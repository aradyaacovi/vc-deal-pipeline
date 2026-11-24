import test from 'node:test';
import assert from 'node:assert/strict';
import { seedStartups } from '../data/seed.js';
import { visibleStartups } from '../js/logic.js';
import { USERS } from '../data/seed.js';
import * as A from '../js/analytics.js';

const today = '2026-11-20';
const seed = () => seedStartups(today);

test('kpis: totals add up and rates are percentages', () => {
  const k = A.pipelineKpis(seed(), today);
  assert.equal(k.total, 9);
  assert.equal(k.active + k.completed, k.total);
  assert.equal(k.completionRate, Math.round((k.completed / k.total) * 100));
  for (const key of ['completionRate', 'quietRate', 'redRate', 'formRate']) assert.ok(k[key] >= 0 && k[key] <= 100, key);
  assert.ok(k.daysToFirstMeeting > 0);
});

test('kpis: an empty list gives nulls, not NaN', () => {
  const k = A.pipelineKpis([], today);
  assert.equal(k.total, 0);
  assert.equal(k.completionRate, null);
  assert.equal(k.avgProgress, null);
  assert.equal(k.daysToFirstMeeting, null);
});

test('funnel: each stage reaches no more startups than the one before it', () => {
  const f = A.funnel(seed());
  assert.equal(f[0].reached, 9);
  for (let i = 1; i < f.length; i += 1) assert.ok(f[i].reached <= f[i - 1].reached, f[i].label);
  assert.equal(f[1].conversion, Math.round((f[1].reached / f[0].reached) * 100));
  assert.equal(f.at(-1).label, 'Done');
});

test('funnel: conversion is null when the earlier stage is empty', () => {
  const f = A.funnel([]);
  assert.ok(f.every((s) => s.reached === 0));
  assert.ok(f.slice(1).every((s) => s.conversion === null));
});

test('stage durations: only counts startups that finished the phase, never negative', () => {
  const d = A.stageDurations(seed());
  for (const s of d) assert.ok(s.avgDays === null || s.avgDays >= 0, s.label);
  assert.ok(d[0].startups >= d[3].startups);
});

test('sectors: counts add up and are sorted by size', () => {
  const sectors = A.sectorBreakdown(seed());
  assert.equal(sectors.reduce((n, s) => n + s.count, 0), 9);
  const fintech = sectors.find((s) => s.sector === 'Fintech');
  assert.equal(fintech.count, 2);
  for (let i = 1; i < sectors.length; i += 1) assert.ok(sectors[i - 1].count >= sectors[i].count);
});

test('light mix covers every startup', () => {
  const m = A.lightMix(seed());
  assert.equal(m.green + m.yellow + m.red + m.none, 9);
  assert.ok(m.red >= 1);
});

test('dataset health: percentages come from real counts', () => {
  const list = seed();
  list[0].oneLiner = '';
  list[1].second = null;
  const h = Object.fromEntries(A.datasetHealth(list).map((c) => [c.id, c]));
  assert.equal(h.oneLiner.passed, 8);
  assert.equal(h.second.passed, 8);
  assert.equal(h.sector.percent, 100);
});

test('analysts see analytics only for their own startups', () => {
  const ben = USERS.find((u) => u.id === 'ben');
  const mine = visibleStartups(ben, seed());
  assert.ok(mine.every((s) => s.lead === 'ben' || s.second === 'ben'));
  assert.ok(A.pipelineKpis(mine, today).total <= 9);
});

test('analytics CSV: header, KPI rows, and no raw formulas', () => {
  const list = seed();
  list[0].sector = '=SUM(A1)';
  const csv = A.analyticsCsv(list, today);
  assert.ok(csv.startsWith('section,metric,value\n'));
  assert.ok(csv.includes('kpi,total,9'));
  assert.ok(csv.includes("'=SUM(A1)"));
  assert.ok(!/(^|,)=SUM/m.test(csv));
});

test('drillDown lists the startups behind a chart element', async () => {
  const { seedPortfolio } = await import('../data/portfolio-seed.js');
  const list = seedPortfolio('2026-11-20').startups ?? seedPortfolio('2026-11-20');
  const fn = A.funnel(list);
  for (const f of fn) assert.equal(A.drillDown(list, 'stage', f.id, '2026-11-20').length, f.reached);
  const st = A.stageDurationStats(list);
  for (const s of st) assert.equal(A.drillDown(list, 'phase', s.id, '2026-11-20').length, s.n);
  const leads = [...new Set(list.map((s) => s.lead))];
  const open = leads.reduce((n, id) => n + A.drillDown(list, 'analyst', id, '2026-11-20').length, 0);
  assert.equal(open, list.filter((s) => A.funnel([s]).at(-1).reached === 0).length);
});
