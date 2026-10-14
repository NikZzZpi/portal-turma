/**
 * Small in-memory adapter for exercising FirestoreStore client logic without
 * Firebase credentials, networking, billing, or a browser. It does NOT execute
 * Firestore Security Rules; use the Firebase Emulator for Rules verification.
 */
export class FakeTimestamp {
  constructor(milliseconds) { this.milliseconds = milliseconds; this.seconds = Math.floor(milliseconds / 1000); this.nanoseconds = (milliseconds % 1000) * 1000000; }
  toDate() { return new Date(this.milliseconds); }
  toMillis() { return this.milliseconds; }
  isEqual(other) { return other instanceof FakeTimestamp && other.milliseconds === this.milliseconds; }
  static fromDate(value) { return new FakeTimestamp(value.getTime()); }
  static fromMillis(value) { return new FakeTimestamp(value); }
  static now() { return FakeTimestamp.fromDate(new Date()); }
}
function copy(value) {
  if (value instanceof FakeTimestamp) return new FakeTimestamp(value.milliseconds);
  if (value instanceof Date) return new Date(value);
  if (Array.isArray(value)) return value.map(copy);
  if (value && typeof value === 'object') {
    if (value.type === 'document' && value.firestore) return value;
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, copy(item)]));
  }
  return value;
}
function property(value, field, ref) { return field === '__name__' ? ref.id : field.split('.').reduce((current, key) => current?.[key], value); }
function comparable(value) { if (value instanceof Date) return value.getTime(); if (value?.toMillis) return value.toMillis(); return value; }
function same(left, right) { return JSON.stringify(left) === JSON.stringify(right); }
export function createFakeFirestore({ now = () => new Date() } = {}) {
  const db = { data: new Map(), sequence: 0, reads: [], writes: [], type: 'firestore' };
  const reference = (base, segments, type) => {
    const firestore = base.type === 'firestore' ? base : base.firestore;
    const path = [base.type === 'firestore' ? '' : base.path, ...segments].filter(Boolean).join('/');
    if (!firestore || !path || path.split('/').length % 2 !== (type === 'document' ? 0 : 1)) throw new Error(`Invalid ${type} path: ${path}`);
    return { type, path, id: path.split('/').at(-1), firestore };
  };
  const snapshot = ref => {
    const exists = db.data.has(ref.path), value = copy(db.data.get(ref.path));
    return { id: ref.id, ref, exists: () => exists, data: () => copy(value), get: key => property(value, key, ref), metadata: { fromCache: false, hasPendingWrites: false } };
  };
  const matches = (ref, value, constraint) => {
    const left = comparable(property(value, constraint.field, ref)), right = comparable(constraint.value);
    switch (constraint.op) {
      case '==': return same(left, right);
      case '!=': return left !== undefined && !same(left, right);
      case '<': return left < right;
      case '<=': return left <= right;
      case '>': return left > right;
      case '>=': return left >= right;
      case 'in': return Array.isArray(right) && right.some(item => same(item, left));
      case 'not-in': return left !== undefined && Array.isArray(right) && !right.some(item => same(item, left));
      case 'array-contains': return Array.isArray(left) && left.some(item => same(item, right));
      case 'array-contains-any': return Array.isArray(left) && Array.isArray(right) && left.some(item => right.some(other => same(item, other)));
      default: throw new Error(`Unsupported fake query operator: ${constraint.op}`);
    }
  };
  const querySnapshots = query => {
    if (!['query', 'collection'].includes(query.type)) throw new Error('getDocs requires a query or collection.');
    const constraints = query.constraints || [], depth = query.path.split('/').length + 1;
    let refs = [...db.data.keys()].filter(path => path.startsWith(`${query.path}/`) && path.split('/').length === depth).map(path => reference(db, [path], 'document'));
    for (const constraint of constraints.filter(item => item.type === 'where')) refs = refs.filter(ref => matches(ref, db.data.get(ref.path), constraint));
    const orders = constraints.filter(item => item.type === 'orderBy');
    if (!orders.length) orders.push({ field: '__name__', direction: 'asc' });
    refs = refs.filter(ref => orders.every(order => order.field === '__name__' || property(db.data.get(ref.path), order.field, ref) !== undefined));
    const orderValues = ref => orders.map(order => comparable(property(db.data.get(ref.path), order.field, ref)));
    const compare = (left, right) => { for (let index = 0; index < orders.length; index++) { const a = left[index], b = right[index]; if (a !== b) return (a < b ? -1 : 1) * (orders[index].direction === 'desc' ? -1 : 1); } return 0; };
    refs.sort((left, right) => compare(orderValues(left), orderValues(right)) || left.id.localeCompare(right.id));
    const after = constraints.find(item => item.type === 'startAfter');
    if (after) {
      const values = after.values[0]?.ref ? orderValues(after.values[0].ref) : after.values.map(comparable);
      refs = refs.filter(ref => compare(orderValues(ref), values) > 0);
    }
    const count = constraints.find(item => item.type === 'limit')?.count ?? Infinity;
    const docs = refs.slice(0, count).map(snapshot);
    return { docs, size: docs.length, empty: !docs.length, forEach: callback => docs.forEach(callback), metadata: { fromCache: false } };
  };
  const ensureDocument = ref => { if (ref?.type !== 'document') throw new Error('Web Firestore transactions accept document references, not queries.'); };
  const write = (kind, ref, value, options) => {
    ensureDocument(ref);
    if (kind === 'update' && !db.data.has(ref.path)) throw new Error(`Document does not exist: ${ref.path}`);
    if (kind === 'delete') db.data.delete(ref.path);
    else db.data.set(ref.path, kind === 'update' || options?.merge ? { ...copy(db.data.get(ref.path)), ...copy(value) } : copy(value));
    db.writes.push({ kind, path: ref.path, data: copy(value) });
  };
  const sdk = {
    doc(base, ...segments) { if (!segments.length && base.type === 'collection') segments = [`auto${String(++db.sequence).padStart(12, '0')}`]; return reference(base, segments, 'document'); },
    collection: (base, ...segments) => reference(base, segments, 'collection'),
    query: (base, ...constraints) => ({ ...base, type: 'query', constraints: [...(base.constraints || []), ...constraints] }),
    where: (field, op, value) => ({ type: 'where', field, op, value }),
    orderBy: (field, direction = 'asc') => ({ type: 'orderBy', field, direction }),
    documentId: () => '__name__',
    limit: count => ({ type: 'limit', count }),
    startAfter: (...values) => ({ type: 'startAfter', values }),
    async getDoc(ref) { ensureDocument(ref); db.reads.push({ kind: 'document', path: ref.path }); return snapshot(ref); },
    async getDocs(query) { db.reads.push({ kind: 'query', path: query.path, constraints: copy(query.constraints || []) }); return querySnapshots(query); },
    async setDoc(ref, value, options) { write('set', ref, value, options); },
    async updateDoc(ref, value) { write('update', ref, value); },
    async deleteDoc(ref) { write('delete', ref); },
    serverTimestamp: () => FakeTimestamp.fromDate(now()),
    Timestamp: FakeTimestamp,
    sum: field => ({ type: 'sum', field }),
    count: () => ({ type: 'count' }),
    async getAggregateFromServer(query, specification) {
      db.reads.push({ kind: 'aggregate', path: query.path, constraints: copy(query.constraints || []) });
      const { docs } = querySnapshots(query);
      const result = Object.fromEntries(Object.entries(specification).map(([key, aggregate]) => [key, aggregate.type === 'count' ? docs.length : docs.reduce((total, snap) => { const value = snap.get(aggregate.field); return total + (typeof value === 'number' ? value : 0); }, 0)]));
      return { data: () => copy(result) };
    },
    async runTransaction(_db, worker) {
      const pending = [], transaction = {
        async get(ref) { if (pending.length) throw new Error('Firestore read after write'); ensureDocument(ref); return sdk.getDoc(ref); },
        set(ref, value, options) { pending.push(['set', ref, value, options]); return transaction; },
        update(ref, value) { pending.push(['update', ref, value]); return transaction; },
        delete(ref) { pending.push(['delete', ref]); return transaction; }
      };
      const result = await worker(transaction);
      for (const [kind, ref] of pending) { ensureDocument(ref); if (kind === 'update' && !db.data.has(ref.path)) throw new Error(`Document does not exist: ${ref.path}`); }
      for (const args of pending) write(...args);
      return result;
    },
    writeBatch() {
      const pending = [], batch = { set(ref, data, options) { pending.push(['set', ref, data, options]); return batch; }, update(ref, data) { pending.push(['update', ref, data]); return batch; }, delete(ref) { pending.push(['delete', ref]); return batch; }, async commit() { for (const args of pending) write(...args); } };
      return batch;
    }
  };
  sdk.getDocFromServer = sdk.getDoc;
  sdk.getDocsFromServer = sdk.getDocs;
  return { db, sdk };
}
