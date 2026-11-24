import {
  PHASES, CHECKLIST, TRACKS, P0_QUESTIONS, P0_STATUSES, LIGHTS, FORM_FIELDS, TILES,
  progress, phaseProgress, nextStep, currentPhase, visibleStartups, canEdit, daysToTarget, isQuiet, lastActivity,
  toggleItem, logActivity, p0Rule, proposeForm, formBlockers, openQuestions, startupLight,
  findSlots, bookSlot, freeSlots, slotLabel, draftText, analystSummary, parseCsv, toCsv, newStartup,
} from './logic.js';
import { pipelineKpis, funnel, stageDurationStats, sectorByLight, lightMix, datasetHealth, analyticsCsv } from './analytics.js';
import { rangeChart, stackedBars, funnelChart, dataTable } from './charts.js';
import { seedPortfolio, portfolioAvailability, PORTFOLIO_USERS } from '../data/portfolio-seed.js';
import { assessImport, rejectedCsv } from './quality.js';
import { SAMPLE_CSV } from '../data/sample-import.js';
import { load, save, clear } from './store.js';
import { USERS as SMALL_USERS, seedStartups, seedAvailability, seedBookings, slotGrid } from '../data/seed.js';

const params = new URLSearchParams(location.search);
const pinned = /^\d{4}-\d{2}-\d{2}$/.test(params.get('today') || '');
const today = pinned ? params.get('today') : new Date().toISOString().slice(0, 10);
// The default demo is the 12-startup dataset; ?data=small switches to the original 9 (used for the deal-page screenshot).
const small = params.get('data') === 'small';
const USERS = small ? SMALL_USERS : PORTFOLIO_USERS;
const ANALYSTS = USERS.filter((u) => u.role === 'analyst');

const fresh = () => (small
  ? { startups: seedStartups(today), availability: seedAvailability(today), bookings: seedBookings(today) }
  : { startups: seedPortfolio(today), availability: portfolioAvailability(today), bookings: [] });
const saved = !pinned && !small && load();
const state = {
  ...(saved || fresh()),
  userId: USERS.some((u) => u.id === params.get('as')) ? params.get('as') : 'dana',
  view: ['overview', 'deal', 'deals', 'analytics'].includes(params.get('view')) ? params.get('view') : 'analytics',
  dealId: params.get('deal') || null,
  phase: null, tab: 'founders', tile: null, q: '', importPreview: null, status: '',
  theme: ['light', 'dark'].includes(params.get('theme')) ? params.get('theme') : readTheme(),
};
if (state.view === 'deal' && !state.startups.some((s) => s.id === state.dealId)) state.view = 'deals';
applyTheme();

const root = document.getElementById('app');
const panel = document.getElementById('detail');
const MAX_IMPORT_BYTES = 1_000_000;

function readTheme() {
  try { const t = localStorage.getItem('vc-deal-pipeline:theme'); return t === 'light' || t === 'dark' ? t : 'auto'; } catch { return 'auto'; }
}
function applyTheme() {
  if (state.theme === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = state.theme;
}

// Small DOM helper. Text always goes in as text nodes, never as HTML, so imported CSV cannot inject markup.
function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k !== 'for' && k in el) el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) if (kid != null && kid !== false) el.append(kid);
  return el;
}

const user = () => USERS.find((u) => u.id === state.userId);
const nameOf = (id) => USERS.find((u) => u.id === id)?.name ?? '—';
const find = (id) => state.startups.find((s) => s.id === id);
const phaseLabel = (id) => PHASES.find((p) => p.id === id)?.label ?? 'Done';
const trackLabel = (id) => TRACKS.find((t) => t.id === id)?.label ?? id;
const newId = () => `s-${(crypto.randomUUID?.() ?? String(Math.random()).slice(2)).slice(0, 8)}`;

function persist() { if (!pinned) save({ startups: state.startups, availability: state.availability, bookings: state.bookings }); }
function update(next) {
  state.startups = state.startups.map((s) => (s.id === next.id ? next : s));
  persist();
}

function pill(light) {
  if (!light) return h('span', { class: 'pill pill-none' }, 'No light yet');
  return h('span', { class: `pill pill-${light}`, title: `${LIGHTS[light]} light` }, LIGHTS[light]);
}

function targetChip(s) {
  const d = daysToTarget(s, today);
  if (d == null) return null;
  if (d < 0) return h('span', { class: 'chipx late' }, `Late by ${-d} day${d === -1 ? '' : 's'}`);
  if (d <= 3) return h('span', { class: 'chipx soon' }, d === 0 ? 'Due today' : `Due in ${d} day${d === 1 ? '' : 's'}`);
  return h('span', { class: 'chipx' }, `Due ${s.target}`);
}

// ---- Layout --------------------------------------------------------------------------------

function notice() {
  const role = user().role === 'manager' ? 'Read-only view of every startup.' : 'You see and edit only your own startups.';
  return h('p', { class: 'notice' }, `Demo · fictional fund and data, stored in this browser. ${role}`);
}

