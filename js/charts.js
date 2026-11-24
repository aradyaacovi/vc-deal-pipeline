// Dependency-free SVG charts. Each builder returns a DOM node. Colours come from CSS variables so light and dark
// themes both work, and every chart has a text summary (aria-label) and a hidden data table for screen readers.
const NS = 'http://www.w3.org/2000/svg';
const COLOR = { brand: 'var(--brand)', green: 'var(--green)', yellow: 'var(--yellow)', red: 'var(--red)', none: 'var(--control)', grid: 'var(--line)', text: 'var(--muted)' };

function el(tag, attrs = {}, ...kids) {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) node.setAttribute(k, String(v));
  for (const kid of kids.flat()) if (kid != null) node.append(kid);
  return node;
}
const text = (x, y, s, attrs = {}) => el('text', { x, y, fill: COLOR.text, 'font-size': 12, ...attrs }, document.createTextNode(String(s)));

/** Hidden table with the same numbers, for screen readers. */
export function dataTable(caption, headers, rows) {
  const t = document.createElement('table');
  t.append(Object.assign(document.createElement('caption'), { textContent: caption }));
  const head = t.createTHead().insertRow();
  headers.forEach((h) => head.append(Object.assign(document.createElement('th'), { textContent: h, scope: 'col' })));
  const body = t.createTBody();
  rows.forEach((r) => { const tr = body.insertRow(); r.forEach((c) => tr.insertCell().textContent = String(c ?? '—')); });
  const box = document.createElement('div');
  box.className = 'sr'; // clips the table to 1px so it is read aloud but never seen or scrolled to
  box.append(t);
  return box;
}

/** One clickable, focusable, hoverable row. A native <title> gives the tooltip; Enter/Space selects. */
function hit(svg, { x, y, width, height, tip, selected, onSelect }, ...kids) {
  const g = el('g', { class: `hit${selected ? ' on' : ''}`, role: onSelect ? 'button' : null, tabindex: onSelect ? 0 : null, 'aria-pressed': onSelect ? String(Boolean(selected)) : null, 'aria-label': tip });
  g.append(el('title', {}, document.createTextNode(tip)), el('rect', { x, y, width, height, fill: 'transparent', class: 'hit-bg' }), ...kids);
  if (onSelect) {
    g.addEventListener('click', onSelect);
    g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(); } });
  }
  svg.append(g);
}

