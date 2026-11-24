// Pipeline analytics: pure functions over the startup list, no DOM, no storage.
// Every metric is defined in docs/METRICS.md; keep the two in step.
import { PHASES, CHECKLIST, progress, phaseProgress, currentPhase, isQuiet, daysToTarget, daysBetween, startupLight, csvEscape } from './logic.js';

const pct = (n, d) => (d ? Math.round((n / d) * 100) : null);
const avg = (nums) => (nums.length ? Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10 : null);
const maxDate = (dates) => dates.reduce((a, b) => (a > b ? a : b));

/** Date a phase was finished: the latest checklist date among its items, or null if it is not complete. */
export function phaseCompletedOn(startup, phaseId) {
  if (!phaseProgress(startup, phaseId).complete) return null;
  return maxDate(CHECKLIST.filter((c) => c.phase === phaseId).map((c) => startup.checklist[c.id]));
}

export function pipelineKpis(startups, today) {
  const total = startups.length;
  const done = startups.filter((s) => currentPhase(s) === 'done');
  const active = startups.filter((s) => currentPhase(s) !== 'done');
  const met = startups.filter((s) => s.checklist?.c8);
  const lights = startups.map(startupLight);
  const toMeeting = met.map((s) => daysBetween(s.assigned, s.checklist.c8)).filter((d) => d >= 0);
  const toFinish = done.map((s) => daysBetween(s.assigned, s.checklist.c17)).filter((d) => d >= 0);
  return {
    total,
    active: active.length,
    completed: done.length,
    completionRate: pct(done.length, total),
    avgProgress: total ? Math.round(startups.reduce((n, s) => n + progress(s).percent, 0) / total) : null,
    quiet: active.filter((s) => isQuiet(s, today)).length,
    quietRate: pct(active.filter((s) => isQuiet(s, today)).length, active.length),
    overdue: active.filter((s) => (daysToTarget(s, today) ?? 0) < 0).length,
    red: lights.filter((l) => l === 'red').length,
    redRate: pct(lights.filter((l) => l === 'red').length, lights.filter(Boolean).length),
    formRate: pct(met.filter((s) => s.form?.submitted).length, met.length),
    daysToFirstMeeting: avg(toMeeting),
    daysToFinish: avg(toFinish),
  };
}

/** How many startups reached each stage (phases in order, then Done), and the conversion from the stage before. */
export function funnel(startups) {
  const stages = [...PHASES.map((p) => ({ id: p.id, label: p.short })), { id: 'done', label: 'Done' }];
  const reached = stages.map((_, i) => startups.filter((s) => stages.findIndex((x) => x.id === currentPhase(s)) >= i).length);
  return stages.map((st, i) => ({ ...st, reached: reached[i], conversion: i === 0 ? null : pct(reached[i], reached[i - 1]) }));
}

/** Average days spent in each phase, for startups that finished it. The first phase starts at assignment. */
export function stageDurations(startups) {
  return PHASES.map((p, i) => {
    const days = [];
    for (const s of startups) {
      const end = phaseCompletedOn(s, p.id);
      const start = i === 0 ? s.assigned : phaseCompletedOn(s, PHASES[i - 1].id);
      if (end && start && daysBetween(start, end) >= 0) days.push(daysBetween(start, end));
    }
    return { id: p.id, label: p.short, startups: days.length, avgDays: avg(days) };
  });
}

export function sectorBreakdown(startups) {
  const groups = new Map();
  for (const s of startups) groups.set(s.sector, [...(groups.get(s.sector) ?? []), s]);
  return [...groups].map(([sector, list]) => ({
    sector,
    count: list.length,
    share: pct(list.length, startups.length),
    avgProgress: Math.round(list.reduce((n, s) => n + progress(s).percent, 0) / list.length),
    red: list.filter((s) => startupLight(s) === 'red').length,
  })).sort((a, b) => b.count - a.count || a.sector.localeCompare(b.sector));
}

export function lightMix(startups) {
  const mix = { green: 0, yellow: 0, red: 0, none: 0 };
  for (const s of startups) mix[startupLight(s) ?? 'none'] += 1;
  return mix;
}

