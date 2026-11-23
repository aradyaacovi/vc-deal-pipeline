// Pure domain logic: no DOM, no storage. Everything here is covered by tests/logic.test.js.

export const STAGES = [
  { id: 'sourced', label: 'Sourced' },
  { id: 'screening', label: 'Screening' },
  { id: 'deep-dive', label: 'Deep dive' },
  { id: 'ic-review', label: 'IC review' },
  { id: 'invested', label: 'Invested' },
  { id: 'passed', label: 'Passed' },
];
export const ACTIVE_STAGES = ['sourced', 'screening', 'deep-dive', 'ic-review'];
const STAGE_IDS = STAGES.map((s) => s.id);

// Evaluation rubric. Weights sum to 1. Scores are 1 (weak) to 5 (strong).
export const RUBRIC = [
  { id: 'team', label: 'Team', weight: 0.3 },
  { id: 'market', label: 'Market', weight: 0.25 },
  { id: 'product', label: 'Product', weight: 0.2 },
  { id: 'traction', label: 'Traction', weight: 0.15 },
  { id: 'terms', label: 'Terms & fit', weight: 0.1 },
];

export const GREEN_AT = 3.8;
export const YELLOW_AT = 3.0;
export const STALE_AFTER_DAYS = 14;

/**
 * Weighted score over the criteria that have been rated.
 * Returns null when nothing is rated. `complete` is true when every criterion is rated.
 * Light rules: any rated criterion of 1 forces red (a fatal flaw is not averaged away);
 * otherwise >= GREEN_AT is green, >= YELLOW_AT is yellow, below that red.
 */
export function scoreDeal(scores = {}) {
  let weighted = 0;
  let weightSum = 0;
  let anyFatal = false;
  let rated = 0;
  for (const c of RUBRIC) {
    const v = scores[c.id];
    if (!Number.isInteger(v) || v < 1 || v > 5) continue;
    rated += 1;
    weighted += v * c.weight;
    weightSum += c.weight;
    if (v === 1) anyFatal = true;
  }
  if (rated === 0) return null;
  const value = Math.round((weighted / weightSum) * 100) / 100;
  let light = 'red';
  if (!anyFatal) light = value >= GREEN_AT ? 'green' : value >= YELLOW_AT ? 'yellow' : 'red';
  return { value, light, complete: rated === RUBRIC.length, rated };
}

// ---- Roles and visibility ------------------------------------------------
// Demo-grade access rules enforced in the UI layer. The app has no backend, so
// this shows the model (analysts see their own deals, managers see all read-only);
// it is not a security boundary.

export function visibleDeals(user, deals) {
  if (user.role === 'manager') return deals;
  return deals.filter((d) => d.analyst === user.id);
}

export function canEdit(user, deal) {
  return user.role === 'analyst' && deal.analyst === user.id;
}

// ---- Dates ---------------------------------------------------------------

export function daysBetween(fromIso, toIso) {
  const a = Date.parse(`${fromIso}T00:00:00Z`);
  const b = Date.parse(`${toIso}T00:00:00Z`);
  return Math.round((b - a) / 86400000);
}

export function isStale(deal, today) {
  return ACTIVE_STAGES.includes(deal.stage) && daysBetween(deal.updated, today) > STALE_AFTER_DAYS;
}

// ---- Pipeline summary ----------------------------------------------------

export function summarize(deals, today) {
  const byStage = Object.fromEntries(STAGE_IDS.map((id) => [id, 0]));
  let scored = 0;
  let scoreTotal = 0;
  let green = 0;
  let stale = 0;
  let askTotal = 0;
  for (const d of deals) {
    byStage[d.stage] += 1;
    const s = scoreDeal(d.scores);
    if (s) {
      scored += 1;
      scoreTotal += s.value;
      if (s.light === 'green') green += 1;
    }
    if (isStale(d, today)) stale += 1;
    if (ACTIVE_STAGES.includes(d.stage) && Number.isFinite(d.askUsd)) askTotal += d.askUsd;
  }
  const active = ACTIVE_STAGES.reduce((n, id) => n + byStage[id], 0);
  return {
    total: deals.length,
    active,
    byStage,
    scored,
    avgScore: scored ? Math.round((scoreTotal / scored) * 100) / 100 : null,
    green,
    stale,
    activeAskUsd: askTotal,
  };
}

