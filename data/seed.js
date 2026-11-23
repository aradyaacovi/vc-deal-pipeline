// Entirely fictional demo data. Company names are invented; any resemblance to a real company is coincidental.
import { CHECKLIST, P0_QUESTIONS, addDays, newStartup } from '../js/logic.js';

export const USERS = [
  { id: 'ava', name: 'Ava Stein', role: 'analyst' },
  { id: 'ben', name: 'Ben Carter', role: 'analyst' },
  { id: 'dana', name: 'Dana Rossi', role: 'manager' },
];

// [id, name, sector, track, lead, second, itemsDone, lastActivityDaysAgo, targetInDays, oneLiner, founder, info, p0, submitted]
const ROWS = [
  ['s1', 'Brightloom', 'Climate software', 'launch', 'ava', 'ben', 16, 2, 6, 'Carbon accounting for mid-size manufacturers.', 'Maya',
    { team: 'Two founders, ten years in industrial software.', market: 'Mid-size manufacturers must report emissions from 2027.', product: 'Connects to existing ERP data, no new hardware.', traction: 'Two paying pilots, one signed annual contract.' },
    ['verified', 'verified', 'verified', 'stated', 'verified'], true],
  ['s2', 'Fernwick Health', 'Digital health', 'launch', 'ava', 'ben', 9, 5, 3, 'Remote monitoring for post-surgery recovery.', 'Noor',
    { team: 'A surgeon and a data scientist.', market: 'Post-surgery readmissions cost hospitals billions.', product: 'Wearable patch plus clinician dashboard.', traction: 'One hospital pilot, results pending.' },
    ['stated', 'verified', 'verified', 'unknown', 'stated'], false],
  ['s3', 'Oakhaven Robotics', 'Industrial automation', 'intro', 'ava', 'ben', 8, 9, 10, 'Warehouse picking arm for mixed items.', 'Tomas',
    { team: 'Robotics PhDs, no commercial experience.', market: 'Warehouse labour shortage.', product: 'Prototype arm, 70% pick success in tests.', traction: 'No revenue yet.' },
    ['concern', 'verified', 'stated', 'unknown', 'unknown'], false],
  ['s4', 'Marlowe Pay', 'Fintech', 'intro', 'ava', 'ben', 1, 3, 2, 'Payments for freelancers working across borders.', 'Iris',
    { team: 'Former payments product lead and an engineer.', market: 'Freelancer cross-border income is growing.', product: 'Wallet with local payout rails.', traction: 'Waitlist of 900 freelancers.' },
    null, false],
  ['s5', 'Tidewell Labs', 'Water tech', 'launch', 'ava', 'ben', 3, 12, 8, 'Sensor network for leak detection in city pipes.', 'Omar',
    { team: 'Three engineers from a utility.', market: 'Cities lose a fifth of treated water to leaks.', product: 'Clamp-on acoustic sensors.', traction: 'Pilot with one municipality.' },
    null, false],
  ['s6', 'Pinecrest AI', 'Developer tools', 'intro', 'ben', 'ava', 5, 1, 12, 'Code-review assistant for large teams.', 'Lena',
    { team: 'Two founders from infrastructure companies.', market: 'Review is the slowest step in delivery.', product: 'Plugin for the main code hosts.', traction: '40 teams on the free plan.' },
    null, false],
  ['s7', 'Saltmarsh Foods', 'Food tech', 'intro', 'ben', 'ava', 2, 9, 5, 'Plant-based seafood for restaurants.', 'Gabe',
    { team: 'A chef and a food scientist.', market: 'Restaurants want seafood alternatives.', product: 'Three tested products.', traction: 'Two restaurant trials.' },
    null, false],
  ['s8', 'Kestrel Mobility', 'Mobility', 'launch', 'ben', 'ava', 12, 4, 7, 'Marketplace for fleet charging capacity.', 'Ravi',
    { team: 'Founders from a charging operator.', market: 'Fleets electrify faster than depots can keep up.', product: 'Booking and billing platform.', traction: 'Letters of intent from three fleets.' },
    ['unknown', 'verified', 'stated', 'stated', 'stated'], false],
  ['s9', 'Verdant Ledger', 'Fintech', 'launch', 'ben', 'ava', 17, 6, null, 'Treasury tooling for small exporters.', 'Hana',
    { team: 'Finance lead and a backend engineer.', market: 'Small exporters hedge poorly.', product: 'Currency exposure dashboard.', traction: 'Twelve paying customers.' },
    ['verified', 'verified', 'verified', 'verified', 'stated'], true],
];

const DOCS = [
  ['Application', ['Application form', 'Pitch deck'], 'received'],
  ['Financials', ['Last 12 months of financials'], 'missing'],
  ['Cap table', ['Current cap table'], 'missing'],
];

export function seedStartups(today) {
  return ROWS.map(([id, name, sector, track, lead, second, done, ago, target, oneLiner, founder, info, p0, submitted]) => {
    const s = newStartup({ id, name, sector, track, oneLiner, lead, second, today });
    s.assigned = addDays(today, -(done * 2 + ago));
    s.target = target == null ? null : addDays(today, target);
    s.founders = [founder];
    s.founderInfo = info;
    CHECKLIST.slice(0, done).forEach((c, i) => { s.checklist[c.id] = addDays(today, -(ago + Math.max(0, done - 1 - i))); });
    s.activity = [{ date: s.assigned, text: 'Assigned', by: lead }];
    CHECKLIST.slice(0, done).forEach((c) => s.activity.push({ date: s.checklist[c.id], text: `Done: ${c.label}`, by: lead }));
    s.docs = DOCS.map(([folder, files, status]) => ({ folder, files, status: done >= 14 || folder === 'Application' ? 'received' : status }));
    if (p0) {
      P0_QUESTIONS.forEach((q, i) => { s.form.p0[q] = { status: p0[i], source: p0[i] === 'verified' ? 'Checked in diligence call' : '' }; });
    }
    if (submitted) {
      s.form.fields = { summary: `${name}: ${oneLiner}`, team: info.team, market: info.market, product: `${info.product} ${info.traction}`, risks: 'No concerns raised.', next: 'Ready for a decision.' };
      s.form.light = 'green';
      s.form.submitted = addDays(today, -(ago + 1));
    }
    return s;
  });
}

const HOURS = ['10:00', '12:00', '14:00', '16:00'];

function weekdays(today, n) {
  const days = [];
  for (let i = 1; days.length < n; i += 1) {
    const d = addDays(today, i);
    const wd = new Date(`${d}T00:00:00Z`).getUTCDay();
    if (wd !== 5 && wd !== 6) days.push(d); // Israeli work week: Sunday to Thursday
  }
  return days;
}

export function slotGrid(today) {
  return weekdays(today, 5).flatMap((d) => HOURS.map((h) => `${d}T${h}`));
}

export function seedAvailability(today) {
  const grid = slotGrid(today);
  return {
    ava: grid.filter((_, i) => i % 3 !== 1),
    ben: grid.filter((_, i) => i % 2 === 0 || i % 5 === 0),
    dana: [],
  };
}

export function seedBookings(today) {
  const grid = slotGrid(today);
  return [{ startupId: 's6', lead: 'ben', second: 'ava', slot: grid[2] }];
}
