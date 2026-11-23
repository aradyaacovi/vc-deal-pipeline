// Browser storage with an in-memory fallback (private mode, blocked storage, tests).
const KEY = 'vc-deal-pipeline:v1';
let memory = null;

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch { /* fall through to memory */ }
  return memory;
}

export function save(deals) {
  memory = deals;
  try { localStorage.setItem(KEY, JSON.stringify(deals)); } catch { /* memory copy is kept */ }
}

export function clear() {
  memory = null;
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}