/** Share of deals that moved on from each active stage (reached a later stage or were closed). */
export function funnel(deals) {
  const order = ['sourced', 'screening', 'deep-dive', 'ic-review', 'invested'];
  const reached = order.map((_, i) => deals.filter((d) => {
    const idx = order.indexOf(d.stage);
    return d.stage === 'passed' ? (d.passedFrom ? order.indexOf(d.passedFrom) >= i : false) : idx >= i;
  }).length);
  return order.map((id, i) => ({
    stage: id,
    reached: reached[i],
    conversion: i === 0 || reached[i - 1] === 0 ? null : Math.round((reached[i] / reached[i - 1]) * 100),
  }));
}

export function moveDeal(deal, stage, today) {
  if (!STAGE_IDS.includes(stage)) throw new Error(`Unknown stage: ${stage}`);
  const passedFrom = stage === 'passed' ? (deal.stage === 'passed' ? deal.passedFrom : deal.stage) : undefined;
  return { ...deal, stage, passedFrom, updated: today };
}

// ---- CSV import / export -------------------------------------------------

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { field += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i += 1;
      row.push(field); field = '';
      if (row.some((c) => c !== '')) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((c) => c !== '')) rows.push(row);
  return rows;
}

const CSV_COLUMNS = ['name', 'sector', 'stage', 'ask_usd', 'notes'];

export function toCsv(deals) {
  const esc = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [CSV_COLUMNS.join(',')];
  for (const d of deals) {
    lines.push([d.name, d.sector, d.stage, d.askUsd, d.notes].map(esc).join(','));
  }
  return `${lines.join('\n')}\n`;
}

/**
 * Validate parsed CSV rows. Returns { deals, errors } where errors carry the
 * 1-based file line so the user can fix the source file. Valid rows are still
 * returned when others fail, and the caller decides whether to accept a partial import.
 */
export function validateImport(rows, { analyst, today, newId, existingNames = [] }) {
  const errors = [];
  const deals = [];
  if (rows.length === 0) return { deals, errors: [{ line: 1, message: 'File is empty' }] };
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const missing = ['name', 'stage'].filter((c) => !header.includes(c));
  if (missing.length) {
    return { deals, errors: [{ line: 1, message: `Missing required column: ${missing.join(', ')}` }] };
  }
  const col = (r, name) => (r[header.indexOf(name)] ?? '').trim();
  const seen = new Set();
  const existing = new Set(existingNames.map((n) => n.toLowerCase()));
  rows.slice(1).forEach((r, i) => {
    const line = i + 2;
    const name = col(r, 'name');
    const stage = col(r, 'stage').toLowerCase();
    const askRaw = col(r, 'ask_usd');
    if (!name) return errors.push({ line, message: 'Name is empty' });
    if (!STAGE_IDS.includes(stage)) {
      return errors.push({ line, message: `Unknown stage "${stage}" (use ${STAGE_IDS.join(', ')})` });
    }
    let askUsd;
    if (askRaw !== '') {
      askUsd = Number(askRaw);
      if (!Number.isFinite(askUsd) || askUsd < 0) {
        return errors.push({ line, message: `ask_usd must be a non-negative number, got "${askRaw}"` });
      }
    }
    const key = name.toLowerCase();
    if (existing.has(key)) return errors.push({ line, message: `"${name}" is already in the pipeline` });
    if (seen.has(key)) return errors.push({ line, message: `Duplicate name "${name}" in file` });
    seen.add(key);
    deals.push({
      id: newId(),
      name,
      sector: col(r, 'sector') || 'Unspecified',
      stage,
      analyst,
      askUsd,
      notes: col(r, 'notes'),
      scores: {},
      updated: today,
    });
  });
  return { deals, errors };
}