function header() {
  const select = h('select', {
    id: 'as',
    onchange: (e) => { state.userId = e.target.value; state.importPreview = null; state.status = ''; state.view = 'deals'; panel.open && panel.close(); render(); },
  }, USERS.map((u) => h('option', { value: u.id, selected: u.id === state.userId }, `${u.name} (${u.role})`)));
  return h('header', { class: 'top' },
    h('div', {}, h('h1', {}, 'Deal Flow'), h('p', { class: 'sub' }, 'Example Ventures · fictional fund, synthetic data')),
    h('div', { class: 'who' },
      h('div', { class: 'seg', role: 'group', 'aria-label': 'Theme' },
        [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']].map(([id, label]) => h('button', {
          type: 'button', 'aria-pressed': state.theme === id ? 'true' : 'false',
          onclick: () => { state.theme = id; applyTheme(); try { localStorage.setItem('vc-deal-pipeline:theme', id); } catch { /* ignore */ } render(); },
        }, label))),
      h('label', { for: 'as' }, 'Viewing as'), select,
      h('button', {
        class: 'btn ghost',
        onclick: () => {
          if (!confirm('Reset to the original demo data? Your changes in this browser will be lost.')) return;
          clear();
          Object.assign(state, fresh(), { status: 'Demo data restored.', view: 'deals' });
          render();
        },
      }, 'Reset demo')));
}

function tabs() {
  const tab = (id, label) => h('button', {
    class: `tab${state.view === id || (id === 'deals' && state.view === 'deal') ? ' on' : ''}`,
    onclick: () => { state.view = id; state.status = ''; render(); },
  }, label);
  return h('nav', { class: 'tabs', 'aria-label': 'Views' }, tab('analytics', 'Analytics'), tab('deals', user().role === 'manager' ? 'All startups' : 'My deals'), tab('overview', 'Overview'));
}

function render() {
  root.replaceChildren(notice(), header(), tabs(),
    h('p', { class: 'status', role: 'status', 'aria-live': 'polite' }, state.status),
    state.view === 'deal' ? dealPage() : state.view === 'overview' ? overviewView() : state.view === 'analytics' ? analyticsView() : dealsView());
}

// ---- My deals ----------------------------------------------------------------------------------

function card(s) {
  const p = progress(s);
  const next = nextStep(s);
  return h('button', { class: 'card', onclick: () => openDeal(s.id) },
    h('strong', {}, s.name),
    h('span', { class: 'sector' }, `${s.sector} · ${trackLabel(s.track)}`),
    h('span', { class: 'bar' }, h('span', { class: 'bar-fill', style: `width:${p.percent}%` })),
    h('span', { class: 'meta' }, h('span', { class: 'num' }, `${p.percent}%`), pill(startupLight(s))),
    next && h('span', { class: 'next' }, `Next: ${next.label}`),
    h('span', { class: 'chips' }, targetChip(s), isQuiet(s, today) && h('span', { class: 'chipx soon' }, 'Gone quiet')));
}

function addForm() {
  const name = h('input', { id: 'new-name', placeholder: 'Startup name', required: true, maxLength: 80 });
  const sector = h('input', { id: 'new-sector', placeholder: 'Sector', maxLength: 60 });
  return h('form', {
    class: 'add',
    onsubmit: (e) => {
      e.preventDefault();
      const n = name.value.trim();
      if (!n) return;
      if (state.startups.some((s) => s.name.toLowerCase() === n.toLowerCase())) { state.status = `"${n}" is already on the list.`; return render(); }
      state.startups = [...state.startups, newStartup({ id: newId(), name: n, sector: sector.value.trim() || 'Unspecified', lead: state.userId, today })];
      persist();
      state.status = `Added ${n}.`;
      render();
    },
  }, h('label', { class: 'sr', for: 'new-name' }, 'Startup name'), name, h('label', { class: 'sr', for: 'new-sector' }, 'Sector'), sector,
  h('button', { class: 'btn', type: 'submit' }, 'Add startup'));
}

async function onFile(e) {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  if (file.size > MAX_IMPORT_BYTES) { state.status = 'File is larger than 1 MB.'; return render(); }
  previewCsv(await file.text());
}

function previewCsv(text) {
  const rows = parseCsv(text);
  if (rows.length > 501) { state.status = 'Import is limited to 500 rows.'; return render(); }
  state.importRows = rows;
  state.importPreview = assessImport(rows, {
    lead: state.userId, today, newId,
    existingNames: state.startups.map((s) => s.name), existingSectors: state.startups.map((s) => s.sector),
  });
  state.status = '';
  render();
}

function download(name, text, type = 'text/csv') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = h('a', { href: url, download: name });
  document.body.append(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}

