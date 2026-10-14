import test from 'node:test';
import assert from 'node:assert/strict';
import { DemoService } from '../docs/js/demo.js';

function demo(role = 'owner') {
  const values = new Map();
  globalThis.localStorage = { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  return new DemoService({ role });
}

test('demo keeps one fixed owner and blocks extra owners', async () => {
  const service = demo();
  await assert.rejects(service.call('member', { id: 'demo-owner', role: 'student', active: true }), /responsável fixo/);
  await assert.rejects(service.call('member', { id: 'demo-owner', role: 'owner', active: false }), /responsável fixo/);
  await assert.rejects(service.call('member', { id: 'demo-student', role: 'owner', active: true }), /responsável único/);
  await service.call('member', { id: 'demo-student', role: 'admin', active: true });
  const snapshot = await service.call('bootstrap');
  assert.equal(snapshot.data.members.filter(row => row.role === 'owner').length, 1);
});

test('demo exposes read confirmations separately and excludes personal data from backup', async () => {
  const service = demo('student');
  const snapshot = await service.call('bootstrap');
  assert.equal(snapshot.data.members.length, 1);
  assert.equal(snapshot.data.members[0].id, 'demo-student');
  const notice = snapshot.data.notices.find(row => row.important);
  await service.call('personal', { data: { favorites: ['events/event-1'], tasks: { 'event-1': 'done' }, read: { [notice.id]: notice.version }, preferences: { initialView: 'calendar' } } });
  await assert.rejects(service.call('personal', { data: { read: { 'notice-1': 1 } } }), /aviso importante/);
  service.setRole('owner');
  const owner = await service.call('bootstrap');
  assert.equal(owner.personal.favorites.length, 0);
  assert(owner.noticeReads.some(row => row.memberId === 'demo-student' && row.noticeId === notice.id));
  const backup = await service.call('backup');
  assert(!Object.hasOwn(backup, 'personal'));
  assert(!Object.hasOwn(backup.data, 'personal'));
  assert(!Object.hasOwn(backup, 'operations'));
  assert(backup.data.noticeReads.some(row => row.memberId === 'demo-student'));
});

test('demo reversal has fixed ID and signed aggregates while preserving financial privacy', async () => {
  const service = demo();
  const original = await service.call('ledger', { data: { title: 'Entrada de teste', date: '2026-10-09', type: 'income', amountCents: 3500, category: 'Contribuição', goalId: 'goal-1', contributorId: 'demo-admin', receiptUrl: 'https://example.com/privado' } });
  const reversed = await service.call('reverse', { id: original.id, reason: 'Lançamento duplicado' });
  assert.equal(reversed.id, `${original.id}_reverse`);
  const snapshot = await service.call('bootstrap');
  const entry = snapshot.data.ledger.find(row => row.id === reversed.id);
  assert.equal(entry.deltaCents, -3500);
  assert.equal(entry.incomeDeltaCents, -3500);
  assert.equal(entry.expenseDeltaCents, 0);
  assert.equal(entry.reason, 'Lançamento duplicado');
  assert.equal(snapshot.totals.balanceCents, 37900);
  await assert.rejects(service.call('reverse', { id: original.id, reason: 'Duplicar estorno' }), /estornado/);
  service.setRole('student');
  const student = await service.call('bootstrap');
  assert(!Object.hasOwn(student.data.ledger.find(row => row.id === original.id), 'receiptUrl'));
});

test('demo idempotency rejects reused operations with different content', async () => {
  const service = demo();
  const payload = { entity: 'teachers', data: { title: 'Exemplo' }, operationId: '4ce2d4b7-c061-4f67-bc44-afad0650c1d0' };
  const first = await service.call('save', payload);
  assert.deepEqual(await service.call('save', payload), first);
  await assert.rejects(service.call('save', { ...payload, data: { title: 'Outro conteúdo' } }), /outros dados/);
});
