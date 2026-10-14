/** Browser smoke test. Requires an installed Playwright and Chromium.
 * Start docs/: python3 -m http.server 8765 --directory docs
 * Then: node tests/browser-smoke.mjs
 * Optional: BASE_URL, BROWSER_EXECUTABLE, SMOKE_OUTPUT_DIR.
 * No packages or browsers are downloaded by this script.
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { chromium } = process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES
  ? require(path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES, 'playwright'))
  : require('playwright');
const output = process.env.SMOKE_OUTPUT_DIR || fileURLToPath(new URL('../../browser-smoke-output/', import.meta.url));
await mkdir(output, { recursive: true });
process.env.TMPDIR ||= output;
const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}) });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('dialog', async dialog => dialog.accept());
const base = process.env.BASE_URL || 'http://127.0.0.1:8765/';
const go = async route => {
  await page.goto(`${base}#/${route}`);
  await page.locator(`.nav-link.active[href="#/${route}"]`).waitFor();
  await page.locator('#content h1').waitFor();
};
const submit = async form => { await form.locator('button:not([type]),button[type="submit"]').last().click(); await page.locator('dialog[open]').waitFor({ state: 'hidden' }); };
const data = () => page.evaluate(() => JSON.parse(localStorage.getItem('portal-demo-v1')));
try {
  await page.goto(base);
  await page.getByRole('button', { name: 'Abrir demonstração' }).click();
  await page.locator('#content h1').waitFor();
  for (const route of ['home', 'notices', 'calendar', 'subjects', 'schedules', 'teachers', 'finance', 'requests', 'favorites', 'help', 'admin']) await go(route);
  await go('home');
  await page.screenshot({ path: path.join(output, 'desktop-home.png'), fullPage: true });
  await go('calendar');
  await page.locator('[data-action="edit"][data-entity="events"]').first().click();
  let form = page.locator('form[data-form="save"]');
  await form.locator('[name="title"]').fill('Evento do smoke test');
  await form.locator('[name="date"]').fill(new Date(Date.now() + 86400000 * 22).toISOString().slice(0, 10));
  await form.locator('[name="time"]').fill('18:00');
  await submit(form);
  let event = (await data()).data.events.find(row => row.title === 'Evento do smoke test');
  assert(event);
  await page.locator('#calendar-view').selectOption('list');
  await page.locator(`[data-action="edit"][data-id="${event.id}"]`).click();
  form = page.locator('form[data-form="save"]');
  await form.locator('[name="time"]').fill('19:00');
  await form.locator('[name="changeReason"]').fill('Horário atualizado no teste.');
  await submit(form);
  assert((await data()).data.news.some(row => row.eventId === event.id));
  await page.locator('#demo-role').selectOption('student');
  await page.waitForFunction(() => document.querySelector('#demo-role')?.value === 'student');
  await go('requests');
  await page.locator('[data-action="request"]').first().click();
  form = page.locator('form[data-form="request"]');
  await form.locator('[name="title"]').fill('Material do smoke test');
  await form.locator('[name="type"]').selectOption('material');
  await form.locator('[name="subjectId"]').selectOption('subject-didatica');
  await form.locator('[name="sourceUrl"]').fill('https://example.com/material');
  await form.locator('[name="description"]').fill('Referência enviada pelo aluno no teste.');
  await submit(form);
  let request = (await data()).data.requests.find(row => row.title === 'Material do smoke test');
  assert.equal(request.authorId, 'demo-student');
  await page.locator('#demo-role').selectOption('owner');
  await page.locator(`[data-action="review"][data-id="${request.id}"]`).click();
  await page.locator('[data-action="publish-request"][data-entity="materials"]').click();
  form = page.locator('form[data-form="save"]');
  await submit(form);
  request = (await data()).data.requests.find(row => row.id === request.id);
  assert.equal(request.status, 'approved');
  assert(request.publishedId);
  await go('finance');
  await page.locator('[data-action="ledger"]').click();
  form = page.locator('form[data-form="ledger"]');
  await form.locator('[name="title"]').fill('Entrada do smoke test');
  await form.locator('[name="amountCents"]').fill('12.34');
  await form.locator('[name="category"]').fill('Teste');
  await submit(form);
  const entry = (await data()).data.ledger.find(row => row.title === 'Entrada do smoke test');
  assert.equal(entry.deltaCents, 1234);
  await page.locator(`[data-action="reverse"][data-id="${entry.id}"]`).click();
  form = page.locator('form[data-form="reverse"]');
  await form.locator('[name="reason"]').fill('Estorno do teste.');
  await submit(form);
  assert((await data()).data.ledger.find(row => row.reversalOf === entry.id));
  await go('notices');
  await page.locator('[data-action="favorite"][data-id="notice-1"]').click();
  await go('favorites');
  assert(await page.getByRole('heading', { name: 'Bem-vindos ao portal da turma' }).isVisible());
  await page.setViewportSize({ width: 390, height: 844 });
  await go('home');
  await page.screenshot({ path: path.join(output, 'mobile-home.png'), fullPage: true });
  const width = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, viewport: window.innerWidth }));
  assert(width.scroll <= width.viewport + 1, `Horizontal overflow: ${width.scroll} > ${width.viewport}`);
  assert.deepEqual(errors, []);
  console.log(`PASS: browser routes, event create/edit, student request/publication, ledger/reversal, favorites, mobile layout. Screenshots: ${output}`);
} catch (error) {
  await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true }).catch(() => {});
  throw error;
} finally { await browser.close(); }