function importPanel() {
  const p = state.importPreview;
  if (!p) return null;
  const n = p.startups.length;
  const tone = p.score >= 80 ? 'green' : p.score >= 50 ? 'yellow' : 'red';
  const list = (items, cls) => items.length > 0 && h('ul', { class: cls }, items.slice(0, 12).map((x) => h('li', {}, `Line ${x.line}: ${x.message}`)), items.length > 12 && h('li', {}, `…and ${items.length - 12} more`));
  return h('section', { class: 'panel', 'aria-label': 'Import preview' },
    h('h2', {}, 'Import check'),
    h('div', { class: 'kpis' },
      h('div', { class: 'kpi' }, h('span', { class: `kpi-v pill-${tone}` }, `${p.score}`), h('span', { class: 'kpi-l' }, 'Quality score'), h('span', { class: 'kpi-h' }, `${p.clean} of ${p.rows} rows clean`)),
      h('div', { class: 'kpi' }, h('span', { class: 'kpi-v' }, String(n)), h('span', { class: 'kpi-l' }, 'Ready to import'), h('span', { class: 'kpi-h' }, 'after cleaning')),
      h('div', { class: 'kpi' }, h('span', { class: 'kpi-v' }, String(p.errors.length)), h('span', { class: 'kpi-l' }, 'Rejected'), h('span', { class: 'kpi-h' }, 'cannot be imported')),
      h('div', { class: 'kpi' }, h('span', { class: 'kpi-v' }, String(p.warnings.length)), h('span', { class: 'kpi-l' }, 'Warnings'), h('span', { class: 'kpi-h' }, 'imported, worth a look'))),
    p.columns.length > 0 && h('div', { class: 'scroll' }, h('table', {}, h('caption', { class: 'sr' }, 'Completeness by column'),
      h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Column'), h('th', { scope: 'col' }, 'Filled'), h('th', { scope: 'col' }, 'Completeness'))),
      h('tbody', {}, p.columns.map((c) => h('tr', {}, h('th', { scope: 'row' }, c.name), h('td', { class: 'num' }, `${c.filled}/${c.total}`),
        h('td', {}, h('div', { class: 'bar-row', style: 'grid-template-columns:1fr 3rem;margin:0' }, h('span', { class: 'bar' }, h('span', { class: 'bar-fill', style: `width:${c.percent}%` })), h('span', { class: 'bar-n' }, `${c.percent}%`)))))))),
    p.errors.length > 0 && h('h3', {}, 'Rejected rows'), list(p.errors, 'errors'),
    p.warnings.length > 0 && h('h3', {}, 'Warnings (cleaned or flagged)'), list(p.warnings, 'warns'),
    h('div', { class: 'row' },
      n > 0 && h('button', { class: 'btn', onclick: () => { state.startups = [...state.startups, ...p.startups]; persist(); state.status = `Imported ${n} startup${n === 1 ? '' : 's'}.`; state.importPreview = null; render(); } }, `Import ${n} valid row${n === 1 ? '' : 's'}`),
      p.errors.length > 0 && h('button', { class: 'btn ghost', onclick: () => download('rejected-rows.csv', rejectedCsv(state.importRows, p.errors)) }, 'Download rejected rows'),
      h('button', { class: 'btn ghost', onclick: () => { state.importPreview = null; render(); } }, 'Cancel')));
}

function focusCard(mine) {
  const open = mine.filter((s) => currentPhase(s) !== 'done');
  if (!open.length) return null;
  const urgent = [...open].sort((a, b) => (daysToTarget(a, today) ?? 999) - (daysToTarget(b, today) ?? 999))[0];
  const next = nextStep(urgent);
  return h('section', { class: 'card focus', 'aria-label': 'Next up' },
    h('div', {}, h('span', { class: 'cap' }, 'Next up'), h('h2', {}, urgent.name), h('p', {}, next.label), h('span', { class: 'chips' }, targetChip(urgent))),
    h('button', { class: 'btn', onclick: () => openDeal(urgent.id) }, 'Open deal'));
}

function dealsView() {
  const me = user();
  const mine = visibleStartups(me, state.startups);
  const isAnalyst = me.role === 'analyst';
  const columns = [...PHASES.map((p) => ({ id: p.id, label: p.label })), { id: 'done', label: 'Done' }];
  return h('main', {},
    isAnalyst && focusCard(mine),
    h('div', { class: 'toolbar' },
      isAnalyst && addForm(),
      h('div', { class: 'row' },
        isAnalyst && h('label', { class: 'btn ghost file' }, 'Import CSV', h('input', { type: 'file', accept: '.csv,text/csv', hidden: true, onchange: onFile })),
        isAnalyst && h('button', { class: 'btn ghost', onclick: () => previewCsv(SAMPLE_CSV) }, 'Try a messy sample file'),
        h('button', { class: 'btn ghost', onclick: () => download('startups.csv', toCsv(mine)) }, 'Export CSV'))),
    importPanel(),
    h('div', { class: 'board' }, columns.map((c) => {
      const items = mine.filter((s) => currentPhase(s) === c.id);
      return h('section', { class: 'col', 'aria-label': `${c.label}, ${items.length} startups` },
        h('h2', {}, c.label, h('span', { class: 'count' }, String(items.length))),
        items.length === 0 ? h('p', { class: 'empty' }, 'Nothing here') : items.map(card));
    })));
}

function openDeal(id) {
  state.dealId = id; state.view = 'deal'; state.phase = null; state.tab = 'founders'; state.status = '';
  render();
  window.scrollTo(0, 0);
}

// ---- Deal page ------------------------------------------------------------------------------------------

function sidePanel(...content) {
  panel.replaceChildren(h('div', {}, content));
  if (!panel.open) panel.showModal();
}

function openDraft(kind, s, title) {
  const ctx = { leadName: nameOf(s.lead) };
  const area = h('textarea', { rows: 16, 'aria-label': title }, draftText(kind, s, ctx));
  const msg = h('span', { class: 'note', role: 'status' });
  sidePanel(
    h('h2', { id: 'detail-title' }, title),
    h('p', { class: 'note' }, 'A ready-made draft from a fixed template. Edit it, then copy it where you need it. No AI call is made.'),
    area,
    h('div', { class: 'row end' }, msg,
      h('button', { class: 'btn ghost', onclick: () => panel.close() }, 'Close'),
      h('button', { class: 'btn', onclick: async () => { try { await navigator.clipboard.writeText(area.value); msg.textContent = 'Copied ✓'; } catch { area.select(); msg.textContent = 'Select and copy manually.'; } } }, 'Copy')));
}

