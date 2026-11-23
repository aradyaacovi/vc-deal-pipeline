import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  RUBRIC, scoreDeal, visibleDeals, canEdit, daysBetween, isStale, summarize, funnel,
  moveDeal, parseCsv, toCsv, validateImport, formatUsd, CHECKLIST, checklistProgress, meetingPrep,
} from '../js/logic.js';
import { seedDeals, USERS } from '../data/seed.js';

const TODAY = '2026-11-20';
const ava = USERS.find((u) => u.id === 'ava');
const ben = USERS.find((u) => u.id === 'ben');
const dana = USERS.find((u) => u.id === 'dana');

test('rubric weights sum to 1', () => {
  const sum = RUBRIC.reduce((n, c) => n + c.weight, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9);
});

test('scoreDeal: weighted average and light thresholds', () => {
  const all = (v) => Object.fromEntries(RUBRIC.map((c) => [c.id, v]));
  assert.deepEqual(scoreDeal(all(5)), { value: 5, light: 'green', complete: true, rated: 5 });
  assert.equal(scoreDeal(all(4)).light, 'green');
  assert.equal(scoreDeal(all(3)).light, 'yellow');
  assert.equal(scoreDeal(all(2)).light, 'red');
  // 3.8 is the first green value, 3.0 the first yellow value
  assert.equal(scoreDeal({ team: 4, market: 4, product: 4, traction: 3, terms: 4 }).value, 3.85);
  assert.equal(scoreDeal({ team: 4, market: 4, product: 4, traction: 3, terms: 4 }).light, 'green');
});

test('scoreDeal: a 1 on any criterion forces red', () => {
  const s = scoreDeal({ team: 5, market: 5, product: 5, traction: 1, terms: 5 });
  assert.ok(s.value > 4);
  assert.equal(s.light, 'red');
});

test('scoreDeal: partial ratings are renormalised and flagged incomplete', () => {
  const s = scoreDeal({ team: 4, market: 4 });
  assert.equal(s.value, 4);
  assert.equal(s.complete, false);
  assert.equal(s.rated, 2);
  assert.equal(scoreDeal({}), null);
});

test('scoreDeal: ignores out-of-range and non-integer values', () => {
  assert.equal(scoreDeal({ team: 0, market: 6, product: 3.5, traction: '4' }), null);
});

test('analysts see only their own deals; managers see all', () => {
  const deals = seedDeals(TODAY);
  assert.ok(visibleDeals(ava, deals).every((d) => d.analyst === 'ava'));
  assert.ok(visibleDeals(ben, deals).every((d) => d.analyst === 'ben'));
  assert.equal(visibleDeals(dana, deals).length, deals.length);
  assert.equal(visibleDeals(ava, deals).length + visibleDeals(ben, deals).length, deals.length);
});

test('only the owning analyst can edit; managers are read-only', () => {
  const [d] = seedDeals(TODAY).filter((x) => x.analyst === 'ava');
  assert.equal(canEdit(ava, d), true);
  assert.equal(canEdit(ben, d), false);
  assert.equal(canEdit(dana, d), false);
});

test('daysBetween and staleness (only active stages go stale)', () => {
  assert.equal(daysBetween('2026-11-01', '2026-11-20'), 19);
  assert.equal(isStale({ stage: 'screening', updated: '2026-11-06' }, TODAY), false); // 14 days
  assert.equal(isStale({ stage: 'screening', updated: '2026-11-05' }, TODAY), true); // 15 days
  assert.equal(isStale({ stage: 'passed', updated: '2026-01-01' }, TODAY), false);
  assert.equal(isStale({ stage: 'invested', updated: '2026-01-01' }, TODAY), false);
});

test('summarize counts the seed data', () => {
  const s = summarize(seedDeals(TODAY), TODAY);
  assert.equal(s.total, 14);
  assert.equal(s.active, 11);
  assert.equal(s.byStage.passed, 2);
  assert.equal(s.byStage.invested, 1);
  assert.equal(s.stale, 3); // Tidewell Labs (21 days), Saltmarsh Foods (16), Lumenfield (18)
});

