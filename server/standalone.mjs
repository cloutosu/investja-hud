// Node 22 ESM — runs the whole app on any always-on machine: serves dist/, the /api/* handlers and the 1-minute tick.
// Same code as the Netlify functions; state lives in STORE_DIR instead of Netlify Blobs.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import api from '../netlify/functions/api.mjs';
import tick from '../netlify/functions/tick.mjs';

process.env.STORE_DIR ||= path.resolve('data');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const PORT = Number(process.env.PORT || 8080);
const TICK_MS = Number(process.env.TICK_MS || 60_000);
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.map': 'application/json',
};

function serveStatic(req, res) {
  const url = new URL(req.url, 'http://x');
  let file = path.join(root, path.normalize(decodeURIComponent(url.pathname)));
  if (!file.startsWith(root)) { res.writeHead(403).end(); return; } // no path traversal
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root, 'index.html'); // SPA fallback
  const ext = path.extname(file);
  const immutable = file.includes(`${path.sep}assets${path.sep}`);
  res.writeHead(200, {
    'Content-Type': MIME[ext] ?? 'application/octet-stream',
    'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache', // sw.js and index.html must never go stale
  });
  fs.createReadStream(file).pipe(res);
}

http.createServer(async (req, res) => {
  try {
    if (req.url.startsWith('/api/')) {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const request = new Request(`http://${req.headers.host || 'localhost'}${req.url}`, {
        method: req.method,
        headers: req.headers,
        body: ['GET', 'HEAD'].includes(req.method) || !chunks.length ? undefined : Buffer.concat(chunks),
      });
      const response = await api(request);
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
      return;
    }
    serveStatic(req, res);
  } catch (e) {
    console.error('[http]', e.message);
    if (!res.headersSent) res.writeHead(500);
    res.end();
  }
}).listen(PORT, () => console.log(`[standalone] http://localhost:${PORT} · store ${process.env.STORE_DIR} · tick ${TICK_MS / 1000}s`));

let running = false;
const runTick = async () => {
  if (running) return; // never overlap: a slow scrape just skips a beat
  running = true;
  try { await tick(); } finally { running = false; }
};
void runTick();
setInterval(() => void runTick(), TICK_MS);