/** Completeness checks on the records themselves: how much of the data an analyst or manager can rely on. */
export function datasetHealth(startups) {
  const checks = [
    { id: 'sector', label: 'Sector filled in', test: (s) => s.sector && s.sector !== 'Unspecified' },
    { id: 'oneLiner', label: 'One-line description', test: (s) => Boolean(s.oneLiner?.trim()) },
    { id: 'second', label: 'Second analyst assigned', test: (s) => Boolean(s.second) },
    { id: 'target', label: 'Target date set', test: (s) => Boolean(s.target) || currentPhase(s) === 'done' },
    { id: 'founders', label: 'Founder named', test: (s) => (s.founders ?? []).length > 0 },
  ];
  return checks.map((c) => {
    const passed = startups.filter(c.test).length;
    return { id: c.id, label: c.label, passed, total: startups.length, percent: pct(passed, startups.length) };
  });
}

/** Linear-interpolated quantile of a sorted list (q between 0 and 1). */
export function quantile(sorted, q) {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return Math.round((sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo)) * 10) / 10;
}

/** Spread of days spent in each phase (median and middle half), for startups that finished it. */
export function stageDurationStats(startups) {
  return PHASES.map((p, i) => {
    const days = [];
    for (const s of startups) {
      const end = phaseCompletedOn(s, p.id);
      const start = i === 0 ? s.assigned : phaseCompletedOn(s, PHASES[i - 1].id);
      if (end && start && daysBetween(start, end) >= 0) days.push(daysBetween(start, end));
    }
    days.sort((a, b) => a - b);
    return { id: p.id, label: p.short, n: days.length, min: days[0] ?? null, p25: quantile(days, 0.25), median: quantile(days, 0.5), p75: quantile(days, 0.75), max: days.at(-1) ?? null };
  });
}

/** Startups per sector split by traffic light, largest sector first. */
export function sectorByLight(startups) {
  const groups = new Map();
  for (const s of startups) {
    const row = groups.get(s.sector) ?? { sector: s.sector, green: 0, yellow: 0, red: 0, none: 0, total: 0 };
    row[startupLight(s) ?? 'none'] += 1;
    row.total += 1;
    groups.set(s.sector, row);
  }
  return [...groups.values()].sort((a, b) => b.total - a.total || a.sector.localeCompare(b.sector));
}

/** One flat, spreadsheet-ready table of the headline numbers (opens cleanly in Excel or Sheets). */
export function analyticsCsv(startups, today) {
  const k = pipelineKpis(startups, today);
  const rows = [['section', 'metric', 'value']];
  for (const [metric, value] of Object.entries(k)) rows.push(['kpi', metric, value ?? '']);
  for (const f of funnel(startups)) rows.push(['funnel', `${f.label}: reached`, f.reached], ['funnel', `${f.label}: conversion %`, f.conversion ?? '']);
  for (const d of stageDurations(startups)) rows.push(['stage_days', d.label, d.avgDays ?? '']);
  for (const s of sectorBreakdown(startups)) rows.push(['sector', s.sector, s.count]);
  return `${rows.map((r) => r.map(csvEscape).join(',')).join('\n')}\n`;
}

/** The startups behind one chart element, for click-through. kind: 'stage' | 'phase' | 'analyst'. */
export function drillDown(startups, kind, key, today) {
  const row = (s, detail) => ({ id: s.id, name: s.name, lead: s.lead, detail });
  if (kind === 'stage') {
    const order = [...PHASES.map((p) => p.id), 'done'];
    const at = order.indexOf(key);
    return startups.filter((s) => order.indexOf(currentPhase(s)) >= at).map((s) => row(s, `now in ${currentPhase(s)}`));
  }
  if (kind === 'phase') {
    const i = PHASES.findIndex((p) => p.id === key);
    const out = [];
    for (const s of startups) {
      const end = phaseCompletedOn(s, key);
      const start = i === 0 ? s.assigned : phaseCompletedOn(s, PHASES[i - 1].id);
      if (end && start && daysBetween(start, end) >= 0) out.push({ ...row(s, `${daysBetween(start, end)} days`), days: daysBetween(start, end) });
    }
    return out.sort((a, b) => b.days - a.days);
  }
  if (kind === 'analyst') {
    return startups.filter((s) => s.lead === key && currentPhase(s) !== 'done').map((s) => row(s, isQuiet(s, today) ? 'gone quiet' : 'moving'));
  }
  return [];
}