function openSchedule(s, itemId) {
  const me = user();
  const draw = () => {
    const options = findSlots({ availability: state.availability, bookings: state.bookings, leadId: s.lead, analysts: ANALYSTS.map((a) => a.id), preferred: s.second ? [s.second] : [] });
    const mine = state.availability[me.id] ?? [];
    const grid = slotGrid(today);
    const days = [...new Set(grid.map((x) => x.split('T')[0]))];
    const draft = h('textarea', { rows: 10, 'aria-label': 'Email with times' }, draftText('times', s, { leadName: nameOf(s.lead), options }));
    const msg = h('p', { class: 'note', role: 'status' });
    sidePanel(
      h('h2', { id: 'detail-title' }, `Book a meeting: ${s.name}`),
      h('p', { class: 'note' }, 'Each analyst marks the hours they are free. Times below are slots where the lead and at least one other analyst are free and nothing else is booked. They are checked again when you book.'),
      h('h3', {}, 'My availability'),
      h('div', { class: 'avail' }, days.map((d) => h('div', { class: 'avail-day' }, h('span', { class: 'when' }, slotLabel(`${d}T00:00`).split(',')[0]),
        grid.filter((x) => x.startsWith(d)).map((slot) => h('button', {
          class: 'chip', type: 'button', 'aria-pressed': mine.includes(slot) ? 'true' : 'false', disabled: me.role !== 'analyst',
          onclick: () => { const cur = new Set(state.availability[me.id] ?? []); if (cur.has(slot)) cur.delete(slot); else cur.add(slot); state.availability = { ...state.availability, [me.id]: [...cur].sort() }; persist(); draw(); },
        }, slot.split('T')[1]))))),
      h('h3', {}, 'Times where both are free'),
      options.length === 0 ? h('p', { class: 'note' }, 'No common time. Ask the analysts to add availability.') : h('ul', { class: 'options' }, options.map((o) => h('li', {},
        h('span', {}, `${slotLabel(o.slot)} · with ${nameOf(o.peer)}`),
        canEdit(me, s) && h('button', {
          class: 'btn ghost', type: 'button',
          onclick: () => {
            try {
              state.bookings = bookSlot({ availability: state.availability, bookings: state.bookings, startupId: s.id, leadId: s.lead, peerId: o.peer, slot: o.slot });
            } catch (err) { msg.textContent = err.message; return draw(); }
            let next = { ...find(s.id), second: s.second ?? o.peer, meeting: o.slot };
            next = logActivity(next, today, `Meeting booked: ${slotLabel(o.slot)} with ${nameOf(o.peer)}`, me.id);
            ['c1', itemId].filter((x, i, a) => x && a.indexOf(x) === i && !next.checklist[x]).forEach((x) => { next = toggleItem(next, x, today, me.id); });
            update(next);
            state.status = `Booked ${slotLabel(o.slot)} for ${s.name}.`;
            panel.close();
            render();
          },
        }, 'Founders chose this')))),
      msg,
      h('h3', {}, 'Email to the founders'),
      draft,
      h('div', { class: 'row end' }, h('button', { class: 'btn ghost', onclick: () => panel.close() }, 'Close'),
        h('button', { class: 'btn', onclick: async () => { try { await navigator.clipboard.writeText(draft.value); msg.textContent = 'Copied ✓'; } catch { draft.select(); } } }, 'Copy email')));
  };
  draw();
}

function itemAction(s, c, editable) {
  if (!c.action) return null;
  const [kind, arg] = c.action.split(':');
  if (kind === 'schedule') return h('button', { class: 'btn sm', onclick: () => openSchedule(s, c.id) }, 'Find times');
  if (kind === 'draft') return h('button', { class: 'btn sm', onclick: () => openDraft(arg, s, c.label) }, 'Ready text');
  if (kind === 'light') return h('button', { class: 'btn sm', onclick: () => { document.getElementById('light-card')?.scrollIntoView({ behavior: 'smooth' }); } }, 'Open form');
  return null;
}

function checklistCard(s, editable) {
  const phaseIds = PHASES.map((p) => p.id);
  const cur = currentPhase(s);
  const idx = state.phase != null ? state.phase : Math.max(0, phaseIds.indexOf(cur === 'done' ? 'dd' : cur));
  const ph = PHASES[idx];
  const pp = phaseProgress(s, ph.id);
  const next = nextStep(s);
  const go = (d) => { state.phase = idx + d; render(); };
  return h('section', { class: 'card', 'aria-labelledby': 'cl-h' },
    h('div', { class: 'card-head' }, h('h2', { id: 'cl-h' }, 'Checklist'), h('span', { class: 'cap' }, editable ? 'Tick the box when a step is done · arrows move between phases' : 'Read-only')),
    h('div', { class: 'stepper' },
      h('button', { class: 'nav', disabled: idx === 0, 'aria-label': 'Previous phase', onclick: () => go(-1) }, '‹'),
      h('div', { class: 'where' }, h('div', { class: 'ph-name' }, ph.label), h('div', { class: 'ph-sub' }, `Phase ${idx + 1} of ${PHASES.length} · ${pp.done} of ${pp.total} done`)),
      h('button', { class: 'nav', disabled: idx === PHASES.length - 1, 'aria-label': 'Next phase', onclick: () => go(1) }, '›')),
    h('ol', { class: 'dots', 'aria-hidden': 'true' }, PHASES.map((p, i) => h('li', { class: `${phaseProgress(s, p.id).complete ? 'done' : ''}${i === idx ? ' here' : ''}` }))),
    h('ul', { class: 'items' }, CHECKLIST.filter((c) => c.phase === ph.id).map((c) => {
      const done = s.checklist?.[c.id];
      return h('li', { class: `item${done ? ' done' : ''}${next?.id === c.id ? ' current' : ''}` },
        h('button', {
          class: 'box', role: 'checkbox', 'aria-checked': done ? 'true' : 'false', 'aria-label': c.label, disabled: !editable,
          onclick: () => { update(toggleItem(find(s.id), c.id, today, state.userId)); render(); },
        }, done ? '✓' : ''),
        h('span', { class: 'text' }, c.label),
        next?.id === c.id && h('span', { class: 'tag' }, 'Next'),
        done && h('span', { class: 'when' }, done),
        editable && itemAction(s, c, editable));
    })));
}

