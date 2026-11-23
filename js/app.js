import {
  STAGES, RUBRIC, STALE_AFTER_DAYS, scoreDeal, visibleDeals, canEdit, isStale,
  summarize, funnel, moveDeal, CHECKLIST, checklistProgress, meetingPrep, parseCsv, toCsv, validateImport, formatUsd,
  FILTERS, filterDeals, validateSubmission, submitDeal, draftMemo, analystSummary, daysInStage,
} from './logic.js';
import { load, save, clear } from './store.js';
import { USERS, seedDeals } from '../data/seed.js';

const params = new URLSearchParams(location.search);
const pinned = /^\d{4}-\d{2}-\d{2}$/.test(params.get('today') || '');
const today = pinned ? params.get('today') : new Date().toISOString().slice(0, 10);

const state = {
  // A pinned ?today= date gives a reproducible demo (used for screenshots), so storage is skipped.
  deals: (!pinned && load()) || seedDeals(today),
  userId: USERS.some((u) => u.id === params.get('as')) ? params.get('as') : 'ava',
  view: params.get('view') === 'overview' ? 'overview' : 'pipeline',
  importPreview: null,
  filter: FILTERS.some((f) => f.id === params.get('filter')) ? params.get('filter') : 'all',
  status: '',
};

const root = document.getElementById('app');
const dialog = document.getElementById('detail');
const LIGHT = { green: 'Green', yellow: 'Yellow', red: 'Red' };
const MAX_IMPORT_BYTES = 1_000_000;

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
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid);
  return el;
}

const user = () => USERS.find((u) => u.id === state.userId);
const analystName = (id) => USERS.find((u) => u.id === id)?.name ?? id;
const newId = () => `d-${(crypto.randomUUID?.() ?? String(Math.random()).slice(2)).slice(0, 8)}`;

function persist() {
  if (!pinned) save(state.deals);
}

function pill(score) {
  if (!score) return h('span', { class: 'pill pill-none' }, 'Not scored');
  const partial = score.complete ? '' : ' (partial)';
  return h('span', {
    class: `pill pill-${score.light}`,
    title: `${LIGHT[score.light]}: weighted score ${score.value.toFixed(2)} of 5, ${score.rated} of ${RUBRIC.length} criteria rated`,
  }, `${LIGHT[score.light]} ${score.value.toFixed(1)}${partial}`);
}

// ---- Layout -----------------------------------------------------------------

function header() {
  const select = h('select', {
    id: 'as',
    onchange: (e) => {
      state.userId = e.target.value;
      state.importPreview = null;
      state.status = '';
      dialog.open && dialog.close();
      render();
    },
  }, USERS.map((u) => h('option', { value: u.id, selected: u.id === state.userId }, `${u.name} (${u.role})`)));
  return h('header', { class: 'top' },
    h('div', {},
      h('h1', {}, 'Deal Pipeline'),
      h('p', { class: 'sub' }, 'Example Ventures · fictional fund, synthetic data')),
    h('div', { class: 'who' },
      h('label', { for: 'as' }, 'Viewing as'), select,
      h('button', {
        class: 'btn ghost',
        onclick: () => {
          if (!confirm('Reset to the original demo data? Your changes in this browser will be lost.')) return;
          clear();
          state.deals = seedDeals(today);
          state.status = 'Demo data restored.';
          render();
        },
      }, 'Reset demo')));
}

function tabs() {
  const tab = (id, label) => h('button', {
    class: `tab${state.view === id ? ' on' : ''}`,
    'aria-current': state.view === id ? 'page' : null,
    onclick: () => { state.view = id; render(); },
  }, label);
  return h('nav', { class: 'tabs', 'aria-label': 'Views' }, tab('pipeline', 'Pipeline'), tab('overview', 'Overview'));
}

function render() {
  root.replaceChildren(
    header(),
    tabs(),
    h('p', { class: 'status', role: 'status', 'aria-live': 'polite' }, state.status),
    state.view === 'pipeline' ? pipelineView() : overviewView(),
  );
}

// ---- Pipeline ---------------------------------------------------------------

