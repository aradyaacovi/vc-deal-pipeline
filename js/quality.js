// Data-quality layer for CSV imports: pure functions, no DOM.
// validateImport (logic.js) decides what is accepted; this module adds profiling, cleaning, warnings and a score.
// The score definition is in docs/METRICS.md.
import { validateImport, csvEscape } from './logic.js';

const COLUMNS = ['name', 'sector', 'track', 'one_liner'];
const SUFFIXES = new Set(['inc', 'ltd', 'llc', 'corp', 'co', 'gmbh', 'labs', 'technologies']);
const MAX_ONE_LINER = 140;

/** A comparison key for names: lower case, punctuation gone, legal suffixes dropped. "Acme, Inc." and "ACME" match. */
export function nameKey(name) {
  return name.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter((w) => w && !SUFFIXES.has(w)).join('');
}

function canonicalSectors(values, known) {
  const spellings = new Map(); // lower case -> Map(spelling -> count)
  for (const v of values) {
    const k = v.toLowerCase();
    if (!spellings.has(k)) spellings.set(k, new Map());
    spellings.get(k).set(v, (spellings.get(k).get(v) ?? 0) + 1);
  }
  const canon = new Map();
  for (const [k, counts] of spellings) {
    const existing = known.find((x) => x.toLowerCase() === k);
    canon.set(k, existing ?? [...counts].sort((a, b) => b[1] - a[1])[0][0]);
  }
  return canon;
}

/**
 * Validate, clean and profile a parsed CSV.
 * Returns the accepted startups (cleaned), the errors that reject a row, the warnings that do not,
 * per-column completeness, and a 0-100 score = share of data rows accepted with nothing to report.
 */
export function assessImport(rows, ctx) {
  const base = validateImport(rows, ctx);
  const empty = { startups: [], accepted: [], errors: base.errors, warnings: [], columns: [], rows: Math.max(rows.length - 1, 0), clean: 0, score: 0 };
  if (!base.accepted.length && base.errors.some((e) => e.line === 1)) return empty;

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const warnings = [];
  const warn = (line, message) => warnings.push({ line, message });

  header.forEach((h, i) => { if (h && !COLUMNS.includes(h)) warn(1, `Column "${rows[0][i].trim()}" is not used and was ignored`); });
  for (const c of COLUMNS) if (!header.includes(c)) warn(1, `Optional column "${c}" is missing; a default is used`);

  const dataRows = rows.slice(1);
  const columns = COLUMNS.map((name) => {
    const idx = header.indexOf(name);
    const filled = idx < 0 ? 0 : dataRows.filter((r) => (r[idx] ?? '').trim() !== '').length;
    return { name, filled, total: dataRows.length, percent: dataRows.length ? Math.round((filled / dataRows.length) * 100) : 0 };
  });

  const known = [...new Set(ctx.existingSectors ?? [])];
  const canon = canonicalSectors(base.accepted.map((a) => a.startup.sector).filter((v) => v !== 'Unspecified'), known);
  const flagged = new Set();
  const seenKeys = new Map((ctx.existingNames ?? []).map((n) => [nameKey(n), n]));

  const accepted = base.accepted.map(({ line, startup }) => {
    const raw = dataRows[line - 2];
    const s = { ...startup };
    const sloppy = header.filter((h, i) => COLUMNS.includes(h) && (raw[i] ?? '') !== (raw[i] ?? '').trim());
    if (sloppy.length) { warn(line, `Extra spaces trimmed in ${sloppy.join(', ')}`); flagged.add(line); }
    if (s.sector === 'Unspecified') { warn(line, 'No sector: set to "Unspecified"'); flagged.add(line); }
    else {
      const fixed = canon.get(s.sector.toLowerCase());
      if (fixed !== s.sector) { warn(line, `Sector "${s.sector}" normalised to "${fixed}"`); s.sector = fixed; flagged.add(line); }
    }
    if (!s.oneLiner) { warn(line, 'No one-line description'); flagged.add(line); }
    else if (s.oneLiner.length > MAX_ONE_LINER) { warn(line, `Description is ${s.oneLiner.length} characters (over ${MAX_ONE_LINER})`); flagged.add(line); }
    if (/^[=+\-@]/.test(s.name) || /^[=+\-@]/.test(s.oneLiner)) { warn(line, 'Text starts with = + - or @ and will be exported as plain text'); flagged.add(line); }
    const key = nameKey(s.name);
    if (seenKeys.has(key)) { warn(line, `"${s.name}" looks like "${seenKeys.get(key)}"; check it is not a duplicate`); flagged.add(line); }
    seenKeys.set(key, s.name);
    return { line, startup: s };
  });

  const rowsTotal = dataRows.length;
  const clean = accepted.filter((a) => !flagged.has(a.line)).length;
  return {
    startups: accepted.map((a) => a.startup),
    accepted,
    errors: base.errors,
    warnings,
    columns,
    rows: rowsTotal,
    clean,
    score: rowsTotal ? Math.round((clean / rowsTotal) * 100) : 0,
  };
}

/** The rejected rows with the reason for each, as a CSV the sender can fix and send back. */
export function rejectedCsv(rows, errors) {
  const header = rows[0] ?? [];
  const lines = [['line', 'reason', ...header].map(csvEscape).join(',')];
  for (const e of errors) {
    if (e.line < 2) continue;
    lines.push([e.line, e.message, ...(rows[e.line - 1] ?? [])].map(csvEscape).join(','));
  }
  return `${lines.join('\n')}\n`;
}
