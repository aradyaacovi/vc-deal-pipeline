import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv } from '../js/logic.js';
import { assessImport, rejectedCsv, nameKey } from '../js/quality.js';
import { SAMPLE_CSV } from '../data/sample-import.js';

const today = '2026-11-20';
let n = 0;
const ctx = (extra = {}) => ({ lead: 'ava', today, newId: () => `t${(n += 1)}`, existingNames: ['Brightloom'], existingSectors: ['Digital health', 'Fintech'], ...extra });
const run = (text, extra) => assessImport(parseCsv(text), ctx(extra));

test('name key ignores case, punctuation and legal suffixes', () => {
  assert.equal(nameKey('Ember Grid Inc.'), nameKey('EMBER GRID'));
  assert.notEqual(nameKey('Ember Grid'), nameKey('Ember Grove'));
});

test('a clean file scores 100 with nothing to report', () => {
  const r = run('name,sector,track,one_liner\nAlpha,Fintech,intro,Payments.\nBeta,Digital health,launch,Wearables.\n');
  assert.equal(r.score, 100);
  assert.equal(r.errors.length, 0);
  assert.equal(r.warnings.length, 0);
  assert.equal(r.startups.length, 2);
});

test('sample file: rejects bad rows, warns on the rest, accepts the good ones', () => {
  const r = run(SAMPLE_CSV);
  const msgs = r.errors.map((e) => e.message).join('|');
  assert.match(msgs, /already on your list/);
  assert.match(msgs, /Name is empty/);
  assert.match(msgs, /Unknown track "sideways"/);
  assert.equal(r.rows, 11);
  assert.equal(r.errors.length, 3);
  assert.equal(r.startups.length, 8);
  assert.ok(r.score > 0 && r.score < 100);
});

test('sample file: each cleaning rule fires', () => {
  const w = run(SAMPLE_CSV).warnings.map((x) => x.message).join('|');
  assert.match(w, /Column "owner_notes" is not used/);
  assert.match(w, /Extra spaces trimmed in name/);
  assert.match(w, /Sector "digital health" normalised to "Digital health"/);
  assert.match(w, /looks like "Ember Grid Inc."/);
  assert.match(w, /No sector/);
  assert.match(w, /starts with = \+ - or @/);
});

test('sector spelling is unified to the most common one in the file when none exists yet', () => {
  const r = run('name,sector\nA,Cleantech\nB,cleantech\nC,Cleantech\n', { existingSectors: [] });
  assert.deepEqual(r.startups.map((s) => s.sector), ['Cleantech', 'Cleantech', 'Cleantech']);
});

test('per-column completeness counts non-empty cells', () => {
  const r = run('name,sector,track,one_liner\nA,X,intro,\nB,,intro,\n');
  const col = Object.fromEntries(r.columns.map((c) => [c.name, c.percent]));
  assert.deepEqual(col, { name: 100, sector: 50, track: 100, one_liner: 0 });
});

test('a file without a name column is rejected outright', () => {
  const r = run('company,sector\nA,B\n');
  assert.equal(r.startups.length, 0);
  assert.equal(r.score, 0);
  assert.match(r.errors[0].message, /Missing required column/);
});

test('an empty file does not crash', () => {
  assert.equal(run('').score, 0);
});

test('rejected rows export with line and reason, and stay formula-safe', () => {
  const text = 'name,track\nGood,intro\n,intro\n=cmd,weird\n';
  const rows = parseCsv(text);
  const r = assessImport(rows, ctx());
  const csv = rejectedCsv(rows, r.errors);
  const lines = csv.trim().split('\n');
  assert.equal(lines[0], 'line,reason,name,track');
  assert.equal(lines.length, 3);
  assert.ok(lines[1].startsWith('3,Name is empty'));
  assert.ok(lines[2].includes("'=cmd"));
});

test('500 rows import quickly', () => {
  const body = Array.from({ length: 500 }, (_, i) => `Company ${i},Fintech,intro,Line ${i}`).join('\n');
  const t0 = performance.now();
  const r = run(`name,sector,track,one_liner\n${body}\n`, { existingNames: [] });
  assert.equal(r.startups.length, 500);
  assert.ok(performance.now() - t0 < 1000);
});