function prepCard(s) {
  const qs = openQuestions(s);
  const standard = ['What changed in the business in the last three months?', 'What do you need this round to achieve?', 'Who else have you talked to?'];
  const items = [...qs.map((q) => ({ text: q.question, tag: P0_STATUSES.find((x) => x.id === q.status).label })), ...standard.map((t) => ({ text: t, tag: 'Standard' }))];
  return h('section', { class: 'card', 'aria-labelledby': 'prep-h' },
    h('div', { class: 'card-head' }, h('h2', { id: 'prep-h' }, 'Preparing the meeting'), h('span', { class: 'cap' }, 'Built from the open P0 questions; the least verified come first')),
    h('div', { class: 'prep-grid' }, items.map((q, i) => h('div', { class: 'prep-item' }, h('span', { class: 'num' }, String(i + 1)), h('span', {}, q.text), h('span', { class: 'cap' }, q.tag)))));
}

function lightCard(s, editable) {
  const form = s.form;
  const submitted = Boolean(form.submitted);
  const dis = !editable || submitted;
  const rule = p0Rule(form.p0);
  const msg = h('span', { class: 'note', role: 'status', 'aria-live': 'polite' });
  const save2 = (patch) => { const cur = find(s.id); update({ ...cur, form: { ...cur.form, ...patch } }); };
  const setP0 = (q, patch) => { const cur = find(s.id); save2({ p0: { ...cur.form.p0, [q]: { ...(cur.form.p0[q] ?? { status: 'unknown', source: '' }), ...patch } } }); };
  const lightSel = h('select', { id: 'f-light', disabled: dis, onchange: (e) => { save2({ light: e.target.value || null }); render(); } },
    h('option', { value: '' }, 'Choose…'), Object.entries(LIGHTS).map(([id, label]) => h('option', { value: id, selected: form.light === id }, label)));
  return h('section', { class: 'card', id: 'light-card', 'aria-labelledby': 'light-h' },
    h('div', { class: 'card-head' }, h('h2', { id: 'light-h' }, 'Traffic-light form'),
      h('span', { class: 'cap' }, submitted ? `Submitted ${form.submitted}` : 'Draft · saved automatically')),
    h('p', { class: 'cap' }, 'P0 questions: what is known and where it was checked. Founder-stated counts as unverified.'),
    h('ul', { class: 'p0-list' }, P0_QUESTIONS.map((q) => {
      const e = form.p0[q] ?? { status: 'unknown', source: '' };
      return h('li', { class: 'p0-item' }, h('b', {}, q),
        h('select', { 'aria-label': q, disabled: dis, onchange: (ev) => { setP0(q, { status: ev.target.value }); render(); } },
          P0_STATUSES.map((st) => h('option', { value: st.id, selected: st.id === e.status }, st.label))),
        h('input', { type: 'text', placeholder: 'Source: where it was checked', 'aria-label': `Source: ${q}`, value: e.source, disabled: dis, maxLength: 200, onchange: (ev) => setP0(q, { source: ev.target.value.trim() }) }));
    })),
    h('div', { class: 'p0-rule' }, h('b', {}, rule.light ? `Suggested by the rules: ${LIGHTS[rule.light]}` : 'No suggestion yet'), h('span', { class: 'cap' }, rule.why),
      rule.light && !dis && h('button', { class: 'btn sm', onclick: () => { save2({ light: rule.light }); render(); } }, 'Use the suggestion')),
    h('div', { class: 'grid2' }, h('div', {}, h('label', { for: 'f-light' }, 'Light (your decision)'), lightSel), h('div', {}, h('label', {}, 'Shown as'), pill(form.light))),
    h('details', { class: 'lf-more', open: !submitted && !form.fields?.summary },
      h('summary', {}, `Form text (${FORM_FIELDS.filter((f) => form.fields?.[f.id]).length} of ${FORM_FIELDS.length} filled)`),
      h('div', { class: 'lf-grid' }, FORM_FIELDS.map((f) => h('div', { class: 'lf-field' }, h('label', { for: `lf-${f.id}` }, f.label),
      h('textarea', { id: `lf-${f.id}`, rows: 3, maxLength: 1500, disabled: dis, value: form.fields?.[f.id] ?? '', onchange: (ev) => save2({ fields: { ...find(s.id).form.fields, [f.id]: ev.target.value } }) }))))),
    h('div', { class: 'row end' }, msg,
      !dis && h('button', { class: 'btn ghost', onclick: () => {
        if (Object.values(form.fields ?? {}).some(Boolean) && !confirm('This replaces the current text with a new proposal, including your edits.')) return;
        const p = proposeForm({ ...find(s.id), leadName: nameOf(s.lead) });
        save2({ fields: p.fields, light: form.light ?? p.light }); render();
      } }, 'Propose from the record'),
      !dis && h('button', { class: 'btn', onclick: () => {
        const cur = find(s.id);
        const blockers = formBlockers(cur.form);
        if (blockers.length) { msg.textContent = blockers.join(' '); return; }
        if (!confirm(`Submit the form for ${s.name}?`)) return;
        let next = { ...cur, form: { ...cur.form, submitted: today } };
        next = logActivity(next, today, `Traffic-light form submitted: ${LIGHTS[cur.form.light]}`, state.userId);
        if (!next.checklist.c10) next = toggleItem(next, 'c10', today, state.userId);
        update(next); state.status = `Form submitted for ${s.name}.`; render();
      } }, 'Submit form'),
      submitted && editable && h('button', { class: 'btn ghost', onclick: () => { const cur = find(s.id); const { submitted: _s, ...rest } = cur.form; update({ ...cur, form: rest }); render(); } }, 'Reopen')));
}

