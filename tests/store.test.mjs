/** Client-store contract tests with an in-memory SDK. These do not evaluate Security Rules. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { FirestoreStore } from '../docs/js/store.js';
import { createFakeFirestore } from './fake-firestore-sdk.mjs';

const BASE = 'classes/turma-licenciatura';
const credentials = (uid, email = `${uid}@example.com`) => ({ uid, email, emailVerified: true, displayName: `Pessoa ${uid}` });
function fixture() {
  const { db, sdk } = createFakeFirestore();
  db.data.set(`${BASE}/config/access`, { ownerUid: 'owner' });
  const ownerUser = credentials('owner');
  const owner = new FirestoreStore({ db, sdk, auth: { currentUser: ownerUser } });
  const newStore = (uid, email) => new FirestoreStore({ db, sdk, auth: { currentUser: credentials(uid, email) } });
  const call = (store, action, payload = {}) => store.call(action, ['bootstrap', 'list', 'backup'].includes(action) ? payload : { operationId: randomUUID(), ...payload });
  const setup = async () => {
    await call(owner, 'bootstrap', { view: 'admin' });
    const semester = (await call(owner, 'save', { entity: 'semesters', data: { title: '2026.2', startDate: '2026-08-01', endDate: '2026-12-20', status: 'published' } })).id;
    await call(owner, 'settings', { data: { title: 'Turma de teste', course: 'Licenciatura', university: 'Universidade fictícia', activeSemesterId: semester, helpText: 'Dados para testes.' } });
    return semester;
  };
  const invite = async (uid, role = 'student') => {
    await call(owner, 'invite', { email: `${uid}@example.com`, name: `Pessoa ${uid}`, role });
    const store = newStore(uid);
    await call(store, 'bootstrap', { view: 'home' });
    return store;
  };
  return { db, sdk, owner, ownerUser, newStore, call, setup, invite };
}
const list = async (f, store, entity, semesterId) => (await f.call(store, 'list', { entity, ...(semesterId ? { semesterId } : {}) })).items;
const eventData = semesterId => ({ title: 'Prova ilustrativa', semesterId, subjectId: '', kind: 'exam', eventState: 'confirmed', date: '2026-11-12', time: '19:00', allDay: false, endDate: '', endTime: '', location: 'Sala de teste', sourceUrl: 'https://example.com/atividade', description: 'Atividade do teste.', changeReason: '', status: 'published' });

test('store initializes only the configured fixed owner and uses verified identity', async () => {
  const f = fixture();
  const snapshot = await f.call(f.owner, 'bootstrap', { view: 'admin' });
  assert.equal(snapshot.me.id, 'owner');
  assert.equal(snapshot.me.role, 'owner');
  assert.equal(typeof snapshot.me.createdAt, 'string');
  const other = f.newStore('not-invited');
  await assert.rejects(f.call(other, 'bootstrap'));
  const unverified = new FirestoreStore({ db: f.db, sdk: f.sdk, auth: { currentUser: { ...credentials('unverified'), emailVerified: false } } });
  await assert.rejects(f.call(unverified, 'bootstrap'));
  await assert.rejects(f.call(f.owner, 'member', { id: 'owner', role: 'student', active: true }));
});

test('store accepts an email invitation into the authenticated UID', async () => {
  const f = fixture(); await f.setup();
  const student = await f.invite('student');
  const snapshot = await f.call(student, 'bootstrap', { view: 'home', force: true });
  assert.equal(snapshot.me.id, 'student');
  assert.equal(snapshot.me.role, 'student');
  const invitation = f.db.data.get(`${BASE}/invites/student@example.com`);
  assert.equal(invitation.status, 'accepted');
  assert.equal(invitation.acceptedBy, 'student');
  const ownMembers = await list(f, student, 'members');
  assert.equal(ownMembers.length, 1);
  assert.equal(ownMembers[0].id, 'student');
  await assert.rejects(f.call(f.owner, 'member', { id: 'student', role: 'owner', active: true }));
});

test('store rechecks membership before edits and validates optimistic versions', async () => {
  const f = fixture(); const semesterId = await f.setup();
  const admin = await f.invite('admin', 'admin');
  const data = eventData(semesterId);
  const created = await f.call(admin, 'save', { entity: 'events', data });
  await assert.rejects(f.call(admin, 'save', { entity: 'events', id: created.id, expectedVersion: 99, data: { ...data, title: 'Stale' } }));
  await f.call(admin, 'save', { entity: 'events', id: created.id, expectedVersion: 1, data: { ...data, time: '20:00', changeReason: 'Horário revisado' } });
  const saved = (await list(f, admin, 'events', semesterId)).find(row => row.id === created.id);
  assert.equal(saved.version, 2);
  assert.equal(saved.time, '20:00');
  const news = await list(f, admin, 'news', semesterId);
  assert(news.some(row => row.eventId === created.id));
  await f.call(f.owner, 'member', { id: 'admin', role: 'student', active: false });
  await assert.rejects(f.call(admin, 'save', { entity: 'events', data }));
});

test('student queries restrict private content before fetching it', async () => {
  const f = fixture(); const semesterId = await f.setup(); const student = await f.invite('student');
  await f.call(f.owner, 'save', { entity: 'events', data: eventData(semesterId) });
  await f.call(f.owner, 'save', { entity: 'events', data: { ...eventData(semesterId), title: 'Rascunho privado', status: 'draft' } });
  await f.call(student, 'request', { data: { title: 'Meu pedido', description: 'Dados do estudante.', type: 'support', semesterId } });
  await f.call(f.owner, 'request', { data: { title: 'Pedido de outra pessoa', description: 'Não deve aparecer.', type: 'support', semesterId } });
  f.db.reads.length = 0;
  const events = await list(f, student, 'events', semesterId);
  const requests = await list(f, student, 'requests', semesterId);
  assert(events.every(row => ['published', 'cancelled'].includes(row.status)));
  assert(requests.every(row => row.authorId === 'student'));
  const queries = f.db.reads.filter(read => read.kind === 'query');
  assert(queries.find(read => read.path.endsWith('/events')).constraints.some(c => c.type === 'where' && c.field === 'status'));
  assert(queries.find(read => read.path.endsWith('/requests')).constraints.some(c => c.type === 'where' && c.field === 'authorId' && c.value === 'student'));
});

test('review creates one linked publication and prevents publishing private finance requests', async () => {
  const f = fixture(); const semesterId = await f.setup(); const student = await f.invite('student');
  const request = await f.call(student, 'request', { data: { title: 'Aviso proposto', description: 'Publicar informação conferida.', type: 'notice', semesterId } });
  await f.call(f.owner, 'review', { id: request.id, expectedVersion: 1, status: 'approved', response: 'Publicação aprovada.', entity: 'notices', data: { title: 'Aviso publicado', description: 'Conferido', semesterId, status: 'published', important: false, pinned: false } });
  const notices = await list(f, f.owner, 'notices', semesterId);
  assert.equal(notices[0].sourceRequestId, request.id);
  await assert.rejects(f.call(f.owner, 'review', { id: request.id, expectedVersion: 2, status: 'approved', response: 'Duplicação', entity: 'notices', data: { title: 'Duplicação', semesterId, status: 'published' } }));
  const finance = await f.call(student, 'request', { data: { title: 'Comprovante privado', description: 'Conferir recebimento.', type: 'finance', semesterId, sourceUrl: 'https://example.com/privado' } });
  await assert.rejects(f.call(f.owner, 'review', { id: finance.id, expectedVersion: 1, status: 'approved', response: 'Publicação indevida', entity: 'notices', data: { title: 'Vazamento', semesterId, status: 'published' } }));
  await f.call(f.owner, 'review', { id: finance.id, expectedVersion: 1, status: 'approved', response: 'Conferido sem publicar.' });
  assert.equal((await list(f, f.owner, 'notices', semesterId)).length, 1);
});

test('read confirmations are projected separately and backup never reads personal collections', async () => {
  const f = fixture(); const semesterId = await f.setup(); const student = await f.invite('student');
  const notice = await f.call(f.owner, 'save', { entity: 'notices', data: { title: 'Aviso importante', description: 'Confirme leitura.', semesterId, status: 'published', important: true, pinned: false } });
  await f.call(student, 'personal', { data: { favorites: [`notices/${notice.id}`], tasks: {}, read: { [notice.id]: 1 }, preferences: { theme: 'dark', initialView: 'calendar' } } });
  const confirmations = await list(f, f.owner, 'noticeReads');
  assert(confirmations.some(row => row.memberId === 'student' && row.noticeId === notice.id));
  f.db.reads.length = 0;
  const backup = await f.call(f.owner, 'backup');
  assert(!f.db.reads.some(read => read.path === `${BASE}/personal`));
  assert(!Object.hasOwn(backup, 'personal'));
  assert(!Object.hasOwn(backup.data || {}, 'personal'));
  assert(!Object.hasOwn(backup, 'operations'));
});

test('ledger aggregates and fixed reversal IDs preserve net totals and privacy', async () => {
  const f = fixture(); await f.setup(); const student = await f.invite('student');
  const goal = await f.call(f.owner, 'save', { entity: 'goals', data: { title: 'Meta', targetCents: 10000, date: '2026-12-01', status: 'published' } });
  const original = await f.call(f.owner, 'ledger', { data: { title: 'Entrada', date: '2026-10-09', type: 'income', amountCents: 3500, category: 'Contribuição', goalId: goal.id, contributorId: 'owner', receiptUrl: 'https://example.com/privado', description: 'Exemplo' } });
  let snapshot = await f.call(f.owner, 'bootstrap', { view: 'finance', force: true });
  assert.equal(snapshot.totals.balanceCents, 3500);
  assert.equal(snapshot.totals.incomeCents, 3500);
  assert.equal(snapshot.goalTotals[goal.id], 3500);
  const reversed = await f.call(f.owner, 'reverse', { id: original.id, reason: 'Corrigir duplicação.' });
  assert.equal(reversed.id, `${original.id}_reverse`);
  snapshot = await f.call(f.owner, 'bootstrap', { view: 'finance', force: true });
  assert.equal(snapshot.totals.balanceCents, 0);
  assert.equal(snapshot.totals.incomeCents, 0);
  assert.equal(snapshot.totals.expenseCents, 0);
  assert.equal(snapshot.goalTotals[goal.id], 0);
  await assert.rejects(f.call(f.owner, 'reverse', { id: original.id, reason: 'Duplicar estorno.' }));
  const entries = await list(f, student, 'ledger');
  assert(entries.every(entry => !entry.receiptUrl && !entry.contributorId));
});

test('clone copies selected subjects and schedules without activating or copying activities', async () => {
  const f = fixture(); const semesterId = await f.setup();
  const teacher = await f.call(f.owner, 'save', { entity: 'teachers', data: { title: 'Professora fictícia', links: [{ label: 'Moodle', url: 'https://example.com/aula' }], sourceCheckedDate: '2026-10-09' } });
  const subject = await f.call(f.owner, 'save', { entity: 'subjects', data: { title: 'Didática', semesterId, teacherIds: [teacher.id], links: [{ label: 'Plano', url: 'https://example.com/plano' }], sourceCheckedDate: '2026-10-09', status: 'published' } });
  await f.call(f.owner, 'save', { entity: 'schedules', data: { title: 'Aula', semesterId, subjectId: subject.id, weekday: '1', time: '19:00', endTime: '22:00', status: 'published' } });
  await f.call(f.owner, 'save', { entity: 'events', data: { ...eventData(semesterId), subjectId: subject.id } });
  const result = await f.call(f.owner, 'cloneSemester', { data: { title: '2027.1', startDate: '2027-02-01', endDate: '2027-06-30', sourceSemesterId: semesterId, subjectIds: [subject.id], copySchedules: true } });
  assert.equal(result.subjectCount, 1);
  assert.equal(result.scheduleCount, 1);
  const subjects = await list(f, f.owner, 'subjects', result.id), schedules = await list(f, f.owner, 'schedules', result.id);
  assert.notEqual(subjects[0].id, subject.id);
  assert.equal(subjects[0].teacherIds[0], teacher.id);
  assert.equal(subjects[0].links[0].label, 'Plano');
  assert.equal(schedules[0].subjectId, subjects[0].id);
  assert.equal((await list(f, f.owner, 'events', result.id)).length, 0);
  assert.equal((await f.call(f.owner, 'bootstrap', { view: 'home', force: true })).settings.activeSemesterId, semesterId);
});

test('shared mutations are idempotent and reject payload collisions', async () => {
  const f = fixture(); await f.setup();
  const payload = { entity: 'teachers', data: { title: 'Docente fictício' }, operationId: randomUUID() };
  const original = await f.call(f.owner, 'save', payload);
  assert.deepEqual(await f.call(f.owner, 'save', payload), original);
  await assert.rejects(f.call(f.owner, 'save', { ...payload, data: { title: 'Outro docente' } }));
  const operations = [...f.db.data.entries()].filter(([path]) => path.startsWith(`${BASE}/operations/`));
  assert(operations.some(([, value]) => value.result.id === original.id));
  const audit = [...f.db.data.entries()].filter(([path]) => path.startsWith(`${BASE}/audit/`));
  assert(audit.some(([, value]) => value.recordId === original.id));
});

test('bootstrap caches collections per view and explicit refresh bypasses the cache', async () => {
  const f = fixture(); await f.setup();
  await f.call(f.owner, 'bootstrap', { view: 'home', force: true });
  f.db.reads.length = 0;
  const cached = await f.call(f.owner, 'bootstrap', { view: 'home' });
  assert(cached.loaded.includes('events'));
  assert(!cached.loaded.includes('ledger'));
  assert.equal(f.db.reads.filter(read => ['query', 'aggregate'].includes(read.kind)).length, 0);
  // Membership is checked even when the content response is cached.
  assert(f.db.reads.some(read => read.path === `${BASE}/members/owner`));
  await f.call(f.owner, 'bootstrap', { view: 'home', force: true });
  assert(f.db.reads.some(read => read.kind === 'query'));
  f.db.reads.length = 0;
  const finance = await f.call(f.owner, 'bootstrap', { view: 'finance' });
  assert(finance.loaded.includes('ledger'));
  assert(f.db.reads.some(read => read.kind === 'aggregate'));
  await f.call(f.owner, 'save', { entity: 'teachers', data: { title: 'Novo docente' } });
  f.db.reads.length = 0;
  await f.call(f.owner, 'bootstrap', { view: 'home' });
  assert(f.db.reads.some(read => read.kind === 'query'));
});

test('ledger totals include records beyond the first page without fetching all entries', async () => {
  const f = fixture(); await f.setup();
  const first = await f.call(f.owner, 'ledger', { data: { title: 'Primeira entrada', date: '2026-10-09', type: 'income', amountCents: 100, category: 'Teste' } });
  const template = f.db.data.get(`${BASE}/ledger/${first.id}`);
  // Raw fixture insertion exercises aggregate/pagination client behavior, not Rules.
  for (let index = 0; index < 101; index++) {
    const id = `extra${String(index).padStart(4, '0')}`;
    f.db.data.set(`${BASE}/ledger/${id}`, { ...template, id, title: `Entrada ${index}` });
  }
  const snapshot = await f.call(f.owner, 'bootstrap', { view: 'finance', force: true });
  assert.equal(snapshot.data.ledger.length, 100);
  assert(snapshot.more.ledger);
  assert.equal(snapshot.totals.balanceCents, 10200);
  assert.equal(snapshot.totals.incomeCents, 10200);
  const last = await f.call(f.owner, 'list', { entity: 'ledger', cursor: snapshot.more.ledger });
  assert.equal(last.items.length, 2);
  assert.equal(last.cursor, null);
});

test('notice-read query and cache are scoped to the selected notice', async () => {
  const f = fixture(); await f.setup();
  for (let index = 0; index < 105; index++) f.db.data.set(`${BASE}/noticeReads/a${String(index).padStart(3, '0')}`, { memberId: `p${index}`, memberName: 'Pessoa fictícia', noticeId: 'old-notice', version: 1, updatedAt: f.sdk.serverTimestamp() });
  f.db.data.set(`${BASE}/noticeReads/zz-target`, { memberId: 'student', memberName: 'Pessoa alvo', noticeId: 'target-notice', version: 2, updatedAt: f.sdk.serverTimestamp() });
  const target = await f.call(f.owner, 'list', { entity: 'noticeReads', noticeId: 'target-notice' });
  assert.equal(target.items.length, 1);
  assert.equal(target.items[0].noticeId, 'target-notice');
  assert.equal(target.cursor, null);
  const old = await f.call(f.owner, 'list', { entity: 'noticeReads', noticeId: 'old-notice' });
  assert.equal(old.items.length, 100);
  assert(old.cursor);
  assert(old.items.every(row => row.noticeId === 'old-notice'));
  assert(f.db.reads.some(read => read.kind === 'query' && read.path.endsWith('/noticeReads') && read.constraints.some(c => c.field === 'noticeId' && c.value === 'target-notice')));
});

test('home upcoming events paginate by date and ID without past or draft events', async () => {
  const f = fixture(); const semesterId = await f.setup();
  const created = await f.call(f.owner, 'save', { entity: 'events', data: eventData(semesterId) });
  const template = f.db.data.get(`${BASE}/events/${created.id}`);
  f.db.data.delete(`${BASE}/events/${created.id}`);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const nextDate = days => { const date = new Date(`${today}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); };
  for (let index = 0; index < 102; index++) {
    const id = `future${String(index).padStart(4, '0')}`;
    f.db.data.set(`${BASE}/events/${id}`, { ...template, id, title: id, date: nextDate(index % 2 + 1) });
  }
  f.db.data.set(`${BASE}/events/aaa-past`, { ...template, id: 'aaa-past', date: nextDate(-1) });
  f.db.data.set(`${BASE}/events/aaa-draft`, { ...template, id: 'aaa-draft', date: nextDate(1), status: 'draft' });
  const first = await f.call(f.owner, 'list', { entity: 'events', semesterId, upcoming: true });
  assert.equal(first.items.length, 100);
  assert(first.cursor.includes('|'));
  assert(first.items.every(row => row.status === 'published' && row.date >= today));
  const second = await f.call(f.owner, 'list', { entity: 'events', semesterId, upcoming: true, cursor: first.cursor });
  assert.equal(second.items.length, 2);
  assert.equal(second.cursor, null);
  const all = [...first.items, ...second.items];
  assert.equal(new Set(all.map(row => row.id)).size, 102);
  assert.deepEqual(all.map(row => `${row.date}|${row.id}`), all.map(row => `${row.date}|${row.id}`).sort());
});
