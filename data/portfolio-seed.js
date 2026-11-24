// A larger, deterministic synthetic dataset (72 invented startups over 12 months) so trends and funnels mean something.
// Same seed, same data, every run. All names are invented; any resemblance to a real company is coincidental.
import { CHECKLIST, P0_QUESTIONS, TRACKS, addDays, newStartup, p0Rule } from '../js/logic.js';
import { seedAvailability as smallAvailability } from './seed.js';

export const PORTFOLIO_USERS = [
  { id: 'ava', name: 'Ava Stein', role: 'analyst' },
  { id: 'ben', name: 'Ben Carter', role: 'analyst' },
  { id: 'cleo', name: 'Cleo Marsh', role: 'analyst' },
  { id: 'dev', name: 'Dev Patel', role: 'analyst' },
  { id: 'dana', name: 'Dana Rossi', role: 'manager' },
];

const SEED = 20261120;
const COUNT = 72;
const SECTORS = [
  ['Fintech', 14, ['Payments for', 'Lending tools for', 'Treasury software for']],
  ['Developer tools', 12, ['Code review for', 'Observability for', 'Testing tools for']],
  ['Climate software', 10, ['Carbon accounting for', 'Energy planning for', 'Emissions reporting for']],
  ['Digital health', 10, ['Remote monitoring for', 'Scheduling software for', 'Home testing for']],
  ['Logistics', 7, ['Route planning for', 'Warehouse software for', 'Freight booking for']],
  ['Food tech', 6, ['Plant-based products for', 'Supply tracking for', 'Menu software for']],
  ['Industrial automation', 6, ['Robotic picking for', 'Predictive maintenance for', 'Vision inspection for']],
  ['Education', 6, ['Tutoring tools for', 'Skills assessment for', 'Course software for']],
  ['Mobility', 5, ['Fleet charging for', 'Ride booking for', 'Parking software for']],
  ['Water tech', 4, ['Leak detection for', 'Quality sensing for', 'Irrigation control for']],
];
const CUSTOMERS = ['small manufacturers', 'regional clinics', 'freelancers', 'city utilities', 'mid-size retailers', 'school networks', 'logistics teams', 'restaurant groups'];
const FIRST = ['Brook', 'Cedar', 'Dune', 'Ember', 'Fable', 'Gale', 'Harbor', 'Iris', 'Juniper', 'Kite', 'Lumen', 'Maple', 'Nova', 'Opal', 'Pebble', 'Quill', 'Reed', 'Sable', 'Tidal', 'Umber', 'Vale', 'Willow', 'Yarrow', 'Zephyr'];
const SECOND = ['works', 'grid', 'loop', 'path', 'stone', 'bridge', 'field', 'forge', 'light', 'ledger', 'lab', 'wise'];
const FOUNDERS = ['Maya', 'Noor', 'Tomas', 'Iris', 'Omar', 'Lena', 'Gabe', 'Ravi', 'Hana', 'Yuri', 'Sana', 'Leo'];

// Probability a startup stalls before starting each phase (prep is never skipped).
const STALL = { meeting: 0.06, after: 0.1, dd: 0.22, end: 0.2 };
// Days a step takes, by phase: [min, max]
const STEP_DAYS = { prep: [2, 9], meeting: [0, 3], after: [2, 7], dd: [4, 16] };

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seedPortfolio(today) {
  const r = rng(SEED);
  const pick = (list) => list[Math.floor(r() * list.length)];
  const between = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
  const weighted = (rows) => { let x = r() * rows.reduce((n, row) => n + row[1], 0); for (const row of rows) { x -= row[1]; if (x < 0) return row; } return rows[0]; };
  const analysts = PORTFOLIO_USERS.filter((u) => u.role === 'analyst').map((u) => u.id);
  const used = new Set();
  const out = [];

  for (let i = 0; i < COUNT; i += 1) {
    let name;
    do { name = `${pick(FIRST)}${pick(SECOND)}`; name = name[0].toUpperCase() + name.slice(1); } while (used.has(name));
    used.add(name);
    const [sector, , lines] = weighted(SECTORS);
    const lead = pick(analysts);
    const second = pick(analysts.filter((a) => a !== lead));
    const track = r() < 0.55 ? TRACKS[0].id : TRACKS[1].id;
    const assigned = addDays(today, -(4 + Math.floor(351 * r() ** 1.5)));
    const s = newStartup({ id: `p${i + 1}`, name, sector, track, oneLiner: `${pick(lines)} ${pick(CUSTOMERS)}.`, lead, second, today: assigned });
    s.activity = [{ date: assigned, text: 'Assigned', by: lead }];
    s.founders = [pick(FOUNDERS)];
    s.founderInfo = { team: 'Two founders with relevant industry experience.', market: `${sector} buyers are under pressure to modernise.`, product: 'Working product with early users.', traction: 'A few pilots, no meaningful revenue yet.' };

    let cursor = assigned;
    let stalled = false;
    let prevPhase = null;
    for (const c of CHECKLIST) {
      if (c.phase !== prevPhase) {
        if (prevPhase && r() < STALL[c.phase]) stalled = true;
        prevPhase = c.phase;
      }
      if (c.id === 'c17' && r() < STALL.end) stalled = true;
      if (stalled) break;
      const [lo, hi] = STEP_DAYS[c.phase];
      const next = addDays(cursor, between(lo, hi));
      if (next > today) break;
      cursor = next;
      s.checklist[c.id] = cursor;
      s.activity.push({ date: cursor, text: `Done: ${c.label}`, by: lead });
    }
    const done = CHECKLIST.filter((c) => s.checklist[c.id]).length;

    if (s.checklist.c10) {
      P0_QUESTIONS.forEach((q) => {
        const x = r();
        const status = x < 0.5 ? 'verified' : x < 0.78 ? 'stated' : x < 0.96 ? 'unknown' : 'concern';
        s.form.p0[q] = { status, source: status === 'verified' ? 'Checked in diligence call' : '' };
      });
      s.form.light = p0Rule(s.form.p0).light;
      s.form.fields = { summary: `${name}: ${s.oneLiner}`, team: s.founderInfo.team, market: s.founderInfo.market, product: s.founderInfo.product, risks: s.form.light === 'red' ? 'A concern was flagged in diligence.' : 'No concerns raised.', next: 'Discuss at the next committee.' };
      s.form.submitted = s.checklist.c10;
    }
    s.target = done === CHECKLIST.length ? null : addDays(assigned, track === 'launch' ? 21 : 14);
    s.docs = [
      { folder: 'Application', files: ['Application form', 'Pitch deck'], status: 'received' },
      { folder: 'Financials', files: ['Last 12 months of financials'], status: done >= 14 ? 'received' : 'missing' },
      { folder: 'Cap table', files: ['Current cap table'], status: done >= 14 ? 'received' : 'missing' },
    ];
    out.push(s);
  }
  return out;
}

export function portfolioAvailability(today) {
  const base = smallAvailability(today);
  return { ...base, cleo: base.ava.filter((_, i) => i % 2 === 0), dev: base.ben.filter((_, i) => i % 3 !== 0) };
}