test('funnel: counts deals that reached each stage, passed deals count up to where they were passed', () => {
  const deals = [
    { stage: 'sourced' }, { stage: 'screening' }, { stage: 'deep-dive' }, { stage: 'invested' },
    { stage: 'passed', passedFrom: 'screening' },
  ];
  const f = funnel(deals);
  assert.deepEqual(f.map((x) => x.reached), [5, 4, 2, 1, 1]);
  assert.equal(f[0].conversion, null);
  assert.equal(f[1].conversion, 80);
  assert.equal(f[2].conversion, 50);
});

test('moveDeal records where a deal was passed from and stamps the date', () => {
  const d = { id: 'x', stage: 'deep-dive', updated: '2026-01-01' };
  const passed = moveDeal(d, 'passed', TODAY);
  assert.equal(passed.passedFrom, 'deep-dive');
  assert.equal(passed.updated, TODAY);
  assert.equal(moveDeal(passed, 'screening', TODAY).passedFrom, undefined);
  assert.throws(() => moveDeal(d, 'nonsense', TODAY));
});

test('parseCsv handles quotes, escaped quotes, embedded newlines and CRLF', () => {
  const rows = parseCsv('name,notes\r\n"Acme, Inc","said ""hi""\nsecond line"\r\nPlain,ok\r\n');
  assert.deepEqual(rows, [['name', 'notes'], ['Acme, Inc', 'said "hi"\nsecond line'], ['Plain', 'ok']]);
});

test('toCsv and parseCsv round-trip', () => {
  const deals = [{ name: 'A, B', sector: 'X', stage: 'sourced', askUsd: 5, notes: 'q"uote' }];
  const rows = parseCsv(toCsv(deals));
  assert.deepEqual(rows[1], ['A, B', 'X', 'sourced', '5', 'q"uote']);
});

test('validateImport: accepts good rows and reports bad ones with file line numbers', () => {
  let n = 0;
  const opts = { analyst: 'ava', today: TODAY, newId: () => `n${n++}`, existingNames: ['Brightloom'] };
  const rows = parseCsv([
    'name,sector,stage,ask_usd,notes',
    'Good Co,SaaS,screening,500000,fine',
    ',SaaS,sourced,,no name',
    'Bad Stage,SaaS,someday,,',
    'Bad Ask,SaaS,sourced,lots,',
    'good co,SaaS,sourced,,duplicate in file',
    'Brightloom,Climate,sourced,,already exists',
  ].join('\n'));
  const { deals, errors } = validateImport(rows, opts);
  assert.equal(deals.length, 1);
  assert.equal(deals[0].analyst, 'ava');
  assert.equal(deals[0].askUsd, 500000);
  assert.deepEqual(errors.map((e) => e.line), [3, 4, 5, 6, 7]);
});

test('validateImport: missing required columns and empty files', () => {
  const opts = { analyst: 'ava', today: TODAY, newId: () => 'x' };
  assert.match(validateImport(parseCsv('sector\nSaaS'), opts).errors[0].message, /Missing required column: name, stage/);
  assert.equal(validateImport([], opts).errors[0].message, 'File is empty');
});

test('formatUsd', () => {
  assert.equal(formatUsd(1500000), '$1.5M');
  assert.equal(formatUsd(900000), '$900K');
  assert.equal(formatUsd(undefined), '—');
});

test('checklistProgress counts done steps', () => {
  assert.deepEqual(checklistProgress({}), { done: 0, total: CHECKLIST.length, percent: 0 });
  assert.equal(checklistProgress({ checklist: { c1: true, c2: true, nope: true } }).done, 2);
  const seed = seedDeals(TODAY);
  assert.equal(checklistProgress(seed.find((d) => d.stage === 'invested')).percent, 100);
});

test('meetingPrep targets the weakest and unrated criteria', () => {
  const m = meetingPrep({ name: 'X', sector: 'Y', askUsd: 1000000, notes: '', scores: { team: 5, market: 5, product: 5, traction: 2, terms: 4 } });
  assert.match(m.focus[0], /^Traction \(rated 2\)/);
  assert.equal(m.questions.filter((q) => q.criterion === 'Traction').length, 2);
  assert.ok(m.opening[1].includes('$1M'));
  const blank = meetingPrep({ name: 'Z', sector: 'Y', scores: {} });
  assert.ok(blank.focus.every((f) => f.includes('not yet rated')));
  assert.equal(blank.questions.length, 4);
});

