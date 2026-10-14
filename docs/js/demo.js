/**
 * Demonstração local, ativada expressamente pelo usuário. Não autentica nem
 * substitui o Firebase. Nenhuma informação deste arquivo vai para produção.
 */
const STORAGE_KEY = 'portal-demo-v1';
const ENTITIES = ['semesters', 'subjects', 'teachers', 'schedules', 'notices', 'events', 'materials', 'groups', 'requests', 'ledger', 'goals', 'news', 'members', 'invites', 'audit'];
const EDITABLE = ['semesters', 'subjects', 'teachers', 'schedules', 'notices', 'events', 'materials', 'groups', 'goals'];
const SEMESTER_ENTITIES = ['subjects', 'schedules', 'notices', 'events', 'materials', 'groups', 'requests', 'news'];
const ROLES = ['owner', 'admin', 'student'];
const FIELDS = {
  semesters: ['title', 'startDate', 'endDate', 'status'],
  subjects: ['title', 'description', 'semesterId', 'teacherIds', 'platformUrl', 'links', 'sourceCheckedDate', 'room', 'status'],
  teachers: ['title', 'email', 'contact', 'officeHours', 'platformUrl', 'links', 'sourceCheckedDate', 'description', 'status'],
  schedules: ['title', 'subjectId', 'semesterId', 'weekday', 'time', 'endTime', 'room', 'status'],
  notices: ['title', 'description', 'semesterId', 'subjectId', 'category', 'sourceUrl', 'eventId', 'pinned', 'important', 'expiresDate', 'status'],
  events: ['title', 'description', 'semesterId', 'subjectId', 'kind', 'date', 'time', 'allDay', 'endDate', 'endTime', 'location', 'sourceUrl', 'changeReason', 'eventState', 'status'],
  materials: ['title', 'description', 'semesterId', 'subjectId', 'category', 'sourceUrl', 'authorName', 'status'],
  groups: ['title', 'description', 'semesterId', 'subjectId', 'date', 'time', 'location', 'sourceUrl', 'organizer', 'status'],
  goals: ['title', 'description', 'targetCents', 'date', 'status']
};
const STATUSES = {
  semesters: ['published', 'archived'], subjects: ['published', 'archived'], teachers: ['published', 'archived'], schedules: ['published', 'archived'],
  notices: ['draft', 'published', 'archived'], events: ['draft', 'published', 'cancelled', 'archived'],
  materials: ['draft', 'published', 'archived'], groups: ['draft', 'published', 'closed', 'archived'], goals: ['published', 'closed', 'archived']
};
const clone = value => JSON.parse(JSON.stringify(value));
const stable = value => Array.isArray(value) ? `[${value.map(stable).join(',')}]` : value && typeof value === 'object' ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}` : JSON.stringify(value);
const now = () => new Date().toISOString();
const uuid = () => globalThis.crypto?.randomUUID?.() || `demo-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
function fail(message, code = 'invalid-argument') { const error = new Error(message); error.code = `functions/${code}`; throw error; }
function today() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  return ['year', 'month', 'day'].map(type => parts.find(part => part.type === type).value).join('-');
}
function dateAfter(days) { const date = new Date(`${today()}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); }
function validDate(value) { return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T12:00:00Z`)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value; }
function cleanText(value, limit = 5000) { if (typeof value !== 'string' || value.length > limit) fail(`Informe um texto com até ${limit} caracteres.`); return value.trim(); }
function url(value) { if (!value) return ''; try { const parsed = new URL(value); if (['http:', 'https:'].includes(parsed.protocol)) return value; } catch {} fail('Use um link completo que comece com https:// ou http://.'); }
function record(id, data, author = 'demo-owner') { const stamp = now(); return { id, ...data, version: 1, createdAt: stamp, updatedAt: stamp, createdBy: author }; }
function makeSeed() {
  const data = Object.fromEntries(ENTITIES.map(entity => [entity, []]));
  data.semesters = [record('s2026', { title: 'Semestre atual · demonstração', startDate: dateAfter(-75), endDate: dateAfter(100), status: 'published' }), record('s2025', { title: 'Semestre anterior · arquivo', startDate: dateAfter(-250), endDate: dateAfter(-90), status: 'archived' })];
  const names = [['didatica', 'Didática', 'Helena Exemplo', 'A-101'], ['psicologia', 'Psicologia da Educação', 'Marcos Exemplo', 'A-102'], ['filosofia', 'Filosofia da Educação', 'Lúcia Exemplo', 'B-201'], ['politicas', 'Políticas Educacionais', 'Rafael Exemplo', 'B-202'], ['pesquisa', 'Metodologia da Pesquisa', 'Camila Exemplo', 'Laboratório 1']];
  names.forEach(([slug, title, teacher, room], index) => {
    data.teachers.push(record(`teacher-${slug}`, { title: `${teacher} (fictício)`, email: `${slug}@example.com`, contact: 'Contato ilustrativo: confirme com a turma', officeHours: 'Quarta-feira, 17h às 18h (exemplo)', platformUrl: index % 2 ? 'https://classroom.google.com/' : 'https://moodle.org/', links: [{ label: 'Moodle · endereço ilustrativo', url: 'https://moodle.org/' }, { label: 'Classroom · endereço ilustrativo', url: 'https://classroom.google.com/' }], sourceCheckedDate: dateAfter(-2), description: 'Professor fictício usado exclusivamente para demonstrar o portal.', status: 'published' }));
    data.subjects.push(record(`subject-${slug}`, { title, description: 'Disciplina ilustrativa da turma de licenciatura.', semesterId: 's2026', teacherIds: [`teacher-${slug}`], platformUrl: index % 2 ? 'https://classroom.google.com/' : 'https://moodle.org/', links: [{ label: 'Plataforma original · exemplo', url: index % 2 ? 'https://classroom.google.com/' : 'https://moodle.org/' }], sourceCheckedDate: dateAfter(-2), room, status: 'published' }));
    data.schedules.push(record(`schedule-${slug}`, { title, subjectId: `subject-${slug}`, semesterId: 's2026', weekday: String(index + 1), time: '19:00', endTime: '22:00', room, status: 'published' }));
  });
  data.events = [
    ['event-1', 'Entrega do plano de aula', 'subject-didatica', 'assignment', 2, '23:59', 'Moodle', 'Prepare um plano de aula com objetivos, sequência didática e avaliação. Prazo fictício para demonstração.'],
    ['event-2', 'Prova de Psicologia da Educação', 'subject-psicologia', 'exam', 4, '19:00', 'A-102', 'Revisão dos conceitos estudados em sala. Evento ilustrativo.'],
    ['event-3', 'Seminário: educação e sociedade', 'subject-filosofia', 'presentation', 7, '19:00', 'B-201', 'Apresentação em grupos. Consulte as orientações originais antes de preparar o trabalho.'],
    ['event-4', 'Reunião da turma', '', 'meeting', 1, '18:30', 'A-101', 'Conversar sobre a organização do semestre e os materiais compartilhados.'],
    ['event-5', 'Entrega do projeto de pesquisa', 'subject-pesquisa', 'assignment', 12, '', 'Classroom', 'Incluir tema, problema, objetivos e referências. Horário ainda não informado pelo professor.'],
    ['event-6', 'Semana acadêmica de licenciatura', '', 'university', 16, '', 'Campus · local a confirmar', 'Evento de exemplo. A programação real deve ser conferida no canal oficial.'],
    ['event-7', 'Leitura orientada: políticas públicas', 'subject-politicas', 'activity', 5, '20:00', 'B-202', 'Levar anotações e uma pergunta para discussão.'],
    ['event-8', 'Oficina de pesquisa — rascunho', 'subject-pesquisa', 'activity', 20, '19:00', 'Laboratório 1', 'Rascunho visível apenas para administradores.']
  ].map(([id, title, subjectId, kind, days, time, location, description]) => record(id, { title, subjectId, kind, date: dateAfter(days), time, allDay: !time, endDate: '', endTime: '', location, description, semesterId: 's2026', sourceUrl: 'https://moodle.org/', changeReason: '', eventState: id === 'event-8' ? 'planned' : 'confirmed', status: id === 'event-8' ? 'draft' : 'published' }));
  data.notices = [
    record('notice-1', { title: 'Bem-vindos ao portal da turma', description: 'Este é um ambiente de demonstração. Explore o calendário, os murais por disciplina e a prestação de contas. Os nomes e os valores são fictícios. No portal real, os administradores publicarão as informações conferidas nas fontes oficiais.', semesterId: 's2026', subjectId: '', category: 'Turma', sourceUrl: '', eventId: '', pinned: true, important: false, expiresDate: '', status: 'published' }),
    record('notice-2', { title: 'Plano de aula: confira o prazo de entrega', description: 'A entrega de Didática está chegando. Confira a atividade no calendário e o link do ambiente original. Use seu checklist pessoal para acompanhar o trabalho.', semesterId: 's2026', subjectId: 'subject-didatica', category: 'Prazo', sourceUrl: 'https://moodle.org/', eventId: 'event-1', pinned: false, important: true, expiresDate: dateAfter(3), status: 'published' }),
    record('notice-3', { title: 'Compartilhe suas anotações com a turma', description: 'Encontrou um material útil? Envie uma solicitação com o link e a disciplina. A administração revisará a contribuição antes de publicar no mural.', semesterId: 's2026', subjectId: '', category: 'Materiais', sourceUrl: '', eventId: '', pinned: false, important: false, expiresDate: '', status: 'published' }),
    record('notice-4', { title: 'Aviso em preparação', description: 'Exemplo de rascunho: alunos não recebem este conteúdo.', semesterId: 's2026', subjectId: '', category: 'Turma', sourceUrl: '', eventId: '', pinned: false, important: false, expiresDate: '', status: 'draft' })
  ];
  const resourceLinks = ['https://pt.wikipedia.org/wiki/Did%C3%A1tica', 'https://pt.wikipedia.org/wiki/Psicologia_educacional', 'https://pt.wikipedia.org/wiki/Filosofia_da_educa%C3%A7%C3%A3o', 'https://pt.wikipedia.org/wiki/Pol%C3%ADtica_educacional', 'https://pt.wikipedia.org/wiki/Metodologia_cient%C3%ADfica'];
  names.forEach(([slug, title], index) => {
    data.materials.push(record(`material-${slug}`, { title: `Referência inicial: ${title}`, description: 'Link público ilustrativo para explorar o mural. Confira a qualidade e a adequação das fontes indicadas pelo professor.', semesterId: 's2026', subjectId: `subject-${slug}`, category: 'reference', sourceUrl: resourceLinks[index], authorName: 'Equipe da demonstração', status: 'published' }));
    data.groups.push(record(`group-${slug}`, { title: `Grupo de revisão de ${title}`, description: 'Encontro fictício para revisar conceitos e trocar dúvidas. Participe pelo canal combinado com a turma.', semesterId: 's2026', subjectId: `subject-${slug}`, date: dateAfter(index + 2), time: '17:30', location: 'Biblioteca · mesa de estudos (exemplo)', sourceUrl: '', organizer: 'Comissão de estudos (fictícia)', status: 'published' }));
  });
  data.goals = [record('goal-1', { title: 'Materiais para a mostra pedagógica', description: 'Meta demonstrativa para impressão de painéis e materiais coletivos.', targetCents: 80000, date: dateAfter(35), status: 'published' }), record('goal-2', { title: 'Reserva da turma', description: 'Fundo coletivo ilustrativo para atividades do semestre.', targetCents: 120000, date: dateAfter(80), status: 'published' })];
  data.ledger = [
    record('ledger-1', { title: 'Contribuições iniciais da turma', date: dateAfter(-12), type: 'income', amountCents: 44000, deltaCents: 44000, category: 'Contribuições', goalId: 'goal-1', description: 'Valor agregado fictício para demonstração.' }),
    record('ledger-2', { title: 'Impressão de materiais coletivos', date: dateAfter(-8), type: 'expense', amountCents: 8600, deltaCents: -8600, category: 'Impressões', goalId: 'goal-1', description: 'Despesa fictícia.' }),
    record('ledger-3', { title: 'Contribuição de estudante de exemplo', date: dateAfter(-3), type: 'income', amountCents: 2500, deltaCents: 2500, category: 'Contribuições', goalId: 'goal-1', description: 'Lançamento de demonstração.' })
  ];
  data.ledger = data.ledger.map(entry => ({ ...entry, incomeDeltaCents: entry.type === 'income' ? entry.amountCents : 0, expenseDeltaCents: entry.type === 'expense' ? entry.amountCents : 0, reversalOf: '', reversedBy: '', reason: '' }));
  data.requests = [record('request-1', { title: 'Adicionar material de revisão de Didática', description: 'Sugestão de referência inicial para o mural da disciplina. Conteúdo fictício.', type: 'material', subjectId: 'subject-didatica', semesterId: 's2026', sourceUrl: resourceLinks[0], relatedId: '', parentId: '', authorId: 'demo-student', authorName: 'Ana · estudante de exemplo', status: 'pending', response: '', publishedId: '' }, 'demo-student'), record('request-2', { title: 'Conferir o local do seminário', description: 'Sugestão fictícia: confirmar se a sala do seminário foi alterada.', type: 'correction', subjectId: 'subject-filosofia', semesterId: 's2026', sourceUrl: '', relatedId: 'event-3', parentId: '', authorId: 'demo-admin', authorName: 'Bruno · administrador de exemplo', status: 'reviewing', response: 'Conferindo a informação no canal original.', publishedId: '' }, 'demo-admin')];
  data.members = [record('demo-owner', { name: 'Você · responsável da demonstração', email: 'responsavel@example.com', role: 'owner', active: true }), record('demo-admin', { name: 'Bruno · administrador de exemplo', email: 'administrador@example.com', role: 'admin', active: true }), record('demo-student', { name: 'Ana · estudante de exemplo', email: 'estudante@example.com', role: 'student', active: true })];
  for (let index = 4; index <= 44; index++) data.members.push(record(`demo-member-${index}`, { name: `Estudante fictício ${String(index).padStart(2, '0')}`, email: `estudante${index}@example.com`, role: 'student', active: true }));
  data.audit = [record('audit-seed', { action: 'seed', entity: 'demo', targetId: '', actorId: 'demo-owner', actorName: 'Demonstração', description: 'Dados fictícios de demonstração criados localmente.' })];
  return { schemaVersion: 1, settings: { title: 'Portal da Licenciatura', course: 'Licenciatura', university: 'Universidade · demonstração', activeSemesterId: 's2026', helpText: 'Informações centralizadas para 44 estudantes. Confira sempre os detalhes no canal original do professor.' }, data, personals: {}, noticeReadRecords: {}, ledgerPrivate: { 'ledger-3': { contributorId: 'demo-student', receiptUrl: '' } }, operations: {} };
}