function card(deal) {
  const stale = isStale(deal, today);
  const me = user();
  return h('button', { class: 'card', onclick: () => openDeal(deal.id) },
    h('strong', {}, deal.name),
    h('span', { class: 'sector' }, deal.sector),
    h('span', { class: 'meta' },
      h('span', {}, formatUsd(deal.askUsd)),
      pill(scoreDeal(deal.scores))),
    me.role === 'manager' && h('span', { class: 'sector' }, analystName(deal.analyst)),
    deal.submission && h('span', { class: 'badge' }, `Submitted ${deal.submission.date}`),
    stale && h('span', { class: 'stale' }, `No update in ${Math.round((Date.parse(today) - Date.parse(deal.updated)) / 86400000)} days`));
}

function addForm() {
  const name = h('input', { id: 'new-name', placeholder: 'Company name', required: true, maxLength: 80 });
  const sector = h('input', { id: 'new-sector', placeholder: 'Sector', maxLength: 60 });
  return h('form', {
    class: 'add',
    onsubmit: (e) => {
      e.preventDefault();
      const n = name.value.trim();
      if (!n) return;
      if (state.deals.some((d) => d.name.toLowerCase() === n.toLowerCase())) {
        state.status = `"${n}" is already in the pipeline.`;
        return render();
      }
      state.deals = [...state.deals, {
        id: newId(), name: n, sector: sector.value.trim() || 'Unspecified', stage: 'sourced',
        analyst: state.userId, scores: {}, notes: '', updated: today,
      }];
      persist();
      state.status = `Added ${n} to Sourced.`;
      render();
    },
  }, h('label', { class: 'sr', for: 'new-name' }, 'Company name'), name,
  h('label', { class: 'sr', for: 'new-sector' }, 'Sector'), sector,
  h('button', { class: 'btn', type: 'submit' }, 'Add deal'));
}

async function onFile(e) {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  if (file.size > MAX_IMPORT_BYTES) {
    state.status = 'File is larger than 1 MB.';
    return render();
  }
  const rows = parseCsv(await file.text());
  if (rows.length > 1001) {
    state.status = 'Import is limited to 1,000 rows.';
    return render();
  }
  state.importPreview = validateImport(rows, {
    analyst: state.userId, today, newId, existingNames: state.deals.map((d) => d.name),
  });
  state.status = '';
  render();
}

function download(name, text, type = 'text/csv') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = h('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function importPanel() {
  const p = state.importPreview;
  if (!p) return null;
  return h('section', { class: 'panel', 'aria-label': 'Import preview' },
    h('h2', {}, 'Import preview'),
    h('p', {}, `${p.deals.length} valid row${p.deals.length === 1 ? '' : 's'}, ${p.errors.length} problem${p.errors.length === 1 ? '' : 's'}.`),
    p.errors.length > 0 && h('ul', { class: 'errors' },
      p.errors.slice(0, 20).map((er) => h('li', {}, `Line ${er.line}: ${er.message}`)),
      p.errors.length > 20 && h('li', {}, `…and ${p.errors.length - 20} more`)),
    h('div', { class: 'row' },
      p.deals.length > 0 && h('button', {
        class: 'btn',
        onclick: () => {
          state.deals = [...state.deals, ...p.deals];
          persist();
          state.status = `Imported ${p.deals.length} deal${p.deals.length === 1 ? '' : 's'}${p.errors.length ? `; ${p.errors.length} skipped` : ''}.`;
          state.importPreview = null;
          render();
        },
      }, `Import ${p.deals.length} valid row${p.deals.length === 1 ? '' : 's'}`),
      h('button', { class: 'btn ghost', onclick: () => { state.importPreview = null; render(); } }, 'Cancel')));
}

function pipelineView() {
  const me = user();
  const mine = visibleDeals(me, state.deals);
  const deals = filterDeals(mine, state.filter, today);
  const isAnalyst = me.role === 'analyst';
  const filterBar = h('div', { class: 'filters', role: 'group', 'aria-label': 'Filter deals' },
    FILTERS.map((f) => {
      const n = filterDeals(mine, f.id, today).length;
      return h('button', {
        class: `chip${state.filter === f.id ? ' on' : ''}`, 'aria-pressed': state.filter === f.id ? 'true' : 'false',
        onclick: () => { state.filter = f.id; render(); },
      }, `${f.label} ${n}`);
    }));
  return h('main', {},
    h('div', { class: 'toolbar' },
      isAnalyst && addForm(),
      h('div', { class: 'row' },
        isAnalyst && h('label', { class: 'btn ghost file' }, 'Import CSV',
          h('input', { type: 'file', accept: '.csv,text/csv', hidden: true, onchange: onFile })),
        h('button', { class: 'btn ghost', onclick: () => download('deals.csv', toCsv(mine)) }, 'Export CSV'))),
    !isAnalyst && h('p', { class: 'note' }, 'Manager view is read-only. Switch to an analyst to edit their deals.'),
    filterBar,
    importPanel(),
    h('div', { class: 'board' }, STAGES.map((s) => {
      const inStage = deals.filter((d) => d.stage === s.id);
      return h('section', { class: 'col', 'aria-label': `${s.label}, ${inStage.length} deals` },
        h('h2', {}, s.label, h('span', { class: 'count' }, String(inStage.length))),
        inStage.length === 0 ? h('p', { class: 'empty' }, 'Nothing here') : inStage.map(card));
    })));
}

