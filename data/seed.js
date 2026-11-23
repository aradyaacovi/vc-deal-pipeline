// Entirely fictional demo data. Company names are invented; any resemblance to a real company is coincidental.

export const USERS = [
  { id: 'ava', name: 'Ava Stein', role: 'analyst' },
  { id: 'ben', name: 'Ben Carter', role: 'analyst' },
  { id: 'dana', name: 'Dana Rossi', role: 'manager' },
];

function isoDaysAgo(today, n) {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

// [id, name, sector, stage, analyst, askUsd, ago, scores(team,market,product,traction,terms), notes, passedFrom]
const ROWS = [
  ['d1', 'Brightloom', 'Climate software', 'ic-review', 'ava', 1500000, 2, [5, 4, 4, 3, 4], 'Carbon accounting for mid-size manufacturers. Two paying pilots; IC memo drafted.'],
  ['d2', 'Fernwick Health', 'Digital health', 'deep-dive', 'ava', 900000, 5, [4, 4, 3, 2, 3], 'Remote monitoring for post-surgery recovery. Waiting on clinical pilot data.'],
  ['d3', 'Oakhaven Robotics', 'Industrial automation', 'screening', 'ava', 2500000, 9, [3, 4, 3, 1, 3], 'Warehouse picking arm. No revenue yet; hardware margins unclear.'],
  ['d4', 'Marlowe Pay', 'Fintech', 'sourced', 'ava', 600000, 3, [], 'Inbound from a founder-community referral. First call booked.'],
  ['d5', 'Tidewell Labs', 'Water tech', 'deep-dive', 'ava', 1200000, 21, [4, 3, 4, 3, 2], 'Sensor network for leak detection. Follow-up overdue.'],
  ['d6', 'Cobalt Orchard', 'Agritech', 'passed', 'ava', 800000, 30, [2, 3, 2, 2, 2], 'Passed after screening: crowded space, weak differentiation.', 'screening'],
  ['d7', 'Halcyon Notes', 'Productivity', 'invested', 'ava', 700000, 60, [4, 4, 5, 4, 4], 'Closed last quarter. Quarterly check-ins scheduled.'],
  ['d8', 'Pinecrest AI', 'Developer tools', 'screening', 'ben', 1800000, 4, [4, 5, 4, 3, 3], 'Code-review assistant. Strong team from two infrastructure companies.'],
  ['d9', 'Saltmarsh Foods', 'Food tech', 'sourced', 'ben', 500000, 16, [], 'Plant-based seafood. No contact since the intro email.'],
  ['d10', 'Kestrel Mobility', 'Mobility', 'deep-dive', 'ben', 3000000, 7, [3, 3, 3, 3, 2], 'Fleet charging marketplace. Market sizing disputed between two sources.'],
  ['d11', 'Verdant Ledger', 'Fintech', 'ic-review', 'ben', 1000000, 1, [4, 4, 4, 4, 3], 'Treasury tooling for small exporters. IC next Tuesday.'],
  ['d12', 'Nimbus Clinic', 'Digital health', 'passed', 'ben', 1400000, 45, [3, 2, 3, 1, 2], 'Passed at deep dive: no path to reimbursement.', 'deep-dive'],
  ['d13', 'Ironbark Security', 'Cybersecurity', 'sourced', 'ben', 900000, 12, [], 'Cold outreach reply. Needs a screening call.'],
  ['d14', 'Lumenfield', 'Education', 'screening', 'ben', 400000, 18, [2, 3, 3, 2, 3], 'Tutoring marketplace. Sliding on traction; stale.'],
];

// How many checklist steps are done at each stage (in order). Illustrative.
const DONE_BY_STAGE = { sourced: 1, screening: 4, 'deep-dive': 10, 'ic-review': 13, invested: 15, passed: 4 };
const CHECK_IDS = Array.from({ length: 15 }, (_, i) => `c${i + 1}`);

const PATH = ['sourced', 'screening', 'deep-dive', 'ic-review', 'invested'];

// Illustrative stage history: the last move happened on the update date, earlier moves 8 days apart.
function seedHistory(stage, passedFrom, ago, today) {
  const last = stage === 'passed' ? passedFrom : stage;
  const steps = PATH.slice(0, PATH.indexOf(last) + 1);
  if (stage === 'passed') steps.push('passed');
  const history = [];
  for (let i = 1; i < steps.length; i += 1) {
    history.push({ date: isoDaysAgo(today, ago + (steps.length - 1 - i) * 8), from: steps[i - 1], to: steps[i] });
  }
  return history;
}

const SUBMITTED = { d1: 'ava', d11: 'ben' };

export function seedDeals(today) {
  return ROWS.map(([id, name, sector, stage, analyst, askUsd, ago, s, notes, passedFrom]) => {
    const scores = {};
    ['team', 'market', 'product', 'traction', 'terms'].forEach((k, i) => {
      if (s[i]) scores[k] = s[i];
    });
    const checklist = Object.fromEntries(CHECK_IDS.slice(0, DONE_BY_STAGE[stage]).map((c) => [c, true]));
    const history = seedHistory(stage, passedFrom, ago, today);
    const deal = { id, name, sector, stage, analyst, askUsd, notes, scores, checklist, updated: isoDaysAgo(today, ago), passedFrom, history };
    if (SUBMITTED[id]) {
      const total = Object.entries(scores).reduce((n, [k, v]) => n + v * ({ team: 0.3, market: 0.25, product: 0.2, traction: 0.15, terms: 0.1 })[k], 0);
      deal.submission = { date: isoDaysAgo(today, ago), light: total >= 3.8 ? 'green' : 'yellow', score: Math.round(total * 100) / 100, by: analyst };
    }
    return deal;
  });
}
