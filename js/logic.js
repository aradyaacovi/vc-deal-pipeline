// Pure domain logic: no DOM, no storage. Everything here is covered by tests/logic.test.js.
//
// The model: a fund assigns each startup to a lead analyst and a second analyst. The lead works through a
// checklist split into four phases, books the meetings, fills in a traffic-light form, and the manager
// reviews the whole picture read-only.

// ---- Phases and checklist ---------------------------------------------------------

export const PHASES = [
  { id: 'prep', label: 'Before the first meeting', short: 'Prep' },
  { id: 'meeting', label: 'First meeting', short: 'Meeting' },
  { id: 'after', label: 'After the first meeting', short: 'After' },
  { id: 'dd', label: 'Second meeting and due diligence', short: 'Diligence' },
];

// `action` says what the button next to an item does: schedule (find meeting times) or draft (a ready text).
// These are generic steps written for this demo; a team would replace them with its own.
export const CHECKLIST = [
  { id: 'c1', phase: 'prep', label: 'Find a second analyst who is free', action: 'schedule' },
  { id: 'c2', phase: 'prep', label: 'Send the introduction email to the founders', action: 'draft:intro' },
  { id: 'c3', phase: 'prep', label: 'Book the meeting and send the invitation', action: 'schedule' },
  { id: 'c4', phase: 'prep', label: 'Research the company, market and competitors', action: 'draft:prep' },
  { id: 'c5', phase: 'prep', label: 'Prepare the questions' },
  { id: 'c6', phase: 'meeting', label: 'Introduce the team and the fund' },
  { id: 'c7', phase: 'meeting', label: 'Founders pitch' },
  { id: 'c8', phase: 'meeting', label: 'Questions and next steps' },
  { id: 'c9', phase: 'after', label: 'Debrief with the second analyst' },
  { id: 'c10', phase: 'after', label: 'Fill in the traffic-light form', action: 'light' },
  { id: 'c11', phase: 'after', label: 'Send the follow-up email with open questions', action: 'draft:followup' },
  { id: 'c12', phase: 'after', label: 'Send the thank-you email', action: 'draft:thanks' },
  { id: 'c13', phase: 'dd', label: 'Book the second meeting', action: 'schedule' },
  { id: 'c14', phase: 'dd', label: 'Request financials and the cap table', action: 'draft:docs' },
  { id: 'c15', phase: 'dd', label: 'Customer and reference calls' },
  { id: 'c16', phase: 'dd', label: 'Write the investment memo', action: 'draft:memo' },
  { id: 'c17', phase: 'dd', label: 'Present to the investment committee' },
];

export const TRACKS = [
  { id: 'intro', label: 'Intro track' },
  { id: 'launch', label: 'Launch track' },
];

export function progress(startup) {
  const done = CHECKLIST.filter((c) => startup.checklist?.[c.id]).length;
  return { done, total: CHECKLIST.length, percent: Math.round((done / CHECKLIST.length) * 100) };
}

export function phaseProgress(startup, phaseId) {
  const items = CHECKLIST.filter((c) => c.phase === phaseId);
  const done = items.filter((c) => startup.checklist?.[c.id]).length;
  return { done, total: items.length, complete: done === items.length };
}

/** The first checklist item that is not done, or null when everything is. */
export function nextStep(startup) {
  return CHECKLIST.find((c) => !startup.checklist?.[c.id]) ?? null;
}

/** The phase the startup is in: the phase of its next step, or 'done'. */
export function currentPhase(startup) {
  const next = nextStep(startup);
  return next ? next.phase : 'done';
}

// ---- Roles --------------------------------------------------------------------------
// Enforced in the UI layer only in this demo. A real deployment must enforce it on the server.

export function visibleStartups(user, startups) {
  if (user.role === 'manager') return startups;
  return startups.filter((s) => s.lead === user.id || s.second === user.id);
}

export function canEdit(user, startup) {
  return user.role === 'analyst' && (startup.lead === user.id || startup.second === user.id);
}

// ---- Dates -----------------------------------------------------------------------------