function tabsCard(s, editable) {
  const tab = (id, label) => h('button', { class: `tab${state.tab === id ? ' on' : ''}`, role: 'tab', 'aria-selected': state.tab === id ? 'true' : 'false', onclick: () => { state.tab = id; render(); } }, label);
  const fi = s.founderInfo ?? {};
  let body;
  if (state.tab === 'founders') {
    body = h('div', {}, h('p', { class: 'warn' }, '⚠ Provided by the founders in their application and deck. Not yet verified. Our own findings are in the P0 answers and the research notes.'),
      h('dl', { class: 'facts' }, [['Team', fi.team], ['Market', fi.market], ['Product', fi.product], ['Traction', fi.traction]].map(([k, v]) => [h('dt', {}, k), h('dd', {}, v || 'Not provided')])));
  } else if (state.tab === 'docs') {
    body = h('div', {}, h('p', { class: 'cap' }, 'Documents requested from the founders and what has arrived.'),
      h('ul', { class: 'folders' }, (s.docs ?? []).map((d, i) => h('li', { class: 'folder' }, h('b', {}, d.folder), h('span', { class: `chipx ${d.status === 'received' ? '' : 'soon'}` }, d.status === 'received' ? 'Received' : 'Missing'),
        h('span', { class: 'cap' }, d.files.join(', ')),
        editable && h('button', { class: 'btn sm', onclick: () => { const cur = find(s.id); const docs = cur.docs.map((x, j) => (j === i ? { ...x, status: x.status === 'received' ? 'missing' : 'received' } : x)); update(logActivity({ ...cur, docs }, today, `${d.folder}: marked ${d.status === 'received' ? 'missing' : 'received'}`, state.userId)); render(); } }, d.status === 'received' ? 'Mark missing' : 'Mark received')))));
  } else {
    body = h('ol', { class: 'timeline' }, [...(s.activity ?? [])].reverse().map((a) => h('li', {}, h('span', { class: 'when' }, a.date), `${a.text}${a.by ? ` · ${nameOf(a.by)}` : ''}`)));
  }
  return h('div', {}, h('div', { class: 'tabs inner', role: 'tablist' }, tab('founders', 'What the founders told us'), tab('docs', 'Document room'), tab('activity', 'Activity')), h('div', { class: 'tabpanel' }, body));
}

function dealPage() {
  const s = find(state.dealId);
  const me = user();
  const editable = canEdit(me, s);
  const next = nextStep(s);
  const qs = openQuestions(s);
  const meetingSlot = s.meeting ? slotLabel(s.meeting) : 'Not booked';
  return h('main', { class: 'deal' },
    h('nav', { class: 'crumb', 'aria-label': 'Location' }, h('button', { class: 'link', onclick: () => { state.view = 'deals'; render(); } }, me.role === 'manager' ? 'All startups' : 'My deals'), h('span', { 'aria-hidden': 'true' }, ' › '), h('span', {}, s.name)),
    h('div', { class: 'deal-head' },
      h('div', {}, h('div', { class: 'chips' }, h('span', { class: 'chipx' }, trackLabel(s.track)), pill(startupLight(s)), targetChip(s)),
        h('h1', {}, s.name), h('p', { class: 'sub' }, `${s.sector} · ${s.oneLiner}`))),
    !editable && h('p', { class: 'warn' }, me.role === 'manager' ? 'Read-only view for the manager. Buttons that change data are disabled.' : 'Read-only: this startup is not assigned to you.'),
    h('section', { class: 'card next-box', 'aria-label': 'Next step' },
      h('span', { class: 'cap' }, 'Next step'), h('p', {}, next ? next.label : 'Everything is done.')),
    h('div', { class: 'cols' },
      h('div', { class: 'stack' }, checklistCard(s, editable), prepCard(s), lightCard(s, editable), tabsCard(s, editable)),
      h('aside', { class: 'stack' },
        h('section', { class: 'card', 'aria-labelledby': 'facts-h' }, h('h2', { id: 'facts-h' }, 'Deal details'),
          h('dl', { class: 'facts' }, [
            ['Lead', nameOf(s.lead)], ['Second analyst', s.second ? nameOf(s.second) : 'Not set'], ['Track', trackLabel(s.track)], ['Phase', phaseLabel(currentPhase(s))],
            ['Progress', `${progress(s).percent}%`], ['Assigned', s.assigned], ['Target', s.target ?? '—'], ['Meeting', meetingSlot], ['Last activity', lastActivity(s)],
          ].map(([k, v]) => [h('dt', {}, k), h('dd', {}, v)]))),
        h('section', { class: 'card', 'aria-labelledby': 'qs-h' }, h('div', { class: 'card-head' }, h('h2', { id: 'qs-h' }, 'Open questions'), h('span', { class: 'cap' }, String(qs.length))),
          qs.length === 0 ? h('p', { class: 'note' }, 'All P0 questions are verified.') : h('ol', { class: 'qs' }, qs.map((q) => h('li', {}, q.question, h('span', { class: 'cap' }, ` ${P0_STATUSES.find((x) => x.id === q.status).label}`))))))));
}