export class DemoService {
  constructor({ role = 'owner' } = {}) {
    this.role = ROLES.includes(role) ? role : 'owner';
    this.isDemo = true;
    this.state = this._load();
  }
  get me() { const member = this.state.data.members.find(item => item.id === `demo-${this.role}`); return clone(member || { id: `demo-${this.role}`, name: 'Participante da demonstração', email: `${this.role}@example.com`, role: this.role, active: true }); }
  get user() { const member = this.me; return { uid: member.id, displayName: member.name, email: member.email, emailVerified: true }; }
  setRole(role) { if (!ROLES.includes(role)) fail('Perfil de demonstração inválido.'); this.role = role; return this.me; }
  reset() { this.state = makeSeed(); this._persist(); return this._bootstrap({}); }
  _load() { try { const state = JSON.parse(globalThis.localStorage?.getItem(STORAGE_KEY) || 'null'); if (state?.schemaVersion === 1 && ENTITIES.every(entity => Array.isArray(state.data?.[entity])) && state.settings && state.personals && state.ledgerPrivate && state.operations) { state.noticeReadRecords ||= {}; return state; } } catch {} const state = makeSeed(); try { globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {} return state; }
  _persist() { try { globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(this.state)); } catch { /* A demonstração continua em memória se o navegador impedir armazenamento. */ } }
  _admin() { if (!['owner', 'admin'].includes(this.me.role)) fail('Somente administradores podem editar o conteúdo compartilhado.', 'permission-denied'); }
  _owner() { if (this.me.role !== 'owner' || this.me.id !== 'demo-owner') fail('Esta ação é exclusiva do responsável configurado pelo portal.', 'permission-denied'); }
  _item(entity, id) { if (!ENTITIES.includes(entity)) fail('Área inválida.'); const item = this.state.data[entity].find(row => row.id === id); if (!item) fail('Registro não encontrado.', 'not-found'); return item; }
  _version(item, expectedVersion) { if (item.version !== expectedVersion) fail('Este registro mudou. Atualize a página e revise os dados antes de salvar.', 'aborted'); }
  _stamp(item) { item.version += 1; item.updatedAt = now(); }
  _audit(action, entity, recordId, description = '') { this.state.data.audit.unshift(record(uuid(), { action, entity, recordId, actorId: this.me.id, actorName: this.me.name, description }, this.me.id)); }
  _personal() { return this.state.personals[this.me.id] || { favorites: [], tasks: {}, read: {}, preferences: {} }; }
  _visible(entity, semesterId) {
    if (!ENTITIES.includes(entity)) fail('Área inválida.');
    const admin = ['owner', 'admin'].includes(this.me.role);
    if ((!admin && ['audit', 'invites'].includes(entity)) || (entity === 'invites' && this.me.role !== 'owner')) return [];
    return this.state.data[entity].filter(item => {
      if (semesterId && SEMESTER_ENTITIES.includes(entity) && item.semesterId !== semesterId) return false;
      if (!admin && entity === 'members' && item.id !== this.me.id) return false;
      if (!admin && entity === 'requests' && item.authorId !== this.me.id) return false;
      if (!admin && item.status === 'draft') return false;
      if (!admin && item.status === 'archived' && entity !== 'semesters') return false;
      return true;
    }).map(item => {
      const value = clone(item);
      if (entity === 'ledger') { const privateData = this.state.ledgerPrivate[item.id]; if (privateData && (admin || privateData.contributorId === this.me.id)) Object.assign(value, clone(privateData)); }
      return value;
    });
  }
  _bootstrap(payload) {
    const semesterId = payload.semesterId || this.state.settings.activeSemesterId;
    const data = Object.fromEntries(ENTITIES.map(entity => [entity, this._visible(entity, semesterId)]));
    const totals = this.state.data.ledger.reduce((value, entry) => {
      value.balanceCents += entry.deltaCents;
      // Entradas e saídas líquidas consideram somente os originais não estornados.
      if (!entry.reversalOf && !entry.reversedBy) {
        if (entry.type === 'income') value.incomeCents += entry.amountCents;
        else value.expenseCents += entry.amountCents;
      }
      return value;
    }, { balanceCents: 0, incomeCents: 0, expenseCents: 0 });
    const goalTotals = this.state.data.ledger.reduce((totals, entry) => {
      if (entry.goalId) totals[entry.goalId] = (totals[entry.goalId] || 0) + entry.deltaCents;
      return totals;
    }, {});
    const result = { me: this.me, settings: clone(this.state.settings), data, personal: clone(this._personal()), totals, goalTotals, more: Object.fromEntries(ENTITIES.map(entity => [entity, null])) };
    if (['owner', 'admin'].includes(this.me.role)) result.noticeReads = clone(Object.values(this.state.noticeReadRecords || {}));
    return result;
  }
  _validate(entity, input, previous = null) {
    if (!EDITABLE.includes(entity) || !input || typeof input !== 'object' || Array.isArray(input)) fail('Dados de edição inválidos.');
    const merged = { ...(previous || {}), ...input };
    const data = Object.fromEntries(FIELDS[entity].filter(key => merged[key] !== undefined).map(key => [key, clone(merged[key])]));
    data.title = cleanText(data.title || '', 120);
    if (!data.title) fail('Preencha o título.');
    data.status ||= 'published';
    if (!STATUSES[entity].includes(data.status)) fail('Status inválido.');
    for (const [key, value] of Object.entries(data)) {
      if (['sourceUrl', 'platformUrl'].includes(key)) data[key] = url(value);
      else if (key.toLowerCase().endsWith('date') && value && !validDate(value)) fail('Informe uma data válida.');
      else if (['time', 'endTime'].includes(key) && value && !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) fail('Informe um horário válido.');
      else if (typeof value === 'string' && value.length > (key === 'description' ? 5000 : 1000)) fail('Um dos textos excedeu o limite permitido.');
    }
    if (SEMESTER_ENTITIES.includes(entity)) {
      if (!this.state.data.semesters.some(item => item.id === data.semesterId)) fail('Selecione um semestre válido.');
      if (data.subjectId && !this.state.data.subjects.some(item => item.id === data.subjectId && item.semesterId === data.semesterId)) fail('Selecione uma disciplina deste semestre.');
    }
    if (['materials', 'schedules', 'groups'].includes(entity) && !data.subjectId) fail('Selecione uma disciplina.');
    if (entity === 'subjects' && data.teacherIds && (!Array.isArray(data.teacherIds) || data.teacherIds.some(id => !this.state.data.teachers.some(teacher => teacher.id === id)))) fail('Selecione professores válidos.');
    if (['subjects', 'teachers'].includes(entity)) {
      data.links ||= [];
      if (!Array.isArray(data.links) || data.links.length > 10) fail('Cadastre no máximo 10 links.');
      data.links = data.links.map(item => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) fail('Link inválido.');
        const label = cleanText(item.label || '', 120), href = url(item.url || '');
        if (!label || !href) fail('Preencha o nome e o endereço de cada link.');
        return { label, url: href };
      });
    }
    if (entity === 'events') {
      data.eventState ||= 'confirmed';
      if (!['planned', 'confirmed', 'completed'].includes(data.eventState)) fail('Situação do evento inválida.');
      if (!validDate(data.date) || !['exam', 'assignment', 'activity', 'presentation', 'meeting', 'university'].includes(data.kind)) fail('Informe a data e o tipo da atividade.');
      if (data.endDate && data.endDate < data.date) fail('A data final deve ser igual ou posterior à data inicial.');
      if (previous && ['date', 'time', 'endDate', 'endTime'].some(key => (previous[key] || '') !== (data[key] || '')) && !data.changeReason?.trim()) fail('Explique o motivo da alteração do prazo.');
    }
    if (entity === 'materials' && !['material', 'notes', 'exercise', 'reference'].includes(data.category)) fail('Selecione uma categoria de material.');
    if (entity === 'materials' && !data.sourceUrl) fail('Informe o link do material.');
    if (entity === 'schedules' && !['1', '2', '3', '4', '5', '6'].includes(String(data.weekday))) fail('Selecione um dia da semana válido.');
    if (entity === 'schedules') data.weekday = String(data.weekday);
    if (entity === 'goals' && (!Number.isSafeInteger(data.targetCents) || data.targetCents <= 0)) fail('Informe uma meta positiva em centavos.');
    if (entity === 'semesters' && (!validDate(data.startDate) || !validDate(data.endDate) || data.endDate < data.startDate)) fail('Confira as datas do semestre.');
    return data;
  }
  _save(payload, skipAudit = false) {
    this._admin();
    const previous = payload.id ? this._item(payload.entity, payload.id) : null;
    if (previous) this._version(previous, payload.expectedVersion);
    const data = this._validate(payload.entity, payload.data, previous);
    if (payload.entity === 'semesters' && data.status === 'archived' && previous?.id === this.state.settings.activeSemesterId) fail('Escolha outro semestre ativo antes de arquivar este.');
    const deadlinesChanged = previous && payload.entity === 'events' && ['date', 'time', 'endDate', 'endTime'].some(key => (previous[key] || '') !== (data[key] || ''));
    const id = previous?.id || uuid();
    if (previous) { Object.assign(previous, data); this._stamp(previous); }
    else this.state.data[payload.entity].unshift(record(id, data, this.me.id));
    if (deadlinesChanged) this.state.data.news.unshift(record(uuid(), { title: `Prazo alterado: ${data.title}`, description: data.changeReason, eventId: id, semesterId: data.semesterId, status: 'published' }, this.me.id));
    if (!skipAudit) this._audit(previous ? 'update' : 'create', payload.entity, id);
    return { id };
  }
  async call(action, payload = {}) {
    if (!this.me.active) fail('Seu acesso está desativado.', 'permission-denied');
    const readOnly = ['bootstrap', 'list', 'backup'].includes(action);
    const key = payload.operationId ? `${this.me.id}/${payload.operationId}` : null;
    const signature = stable({ action, payload });
    if (!readOnly && key && this.state.operations[key]) {
      const operation = this.state.operations[key];
      if (operation.signature && operation.signature !== signature) fail('Esta operação já foi usada com outros dados. Atualize e tente novamente.', 'already-exists');
      return clone(operation.signature ? operation.result : operation);
    }
    const before = !readOnly ? clone(this.state) : null;
    try {
      const result = this._dispatch(action, payload);
      if (!readOnly) {
        if (key) { this.state.operations[key] = { signature, result }; const keys = Object.keys(this.state.operations); if (keys.length > 1000) delete this.state.operations[keys[0]]; }
        this._persist();
      }
      return clone(result);
    } catch (error) { if (before) this.state = before; throw error; }
  }
  _dispatch(action, payload) {
    switch (action) {
      case 'bootstrap': return this._bootstrap(payload);
      case 'list': {
        const items = this._visible(payload.entity, payload.semesterId || this.state.settings.activeSemesterId);
        const offset = Number(payload.cursor || 0);
        if (!Number.isSafeInteger(offset) || offset < 0) fail('Página inválida.');
        return { items: items.slice(offset, offset + 100), cursor: offset + 100 < items.length ? String(offset + 100) : null };
      }
      case 'save': return this._save(payload);
      case 'cloneSemester': {
        this._admin();
        const input = payload.data || {};
        const semester = this._validate('semesters', { title: input.title, startDate: input.startDate, endDate: input.endDate, status: 'published' });
        const source = this._item('semesters', input.sourceSemesterId);
        if (!['published', 'archived'].includes(source.status)) fail('O semestre de origem não está disponível para cópia.', 'failed-precondition');
        if (!Array.isArray(input.subjectIds) || input.subjectIds.length > 30 || new Set(input.subjectIds).size !== input.subjectIds.length || input.subjectIds.some(id => typeof id !== 'string')) fail('Selecione até 30 matérias diferentes.');
        if (input.copySchedules !== undefined && typeof input.copySchedules !== 'boolean') fail('Informe se os horários também devem ser copiados.');
        const subjects = input.subjectIds.map(id => this._item('subjects', id));
        if (subjects.some(item => item.semesterId !== source.id || item.status !== 'published')) fail('Escolha somente matérias publicadas do semestre de origem.', 'failed-precondition');
        const schedules = input.copySchedules ? this.state.data.schedules.filter(item => item.status === 'published' && input.subjectIds.includes(item.subjectId)) : [];
        if (schedules.some(item => item.semesterId !== source.id)) fail('Um horário selecionado está vinculado a outro semestre. Corrija o cadastro antes de copiar.', 'failed-precondition');
        if (schedules.length > 100) fail('O assistente permite copiar até 100 horários por vez.', 'resource-exhausted');
        const id = uuid(), subjectMap = new Map();
        this.state.data.semesters.unshift(record(id, { ...semester, clonedFrom: source.id }, this.me.id));
        for (const sourceSubject of subjects) {
          const subjectId = uuid();
          const subject = this._validate('subjects', { ...sourceSubject, semesterId: id, status: 'published' });
          this.state.data.subjects.unshift(record(subjectId, { ...subject, clonedFrom: sourceSubject.id }, this.me.id));
          subjectMap.set(sourceSubject.id, subjectId);
        }
        for (const sourceSchedule of schedules) {
          const schedule = this._validate('schedules', { ...sourceSchedule, semesterId: id, subjectId: subjectMap.get(sourceSchedule.subjectId), status: 'published' });
          this.state.data.schedules.unshift(record(uuid(), { ...schedule, clonedFrom: sourceSchedule.id }, this.me.id));
        }
        this._audit(action, 'semesters', id, `${subjects.length} matéria(s) e ${schedules.length} horário(s) copiados.`);
        return { id, subjectCount: subjects.length, scheduleCount: schedules.length };
      }
      case 'archive':
      case 'restore': {
        this._admin();
        if (!EDITABLE.includes(payload.entity)) fail('Esta área não permite arquivamento.');
        const item = this._item(payload.entity, payload.id);
        this._version(item, payload.expectedVersion);
        if (action === 'archive' && payload.entity === 'semesters' && item.id === this.state.settings.activeSemesterId) fail('Escolha outro semestre ativo antes de arquivar este.');
        item.status = action === 'archive' ? 'archived' : 'published'; this._stamp(item); this._audit(action, payload.entity, item.id);
        return { id: item.id };
      }
      case 'settings': {
        this._admin();
        const allowed = ['title', 'course', 'university', 'activeSemesterId', 'helpText'];
        const data = Object.fromEntries(allowed.filter(key => payload.data?.[key] !== undefined).map(key => [key, cleanText(payload.data[key], key === 'helpText' ? 5000 : 200)]));
        if ('title' in data && !data.title) fail('Preencha o nome do portal.');
        if (data.activeSemesterId && !this.state.data.semesters.some(item => item.id === data.activeSemesterId && item.status !== 'archived')) fail('Escolha um semestre não arquivado.');
        Object.assign(this.state.settings, data); this._audit(action, 'settings', 'main'); return { ok: true };
      }
      case 'invite': {
        this._owner();
        const email = cleanText(payload.email || '', 254).toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !['admin', 'student'].includes(payload.role)) fail('Confira o e-mail e o perfil do convite.');
        if (this.state.data.members.some(item => item.email.toLowerCase() === email)) fail('Este e-mail já faz parte da turma.', 'already-exists');
        if (this.state.data.invites.some(item => item.email === email && item.status === 'pending')) fail('Já existe um convite pendente para este e-mail.', 'already-exists');
        const id = uuid(); this.state.data.invites.unshift(record(id, { email, name: cleanText(payload.name || '', 120), role: payload.role, status: 'pending' }, this.me.id)); this._audit(action, 'invites', id); return { id };
      }
      case 'member': {
        this._owner();
        const member = this._item('members', payload.id);
        const role = payload.role ?? member.role, active = payload.active ?? member.active;
        if (!ROLES.includes(role) || typeof active !== 'boolean') fail('Perfil de participante inválido.');
        if (member.id === 'demo-owner' && (role !== 'owner' || !active)) fail('O responsável fixo não pode ser rebaixado ou desativado pelo aplicativo.');
        if (member.id !== 'demo-owner' && role === 'owner') fail('O portal tem um responsável único. A transferência é feita pelo titular no Console do Firebase.');
        Object.assign(member, { role, active }); this._stamp(member); this._audit(action, 'members', member.id); return { id: member.id };
      }
      case 'revokeInvite': {
        this._owner();
        const invitation = this._item('invites', payload.id);
        if (invitation.status !== 'pending') fail('Somente convites pendentes podem ser revogados. Para remover quem já entrou, desative o membro.', 'failed-precondition');
        invitation.status = 'revoked'; this._stamp(invitation); this._audit(action, 'invites', invitation.id); return { id: invitation.id };
      }
      case 'request': {
        const input = payload.data || {};
        if (this.me.role === 'student' && this.state.data.requests.filter(item => item.authorId === this.me.id && item.createdAt.slice(0, 10) === now().slice(0, 10)).length >= 10) fail('Limite de 10 solicitações por dia atingido.', 'resource-exhausted');
        const data = { title: cleanText(input.title || '', 120), description: cleanText(input.description || '', 5000), type: cleanText(input.type || 'support', 60), subjectId: input.subjectId || '', semesterId: input.semesterId || this.state.settings.activeSemesterId, sourceUrl: url(input.sourceUrl || ''), relatedId: cleanText(input.relatedId || '', 200), parentId: cleanText(input.parentId || '', 200), authorId: this.me.id, authorName: this.me.name, status: 'pending', response: '', publishedId: '' };
        if (!['notice', 'event', 'material', 'group', 'correction', 'finance', 'support'].includes(data.type)) fail('Escolha um tipo válido de solicitação.');
        if (!data.title || !data.description) fail('Preencha o título e a descrição da solicitação.');
        if (!this.state.data.semesters.some(item => item.id === data.semesterId)) fail('Selecione um semestre válido.');
        if (data.subjectId && !this.state.data.subjects.some(item => item.id === data.subjectId && item.semesterId === data.semesterId)) fail('Selecione uma disciplina válida.');
        if (data.parentId && !this.state.data.requests.some(item => item.id === data.parentId && item.authorId === this.me.id)) fail('Solicitação anterior inválida.');
        const id = uuid(); this.state.data.requests.unshift(record(id, data, this.me.id)); this._audit(action, 'requests', id); return { id };
      }
      case 'review': {
        this._admin();
        const request = this._item('requests', payload.id); this._version(request, payload.expectedVersion);
        if (['approved', 'rejected', 'cancelled'].includes(request.status)) fail('Esta solicitação já foi finalizada.', 'failed-precondition');
        if (!['reviewing', 'awaiting', 'rejected', 'cancelled', 'approved'].includes(payload.status)) fail('Escolha um status de revisão válido.');
        const response = cleanText(payload.response || '', 3000);
        if (payload.status !== 'reviewing' && !response) fail('Informe uma resposta para o aluno.');
        let publishedId = request.publishedId || '';
        let publishedEntity = request.publishedEntity || '';
        if (payload.status === 'approved' && !payload.entity && !['correction', 'finance', 'support'].includes(request.type)) fail('Este pedido exige uma publicação. Use Aprovar criando uma publicação.', 'failed-precondition');
        if (payload.status === 'approved' && payload.entity) {
          if (!['notice', 'event', 'material', 'group'].includes(request.type)) fail('Pedidos de caixa, ajuda e correção são privados e não podem virar publicações. Registre a solução na resposta ao aluno.', 'failed-precondition');
          if (!['notices', 'events', 'materials', 'groups'].includes(payload.entity)) fail('Área de publicação inválida.');
          const publication = this._validate(payload.entity, payload.data);
          if (publication.status !== 'published') fail('A aprovação deve criar conteúdo publicado.');
          if (publication.semesterId !== request.semesterId || (request.subjectId && publication.subjectId !== request.subjectId)) fail('A publicação deve pertencer ao semestre e à disciplina da solicitação.');
          publishedId = this._save({ entity: payload.entity, data: publication }, true).id;
          publishedEntity = payload.entity;
          Object.assign(this._item(payload.entity, publishedId), { sourceRequestId: request.id, submittedBy: request.authorId, submittedByName: request.authorName });
        }
        Object.assign(request, { status: payload.status, response, publishedId, publishedEntity, reviewedBy: this.me.id, reviewedAt: now() }); this._stamp(request); this._audit(action, 'requests', request.id, response);
        return { id: request.id, publishedId };
      }
      case 'ledger': {
        this._admin();
        const input = payload.data || {};
        if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0 || input.amountCents > 1000000000) fail('Informe um valor positivo e válido em centavos.');
        if (!['income', 'expense'].includes(input.type) || !validDate(input.date)) fail('Confira o tipo e a data do lançamento.');
        const data = { title: cleanText(input.title || '', 120), date: input.date, type: input.type, amountCents: input.amountCents, deltaCents: input.type === 'income' ? input.amountCents : -input.amountCents, incomeDeltaCents: input.type === 'income' ? input.amountCents : 0, expenseDeltaCents: input.type === 'expense' ? input.amountCents : 0, category: cleanText(input.category || 'Outros', 120), goalId: input.goalId || '', description: cleanText(input.description || '', 5000), reversalOf: '', reversedBy: '', reason: '' };
        if (!data.title) fail('Preencha o título.');
        if (data.goalId && !this.state.data.goals.some(item => item.id === data.goalId)) fail('Selecione uma meta válida.');
        if (input.contributorId && !this.state.data.members.some(item => item.id === input.contributorId)) fail('Participante não encontrado.');
        const id = uuid(); this.state.data.ledger.unshift(record(id, data, this.me.id)); this.state.ledgerPrivate[id] = { contributorId: input.contributorId || '', receiptUrl: url(input.receiptUrl || '') }; this._audit(action, 'ledger', id); return { id };
      }
      case 'reverse': {
        this._admin();
        const original = this._item('ledger', payload.id);
        if (original.reversalOf || original.reversedBy) fail('Este lançamento já é um estorno ou já foi estornado.', 'failed-precondition');
        const reason = cleanText(payload.reason || '', 5000); if (!reason) fail('Informe o motivo do estorno.');
        const id = `${original.id}_reverse`; this.state.data.ledger.unshift(record(id, { title: `Estorno: ${original.title}`.slice(0, 120), date: today(), type: original.type === 'income' ? 'expense' : 'income', amountCents: original.amountCents, deltaCents: -original.deltaCents, incomeDeltaCents: -(original.incomeDeltaCents ?? (original.type === 'income' ? original.amountCents : 0)), expenseDeltaCents: -(original.expenseDeltaCents ?? (original.type === 'expense' ? original.amountCents : 0)), category: 'Estorno', goalId: original.goalId || '', description: reason, reason, reversalOf: original.id, reversedBy: '' }, this.me.id)); this.state.ledgerPrivate[id] = { contributorId: this.state.ledgerPrivate[original.id]?.contributorId || '', receiptUrl: '' }; original.reversedBy = id; this._stamp(original); this._audit(action, 'ledger', id, reason); return { id };
      }
      case 'personal': {
        const input = payload.data || {}, data = clone(this._personal());
        if (input.favorites !== undefined) {
          if (!Array.isArray(input.favorites) || input.favorites.length > 500 || input.favorites.some(value => typeof value !== 'string' || !/^[a-z]+\/[^/]{1,200}$/.test(value))) fail('Lista de favoritos inválida.');
          data.favorites = [...new Set(input.favorites)];
        }
        if (input.tasks !== undefined) {
          if (!input.tasks || typeof input.tasks !== 'object' || Array.isArray(input.tasks) || Object.keys(input.tasks).length > 500 || Object.values(input.tasks).some(value => !['todo', 'doing', 'done'].includes(value))) fail('Checklist inválido.');
          data.tasks = clone(input.tasks);
        }
        if (input.read !== undefined) {
          if (!input.read || typeof input.read !== 'object' || Array.isArray(input.read) || Object.keys(input.read).length > 1000 || Object.values(input.read).some(value => !Number.isSafeInteger(value) || value < 1)) fail('Confirmações de leitura inválidas.');
          for (const [noticeId, version] of Object.entries(input.read)) {
            if (data.read[noticeId] === version) continue;
            const notice = this.state.data.notices.find(item => item.id === noticeId);
            if (!notice || notice.status !== 'published' || !notice.important || notice.version !== version) fail('Confirme apenas a versão atual de um aviso importante publicado.');
            this.state.noticeReadRecords[`${this.me.id}_${noticeId}`] = { memberId: this.me.id, memberName: this.me.name, noticeId, version, updatedAt: now() };
          }
          data.read = clone(input.read);
        }
        if (input.preferences !== undefined) {
          if (!input.preferences || typeof input.preferences !== 'object' || Array.isArray(input.preferences)) fail('Preferências inválidas.');
          const preferences = {};
          if (input.preferences.theme !== undefined) { if (!['light', 'dark'].includes(input.preferences.theme)) fail('Tema inválido.'); preferences.theme = input.preferences.theme; }
          if (input.preferences.initialView !== undefined) { if (!['home', 'calendar', 'subjects'].includes(input.preferences.initialView)) fail('Página inicial inválida.'); preferences.initialView = input.preferences.initialView; }
          if (input.preferences.subjectId !== undefined) preferences.subjectId = cleanText(input.preferences.subjectId, 200);
          data.preferences = preferences;
        }
        this.state.personals[this.me.id] = data; return { ok: true };
      }
      case 'backup': this._owner(); return { exportedAt: now(), source: 'demo-local', schemaVersion: 1, settings: clone(this.state.settings), data: { ...clone(this.state.data), noticeReads: clone(Object.values(this.state.noticeReadRecords || {})) }, ledgerPrivate: clone(this.state.ledgerPrivate) };
      default: fail('Ação não reconhecida.');
    }
  }
}