export function daysBetween(fromIso, toIso) {
  return Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86400000);
}

export function addDays(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const QUIET_AFTER_DAYS = 7;

export function lastActivity(startup) {
  const dates = (startup.activity ?? []).map((a) => a.date);
  return dates.length ? dates.reduce((a, b) => (a > b ? a : b)) : startup.assigned;
}

/** Active startups with no activity for QUIET_AFTER_DAYS or more. */
export function isQuiet(startup, today) {
  return currentPhase(startup) !== 'done' && daysBetween(lastActivity(startup), today) >= QUIET_AFTER_DAYS;
}

/** Days until the target date: negative when it has passed, null when there is none or the work is done. */
export function daysToTarget(startup, today) {
  if (!startup.target || currentPhase(startup) === 'done') return null;
  return daysBetween(today, startup.target);
}

export function logActivity(startup, today, text, by) {
  return { ...startup, activity: [...(startup.activity ?? []), { date: today, text, by }] };
}

/** Ticks or unticks a checklist item and records it in the activity log. */
export function toggleItem(startup, itemId, today, by) {
  const item = CHECKLIST.find((c) => c.id === itemId);
  if (!item) throw new Error(`Unknown checklist item: ${itemId}`);
  const checklist = { ...startup.checklist };
  const done = !checklist[itemId];
  if (done) checklist[itemId] = today; else delete checklist[itemId];
  return logActivity({ ...startup, checklist }, today, `${done ? 'Done' : 'Reopened'}: ${item.label}`, by);
}

// ---- Traffic-light form -----------------------------------------------------------------
// P0 questions are the must-know facts before a decision. Each gets a status and a source.
// The suggested colour follows fixed rules, and the analyst makes the final call.

export const P0_QUESTIONS = [
  'Is there a paying customer or a signed pilot?',
  'Are the founders working on this full time?',
  'Does the company own its core technology or IP?',
  'Is the cap table clean (no unexplained holders)?',
  'Is the market size backed by an independent source?',
];

export const P0_STATUSES = [
  { id: 'unknown', label: 'Unknown' },
  { id: 'stated', label: 'Founder-stated' },
  { id: 'verified', label: 'Verified' },
  { id: 'concern', label: 'Concern' },
];

/**
 * Suggested light from the P0 answers.
 * Any concern: red. Otherwise yellow while fewer than three quarters are verified, green when they are.
 * Nothing answered yet: no suggestion.
 */
export function p0Rule(answers = {}, questions = P0_QUESTIONS) {
  const status = (q) => answers[q]?.status ?? 'unknown';
  const counts = { unknown: 0, stated: 0, verified: 0, concern: 0 };
  questions.forEach((q) => { counts[status(q)] += 1; });
  const total = questions.length;
  if (counts.unknown === total) return { light: null, why: 'No P0 question has been answered yet.', counts };
  if (counts.concern > 0) return { light: 'red', why: `${counts.concern} concern${counts.concern === 1 ? '' : 's'} flagged. Any concern makes the suggestion red.`, counts };
  if (counts.verified / total >= 0.75) return { light: 'green', why: `${counts.verified} of ${total} verified, no concerns.`, counts };
  return { light: 'yellow', why: `${counts.verified} of ${total} verified; the rest is founder-stated or unknown.`, counts };
}

export const LIGHTS = { green: 'Green', yellow: 'Yellow', red: 'Red' };

export const FORM_FIELDS = [
  { id: 'summary', label: 'Summary' },
  { id: 'team', label: 'Team' },
  { id: 'market', label: 'Market' },
  { id: 'product', label: 'Product and traction' },
  { id: 'risks', label: 'Risks' },
  { id: 'next', label: 'Recommended next step' },
];

/** A template proposal for the form, built from what the founders provided and the P0 answers. No AI call. */
export function proposeForm(startup) {
  const f = startup.founderInfo ?? {};
  const answers = startup.form?.p0 ?? {};
  const rule = p0Rule(answers);
  const concerns = P0_QUESTIONS.filter((q) => answers[q]?.status === 'concern');
  const open = P0_QUESTIONS.filter((q) => (answers[q]?.status ?? 'unknown') !== 'verified');
  const fields = {
    summary: `${startup.name} (${startup.sector}): ${startup.oneLiner} Reviewed by ${startup.leadName ?? 'the lead analyst'}.`,
    team: f.team ? `Founders say: ${f.team} (not yet verified).` : 'No team information provided yet.',
    market: f.market ? `Founders say: ${f.market} (not yet verified).` : 'No market information provided yet.',
    product: [f.product, f.traction].filter(Boolean).map((t) => `Founders say: ${t}`).join(' ') || 'No product or traction information provided yet.',
    risks: concerns.length ? `Concerns raised: ${concerns.join(' ')}` : 'No concerns raised so far.',
    next: open.length ? `Resolve ${open.length} open P0 question${open.length === 1 ? '' : 's'} before deciding.` : 'All P0 questions are verified: ready for a decision.',
  };
  return { fields, light: rule.light };
}

/** What blocks submitting the form. An empty list means it can be submitted. */
export function formBlockers(form = {}) {
  const blockers = [];
  if (!form.light) blockers.push('Choose a light.');
  const empty = FORM_FIELDS.filter((x) => !(form.fields?.[x.id] ?? '').trim()).map((x) => x.label);
  if (empty.length) blockers.push(`Fill in: ${empty.join(', ')}.`);
  const rule = p0Rule(form.p0 ?? {});
  if (rule.light === 'red' && form.light === 'green') blockers.push('A concern is flagged, so the light cannot be green.');
  return blockers;
}

/** Open questions for the founders: every P0 question that is not verified. */
export function openQuestions(startup) {
  const answers = startup.form?.p0 ?? {};
  return P0_QUESTIONS.filter((q) => answers[q]?.status !== 'verified')
    .map((q) => ({ question: q, status: answers[q]?.status ?? 'unknown' }));
}

// ---- Meeting scheduling ---------------------------------------------------------------------
// Each analyst lists the hour slots they are free (ISO local strings "2026-11-24T10:00").
// Finding times: the lead is free and at least one other analyst is free, and the slot is not already booked.

export function slotLabel(slot) {
  const [d, t] = slot.split('T');
  const day = new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  return `${day}, ${t}`;
}

export function freeSlots(availability, bookings, analystId) {
  const taken = new Set(bookings.filter((b) => b.lead === analystId || b.second === analystId).map((b) => b.slot));
  return (availability[analystId] ?? []).filter((s) => !taken.has(s));
}

/**
 * Up to `count` different slots where `leadId` and at least one other analyst are free.
 * `preferred` analysts (for example whoever joined the first meeting) are tried first at each slot.
 */
export function findSlots({ availability, bookings, leadId, analysts, count = 3, preferred = [] }) {
  const lead = new Set(freeSlots(availability, bookings, leadId));
  const peers = analysts.filter((a) => a !== leadId);
  const order = [...preferred.filter((p) => peers.includes(p)), ...peers.filter((p) => !preferred.includes(p))];
  const peerFree = new Map(order.map((p) => [p, new Set(freeSlots(availability, bookings, p))]));
  const out = [];
  for (const slot of [...lead].sort()) {
    const peer = order.find((p) => peerFree.get(p).has(slot));
    if (peer) out.push({ slot, peer });
    if (out.length === count) break;
  }
  return out;
}

/** Books a slot after checking again that it is still free for both analysts. Throws if it is not. */
export function bookSlot({ availability, bookings, startupId, leadId, peerId, slot }) {
  const stillFree = (id) => freeSlots(availability, bookings, id).includes(slot);
  if (!stillFree(leadId) || !stillFree(peerId)) throw new Error('That time was taken in the meantime. Pick another.');
  return [...bookings, { startupId, lead: leadId, second: peerId, slot }];
}

// ---- Ready-made texts -----------------------------------------------------------------------------
// Fixed templates, filled from the startup record. They are drafts for the analyst to edit; no AI call is made.

export function draftText(kind, startup, ctx = {}) {
  const founder = startup.founders?.[0] ?? 'there';
  const lead = ctx.leadName ?? 'the lead analyst';
  switch (kind) {
    case 'intro':
      return `Subject: Introduction: ${startup.name} and Example Ventures\n\nHi ${founder},\n\nThank you for applying. I will be your main contact at Example Ventures for ${startup.name}. We read your application and would like to meet to hear more about ${startup.oneLiner.replace(/\.$/, '')}.\n\nI will send a few times shortly. Please tell me who from the team will join.\n\nBest,\n${lead}`;
    case 'times': {
      const lines = (ctx.options ?? []).map((o, i) => `${i + 1}. ${slotLabel(o.slot)}`).join('\n');
      return `Subject: Meeting times: ${startup.name}\n\nHi ${founder},\n\nHere are three times for our first meeting (about 45 minutes, on video):\n\n${lines}\n\nPlease reply with the one that suits you. Another analyst will join me.\n\nBest,\n${lead}`;
    }
    case 'prep':
      return `Research notes: ${startup.name}\n\n- What they say they do: ${startup.oneLiner}\n- Sector: ${startup.sector}\n- To research: three competitors, market size from an independent source, founders' background.\n- Keep founder statements and our own findings in separate lists.`;
    case 'followup': {
      const qs = openQuestions(startup).map((q, i) => `${i + 1}. ${q.question}`).join('\n') || 'No open questions.';
      return `Subject: Follow-up: ${startup.name}\n\nHi ${founder},\n\nThank you for the conversation. To move forward we need a few things confirmed:\n\n${qs}\n\nA short written answer or a document for each is enough.\n\nBest,\n${lead}`;
    }
    case 'thanks':
      return `Subject: Thank you: ${startup.name}\n\nHi ${founder},\n\nThank you for your time today. We will discuss internally and come back to you within a week with next steps.\n\nBest,\n${lead}`;
    case 'docs':
      return `Subject: Documents for diligence: ${startup.name}\n\nHi ${founder},\n\nTo continue we would like to see: the last 12 months of financials, the current cap table, and your main customer contracts or pilot agreements.\n\nPlease share them in the folder we set up, or reply with files.\n\nBest,\n${lead}`;
    case 'memo':
      return memoDraft(startup);
    default:
      throw new Error(`Unknown draft: ${kind}`);
  }
}

export function memoDraft(startup) {
  const form = startup.form ?? {};
  const answers = form.p0 ?? {};
  const rule = p0Rule(answers);
  const light = form.light ?? rule.light;
  const lines = [
    `# Investment memo (draft): ${startup.name}`,
    '',
    `Sector: ${startup.sector} · Track: ${TRACKS.find((t) => t.id === startup.track)?.label ?? startup.track}`,
    '',
    '## Summary',
    form.fields?.summary || startup.oneLiner,
    '',
    '## What the founders told us (not verified)',
    ...['team', 'market', 'product', 'traction'].map((k) => `- ${k[0].toUpperCase()}${k.slice(1)}: ${startup.founderInfo?.[k] ?? 'not provided'}`),
    '',
    '## Our findings',
    '| P0 question | Status | Source |',
    '| --- | --- | --- |',
    ...P0_QUESTIONS.map((q) => `| ${q} | ${P0_STATUSES.find((s) => s.id === (answers[q]?.status ?? 'unknown')).label} | ${answers[q]?.source || '-'} |`),
    '',
    '## Light and recommendation',
    light ? `${LIGHTS[light]}. ${rule.why}` : 'No light chosen yet.',
    form.fields?.next ?? '',
    '',
    '_Template draft from the startup record. The analyst reviews and rewrites it._',
  ];
  return lines.join('\n');
}

// ---- Manager view -------------------------------------------------------------------------------------

export function startupLight(startup) {
  return startup.form?.light ?? p0Rule(startup.form?.p0 ?? {}).light;
}

export function analystSummary(startups, analysts, today) {
  return analysts.map((a) => {
    const lead = startups.filter((s) => s.lead === a.id);
    const second = startups.filter((s) => s.second === a.id);
    const open = lead.filter((s) => currentPhase(s) !== 'done');
    return {
      id: a.id,
      name: a.name,
      lead: lead.length,
      second: second.length,
      quiet: open.filter((s) => isQuiet(s, today)).length,
      submitted: lead.filter((s) => s.form?.submitted).length,
      progress: lead.length ? Math.round(lead.reduce((n, s) => n + progress(s).percent, 0) / lead.length) : null,
    };
  });
}

export const TILES = [
  { id: 'red', label: 'Red light', hint: 'a concern was flagged', tone: 'red', test: (s) => startupLight(s) === 'red' },
  { id: 'quiet', label: 'Gone quiet', hint: `no activity for ${QUIET_AFTER_DAYS}+ days`, tone: 'yellow', test: (s, today) => isQuiet(s, today) },
  { id: 'soon', label: 'Due soon', hint: 'target within 3 days or late', tone: 'yellow', test: (s, today) => { const d = daysToTarget(s, today); return d != null && d <= 3; } },
  { id: 'noform', label: 'Form missing', hint: 'met, no form submitted', tone: 'green', test: (s) => Boolean(s.checklist?.c8) && !s.form?.submitted },
];

// ---- CSV --------------------------------------------------------------------------------------------
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

const CSV_COLUMNS = ['name', 'sector', 'track', 'one_liner'];

/** One CSV cell, quoted when needed and made safe against spreadsheet formula injection. */
export function csvEscape(v) {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // stop spreadsheets from running imported text as a formula
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(startups) {
  const esc = csvEscape;
  const lines = [CSV_COLUMNS.join(',')];
  for (const s of startups) lines.push([s.name, s.sector, s.track, s.oneLiner].map(esc).join(','));
  return `${lines.join('\n')}\n`;
}

/**
 * Validate parsed CSV rows for importing new startups. Errors carry the 1-based file line.
 * Valid rows are still returned when others fail; the caller decides whether to accept a partial import.
 */
export function validateImport(rows, { lead, today, newId, existingNames = [] }) {
  const errors = [];
  const startups = [];
  const accepted = []; // { line, startup }: lets callers tie a startup back to its file line
  if (rows.length === 0) return { startups, accepted, errors: [{ line: 1, message: 'File is empty' }] };
  const header = rows[0].map((h) => h.trim().toLowerCase());
  if (!header.includes('name')) return { startups, accepted, errors: [{ line: 1, message: 'Missing required column: name' }] };
  const col = (r, name) => (r[header.indexOf(name)] ?? '').trim();
  const seen = new Set();
  const existing = new Set(existingNames.map((n) => n.toLowerCase()));
  const trackIds = TRACKS.map((t) => t.id);
  rows.slice(1).forEach((r, i) => {
    const line = i + 2;
    const name = col(r, 'name');
    const track = (col(r, 'track') || 'intro').toLowerCase();
    if (!name) return errors.push({ line, message: 'Name is empty' });
    if (!trackIds.includes(track)) return errors.push({ line, message: `Unknown track "${track}" (use ${trackIds.join(', ')})` });
    const key = name.toLowerCase();
    if (existing.has(key)) return errors.push({ line, message: `"${name}" is already on your list` });
    if (seen.has(key)) return errors.push({ line, message: `Duplicate name "${name}" in file` });
    seen.add(key);
    const startup = newStartup({ id: newId(), name, sector: col(r, 'sector') || 'Unspecified', track, oneLiner: col(r, 'one_liner'), lead, today });
    startups.push(startup);
    accepted.push({ line, startup });
    return null;
  });
  return { startups, accepted, errors };
}

export function newStartup({ id, name, sector, track = 'intro', oneLiner = '', lead, second = null, today }) {
  return {
    id, name, sector, track, oneLiner, lead, second, assigned: today, target: addDays(today, 14),
    founders: [], founderInfo: {}, checklist: {}, form: { p0: {}, fields: {}, light: null }, docs: [], activity: [{ date: today, text: 'Assigned', by: lead }],
  };
}