// ---- Deal detail --------------------------------------------------------------

function openDeal(id) {
  const deal = state.deals.find((d) => d.id === id);
  if (!deal) return;
  const editable = canEdit(user(), deal);
  const draft = { ...deal.scores };
  const checks = { ...deal.checklist };
  const live = h('div', { class: 'live', 'aria-live': 'polite' });
  const refresh = () => live.replaceChildren(h('span', {}, 'Weighted score: '), pill(scoreDeal(draft)));

  const stage = h('select', { id: 'f-stage', disabled: !editable },
    STAGES.map((s) => h('option', { value: s.id, selected: s.id === deal.stage }, s.label)));
  const ask = h('input', { id: 'f-ask', type: 'number', min: '0', step: '50000', value: deal.askUsd ?? '', disabled: !editable });
  const notes = h('textarea', { id: 'f-notes', rows: 4, maxLength: 2000, disabled: !editable }, deal.notes ?? '');

  const rubric = RUBRIC.map((c) => h('fieldset', { class: 'crit', disabled: !editable },
    h('legend', {}, `${c.label} `, h('span', { class: 'w' }, `${Math.round(c.weight * 100)}%`)),
    [1, 2, 3, 4, 5].map((n) => h('label', { class: 'opt' },
      h('input', {
        type: 'radio', name: `r-${c.id}`, value: String(n), checked: draft[c.id] === n,
        onchange: () => { draft[c.id] = n; refresh(); },
      }), String(n))),
    h('label', { class: 'opt' },
      h('input', {
        type: 'radio', name: `r-${c.id}`, value: '', checked: draft[c.id] == null,
        onchange: () => { delete draft[c.id]; refresh(); },
      }), 'n/a')));
  refresh();

  const progress = h('p', { class: 'note', 'aria-live': 'polite' });
  const showProgress = () => {
    const p = checklistProgress({ checklist: checks });
    progress.textContent = `${p.done} of ${p.total} steps done (${p.percent}%)`;
  };
  const phases = [...new Set(CHECKLIST.map((c) => c.phase))];
  const checklistEl = phases.map((ph) => h('fieldset', { class: 'crit col1', disabled: !editable },
    h('legend', {}, ph),
    CHECKLIST.filter((c) => c.phase === ph).map((c) => h('label', { class: 'opt' },
      h('input', {
        type: 'checkbox', checked: !!checks[c.id],
        onchange: (e) => { if (e.target.checked) checks[c.id] = true; else delete checks[c.id]; showProgress(); },
      }), c.label))));
  showProgress();

  const prepOut = h('div', { class: 'prep', 'aria-live': 'polite' });
  const prepBtn = h('button', {
    class: 'btn ghost', type: 'button',
    onclick: () => {
      const m = meetingPrep({ ...deal, scores: draft, notes: notes.value });
      prepOut.replaceChildren(
        h('p', { class: 'note' }, 'Template draft built from the scores and notes. No AI call is made.'),
        h('h4', {}, 'Opening points'), h('ul', {}, m.opening.map((o) => h('li', {}, o))),
        h('h4', {}, `Focus areas: ${m.focus.join(', ')}`),
        h('h4', {}, 'Questions'), h('ol', {}, m.questions.map((q) => h('li', {}, h('strong', {}, `${q.criterion}: `), q.text))));
    },
  }, 'Draft meeting prep');

  const currentDeal = () => ({ ...deal, scores: { ...draft }, checklist: { ...checks }, notes: notes.value.trim(), askUsd: ask.value === '' ? undefined : Math.max(0, Number(ask.value)) });

  const memoOut = h('div', { class: 'prep', 'aria-live': 'polite' });
  const memoBtn = h('button', {
    class: 'btn ghost', type: 'button',
    onclick: () => {
      const text = draftMemo(currentDeal());
      memoOut.replaceChildren(
        h('p', { class: 'note' }, 'Template draft built from the deal record. No AI call is made.'),
        h('pre', { class: 'memo' }, text),
        h('button', { class: 'btn ghost', type: 'button', onclick: () => download(`${deal.name.replace(/\W+/g, '-').toLowerCase()}-memo.md`, text, 'text/markdown') }, 'Download .md'));
    },
  }, 'Draft IC memo');

  const submitOut = h('div', { class: 'prep', 'aria-live': 'polite' });
  const submitBtn = h('button', {
    class: 'btn', type: 'button',
    onclick: () => {
      const candidate = currentDeal();
      const blockers = validateSubmission(candidate);
      if (blockers.length) {
        submitOut.replaceChildren(h('p', { class: 'note' }, 'Not ready to submit:'), h('ul', { class: 'errors' }, blockers.map((b) => h('li', {}, b))));
        return;
      }
      if (!confirm(`Submit ${deal.name} to the investment committee? It moves to IC review.`)) return;
      state.deals = state.deals.map((d) => (d.id === deal.id ? submitDeal(candidate, today) : d));
      persist();
      state.status = `Submitted ${deal.name} to IC review.`;
      dialog.close();
      render();
    },
  }, 'Submit to IC');

  const history = [...(deal.history ?? [])].reverse();
  const stageLabel = (id) => STAGES.find((st) => st.id === id)?.label ?? id;
  const historyEl = history.length === 0
    ? h('p', { class: 'note' }, 'No stage changes recorded yet.')
    : h('ol', { class: 'timeline' }, history.map((e) => h('li', {}, h('span', { class: 'when' }, e.date), `${stageLabel(e.from)} → ${stageLabel(e.to)}`)));
  const inStage = daysInStage(deal, today);

  dialog.replaceChildren(h('form', {
    method: 'dialog',
    onsubmit: (e) => {
      e.preventDefault();
      if (!editable) return dialog.close();
      let next = {
        ...deal,
        scores: { ...draft },
        checklist: { ...checks },
        notes: notes.value.trim(),
        askUsd: ask.value === '' ? undefined : Math.max(0, Number(ask.value)),
      };
      next = stage.value !== deal.stage ? moveDeal(next, stage.value, today) : { ...next, updated: today };
      state.deals = state.deals.map((d) => (d.id === deal.id ? next : d));
      persist();
      state.status = `Saved ${deal.name}.`;
      dialog.close();
      render();
    },
  },
  h('h2', { id: 'detail-title' }, deal.name),
  h('p', { class: 'sub' }, `${deal.sector} · ${analystName(deal.analyst)} · updated ${deal.updated}`),
  !editable && h('p', { class: 'note' }, 'Read-only: this deal belongs to another analyst, or you are viewing as manager.'),
  h('div', { class: 'grid2' },
    h('div', {}, h('label', { for: 'f-stage' }, 'Stage'), stage),
    h('div', {}, h('label', { for: 'f-ask' }, 'Ask (USD)'), ask)),
  h('h3', {}, 'Evaluation'),
  h('p', { class: 'note' }, `Rate 1 (weak) to 5 (strong). A 1 on any criterion makes the deal red. Green from 3.8, yellow from 3.0. Deals untouched for over ${STALE_AFTER_DAYS} days are flagged as stale.`),
  h('div', { class: 'rubric' }, rubric),
  live,
  h('h3', {}, 'Checklist'), progress, h('div', { class: 'rubric' }, checklistEl),
  h('h3', {}, 'Meeting prep'), prepBtn, prepOut,
  h('h3', {}, 'Investment committee'),
  deal.submission && h('p', { class: 'note' }, `Submitted ${deal.submission.date}: ${deal.submission.light} (${deal.submission.score.toFixed(2)}).`),
  h('div', { class: 'row' }, memoBtn, editable && submitBtn), memoOut, submitOut,
  h('h3', {}, 'Stage history'),
  inStage != null && h('p', { class: 'note' }, `${inStage} day${inStage === 1 ? '' : 's'} in ${stageLabel(deal.stage)}.`),
  historyEl,
  h('label', { for: 'f-notes' }, 'Notes'), notes,
  h('div', { class: 'row end' },
    h('button', { class: 'btn ghost', type: 'button', onclick: () => dialog.close() }, editable ? 'Cancel' : 'Close'),
    editable && h('button', { class: 'btn', type: 'submit' }, 'Save'))));
  dialog.showModal();
}

