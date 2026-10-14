import test from 'node:test';
import assert from 'node:assert/strict';
import * as v from '../docs/js/validation.js';

test('datas reais, anos bissextos e horários', () => {
  assert.equal(v.date('2028-02-29'),'2028-02-29');
  for (const date of ['2026-02-29','2026-04-31','2026-1-09','1999-12-31','2026-13-01']) assert.throws(() => v.date(date),v.InputError);
  for (const time of ['24:00','08:60','8:05','12:30:00']) assert.throws(() => v.time(time),v.InputError);
  assert.equal(v.time('23:59'),'23:59');
});
test('URLs não executam protocolos de scripts, nem aceitam credenciais', () => {
  for (const url of ['javascript:alert(1)','data:text/html,hi','file:///etc/passwd','https://user:secret@example.com','não é link']) assert.throws(() => v.url(url),v.InputError);
  assert.equal(v.url('https://classroom.google.com/c/123'),'https://classroom.google.com/c/123');
});
test('campos desconhecidos, metadados e elevação de perfil são recusados', () => {
  for (const field of ['role','createdBy','id','version','authorId']) assert.throws(() => v.entity('teachers',{title:'Professor', [field]:'owner'}),v.InputError);
  assert.throws(() => v.personal({role:'owner'}),v.InputError);
  assert.throws(() => v.entity('__proto__',{}),v.InputError);
  assert.throws(() => v.personal(JSON.parse('{"tasks":{"__proto__":"done"}}')),v.InputError);
});
test('dinheiro é centavos inteiros, positivos, com limite explícito', () => {
  const base = {title:'Contribuição',date:'2026-10-09',type:'income',category:'Mensalidade'};
  assert.equal(v.ledger({...base,amountCents:2500}).amountCents,2500);
  for (const amount of [0,-5,25.5,'2500',NaN,Infinity,100000001]) assert.throws(() => v.ledger({...base,amountCents:amount}),v.InputError);
});
test('agenda exige intervalo válido e ignora horário em evento de dia inteiro', () => {
  assert.throws(() => v.entity('schedules',{title:'Aula',subjectId:'a',semesterId:'b',weekday:'2',time:'10:00',endTime:'09:00'}),v.InputError);
  const event = v.entity('events',{title:'Prova',semesterId:'b',kind:'exam',date:'2026-11-01',time:'09:00',endTime:'10:00',allDay:true});
  assert.equal(event.time,''); assert.equal(event.endTime,'');
  assert.throws(() => v.entity('events',{...event,endDate:'2026-10-31'}),v.InputError);
});
test('dados pessoais têm limites e formato próprios', () => {
  assert.deepEqual(v.personal({favorites:['events/abc','events/abc'],tasks:{abc:'done'},read:{notice:3},preferences:{theme:'dark'}}).favorites,['events/abc']);
  assert.throws(() => v.personal({favorites:['members/owner']}),v.InputError);
  assert.throws(() => v.personal({favorites:Array(501).fill('events/abc')}),v.InputError);
  assert.throws(() => v.personal({read:{abc:0}}),v.InputError);
  assert.throws(() => v.personal({preferences:{admin:true}}),v.InputError);
});
test('plataformas têm rótulo, URL segura e limite de dez por cadastro', () => {
  const teacher=v.entity('teachers',{title:'Ana',links:[{label:'Moodle',url:'https://example.edu/moodle'},{label:'Classroom',url:'https://classroom.google.com'}],sourceCheckedDate:'2026-10-09'});
  assert.equal(teacher.links.length,2);assert.equal(teacher.sourceCheckedDate,'2026-10-09');
  assert.throws(()=>v.entity('teachers',{title:'Ana',links:[{label:'',url:'https://example.edu'}]}),v.InputError);
  assert.throws(()=>v.entity('subjects',{title:'A',semesterId:'s',links:Array(11).fill({label:'A',url:'https://example.edu'})}),v.InputError);
  assert.throws(()=>v.entity('teachers',{title:'A',links:[{label:'Inseguro',url:'javascript:alert(1)'}]}),v.InputError);
  assert.throws(()=>v.entity('teachers',{title:'A',sourceCheckedDate:'2026-02-30'}),v.InputError);
});
test('andamento coletivo, tela inicial e limites do assistente de semestre', () => {
  const event={title:'Evento',semesterId:'s',kind:'exam',date:'2026-10-09'};
  assert.equal(v.entity('events',event).eventState,'confirmed');
  assert.equal(v.entity('events',{...event,eventState:'completed'}).eventState,'completed');
  assert.throws(()=>v.entity('events',{...event,eventState:'admin'}),v.InputError);
  assert.deepEqual(v.personal({preferences:{initialView:'calendar',subjectId:'s'}}).preferences,{initialView:'calendar',subjectId:'s'});
  assert.throws(()=>v.personal({preferences:{initialView:'admin'}}),v.InputError);
  const clone={title:'Próximo',startDate:'2027-02-01',endDate:'2027-06-30',sourceSemesterId:'s',subjectIds:['a'],copySchedules:true};
  assert.equal(v.cloneSemester(clone).copySchedules,true);
  assert.throws(()=>v.cloneSemester({...clone,subjectIds:Array(31).fill('a')}),v.InputError);
  assert.throws(()=>v.cloneSemester({...clone,subjectIds:['a','a']}),v.InputError);
  assert.throws(()=>v.cloneSemester({...clone,copySchedules:'false'}),v.InputError);
});