// ---- history, filters, submission, memo, workload ------------------------------------

import {
  daysInStage, filterDeals, validateSubmission, submitDeal, draftMemo, analystSummary,
} from '../js/logic.js';

test('moveDeal records a stage change in history, and not a no-op move', () => {
  const d = { id: 'x', stage: 'screening', updated: '2026-01-01' };
  const moved = moveDeal(d, 'deep-dive', TODAY);
  assert.deepEqual(moved.history, [{ date: TODAY, from: 'screening', to: 'deep-dive' }]);
  assert.equal(moveDeal(moved, 'deep-dive', '2026-12-01').history.length, 1);
  assert.equal(daysInStage(moved, '2026-11-25'), 5);
  assert.equal(daysInStage(d, TODAY), null);
});

test('seed deals carry a consistent history ending at their current stage', () => {
  for (const d of seedDeals(TODAY)) {
    const last = d.history.at(-1);
    if (d.stage === 'sourced') assert.equal(d.history.length, 0);
    else assert.equal(last.to, d.stage, d.name);
  }
});

test('filterDeals: stale, traffic light and unscored', () => {
  const deals = seedDeals(TODAY);
  assert.deepEqual(filterDeals(deals, 'stale', TODAY).map((d) => d.id).sort(), deals.filter((d) => isStale(d, TODAY)).map((d) => d.id).sort());
  assert.ok(filterDeals(deals, 'green', TODAY).every((d) => scoreDeal(d.scores).light === 'green'));
  assert.ok(filterDeals(deals, 'unscored', TODAY).every((d) => !scoreDeal(d.scores)));
  assert.equal(filterDeals(deals, 'all', TODAY).length, deals.length);
});

test('validateSubmission lists every blocker, and passes a ready deal', () => {
  const empty = { stage: 'screening', scores: {}, checklist: {}, notes: '' };
  assert.equal(validateSubmission(empty).length, 5);
  const red = { ...seedDeals(TODAY).find((d) => d.id === 'd10'), scores: { team: 1, market: 3, product: 3, traction: 3, terms: 3 } };
  assert.ok(validateSubmission(red).some((b) => b.includes('red')));
  const ready = seedDeals(TODAY).find((d) => d.id === 'd5');
  assert.deepEqual(validateSubmission(ready), []);
});

test('submitDeal moves to IC review, records the submission, and refuses an unready deal', () => {
  const ready = seedDeals(TODAY).find((d) => d.id === 'd5');
  const sent = submitDeal(ready, TODAY);
  assert.equal(sent.stage, 'ic-review');
  assert.equal(sent.submission.date, TODAY);
  assert.equal(sent.submission.light, scoreDeal(ready.scores).light);
  assert.equal(sent.history.at(-1).to, 'ic-review');
  assert.throws(() => submitDeal({ ...ready, notes: '' }, TODAY));
});

test('draftMemo includes the evaluation table, a recommendation by light, and flags risks', () => {
  const memo = draftMemo(seedDeals(TODAY).find((d) => d.id === 'd1'));
  assert.match(memo, /# Investment memo \(draft\): Brightloom/);
  assert.match(memo, /\| Team \| 30% \| 5 \|/);
  assert.match(memo, /term-sheet/);
  const risky = draftMemo({ name: 'X', sector: 'Y', stage: 'screening', scores: { team: 2 }, notes: '' });
  assert.match(risky, /Risks and gaps: Team \(2\/5\), Market \(not rated\)/);
  assert.match(risky, /No notes recorded yet/);
});

test('analystSummary counts per analyst and ignores empty ones', () => {
  const deals = seedDeals(TODAY);
  const rows = analystSummary(deals, USERS.filter((u) => u.role === 'analyst'), TODAY);
  assert.equal(rows.length, 2);
  const a = rows.find((r) => r.id === 'ava');
  assert.equal(a.active, deals.filter((d) => d.analyst === 'ava' && ['sourced', 'screening', 'deep-dive', 'ic-review'].includes(d.stage)).length);
  assert.equal(a.submitted, 1);
  assert.equal(analystSummary([], [{ id: 'z', name: 'Z' }], TODAY)[0].avgScore, null);
});