// ---- Overview ------------------------------------------------------------------------------------------------

function overviewView() {
  const me = user();
  const mine = visibleStartups(me, state.startups);
  const open = mine.filter((s) => currentPhase(s) !== 'done');
  const avg = mine.length ? Math.round(mine.reduce((n, s) => n + progress(s).percent, 0) / mine.length) : 0;
  const tile = TILES.find((t) => t.id === state.tile);
  const needle = state.q.trim().toLowerCase();
  const rows = mine.filter((s) => (!tile || tile.test(s, today)) && (!needle || `${s.name} ${s.sector}`.toLowerCase().includes(needle)))
    .sort((a, b) => (daysToTarget(a, today) ?? 999) - (daysToTarget(b, today) ?? 999));
  const people = ANALYSTS.filter((a) => me.role === 'manager' || a.id === me.id);
  return h('main', {},
    h('div', { class: 'tiles', role: 'group', 'aria-label': 'Filter the table' }, TILES.map((t) => {
      const n = mine.filter((s) => t.test(s, today)).length;
      const pressed = state.tile === t.id;
      return h('button', { class: `tile${n === 0 ? ' zero' : ` hot ${t.tone}`}`, 'aria-pressed': pressed ? 'true' : 'false', onclick: () => { state.tile = pressed ? null : t.id; render(); } },
        h('span', { class: 'v' }, String(n)), h('span', { class: 'l' }, t.label), h('span', { class: 'h' }, t.hint));
    })),
    h('p', { class: 'lead' }, h('span', { class: 'num' }, String(open.length)), ' open of ', h('span', { class: 'num' }, String(mine.length)), ' startups · average progress ', h('span', { class: 'num' }, `${avg}%`)),
    h('section', { class: 'panel' }, h('h2', {}, me.role === 'manager' ? 'Workload by analyst' : 'Your workload'),
      h('div', { class: 'scroll' }, h('table', {}, h('thead', {}, h('tr', {}, ['Analyst', 'As lead', 'As second', 'Gone quiet', 'Forms submitted', 'Avg progress'].map((c) => h('th', { scope: 'col' }, c)))),
        h('tbody', {}, analystSummary(mine, people, today).map((a) => h('tr', {}, h('th', { scope: 'row' }, a.name), h('td', { class: 'num' }, String(a.lead)), h('td', { class: 'num' }, String(a.second)),
          h('td', { class: 'num' }, String(a.quiet)), h('td', { class: 'num' }, String(a.submitted)), h('td', { class: 'num' }, a.progress == null ? '—' : `${a.progress}%`))))))),
    h('section', { class: 'panel' },
      h('div', { class: 'row', style: 'justify-content:space-between' }, h('h2', {}, `Startups (${rows.length})`),
        h('div', { class: 'row' }, h('label', { class: 'sr', for: 'q' }, 'Search startups'),
          h('input', { id: 'q', class: 'search', type: 'search', placeholder: 'Search name or sector', value: state.q, oninput: (e) => { state.q = e.target.value; render(); const el = document.getElementById('q'); el.focus(); el.setSelectionRange(state.q.length, state.q.length); } }),
          (tile || needle) && h('button', { class: 'btn ghost', onclick: () => { state.tile = null; state.q = ''; render(); } }, 'Clear'))),
      h('div', { class: 'scroll' }, h('table', {}, h('thead', {}, h('tr', {}, ['Startup', 'Track', 'Lead', 'Second', 'Phase', 'Progress', 'Next step', 'Light', 'Target'].map((c) => h('th', { scope: 'col' }, c)))),
        h('tbody', {}, rows.map((s) => {
          const next = nextStep(s);
          return h('tr', { class: isQuiet(s, today) ? 'is-quiet' : '' },
            h('th', { scope: 'row' }, h('button', { class: 'link', onclick: () => openDeal(s.id) }, s.name)),
            h('td', {}, trackLabel(s.track)), h('td', {}, nameOf(s.lead)), h('td', {}, s.second ? nameOf(s.second) : '—'),
            h('td', {}, phaseLabel(currentPhase(s))), h('td', { class: 'num' }, `${progress(s).percent}%`),
            h('td', { class: 'wrap' }, next ? next.label : 'Done'), h('td', {}, pill(startupLight(s))), h('td', {}, targetChip(s) ?? '—'));
        }))))));
}

// ---- Analytics ---------------------------------------------------------------------------------------

function kpi(value, label, hint) {
  return h('div', { class: 'kpi' }, h('span', { class: 'kpi-v' }, value ?? '—'), h('span', { class: 'kpi-l' }, label), h('span', { class: 'kpi-h' }, hint));
}

function barRow(label, percent, text, wide = false) {
  return h('div', { class: 'bar-row', style: wide ? 'grid-template-columns:14rem 1fr 4rem' : null }, h('span', {}, label),
    h('span', { class: 'bar', role: 'img', 'aria-label': `${label}: ${text}` }, h('span', { class: 'bar-fill', style: `width:${percent ?? 0}%` })), h('span', { class: 'bar-n' }, text));
}

function chartPanel(title, note, svg, table, legendItems) {
  return h('section', { class: 'panel' }, h('h2', {}, title), note && h('p', { class: 'note' }, note),
    legendItems && h('p', { class: 'legend' }, legendItems.map(([color, text]) => h('span', {}, h('i', { class: 'swatch', style: `background:var(--${color})` }), text))),
    svg, table);
}