export function formatUsd(n) {
  if (!Number.isFinite(n)) return '—';
  if (n >= 1e6) return `$${(n / 1e6).toFixed(n % 1e6 === 0 ? 0 : 1)}M`;
  if (n >= 1e3) return `$${Math.round(n / 1e3)}K`;
  return `$${n}`;
}

// ---- Per-deal checklist ------------------------------------------------------
// Generic process steps written for this demo. Teams would replace them with their own.

export const CHECKLIST = [
  { id: 'c1', phase: 'Before the first meeting', label: 'Align availability with the analyst team' },
  { id: 'c2', phase: 'Before the first meeting', label: 'Send an introduction email to the founders' },
  { id: 'c3', phase: 'Before the first meeting', label: 'Schedule the meeting and send the invitation' },
  { id: 'c4', phase: 'Before the first meeting', label: 'Research the company, market and competitors' },
  { id: 'c5', phase: 'Before the first meeting', label: 'Prepare questions' },
  { id: 'c6', phase: 'First meeting', label: 'Introduce the team and the fund' },
  { id: 'c7', phase: 'First meeting', label: 'Founders pitch' },
  { id: 'c8', phase: 'First meeting', label: 'Q&A and next steps' },
  { id: 'c9', phase: 'After the first meeting', label: 'Debrief with the analyst team' },
  { id: 'c10', phase: 'After the first meeting', label: 'Complete the traffic-light evaluation' },
  { id: 'c11', phase: 'After the first meeting', label: 'Send a follow-up email with open questions' },
  { id: 'c12', phase: 'Due diligence', label: 'Request financials and cap table' },
  { id: 'c13', phase: 'Due diligence', label: 'Customer and reference calls' },
  { id: 'c14', phase: 'Due diligence', label: 'Write the investment memo' },
  { id: 'c15', phase: 'Due diligence', label: 'Present to the investment committee' },
];

export function checklistProgress(deal) {
  const done = CHECKLIST.filter((c) => deal.checklist?.[c.id]).length;
  return { done, total: CHECKLIST.length, percent: Math.round((done / CHECKLIST.length) * 100) };
}

// ---- Meeting prep (template-based draft) ----------------------------------------
// Deterministic: no model call. The weakest or unrated criteria get the most questions,
// so the meeting is spent where the evaluation is least certain.

export const QUESTION_BANK = {
  team: ['Who is on the founding team, and how long have you worked together?', 'What is the one skill the team lacks today, and how will you fill it?'],
  market: ['Who is the first customer segment, and how large is it in your own numbers?', 'Which competitor would a customer compare you with, and why do you win?'],
  product: ['What does the product do today that it did not do six months ago?', 'What is the hardest technical or regulatory problem still open?'],
  traction: ['What are the three numbers you track weekly, and where are they now?', 'What did the last ten conversations with customers teach you?'],
  terms: ['What are you raising, on what terms, and what does this round let you reach?', 'Who else is in the round or has been approached?'],
};

export function meetingPrep(deal) {
  const rated = RUBRIC.map((c) => ({ ...c, score: deal.scores?.[c.id] }));
  const order = [...rated].sort((a, b) => (a.score ?? 0) - (b.score ?? 0));
  const focus = order.slice(0, 3);
  const questions = [];
  focus.forEach((c, i) => {
    const take = i === 0 ? 2 : 1;
    questions.push(...QUESTION_BANK[c.id].slice(0, take).map((q) => ({ criterion: c.label, text: q })));
  });
  const opening = [
    `Introduce the fund and the team; confirm how long the founders have.`,
    deal.askUsd ? `Context: ${deal.name} (${deal.sector}) is looking for ${formatUsd(deal.askUsd)}.` : `Context: ${deal.name} (${deal.sector}); ask size not yet known.`,
    deal.notes ? `Where we left off: ${deal.notes}` : 'No notes yet: start from the founders\' own account.',
  ];
  return {
    opening,
    focus: focus.map((c) => (c.score ? `${c.label} (rated ${c.score})` : `${c.label} (not yet rated)`)),
    questions,
  };
}
