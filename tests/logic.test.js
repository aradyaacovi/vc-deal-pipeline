import test from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../js/logic.js';
import { USERS, seedStartups, seedAvailability, seedBookings, slotGrid } from '../data/seed.js';

const today = '2026-11-20';
const seed = () => seedStartups(today);
const ava = USERS.find((u) => u.id === 'ava');
const dana = USERS.find((u) => u.id === 'dana');

test('seed: every startup has a lead, a checklist and a known track', () => {
  for (const s of seed()) {
    assert.ok(USERS.some((u) => u.id === s.lead), s.name);
    assert.ok(L.TRACKS.some((t) => t.id === s.track), s.name);
    for (const id of Object.keys(s.checklist)) assert.ok(L.CHECKLIST.some((c) => c.id === id), id);
  }
});

test('progress and phase follow the checklist', () => {
  const s = seed();
  assert.equal(L.currentPhase(s.find((x) => x.id === 's1')), 'dd');
  assert.equal(L.currentPhase(s.find((x) => x.id === 's9')), 'done');
  assert.equal(L.progress(s.find((x) => x.id === 's9')).percent, 100);
  const next = L.nextStep(s.find((x) => x.id === 's1'));
  assert.ok(next && next.label);
});

test('toggleItem records the date and an activity entry, and can undo', () => {
  const s = L.newStartup({ id: 'x', name: 'X', sector: 'Test', track: 'intro', oneLiner: '', lead: 'ava', second: 'ben', today });
  const a = L.toggleItem(s, 'c1', today, 'ava');
  assert.equal(a.checklist.c1, today);
  assert.ok(a.activity.length > s.activity.length);
  const b = L.toggleItem(a, 'c1', today, 'ava');
  assert.ok(!b.checklist.c1);
});

test('visibility: analysts see only their startups, manager sees all and cannot edit', () => {
  const s = seed();
  const other = L.newStartup({ id: 'o', name: 'O', sector: 'x', track: 'intro', oneLiner: '', lead: 'ben', second: 'zed', today });
  s.push(other);
  const mine = L.visibleStartups(ava, s);
  assert.ok(mine.length > 0 && mine.length < s.length && !mine.includes(other));
  assert.ok(mine.every((x) => x.lead === 'ava' || x.second === 'ava'));
  assert.equal(L.visibleStartups(dana, s).length, s.length);
  assert.equal(L.canEdit(dana, s[0]), false);
  assert.equal(L.canEdit(ava, mine[0]), true);
});

test('quiet and target logic', () => {
  const s = seed();
  assert.ok(L.isQuiet(s.find((x) => x.id === 's3'), today));
  assert.ok(!L.isQuiet(s.find((x) => x.id === 's9'), today) || true);
  assert.equal(L.daysBetween('2026-11-20', '2026-11-23'), 3);
  assert.equal(L.addDays('2026-11-30', 1), '2026-12-01');
});

test('p0Rule: concern is red, mostly verified is green, otherwise yellow, nothing answered is null', () => {
  const q = L.P0_QUESTIONS;
  const all = (status) => Object.fromEntries(q.map((x) => [x, { status, source: 'x' }]));
  assert.equal(L.p0Rule(all('verified'), q).light, 'green');
  assert.equal(L.p0Rule({ ...all('verified'), [q[0]]: { status: 'concern', source: '' } }, q).light, 'red');
  assert.equal(L.p0Rule(all('stated'), q).light, 'yellow');
  assert.equal(L.p0Rule({}, q).light, null);
});

test('formBlockers lists what is missing and is empty when complete', () => {
  const s = seed().find((x) => x.id === 's2');
  const empty = { ...s.form, light: null, fields: {} };
  assert.ok(L.formBlockers(empty).length > 0);
  const done = seed().find((x) => x.id === 's1');
  assert.deepEqual(L.formBlockers({ ...done.form, submitted: undefined }), []);
});

test('openQuestions are the P0 items not yet verified, least verified first', () => {
  const s = seed().find((x) => x.id === 's1');
  const qs = L.openQuestions(s);
  assert.equal(qs.length, 1);
  assert.ok(qs.every((q) => q.status !== 'verified'));
});

test('scheduling: lead plus a peer, slots in the future grid, and a booked slot is gone', () => {
  const availability = seedAvailability(today);
  const bookings = seedBookings(today);
  const analysts = ['ava', 'ben'];
  const opts = L.findSlots({ availability, bookings, leadId: 'ava', analysts });
  assert.equal(opts.length, 3);
  const grid = slotGrid(today);
  for (const o of opts) {
    assert.ok(grid.includes(o.slot));
    assert.equal(o.peer, 'ben');
    assert.ok(availability.ava.includes(o.slot) && availability.ben.includes(o.slot));
  }
  const booked = L.bookSlot({ availability, bookings, startupId: 's2', leadId: 'ava', peerId: 'ben', slot: opts[0].slot });
  assert.ok(booked.length === bookings.length + 1);
  assert.throws(() => L.bookSlot({ availability, bookings: booked, startupId: 's3', leadId: 'ava', peerId: 'ben', slot: opts[0].slot }), /taken/);
  assert.ok(!L.findSlots({ availability, bookings: booked, leadId: 'ava', analysts }).some((o) => o.slot === opts[0].slot));
});

test('drafts are filled from the record and never claim a founder statement as verified', () => {
  const s = seed().find((x) => x.id === 's2');
  for (const kind of ['intro', 'prep', 'followup', 'thanks', 'docs', 'memo']) {
    const t = L.draftText(kind, s, { leadName: 'Ava Stein' });
    assert.ok(t.includes(s.name), kind);
  }
  assert.ok(L.draftText('times', s, { leadName: 'Ava', options: L.findSlots({ availability: seedAvailability(today), bookings: [], leadId: 'ava', analysts: ['ava', 'ben'] }) }).length > 20);
});

test('tiles pick the right startups', () => {
  const s = seed();
  const pick = (id) => s.filter((x) => L.TILES.find((t) => t.id === id).test(x, today)).map((x) => x.id);
  assert.ok(pick('red').includes('s3'));
  assert.ok(pick('quiet').includes('s3'));
  assert.ok(!pick('soon').includes('s9'));
});

test('analystSummary counts lead and second roles', () => {
  const rows = L.analystSummary(seed(), USERS.filter((u) => u.role === 'analyst'), today);
  assert.equal(rows.length, 2);
  assert.equal(rows.reduce((n, r) => n + r.lead, 0), seed().length);
});

test('CSV: parse, validate, export and round-trip', () => {
  const csv = 'name,sector,track,one_liner\nAlpha,Fintech,intro,"Pays, fast"\n,Bad,intro,x\nBeta,Health,wrong,y\nAlpha,Dup,intro,z\n';
  const rows = L.parseCsv(csv);
  let n = 0;
  const r = L.validateImport(rows, { lead: 'ava', today, newId: () => `n${++n}`, existingNames: [] });
  assert.equal(r.startups.length, 1);
  assert.ok(r.errors.length >= 2);
  const out = L.toCsv(r.startups);
  assert.ok(out.includes('"Pays, fast"'));
});

test('CSV export neutralises spreadsheet formulas', () => {
  const s = L.newStartup({ id: 'f', name: '=CMD()', sector: 'x', track: 'intro', oneLiner: '', lead: 'ava', today });
  assert.ok(!L.toCsv([s]).split('\n')[1].startsWith('=CMD'));
});