function chartWidth() { return Math.max(320, Math.min(960, document.documentElement.clientWidth - 56)); }

function analyticsView() {
  const me = user();
  const mine = visibleStartups(me, state.startups);
  if (!mine.length) return h('main', {}, h('p', { class: 'empty' }, 'No startups to analyse yet.'));
  const k = pipelineKpis(mine, today);
  const fn = funnel(mine);
  const stats = stageDurationStats(mine);
  const W = chartWidth();
  const sectors = sectorByLight(mine);
  const mix = lightMix(mine);
  const people = ANALYSTS.filter((a) => me.role === 'manager' || a.id === me.id);
  const load = analystSummary(mine, people, today);
  const pctText = (v) => (v == null ? '—' : `${v}%`);
  const slow = stats.filter((x) => x.median != null).sort((a, b) => b.median - a.median)[0];
  return h('main', {},
    h('div', { class: 'row', style: 'justify-content:space-between' },
      h('p', { class: 'lead' }, me.role === 'manager' ? 'All startups' : 'Your startups', ` · as of ${today} · synthetic data · definitions in `, h('a', { href: 'https://github.com/aradyaacovi/vc-deal-pipeline/blob/main/docs/METRICS.md' }, 'METRICS.md')),
      h('button', { class: 'btn ghost', onclick: () => download('pipeline-analytics.csv', analyticsCsv(mine, today)) }, 'Export analytics CSV')),
    h('div', { class: 'kpis' },
      kpi(String(k.active), 'Active', `${k.total} startups in total`),
      kpi(pctText(k.completionRate), 'Completed', `${k.completed} through the committee`),
      kpi(pctText(k.avgProgress), 'Avg progress', 'checklist items done'),
      kpi(pctText(k.quietRate), 'Gone quiet', `${k.quiet} of ${k.active} active`),
      kpi(pctText(k.redRate), 'Red lights', `${k.red} of ${mine.length - mix.none} evaluated`),
      kpi(k.daysToFirstMeeting == null ? null : `${k.daysToFirstMeeting}d`, 'To first meeting', 'assignment to meeting done'),
      kpi(pctText(k.formRate), 'Form submitted', 'of startups already met')),
    chartPanel('Where startups drop out', 'Startups that reached each stage, and the share that moved on from the stage before.',
      funnelChart({ width: W, stages: fn, label: `Funnel: ${fn.map((f) => `${f.label} ${f.reached}`).join(', ')}.` }),
      dataTable('Funnel', ['Stage', 'Reached', 'Conversion %'], fn.map((f) => [f.label, f.reached, f.conversion]))),
    chartPanel('Time in each phase', slow ? `${slow.label} is the slowest phase: median ${slow.median} days. Bar = middle half, tick = median, line = fastest to slowest; in brackets, startups that finished the phase.` : 'No finished phases yet.',
      rangeChart({ width: W, rows: stats, label: `Days per phase, median: ${stats.map((x) => `${x.label} ${x.median ?? 'none'}`).join(', ')}.` }),
      dataTable('Days per phase', ['Phase', 'Finished', 'Fastest', 'Q1', 'Median', 'Q3', 'Slowest'], stats.map((x) => [x.label, x.n, x.min, x.p25, x.median, x.p75, x.max]))),
    chartPanel('Sectors and traffic lights', 'Where startups and risks concentrate.',
      stackedBars({ width: W, rows: sectors.map((x) => ({ label: x.sector, parts: ['green', 'yellow', 'red', 'none'].map((key) => ({ key, value: x[key] })) })), keys: [{ key: 'green', color: 'green' }, { key: 'yellow', color: 'yellow' }, { key: 'red', color: 'red' }, { key: 'none', color: 'none' }], label: `Startups by sector and light. Largest: ${sectors[0].sector}, ${sectors[0].total}.` }),
      dataTable('Sectors by light', ['Sector', 'Green', 'Yellow', 'Red', 'Not evaluated'], sectors.map((x) => [x.sector, x.green, x.yellow, x.red, x.none])),
      [['green', 'Green'], ['yellow', 'Yellow'], ['red', 'Red'], ['control', 'Not evaluated']]),
    chartPanel(me.role === 'manager' ? 'Workload by analyst' : 'Your workload', 'Open startups as lead, split into moving and gone quiet.',
      stackedBars({ width: W, rows: load.map((a) => ({ label: a.name, parts: [{ key: 'moving', value: a.open - a.quiet }, { key: 'quiet', value: a.quiet }] })), keys: [{ key: 'moving', color: 'brand' }, { key: 'quiet', color: 'yellow' }], label: `Open startups per analyst: ${load.map((a) => `${a.name} ${a.open}`).join(', ')}.` }),
      dataTable('Workload', ['Analyst', 'Open as lead', 'Gone quiet'], load.map((a) => [a.name, a.open, a.quiet])),
      [['brand', 'Moving'], ['yellow', 'Gone quiet']]),
    h('section', { class: 'panel' }, h('h2', {}, 'Data health'),
      h('p', { class: 'note' }, 'How complete the records are. Low numbers here mean the analytics above are less reliable.'),
      datasetHealth(mine).map((c) => barRow(c.label, c.percent, `${c.passed}/${c.total}`, true))));
}

let lastWidth = document.documentElement.clientWidth;
window.addEventListener('resize', () => {
  const w = document.documentElement.clientWidth;
  if (state.view === 'analytics' && w !== lastWidth) { lastWidth = w; render(); }
});

render();
