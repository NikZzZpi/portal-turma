export const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const money=n=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format((Number(n)||0)/100);
export const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export function shiftDay(date,days){const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);}
export const dateLabel=s=>s ? new Date(s.length===10?s+'T12:00:00Z':s).toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'short',year:'numeric'}) : 'Sem data';
export function safeUrl(s){try{const u=new URL(s);return ['http:','https:'].includes(u.protocol)?u.href:'';}catch{return '';}}
export const link=(url,label='Abrir fonte original')=>safeUrl(url)?`<a class="link" href="${esc(safeUrl(url))}" target="_blank" rel="noopener noreferrer">${esc(label)} ↗</a>`:'';
export function download(name,content,type){const a=document.createElement('a');const u=URL.createObjectURL(new Blob([content],{type}));a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}
export function toCSV(rows){return '\uFEFF'+rows.map(row=>row.map(v=>{let s=String(v??'');if(/^[\s\u200B-\u200D\uFEFF]*[=+@-]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';}).join(';')).join('\r\n');}
const icalEscape=s=>String(s??'').replace(/\\/g,'\\\\').replace(/\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,');
export function toICS(events){
 const out=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Portal da Turma//PT-BR','CALSCALE:GREGORIAN','X-WR-TIMEZONE:America/Sao_Paulo'];
 for(const e of events.filter(x=>x.status==='published')){
  const d=e.date.replaceAll('-','');out.push('BEGIN:VEVENT',`UID:${icalEscape(e.id)}@portal-turma`,`DTSTAMP:${new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'')}`,`SUMMARY:${icalEscape(e.title)}`);
  if(!e.time||e.allDay) out.push(`DTSTART;VALUE=DATE:${d}`,`DTEND;VALUE=DATE:${shiftDay(e.endDate||e.date,1).replaceAll('-','')}`);
  else {out.push(`DTSTART;TZID=America/Sao_Paulo:${d}T${e.time.replace(':','')}00`);if(e.endTime)out.push(`DTEND;TZID=America/Sao_Paulo:${(e.endDate||e.date).replaceAll('-','')}T${e.endTime.replace(':','')}00`);}
  out.push(`DESCRIPTION:${icalEscape((e.description||'')+(!e.time&&!e.allDay?'\nHorário não informado.':'')+(e.sourceUrl?'\n'+e.sourceUrl:''))}`,`LOCATION:${icalEscape(e.location||'')}`,'END:VEVENT');
 }out.push('END:VCALENDAR');return out.join('\r\n')+'\r\n';
}
export const statusLabels={published:'Publicado',draft:'Rascunho',archived:'Arquivado',cancelled:'Cancelado',closed:'Encerrado',pending:'Pendente',reviewing:'Em análise',awaiting:'Aguardando complemento',rejected:'Recusado',approved:'Aprovado',todo:'A fazer',doing:'Em andamento',done:'Concluído'};
export const kindLabels={exam:'Prova',assignment:'Trabalho',activity:'Atividade',presentation:'Apresentação',meeting:'Reunião',university:'Universidade'};
export function daysUntil(date){return Math.round((new Date(date+'T12:00:00Z')-new Date(today()+'T12:00:00Z'))/86400000);}
export function urgency(e){const n=daysUntil(e.date);return n<0?'Prazo encerrado':n===0?'Hoje':n===1?'Amanhã':`Em ${n} dias`;}
