import test from 'node:test';
import assert from 'node:assert/strict';
import { seedPortfolio, PORTFOLIO_USERS } from '../data/portfolio-seed.js';
import { CHECKLIST, TRACKS, startupLight, visibleStartups } from '../js/logic.js';
import * as A from '../js/analytics.js';

const today = '2026-11-20';
const data = () => seedPortfolio(today);

test('dataset: 72 startups, same every run, unique ids and names', () => {
  const a = data();
  assert.equal(a.length, 72);
  assert.deepEqual(a, data());
  assert.equal(new Set(a.map((s) => s.id)).size, 72);
  assert.equal(new Set(a.map((s) => s.name)).size, 72);
});

test('dataset: no event in the future, checklist in order, valid people and tracks', () => {
  for (const s of data()) {
    assert.ok(PORTFOLIO_USERS.some((u) => u.id === s.lead && u.role === 'analyst'), s.name);
    assert.notEqual(s.lead, s.second);
    assert.ok(TRACKS.some((t) => t.id === s.track));
    const dates = CHECKLIST.map((c) => s.checklist[c.id]).filter(Boolean);
    assert.deepEqual(dates, [...dates].sort(), `${s.name} out of order`);
    assert.ok(s.assigned <= today && dates.every((d) => d >= s.assigned && d <= today), s.name);
    const done = dates.length;
    assert.deepEqual(CHECKLIST.slice(0, done).map((c) => c.id), Object.keys(s.checklist), 'steps are done in sequence');
  }
});

test('dataset: it spans about a year and has a realistic spread', () => {
  const d = data();
  const oldest = d.map((s) => s.assigned).sort()[0];
  assert.ok(A.pipelineKpis(d, today).total === 72);
  assert.ok(oldest <= '2026-01-15');
  const k = A.pipelineKpis(d, today);
  assert.ok(k.completionRate > 15 && k.completionRate < 60, 'some, not all, finish');
  const f = A.funnel(d);
  assert.ok(f.every((x, i) => i === 0 || x.reached <= f[i - 1].reached));
  const mix = A.lightMix(d);
  assert.ok(mix.green > 0 && mix.yellow > 0 && mix.red > 0);
  assert.ok(d.filter((s) => s.form.submitted).every((s) => startupLight(s) === s.form.light));
});

test('weekly flow: 26 weeks, oldest first, counts match the data', () => {
  const d = data();
  const w = A.weeklyFlow(d, today, 26);
  assert.equal(w.length, 26);
  assert.equal(w.at(-1).end, today);
  assert.ok(w.every((x, i) => i === 0 || x.end > w[i - 1].end));
  const entered = w.reduce((n, x) => n + x.entered, 0);
  assert.equal(entered, d.filter((s) => s.assigned >= w[0].start).length);
  assert.equal(w.at(-1).open, A.pipelineKpis(d, today).active);
});

test('weekly flow: empty list gives zeros, not errors', () => {
  const w = A.weeklyFlow([], today, 4);
  assert.deepEqual(w.map((x) => x.open), [0, 0, 0, 0]);
});

test('quantile: interpolates and handles empty input', () => {
  assert.equal(A.quantile([], 0.5), null);
  assert.equal(A.quantile([4], 0.5), 4);
  assert.equal(A.quantile([1, 2, 3, 4], 0.5), 2.5);
  assert.equal(A.quantile([1, 2, 3, 4, 5], 0.25), 2);
});

test('phase stats: ordered quartiles, and they agree with the averages', () => {
  const d = data();
  const stats = A.stageDurationStats(d);
  for (const s of stats) {
    if (!s.n) continue;
    assert.ok(s.min <= s.p25 && s.p25 <= s.median && s.median <= s.p75 && s.p75 <= s.max, s.label);
  }
  assert.deepEqual(stats.map((s) => s.n), A.stageDurations(d).map((s) => s.startups));
});

test('sectors by light: rows add up to each sector and to the total', () => {
  const d = data();
  const rows = A.sectorByLight(d);
  for (const r of rows) assert.equal(r.green + r.yellow + r.red + r.none, r.total);
  assert.equal(rows.reduce((n, r) => n + r.total, 0), 72);
  for (let i = 1; i < rows.length; i += 1) assert.ok(rows[i - 1].total >= rows[i].total);
});

test('an analyst sees only their own startups in the large dataset too', () => {
  const d = data();
  const cleo = PORTFOLIO_USERS.find((u) => u.id === 'cleo');
  const mine = visibleStartups(cleo, d);
  assert.ok(mine.length > 0 && mine.length < d.length);
  assert.ok(mine.every((s) => s.lead === 'cleo' || s.second === 'cleo'));
});
