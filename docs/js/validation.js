
// Validation for forms and Firestore service. Firestore Rules enforce access independently.
class InputError extends Error {
  constructor(message, code = 'invalid-argument') { super(message); this.name = 'InputError'; this.code = code; }
}
const fail = (message, code) => { throw new InputError(message, code); };
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
function object(value, label = 'Dados') { if (!plain(value)) fail(`${label} devem ser um objeto.`); return value; }
function fields(value, allowed, label = 'Dados') {
  object(value, label);
  for (const key of Object.keys(value)) if (!allowed.includes(key)) fail(`Campo não permitido: ${key}.`);
  return value;
}
function text(value, name, max = 120, required = false) {
  if (value === undefined || value === null) value = '';
  if (typeof value !== 'string') fail(`${name}: informe um texto.`);
  const result = value.trim();
  if ((required && !result) || result.length > max || /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(result)) fail(`${name}: texto obrigatório ou maior que ${max} caracteres.`);
  return result;
}
function id(value, required = true) {
  const result = text(value, 'Identificador', 128, required);
  if (result && !/^[A-Za-z0-9_-]+$/.test(result)) fail('Identificador inválido.');
  return result;
}
function enumValue(value, allowed, name) { if (!allowed.includes(value)) fail(`${name}: opção inválida.`); return value; }
function integer(value, name, min = 0, max = Number.MAX_SAFE_INTEGER) { if (!Number.isSafeInteger(value) || value < min || value > max) fail(`${name}: informe um número inteiro entre ${min} e ${max}.`); return value; }
function bool(value, name) { if (typeof value !== 'boolean') fail(`${name}: informe verdadeiro ou falso.`); return value; }
function email(value) {
  const result = text(value, 'E-mail', 254, true).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) fail('E-mail inválido.');
  return result;
}
function url(value, required = false) {
  const result = text(value, 'Link', 2000, required);
  if (!result) return '';
  try { const u = new URL(result); if (!['https:', 'http:'].includes(u.protocol) || !u.hostname || u.username || u.password) fail('Use um link HTTP ou HTTPS sem senha.'); } catch (error) { if (error instanceof InputError) throw error; fail('Link inválido.'); }
  return result;
}
function date(value, required = true) {
  const result = text(value, 'Data', 10, required);
  if (!result) return '';
  const parsed = new Date(`${result}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result) || Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== result || result < '2000-01-01' || result > '2100-12-31') fail('Data inválida: use AAAA-MM-DD, entre 2000 e 2100.');
  return result;
}
function time(value, required = false) {
  const result = text(value, 'Horário', 5, required);
  if (result && !/^([01]\d|2[0-3]):[0-5]\d$/.test(result)) fail('Horário inválido: use HH:mm.');
  return result;
}
function links(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 10) fail('Informe no máximo 10 plataformas ou links.');
  return value.map(link => {
    fields(link,['label','url'],'Link');
    return { label:text(link.label,'Nome da plataforma',120,true),url:url(link.url,true) };
  });
}
const schemas = {
  semesters: ['title','startDate','endDate','status'],
  subjects: ['title','description','semesterId','teacherIds','platformUrl','links','sourceCheckedDate','room','status'],
  teachers: ['title','email','contact','officeHours','platformUrl','links','sourceCheckedDate','description','status'],
  schedules: ['title','subjectId','semesterId','weekday','time','endTime','room','status'],
  notices: ['title','description','semesterId','subjectId','category','sourceUrl','eventId','pinned','important','expiresDate','status'],
  events: ['title','description','semesterId','subjectId','kind','eventState','date','time','allDay','endDate','endTime','location','sourceUrl','changeReason','status'],
  materials: ['title','description','semesterId','subjectId','category','sourceUrl','authorName','status'],
  groups: ['title','description','semesterId','subjectId','date','time','location','sourceUrl','organizer','status'],
  goals: ['title','description','targetCents','date','status']
};
const states = {
  semesters: ['published','archived'], subjects: ['published','archived'], teachers: ['published','archived'], schedules: ['published','archived'],
  notices: ['draft','published','archived'], events: ['draft','published','cancelled','archived'], materials: ['draft','published','archived'],
  groups: ['draft','published','closed','archived'], goals: ['published','closed','archived']
};
function entity(name, input) {
  if (!Object.hasOwn(schemas, name)) fail('Tipo de conteúdo inválido.');
  fields(input, schemas[name]);
  const d = { title: text(input.title, 'Título', 120, true) };
  for (const key of schemas[name]) {
    if (key === 'title') continue;
    const value = input[key];
    if (key === 'status') d[key] = enumValue(value || 'published', states[name], 'Situação');
    else if (key === 'description') d[key] = text(value, 'Descrição', 5000);
    else if (['semesterId','subjectId','eventId'].includes(key)) d[key] = id(value, key === 'semesterId' || (key === 'subjectId' && ['schedules','materials','groups'].includes(name)));
    else if (['sourceUrl','platformUrl'].includes(key)) d[key] = url(value, name === 'materials');
    else if (key === 'email') d[key] = value ? email(value) : '';
    else if (key === 'links') d[key] = links(value);
    else if (['date','startDate','endDate','expiresDate','sourceCheckedDate'].includes(key)) d[key] = date(value, key === 'startDate' || (key === 'endDate' && name === 'semesters') || (key === 'date' && ['events','groups'].includes(name)));
    else if (['time','endTime'].includes(key)) d[key] = time(value, name === 'schedules');
    else if (key === 'weekday') d[key] = enumValue(String(value), ['1','2','3','4','5','6'], 'Dia da semana');
    else if (['pinned','important','allDay'].includes(key)) d[key] = value === undefined ? false : bool(value, key);
    else if (key === 'targetCents') d[key] = integer(value, 'Meta em centavos', 1, 100000000);
    else if (key === 'kind') d[key] = enumValue(value, ['exam','assignment','activity','presentation','meeting','university'], 'Tipo de evento');
    else if (key === 'eventState') d[key] = enumValue(value || 'confirmed', ['planned','confirmed','completed'], 'Andamento do evento');
    else if (key === 'category' && name === 'materials') d[key] = enumValue(value, ['material','notes','exercise','reference'], 'Tipo de material');
    else if (key === 'teacherIds') { if (!Array.isArray(value || []) || (value || []).length > 10) fail('Informe até 10 professores.'); d[key] = [...new Set((value || []).map(v => id(v)))]; }
    else d[key] = text(value, key, ['changeReason','contact','officeHours'].includes(key) ? 500 : 160);
  }
  if (name === 'semesters' && d.endDate < d.startDate) fail('O fim do semestre deve ser após o início.');
  if (name === 'schedules' && d.endTime <= d.time) fail('O fim da aula deve ser após o início.');
  if (name === 'events') {
    if (d.allDay) { d.time = ''; d.endTime = ''; }
    if (d.endDate && d.endDate < d.date) fail('O fim do evento deve ser após o início.');
    if ((!d.endDate || d.endDate === d.date) && d.time && d.endTime && d.endTime < d.time) fail('O horário final deve ser após o inicial.');
  }
  return d;
}
function request(input) {
  fields(input, ['title','description','type','subjectId','semesterId','sourceUrl','relatedId','parentId']);
  return { title: text(input.title,'Título',120,true), description: text(input.description,'Descrição',5000,true), type: enumValue(input.type,['notice','event','material','group','correction','finance','support'],'Tipo da solicitação'), subjectId: id(input.subjectId,false), semesterId: id(input.semesterId), sourceUrl: url(input.sourceUrl), relatedId: id(input.relatedId,false), parentId: id(input.parentId,false) };
}
function ledger(input) {
  fields(input, ['title','date','type','amountCents','category','goalId','contributorId','receiptUrl','description']);
  return { title: text(input.title,'Título',120,true), date: date(input.date), type: enumValue(input.type,['income','expense'],'Tipo'), amountCents: integer(input.amountCents,'Valor em centavos',1,100000000), category: text(input.category,'Categoria',120,true), goalId: id(input.goalId,false), contributorId: id(input.contributorId,false), receiptUrl: url(input.receiptUrl), description: text(input.description,'Descrição',5000) };
}
function personal(input) {
  fields(input,['favorites','tasks','read','preferences']);
  const output = {};
  if (Object.hasOwn(input,'favorites')) {
    if (!Array.isArray(input.favorites) || input.favorites.length > 500) fail('Limite de 500 favoritos.');
    output.favorites = [...new Set(input.favorites.map(x => { if (typeof x !== 'string' || !/^(notices|events|materials|groups|subjects|teachers)\/[A-Za-z0-9_-]{1,128}$/.test(x)) fail('Favorito inválido.'); return x; }))];
  }
  for (const key of ['tasks','read']) if (Object.hasOwn(input,key)) {
    object(input[key]); if (Object.keys(input[key]).length > 1000) fail(`Limite de 1000 registros em ${key}.`);
    output[key] = {};
    for (const [keyId,value] of Object.entries(input[key])) { id(keyId); if (['__proto__','prototype','constructor'].includes(keyId)) fail('Identificador reservado.'); output[key][keyId] = key === 'tasks' ? enumValue(value,['todo','doing','done'],'Tarefa') : integer(value,'Versão lida',1,1000000); }
  }
  if (Object.hasOwn(input,'preferences')) {
    fields(input.preferences,['theme','subjectId','initialView']); output.preferences = {};
    if (input.preferences.theme !== undefined) output.preferences.theme = enumValue(input.preferences.theme,['light','dark'],'Tema');
    if (input.preferences.subjectId !== undefined) output.preferences.subjectId = id(input.preferences.subjectId,false);
    if (input.preferences.initialView !== undefined) output.preferences.initialView = enumValue(input.preferences.initialView,['home','calendar','subjects'],'Tela inicial');
  }
  return output;
}
function settings(input) {
  fields(input,['title','course','university','activeSemesterId','helpText']);
  return { title: text(input.title,'Nome do portal',120,true), course: text(input.course,'Curso',160,true), university: text(input.university,'Universidade',160), activeSemesterId: id(input.activeSemesterId,false), helpText: text(input.helpText,'Ajuda',3000) };
}
function cloneSemester(input) {
  fields(input,['title','startDate','endDate','sourceSemesterId','subjectIds','copySchedules']);
  const semester = entity('semesters',{ title:input.title,startDate:input.startDate,endDate:input.endDate,status:'published' });
  if (!Array.isArray(input.subjectIds) || input.subjectIds.length > 30) fail('Selecione no máximo 30 matérias para copiar.');
  const subjectIds = input.subjectIds.map(value => id(value));
  if (new Set(subjectIds).size !== subjectIds.length) fail('Não repita matérias na seleção.');
  return { ...semester,sourceSemesterId:id(input.sourceSemesterId),subjectIds,copySchedules:input.copySchedules === undefined ? false : bool(input.copySchedules,'Copiar horários') };
}
export { InputError, fail, object, fields, text, id, enumValue, integer, bool, email, url, date, time, links, entity, request, ledger, personal, settings, cloneSemester, schemas, states };