// ---- Overview -----------------------------------------------------------------

function overviewView() {
  const me = user();
  const deals = visibleDeals(me, state.deals);
  const s = summarize(deals, today);
  const f = funnel(deals);
  const maxReached = Math.max(1, ...f.map((x) => x.reached));
  const kpi = (label, value, hint) => h('div', { class: 'kpi' },
    h('span', { class: 'kpi-v' }, String(value)), h('span', { class: 'kpi-l' }, label), hint && h('span', { class: 'kpi-h' }, hint));

  const rows = [...deals].sort((a, b) => b.updated.localeCompare(a.updated));
  return h('main', {},
    me.role === 'analyst'
      ? h('p', { class: 'note' }, 'Showing your deals only. Managers see every analyst.')
      : h('p', { class: 'note' }, 'All analysts, read-only.'),
    h('div', { class: 'kpis' },
      kpi('Active deals', s.active, `${s.total} total`),
      kpi('Avg score', s.avgScore == null ? '—' : s.avgScore.toFixed(1), `${s.scored} scored`),
      kpi('Green deals', s.green),
      kpi('Stale', s.stale, `no update > ${STALE_AFTER_DAYS} days`),
      kpi('Active asks', formatUsd(s.activeAskUsd))),
    h('section', { class: 'panel' },
      h('h2', {}, 'Funnel'),
      h('p', { class: 'note' }, 'Deals that reached each stage, including those later passed. Percent is the share that moved on from the previous stage.'),
      f.map((x) => h('div', { class: 'bar-row' },
        h('span', { class: 'bar-l' }, STAGES.find((st) => st.id === x.stage).label),
        h('span', { class: 'bar' }, h('span', { class: 'bar-fill', style: `width:${(x.reached / maxReached) * 100}%` })),
        h('span', { class: 'bar-n' }, `${x.reached}${x.conversion == null ? '' : ` · ${x.conversion}%`}`)))),
    h('section', { class: 'panel' },
      h('h2', {}, me.role === 'manager' ? 'Workload by analyst' : 'Your workload'),
      h('div', { class: 'scroll' }, h('table', {},
        h('thead', {}, h('tr', {}, ['Analyst', 'Active', 'Stale', 'Submitted', 'Avg score', 'Avg checklist', 'Active ask'].map((c) => h('th', { scope: 'col' }, c)))),
        h('tbody', {}, analystSummary(deals, USERS.filter((u) => u.role === 'analyst' && (me.role === 'manager' || u.id === me.id)), today).map((a) => h('tr', {},
          h('th', { scope: 'row' }, a.name),
          h('td', {}, String(a.active)),
          h('td', {}, String(a.stale)),
          h('td', {}, String(a.submitted)),
          h('td', {}, a.avgScore == null ? '—' : a.avgScore.toFixed(1)),
          h('td', {}, a.avgChecklist == null ? '—' : `${a.avgChecklist}%`),
          h('td', {}, formatUsd(a.activeAskUsd)))))))),
    h('section', { class: 'panel' },
      h('h2', {}, 'All deals'),
      h('div', { class: 'scroll' }, h('table', {},
        h('thead', {}, h('tr', {}, ['Company', 'Sector', 'Analyst', 'Stage', 'Ask', 'Score', 'Checklist', 'Updated'].map((c) => h('th', { scope: 'col' }, c)))),
        h('tbody', {}, rows.map((d) => h('tr', { class: isStale(d, today) ? 'is-stale' : '' },
          h('th', { scope: 'row' }, h('button', { class: 'link', onclick: () => openDeal(d.id) }, d.name)),
          h('td', {}, d.sector),
          h('td', {}, analystName(d.analyst)),
          h('td', {}, STAGES.find((st) => st.id === d.stage).label),
          h('td', {}, formatUsd(d.askUsd)),
          h('td', {}, pill(scoreDeal(d.scores))),
          h('td', {}, `${checklistProgress(d).percent}%`),
          h('td', {}, d.updated))))))));
}

render();
