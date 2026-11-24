// Browser storage with an in-memory fallback (private mode, blocked storage, tests).
const KEY = 'vc-deal-pipeline:v3';
let memory = null;

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.startups)) return parsed;
    }
  } catch { /* fall through to memory */ }
  return memory;
}

export function save(state) {
  memory = state;
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* memory copy is kept */ }
}

export function clear() {
  memory = null;
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}
