// Node 20 ESM — durable key/value store for running off Netlify: in-memory Map, one JSON file per key.
// Same interface as the Blobs store: { get(key, fallback), set(key, value), del(key), list(prefix) }.
import fs from 'node:fs';
import path from 'node:path';

const FLUSH_MS = 1500;

export function openFileStore(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const file = (k) => path.join(dir, `${encodeURIComponent(k)}.json`);
  const mem = new Map();
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.json')) continue;
    try { mem.set(decodeURIComponent(f.slice(0, -5)), JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))); } catch { /* skip a half-written file */ }
  }

  const dirty = new Set();
  const removed = new Set();
  let timer = null;

  const flush = () => {
    timer = null;
    for (const k of dirty) {
      const tmp = `${file(k)}.tmp`;
      try {
        fs.writeFileSync(tmp, JSON.stringify(mem.get(k)));
        fs.renameSync(tmp, file(k)); // atomic: a crash never leaves a torn file
      } catch (e) { console.error('[store] write failed', k, e.message); }
    }
    for (const k of removed) { try { fs.unlinkSync(file(k)); } catch { /* already gone */ } }
    dirty.clear();
    removed.clear();
  };
  const schedule = () => { timer ??= setTimeout(flush, FLUSH_MS); };
  for (const sig of ['SIGTERM', 'SIGINT']) process.once(sig, () => { flush(); process.exit(0); });

  return {
    get: async (k, fb) => (mem.has(k) ? structuredClone(mem.get(k)) : fb),
    set: async (k, v) => { mem.set(k, structuredClone(v)); removed.delete(k); dirty.add(k); schedule(); },
    del: async (k) => { mem.delete(k); dirty.delete(k); removed.add(k); schedule(); },
    list: async (prefix) => [...mem.keys()].filter((k) => k.startsWith(prefix)),
    flush,
  };
}