function frame(width, height, label) {
  return el('svg', { viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': label, class: 'chart', preserveAspectRatio: 'xMidYMid meet' });
}

/** Smallest axis maximum >= v that splits into four whole, round steps. */
const niceMax = (v) => { for (const step of [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000]) if (step * 4 >= v) return step * 4; return Math.ceil(v / 4) * 4; };

/** Horizontal range bars: the middle half as a bar, the median as a tick, min to max as a whisker. */
export function rangeChart({ rows, label, unit = 'days', width = 960, selected = null, onSelect = null }) {
  const rowH = 38;
  const m = { l: 120, r: 36, t: 8, b: 26 };
  const height = m.t + m.b + rows.length * rowH;
  const max = niceMax(Math.max(1, ...rows.map((r) => r.max ?? 0)));
  const x = (v) => m.l + (v / max) * (width - m.l - m.r);
  const svg = frame(width, height, label);
  for (let i = 0; i <= 4; i += 1) {
    const v = (max / 4) * i;
    svg.append(el('line', { x1: x(v), x2: x(v), y1: m.t, y2: height - m.b, stroke: COLOR.grid, 'stroke-dasharray': '2 4' }), text(x(v), height - 8, `${Math.round(v)}`, { 'text-anchor': 'middle' }));
  }
  svg.append(text(m.l - 14, height - 8, unit, { 'text-anchor': 'end' }));
  rows.forEach((r, i) => {
    const cy = m.t + i * rowH + rowH / 2;
    const tip = r.n === 0 ? `${r.label}: no startup has finished this phase yet` : `${r.label}: median ${r.median} ${unit}, middle half ${r.p25}\u2013${r.p75}, fastest ${r.min}, slowest ${r.max}, ${r.n} finished`;
    const kids = [text(m.l - 8, cy + 4, `${r.label} (${r.n})`, { 'text-anchor': 'end', fill: 'var(--ink)', 'font-size': 12 })];
    if (r.n > 0) kids.push(
      el('line', { x1: x(r.min), x2: x(r.max), y1: cy, y2: cy, stroke: COLOR.none, 'stroke-width': 1.5 }),
      el('rect', { x: x(r.p25), y: cy - 9, width: Math.max(2, x(r.p75) - x(r.p25)), height: 18, rx: 6, fill: COLOR.brand, opacity: 0.88, class: 'mark' }),
      el('line', { x1: x(r.median), x2: x(r.median), y1: cy - 12, y2: cy + 12, stroke: 'var(--ink)', 'stroke-width': 2.5 }),
      text(x(r.max) + 6, cy + 4, `${r.median}`, { fill: 'var(--ink)' }));
    hit(svg, { x: 0, y: cy - rowH / 2, width, height: rowH, tip, selected: selected === r.id, onSelect: r.n > 0 && onSelect ? () => onSelect(r.id) : null }, ...kids);
  });
  return svg;
}

/** Stacked horizontal bars. rows: [{ label, parts: [{ key, value }] }], keys: [{ key, color }]. */
export function stackedBars({ rows, keys, label, width = 960, selected = null, onSelect = null }) {
  const rowH = 26;
  const m = { l: 140, r: 36, t: 6, b: 6 };
  const height = m.t + m.b + rows.length * rowH;
  const max = Math.max(1, ...rows.map((r) => r.parts.reduce((n, p) => n + p.value, 0)));
  const scale = (width - m.l - m.r) / max;
  const svg = frame(width, height, label);
  rows.forEach((r, i) => {
    const cy = m.t + i * rowH;
    let x0 = m.l;
    const kids = [text(m.l - 8, cy + 16, r.label, { 'text-anchor': 'end', fill: 'var(--ink)', 'font-size': 12 })];
    for (const p of r.parts) {
      if (!p.value) continue;
      const color = keys.find((k) => k.key === p.key)?.color;
      kids.push(el('rect', { x: x0, y: cy + 3, width: p.value * scale, height: rowH - 8, fill: COLOR[color] ?? color, rx: 3, class: 'mark' }));
      x0 += p.value * scale;
    }
    const total = r.parts.reduce((n, p) => n + p.value, 0);
    kids.push(text(x0 + 6, cy + 16, total, { fill: 'var(--ink)' }));
    hit(svg, { x: 0, y: cy, width, height: rowH, tip: `${r.label}: ${r.parts.map((p) => `${p.value} ${p.key}`).join(', ')}`, selected: selected === r.key, onSelect: onSelect && total ? () => onSelect(r.key) : null }, ...kids);
  });
  return svg;
}

/** Funnel: one bar per stage, width = share of the first stage, with the conversion from the stage before. */
export function funnelChart({ stages, label, width = 960, selected = null, onSelect = null }) {
  const rowH = 34;
  const m = { l: 84, r: 96, t: 6, b: 6 };
  const height = m.t + m.b + stages.length * rowH;
  const top = Math.max(1, stages[0]?.reached ?? 1);
  const svg = frame(width, height, label);
  stages.forEach((s, i) => {
    const cy = m.t + i * rowH;
    const w = ((width - m.l - m.r) * s.reached) / top;
    const tip = `${s.label}: ${s.reached} startups reached it${s.conversion == null ? '' : `, ${s.conversion}% of those that reached the stage before`}`;
    hit(svg, { x: 0, y: cy, width, height: rowH, tip, selected: selected === s.id, onSelect: onSelect && s.reached ? () => onSelect(s.id) : null },
      text(m.l - 8, cy + 20, s.label, { 'text-anchor': 'end', fill: 'var(--ink)', 'font-size': 12 }),
      el('rect', { x: m.l, y: cy + 4, width: Math.max(2, w), height: rowH - 10, rx: 6, fill: COLOR.brand, opacity: 1 - i * 0.12, class: 'mark' }),
      text(m.l + Math.max(2, w) + 8, cy + 20, s.conversion == null ? `${s.reached}` : `${s.reached} · ${s.conversion}%`, { fill: 'var(--ink)' }));
  });
  return svg;
}
