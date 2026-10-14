import test from 'node:test';
import assert from 'node:assert/strict';
import { esc, safeUrl, link, money, today, shiftDay, dateLabel, toCSV, toICS } from '../docs/js/helpers.js';

test('esc impede que textos de usuário se tornem marcação HTML', () => {
  assert.equal(esc('<img src=x onerror="alert(1)"> & \'texto\''), '&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; &#39;texto&#39;');
  assert.equal(esc(null), '');
  assert.equal(esc(undefined), '');
  assert.equal(esc(44), '44');
});

test('safeUrl aceita apenas endereços absolutos HTTP e HTTPS', () => {
  assert.equal(safeUrl('https://moodle.example.edu/curso?id=44'), 'https://moodle.example.edu/curso?id=44');
  assert.equal(safeUrl('http://example.edu/material'), 'http://example.edu/material');
  for (const value of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,<script>alert(1)</script>', 'file:///etc/passwd', '//example.org/x', '/arquivo.pdf', 'mailto:aluno@example.org', '', 'texto sem endereço']) {
    assert.equal(safeUrl(value), '', value);
  }
});

test('links externos mantêm o rótulo escapado e protegem a nova aba', () => {
  const result = link('https://example.edu/?a=1&b=2', '<script>teste</script>');
  assert.match(result, /href="https:\/\/example\.edu\/\?a=1&amp;b=2"/);
  assert.match(result, /rel="noopener noreferrer"/);
  assert.match(result, /&lt;script&gt;teste&lt;\/script&gt;/);
  assert.equal(link('javascript:alert(1)', 'Abrir'), '');
});

test('shiftDay respeita viradas de mês, ano e anos bissextos', () => {
  assert.equal(shiftDay('2026-01-31', 1), '2026-02-01');
  assert.equal(shiftDay('2026-03-01', -1), '2026-02-28');
  assert.equal(shiftDay('2028-02-28', 1), '2028-02-29');
  assert.equal(shiftDay('2028-02-29', 1), '2028-03-01');
  assert.equal(shiftDay('2026-12-31', 1), '2027-01-01');
  assert.equal(shiftDay('2027-01-01', -1), '2026-12-31');
  assert.equal(shiftDay('2026-10-09', 0), '2026-10-09');
});

test('today usa a data de São Paulo mesmo perto da meia-noite em UTC', () => {
  const OriginalDate = globalThis.Date;
  try {
    globalThis.Date = class extends OriginalDate {
      constructor(...args) { super(...(args.length ? args : ['2027-01-01T01:00:00Z'])); }
      static now() { return new OriginalDate('2027-01-01T01:00:00Z').getTime(); }
    };
    assert.equal(today(), '2026-12-31');
  } finally {
    globalThis.Date = OriginalDate;
  }
});

test('dateLabel não desloca uma data de calendário para o dia anterior', () => {
  assert.equal(dateLabel(''), 'Sem data');
  assert.match(dateLabel('2026-03-01'), /^01/);
  assert.match(dateLabel('2026-03-01'), /2026/);
});

const event = (changes = {}) => ({
  id: 'prova-44', title: 'Prova de Didática', status: 'published', date: '2026-10-31',
  time: '', allDay: false, description: '', location: 'Sala 12', ...changes
});

test('ICS com horário desconhecido conserva a data e declara a ausência do horário', () => {
  const result = toICS([event()]);
  assert.match(result, /DTSTART;VALUE=DATE:20261031\r\n/);
  assert.match(result, /DTEND;VALUE=DATE:20261101\r\n/);
  assert.match(result, /Horário não informado\./);
  assert.doesNotMatch(result, /DTSTART[^\r\n]*T000000/);
  assert.match(result, /END:VCALENDAR\r\n$/);
});

test('ICS de dia inteiro usa fim exclusivo inclusive em eventos com vários dias', () => {
  const result = toICS([event({ date: '2026-12-30', endDate: '2026-12-31', allDay: true })]);
  assert.match(result, /DTSTART;VALUE=DATE:20261230\r\n/);
  assert.match(result, /DTEND;VALUE=DATE:20270101\r\n/);
  assert.doesNotMatch(result, /Horário não informado/);
});

test('ICS de evento com horário explicita o fuso de Brasília', () => {
  const result = toICS([event({ time: '19:30', endTime: '21:00' })]);
  assert.match(result, /DTSTART;TZID=America\/Sao_Paulo:20261031T193000\r\n/);
  assert.match(result, /DTEND;TZID=America\/Sao_Paulo:20261031T210000\r\n/);
  assert.doesNotMatch(result, /Horário não informado/);
});

test('ICS não inventa horário final e não exporta rascunhos ou cancelados', () => {
  const result = toICS([
    event({ time: '08:00' }),
    event({ id: 'oculto-1', title: 'Rascunho confidencial', status: 'draft' }),
    event({ id: 'oculto-2', title: 'Evento cancelado', status: 'cancelled' }),
    event({ id: 'oculto-3', title: 'Evento arquivado', status: 'archived' })
  ]);
  assert.equal((result.match(/BEGIN:VEVENT/g) || []).length, 1);
  assert.doesNotMatch(result, /DTEND/);
  assert.doesNotMatch(result, /Rascunho confidencial|Evento cancelado|Evento arquivado/);
});

test('ICS escapa delimitadores e quebras de linha do conteúdo', () => {
  const result = toICS([event({ title: 'Leitura; debate, revisão', description: 'Linha 1\nLinha 2\\fim' })]);
  assert.ok(result.includes('SUMMARY:Leitura\\; debate\\, revisão\r\n'));
  assert.ok(result.includes('Linha 1\\nLinha 2\\\\fim'));
});

test('CSV conserva acentos, separadores e aspas sem quebrar as células', () => {
  const result = toCSV([['Descrição', 'Valor'], ['Livro; "Pedagogia"', 1250], [null, 'ação']]);
  assert.ok(result.startsWith('\uFEFF'));
  assert.ok(result.includes('"Livro; ""Pedagogia""";"1250"'));
  assert.ok(result.includes('"";"ação"'));
});

test('CSV neutraliza fórmulas fornecidas como texto por usuário', () => {
  const danger = ['=HYPERLINK("https://example.org")', '+SUM(1;2)', '-2+3', '@SUM(1;2)'];
  for (const value of danger) {
    assert.ok(toCSV([[value]]).startsWith('\uFEFF"\''), value);
  }
});

test('CSV neutraliza fórmulas precedidas de espaços e controles invisíveis', () => {
  for (const value of ['\t=1+1', '\r=1+1', '\n=1+1', '  =1+1', '\t+1+1', '\uFEFF=1+1']) {
    assert.ok(toCSV([[value]]).startsWith('\uFEFF"\''), JSON.stringify(value));
  }
});

test('money exibe os centavos em reais, incluindo zero e estornos', () => {
  const normalized = value => money(value).replace(/\s/g, ' ');
  assert.equal(normalized(12345), 'R$ 123,45');
  assert.equal(normalized(1), 'R$ 0,01');
  assert.equal(normalized(0), 'R$ 0,00');
  assert.equal(normalized(-105), '-R$ 1,05');
  assert.equal(normalized(100000), 'R$ 1.000,00');
  assert.equal(normalized(100.5), 'R$ 1,01');
});
