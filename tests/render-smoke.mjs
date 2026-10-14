/** Integration of the real app handlers and templates with DemoService in a minimal DOM harness.
 * Run: node tests/render-smoke.mjs. This is not a browser or visual test.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { DemoService } from '../docs/js/demo.js';
import { FirestoreStore } from '../docs/js/store.js';
import { createFakeFirestore } from './fake-firestore-sdk.mjs';
import * as helpers from '../docs/js/helpers.js';
import { schemas, statuses } from '../docs/js/schema.js';
const memory = new Map();
globalThis.localStorage = { getItem: key => memory.get(key) || null, setItem: (key, value) => memory.set(key, value), removeItem: key => memory.delete(key) };
const nodes = { app: { innerHTML: '' }, content: { innerHTML: '' }, dialog: null, toasts: [] }, handlers = {}, windowHandlers = {};
class Element {
  constructor(tag) { this.tag = tag; this.innerHTML = ''; this.dataset = {}; this.open = false; this.hidden = false; }
  setAttribute() {} addEventListener() {} focus() {} showModal() { this.open = true; } close() { this.open = false; } remove() { if (this.tag === 'dialog') nodes.dialog = null; }
  querySelector() { return null; }
}
class Form {
  constructor(kind, values, dataset = {}) {
    this.dataset = { form: kind, ...dataset }; this.values = values; this.button = { disabled: false }; this.error = { hidden: true, textContent: '' };
    this.elements = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, { checked: value === true, selectedOptions: Array.isArray(value) ? value.map(value => ({ value })) : [] }]));
  }
  querySelector(selector) { return selector === '.form-error' ? this.error : this.button; }
  querySelectorAll(selector) { return selector === '[name=cloneSubject]:checked' ? (this.values.cloneSubject || []).map(value => ({ value, checked: true })) : []; }
}
const document = {
  hidden: false,
  body: { dataset: {}, append: node => { if (node.tag === 'dialog') nodes.dialog = node; else nodes.toasts.push(node.textContent); } },
  querySelector(selector) { if (selector === '#app') return nodes.app; if (selector === '#content') return nodes.content; if (selector === '#portal-dialog' || selector === 'dialog') return nodes.dialog; if (selector === 'dialog[open]') return nodes.dialog?.open ? nodes.dialog : null; return null; },
  addEventListener(type, handler) { handlers[type] = handler; }, createElement: tag => new Element(tag)
};
const context = vm.createContext({ ...helpers, DemoService, schemas, statuses, configured: false, friendlyError: error => error.message, FirebaseService: class {}, document, HTMLFormElement: Form, FormData: class { constructor(form) { return Object.entries(form.values); } }, crypto: webcrypto, location: { hash: '', href: 'http://localhost:8765/' }, sessionStorage: globalThis.localStorage, window: { addEventListener(type, handler) { windowHandlers[type] = handler; } }, setTimeout() {}, clearTimeout() {}, navigator: { clipboard: { writeText: async () => {} } }, confirm: () => true, console, Intl, Date, URL, Blob, Map, Set });
const source = (await readFile(new URL('../docs/js/app.js', import.meta.url), 'utf8')).replace(/^import .*;\s*$/gm, '');
vm.runInContext(`${source}\nglobalThis.testApi={state,render,load,saveForm};`, context);
const api = context.testApi;
const click = async (action, extra = {}) => handlers.click({ target: { closest: () => ({ dataset: { action, ...extra }, disabled: false }) } });
const change = async (id, value, dataset = {}) => handlers.change({ target: { id, value, dataset } });
async function submit(kind, values, dataset = {}) { const form = new Form(kind, values, dataset); await handlers.submit({ target: form, preventDefault() {} }); if (!form.error.hidden) throw new Error(form.error.textContent); return form; }
function route(name) { context.location.hash = `#/${name}`; api.render(); assert(nodes.content.innerHTML.length > 100, `empty route ${name}`); assert(!nodes.content.innerHTML.includes('undefined'), `undefined text on ${name}`); }
async function navigate(name) { context.location.hash = `#/${name}`; await windowHandlers.hashchange(); assert(nodes.content.innerHTML.length > 100, `empty route ${name}`); assert(!nodes.content.innerHTML.includes('undefined'), `undefined text on ${name}`); }
assert(nodes.app.innerHTML.includes('Abrir demonstração'));
await click('demo');
assert.equal(api.state.snapshot.me.role, 'owner');
for (const name of ['home', 'notices', 'calendar', 'subjects', 'schedules', 'teachers', 'finance', 'requests', 'favorites', 'help', 'admin']) route(name);
route('calendar');
await click('edit', { entity: 'events' });
assert(nodes.dialog.innerHTML.includes('Salvar evento'));
const originalCount = api.state.snapshot.data.events.length;
const form = { title: 'Teste integrado — prova', description: 'Evento criado pelo formulário real.', semesterId: 's2026', subjectId: 'subject-didatica', kind: 'exam', date: helpers.shiftDay(helpers.today(), 22), time: '18:00', allDay: false, endDate: '', endTime: '', location: 'Sala 101', sourceUrl: 'https://example.com/atividade', changeReason: '', status: 'published' };
await submit('save', form, { entity: 'events' });
assert.equal(api.state.snapshot.data.events.length, originalCount + 1);
let created = api.state.snapshot.data.events.find(row => row.title === form.title);
await submit('save', { ...form, time: '19:00', changeReason: 'Mudança confirmada' }, { entity: 'events', id: created.id, version: String(created.version) });
assert(api.state.snapshot.data.news.some(row => row.eventId === created.id));
await click('archive', { entity: 'events', id: created.id });
assert.equal(api.state.snapshot.data.events.find(row => row.id === created.id).status, 'archived');
await click('restore', { entity: 'events', id: created.id });
assert.equal(api.state.snapshot.data.events.find(row => row.id === created.id).status, 'published');
await change('demo-role', 'student');
assert.equal(api.state.snapshot.me.role, 'student');
for (const name of ['home', 'notices', 'calendar', 'subjects', 'schedules', 'teachers', 'finance', 'requests', 'favorites', 'help', 'admin']) route(name);
route('requests');
await submit('request', { title: 'Sugestão integrada de leitura', description: 'Material de revisão enviado pelo aluno.', type: 'material', subjectId: 'subject-didatica', sourceUrl: 'https://example.com/material' });
let request = api.state.snapshot.data.requests.find(row => row.title === 'Sugestão integrada de leitura');
assert.equal(request.authorId, 'demo-student');
await click('favorite', { entity: 'events', id: created.id });
assert(api.state.snapshot.personal.favorites.includes(`events/${created.id}`));
await change('', 'done', { task: created.id });
assert.equal(api.state.snapshot.personal.tasks[created.id], 'done');
await change('demo-role', 'owner');
route('requests');
await click('review', { id: request.id });
await click('publish-request', { id: request.id, entity: 'materials' });
assert(nodes.dialog.innerHTML.includes('Aprovar e publicar'));
await submit('save', { title: request.title, description: request.description, semesterId: 's2026', subjectId: 'subject-didatica', category: 'reference', sourceUrl: request.sourceUrl, authorName: request.authorName, status: 'published', reviewResponse: 'Aprovado e publicado.' }, { entity: 'materials', review: request.id, reviewVersion: String(request.version) });
request = api.state.snapshot.data.requests.find(row => row.id === request.id);
assert.equal(request.status, 'approved');
assert(api.state.snapshot.data.materials.some(row => row.id === request.publishedId));
await change('request-owner', 'demo-owner');
assert(nodes.content.innerHTML.includes(request.title), 'Review-owner filter must use the reviewer stored by the service.');
await change('request-owner', 'unassigned');
assert(!nodes.content.innerHTML.includes(request.title), 'A reviewed request must not be listed as unassigned.');
await change('request-owner', '');
route('finance');
const balance = api.state.snapshot.totals.balanceCents;
const goalBalance = api.state.snapshot.goalTotals['goal-1'];
await submit('ledger', { title: 'Contribuição de teste integrado', date: helpers.today(), type: 'income', amountCents: '12.34', category: 'Contribuições', goalId: 'goal-1', contributorId: 'demo-student', receiptUrl: 'https://example.com/privado', description: 'Exemplo' });
assert.equal(api.state.snapshot.totals.balanceCents, balance + 1234);
assert.equal(api.state.snapshot.goalTotals['goal-1'], goalBalance + 1234);
const entry = api.state.snapshot.data.ledger.find(row => row.title === 'Contribuição de teste integrado');
await submit('reverse', { reason: 'Corrigir lançamento de teste.' }, { id: entry.id });
assert.equal(api.state.snapshot.totals.balanceCents, balance);
assert.equal(api.state.snapshot.goalTotals['goal-1'], goalBalance);
const invitation = await api.state.service.call('invite', { email: 'novo@example.com', name: 'Novo estudante', role: 'student', operationId: 'invite-test' });
await api.state.service.call('revokeInvite', { id: invitation.id, operationId: 'revoke-test' });
await api.load();
assert.equal(api.state.snapshot.data.invites.find(row => row.id === invitation.id).status, 'revoked');
await assert.rejects(api.state.service.call('revokeInvite', { id: invitation.id }), /pendentes/);
await change('demo-role', 'student');
route('favorites');
assert(nodes.content.innerHTML.includes(form.title));
assert(!api.state.snapshot.data.events.some(row => row.status === 'draft'));
assert(!api.state.snapshot.data.requests.some(row => row.authorId !== 'demo-student'));
assert.equal(api.state.snapshot.personal.tasks[created.id], 'done');
await click('theme');
assert.equal(document.body.dataset.theme, 'dark');
// New preference and calendar controls use the real change/submit handlers.
await submit('preferences', { initialView: 'calendar', subjectId: 'subject-didatica' });
assert.equal(api.state.snapshot.personal.preferences.initialView, 'calendar');
assert.equal(api.state.subject, 'subject-didatica');
assert.equal(api.state.snapshot.personal.preferences.theme, 'dark');
await click('reset-preferences');
assert.equal(api.state.snapshot.personal.preferences.initialView, 'home');
assert.equal(api.state.subject, '');
assert.equal(document.body.dataset.theme, 'light');
route('calendar');
await change('calendar-view', 'week');
assert.equal((nodes.content.innerHTML.match(/class="calendar-day /g) || []).length, 7);
const weekStart = api.state.weekStart;
await click('month', { step: '1' });
assert.equal(api.state.weekStart, helpers.shiftDay(weekStart, 7));
await click('month', { step: '-1' });
assert.equal(api.state.weekStart, weekStart);
await change('calendar-view', 'month');
assert.equal((nodes.content.innerHTML.match(/class="calendar-day /g) || []).length, 42);
await change('calendar-view', 'list');
assert(!nodes.content.innerHTML.includes('class="calendar-grid"'));

// Private requests never expose a publication action, even to administrators.
await submit('request', { title: 'Comprovante privado do teste', description: 'Conferir recebimento sem publicar.', type: 'finance', subjectId: '', sourceUrl: 'https://example.com/comprovante-privado' });
const financeRequest = api.state.snapshot.data.requests.find(row => row.title === 'Comprovante privado do teste');
await change('demo-role', 'owner');
route('requests');
await click('review', { id: financeRequest.id });
assert(!nodes.dialog.innerHTML.includes('data-action="publish-request"'));
assert(!nodes.dialog.innerHTML.includes('Aprovar criando uma publicação'));
await assert.rejects(api.state.service.call('review', { id: financeRequest.id, expectedVersion: financeRequest.version, status: 'approved', response: 'Tentativa indevida', entity: 'notices', data: { title: 'Não publicar', semesterId: 's2026', status: 'published' } }), /privados/);
await submit('review', { status: 'approved', response: 'Conferido em particular; não cria lançamento automaticamente.' }, { id: financeRequest.id, version: String(financeRequest.version) });
assert.equal(api.state.snapshot.data.requests.find(row => row.id === financeRequest.id).publishedId, '');
assert(!api.state.snapshot.data.notices.some(row => row.title === 'Não publicar'));

// Completed events remain in the calendar and disappear from upcoming alerts.
const completedTitle = 'Atividade já concluída — teste';
await submit('save', { ...form, title: completedTitle, kind: 'activity', date: helpers.shiftDay(helpers.today(), 1), eventState: 'completed' }, { entity: 'events' });
const completed = api.state.snapshot.data.events.find(row => row.title === completedTitle);
assert.equal(completed.eventState, 'completed');
route('home');
assert(!nodes.content.innerHTML.includes(completedTitle));
route('calendar');
assert(nodes.content.innerHTML.includes(completedTitle));
await click('detail', { entity: 'events', id: completed.id });
assert(nodes.dialog.innerHTML.includes('Concluído'));

// Multi-link textareas are converted into structured link lists by the real form code.
const teacher = api.state.snapshot.data.teachers[0];
const teacherForm = { ...teacher, links: 'Atividades | https://example.com/atividades\nBiblioteca | https://example.com/biblioteca', sourceCheckedDate: helpers.today() };
await submit('save', teacherForm, { entity: 'teachers', id: teacher.id, version: String(teacher.version) });
assert.equal(api.state.snapshot.data.teachers.find(row => row.id === teacher.id).links.length, 2);
route('teachers');
assert(nodes.content.innerHTML.includes('https://example.com/biblioteca'));
assert(nodes.content.innerHTML.includes('Conferido em'));
await assert.rejects(submit('save', { ...teacherForm, links: 'formato inválido' }, { entity: 'teachers', id: teacher.id, version: '2' }), /Use Nome/);

// Semester assistant copies only selected published subjects and their schedules.
route('admin');
await click('clone-semester');
assert(nodes.dialog.innerHTML.includes('Preparar novo semestre'));
const activeSemester = api.state.snapshot.settings.activeSemesterId;
await submit('clone-semester', { title: 'Próximo semestre — teste', startDate: helpers.shiftDay(helpers.today(), 100), endDate: helpers.shiftDay(helpers.today(), 200), cloneSubject: ['subject-didatica', 'subject-psicologia'], copySchedules: true });
const clonedSemester = api.state.semester;
assert.notEqual(clonedSemester, activeSemester);
assert.equal(api.state.snapshot.settings.activeSemesterId, activeSemester);
assert.equal(api.state.snapshot.data.subjects.length, 2);
assert.equal(api.state.snapshot.data.schedules.length, 2);
assert(api.state.snapshot.data.schedules.every(row => api.state.snapshot.data.subjects.some(subject => subject.id === row.subjectId)));
assert(api.state.snapshot.data.subjects.every(row => row.id !== row.clonedFrom && row.semesterId === clonedSemester));
assert.equal(api.state.snapshot.data.events.length, 0);
assert.equal(api.state.snapshot.data.notices.length, 0);
await change('semester-select', activeSemester);

// A response from the old session must never restore private UI after logout.
const delayedSnapshot = JSON.parse(JSON.stringify(api.state.snapshot));
let resolveBootstrap;
api.state.service = { call: async () => new Promise(resolve => { resolveBootstrap = resolve; }) };
const delayedLoad = api.load();
assert.equal(api.state.loading, true);
const epochBeforeLogout = api.state.epoch;
await click('logout');
const loginMarkup = nodes.app.innerHTML;
assert(api.state.epoch > epochBeforeLogout);
assert(loginMarkup.includes('Abrir demonstração'));
resolveBootstrap(delayedSnapshot);
await delayedLoad;
assert.equal(api.state.snapshot, null);
assert.equal(nodes.app.innerHTML, loginMarkup);
assert.equal(api.state.loading, false);

// Delayed manual pagination cannot append private records to a logged-out or new session.
for (const startNewSession of [false, true]) {
  await click('demo');
  const oldService = api.state.service;
  const normalCall = oldService.call.bind(oldService);
  let resolvePage;
  oldService.call = (action, payload) => action === 'list' ? new Promise(resolve => { resolvePage = resolve; }) : normalCall(action, payload);
  api.state.snapshot.more.materials = 'deferred-page';
  const pendingPage = click('more', { entity: 'materials' });
  assert.equal(typeof resolvePage, 'function');
  await click('logout');
  assert.equal(api.state.snapshot, null);
  if (startNewSession) await click('demo');
  const currentSnapshot = api.state.snapshot;
  const currentMarkup = nodes.app.innerHTML;
  resolvePage({ items: [{ id: 'late-private-material', title: 'Dado privado da sessão antiga', semesterId: 's2026', status: 'published' }], cursor: null });
  await pendingPage;
  assert.equal(api.state.snapshot, currentSnapshot);
  assert.equal(nodes.app.innerHTML, currentMarkup);
  assert(!api.state.snapshot?.data.materials.some(row => row.id === 'late-private-material'));
}

// Changing semesters while an old bootstrap is pending keeps only the new selection.
const semesterService = api.state.service;
const callForSemester = semesterService.call.bind(semesterService);
const oldSemesterSnapshot = await callForSemester('bootstrap', { semesterId: 's2026' });
let resolveOldSemester;
let interceptedOldSemester = false;
semesterService.call = (action, payload) => {
  if (action === 'bootstrap' && payload.semesterId === 's2026' && !interceptedOldSemester) {
    interceptedOldSemester = true;
    return new Promise(resolve => { resolveOldSemester = resolve; });
  }
  return callForSemester(action, payload);
};
const oldSemesterLoad = api.load();
assert.equal(typeof resolveOldSemester, 'function');
await change('semester-select', 's2025');
assert.equal(api.state.semester, 's2025');
assert.equal(api.state.snapshot.data.subjects.length, 0);
const selectedSemesterSnapshot = api.state.snapshot;
const selectedSemesterMarkup = nodes.app.innerHTML;
resolveOldSemester(oldSemesterSnapshot);
await oldSemesterLoad;
assert.equal(api.state.semester, 's2025');
assert.equal(api.state.snapshot, selectedSemesterSnapshot);
assert.equal(nodes.app.innerHTML, selectedSemesterMarkup);
assert.equal(api.state.loading, false);

// Run frontend serializers against the real direct-Firestore Store and its injected SDK.
// The test-only JSON bridge normalizes VM object prototypes to the imported module's realm.
const { db, sdk } = createFakeFirestore();
db.data.set('classes/turma-licenciatura/config/access', { ownerUid: 'integration-owner' });
const auth = { currentUser: { uid: 'integration-owner', email: 'integration@example.com', emailVerified: true, displayName: 'Responsável do teste' } };
const directStore = new FirestoreStore({ db, sdk, auth });
const productionAdapter = { call: (action, payload = {}) => directStore.call(action, JSON.parse(JSON.stringify(payload))) };
api.state.epoch += 1;
api.state.service = productionAdapter;
api.state.demo = false;
api.state.snapshot = null;
api.state.semester = '';
api.state.subject = '';
api.state.search = '';
context.location.hash = '#/admin';
await api.load();
assert.equal(api.state.snapshot.me.role, 'owner');
await submit('save', { title: 'Semestre de integração', startDate: '2026-08-01', endDate: '2026-12-20', status: 'published' }, { entity: 'semesters' });
const realSemester = api.state.snapshot.data.semesters[0].id;
await submit('settings', { title: 'Turma de integração', course: 'Licenciatura', university: 'Exemplo', activeSemesterId: realSemester, helpText: 'Configuração do teste.' });
await submit('save', { title: 'Professor fictício da integração', email: 'professor@example.com', contact: 'Contato autorizado', officeHours: 'Quarta', platformUrl: 'https://example.com/', links: 'Atividades | https://example.com/atividades\nBiblioteca | https://example.com/biblioteca', sourceCheckedDate: helpers.today(), description: 'Professor de teste.', status: 'published' }, { entity: 'teachers' });
const realTeacher = api.state.snapshot.data.teachers[0];
assert.equal(realTeacher.links.length, 2);
await submit('save', { title: 'Didática de integração', description: 'Disciplina de teste.', semesterId: realSemester, teacherIds: [realTeacher.id], platformUrl: 'https://example.com/materia', links: 'Plano | https://example.com/plano', sourceCheckedDate: helpers.today(), room: 'A-1', status: 'published' }, { entity: 'subjects' });
const realSubject = api.state.snapshot.data.subjects[0].id;
await submit('save', { title: 'Horário de integração', semesterId: realSemester, subjectId: realSubject, weekday: '1', time: '19:00', endTime: '22:00', room: 'A-1', status: 'published' }, { entity: 'schedules' });
await navigate('calendar');
await submit('save', { ...form, title: 'Evento backend real', semesterId: realSemester, subjectId: realSubject, eventState: 'planned' }, { entity: 'events' });
const realEvent = api.state.snapshot.data.events[0];
assert.equal(realEvent.eventState, 'planned');
await navigate('subjects');
await submit('save', { title: 'Material backend real', description: 'Referência', semesterId: realSemester, subjectId: realSubject, category: 'reference', sourceUrl: 'https://example.com/referencia', authorName: 'Autor de teste', status: 'published' }, { entity: 'materials' });
assert.equal(api.state.snapshot.data.materials[0].title, 'Material backend real');
await navigate('favorites');
await submit('preferences', { initialView: 'subjects', subjectId: realSubject });
assert.equal(api.state.snapshot.personal.preferences.initialView, 'subjects');
await navigate('admin');
await submit('clone-semester', { title: 'Semestre copiado pelo backend', startDate: '2027-02-01', endDate: '2027-06-30', cloneSubject: [realSubject], copySchedules: true });
assert.notEqual(api.state.semester, realSemester);
assert.equal(api.state.snapshot.settings.activeSemesterId, realSemester);
assert.equal(api.state.snapshot.data.subjects.length, 1);
await navigate('schedules');
assert.equal(api.state.snapshot.data.schedules.length, 1);
assert.equal(api.state.snapshot.data.schedules[0].subjectId, api.state.snapshot.data.subjects[0].id);
assert.equal(api.state.snapshot.data.events.length, 0);
assert.equal(api.state.snapshot.data.materials.length, 0);
assert.equal(api.state.snapshot.data.subjects[0].links[0].label, 'Plano');

// Hash navigation during the very first bootstrap must request the newly selected scope.
const initialHome = await productionAdapter.call('bootstrap', { semesterId: realSemester, view: 'home', force: true });
let releaseInitialHome;
api.state.service = { call: (action, payload) => action === 'bootstrap' && payload.view === 'home' ? new Promise(resolve => { releaseInitialHome = resolve; }) : productionAdapter.call(action, payload) };
api.state.snapshot = null;
api.state.semester = realSemester;
api.state.loading = false;
api.state.epoch += 1;
context.location.hash = '#/home';
const initialLoad = api.load(true);
assert.equal(typeof releaseInitialHome, 'function');
context.location.hash = '#/finance';
await windowHandlers.hashchange();
releaseInitialHome(initialHome);
await initialLoad;
assert(api.state.snapshot.loaded.includes('ledger'), 'Navigation during first bootstrap must load the finance scope, not render cached home scope.');
assert(nodes.content.innerHTML.includes('Caixa da turma'));
console.log('PASS: all original flows plus week/month/list, preferences, private-finance review, completed alerts, multi-links, clone UI, stale bootstrap/pagination after logout or new login, semester-load race, and real direct-Firestore Store form serialization with route-scoped loading. Minimal DOM and fake SDK; no browser, visual, live Firebase or Security Rules test.');
