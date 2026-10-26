// Node 20 ESM — investja.org client, trade queue and market-data ingestion (Netlify Functions + dev server)
import { parseDashboard, parseLeaderboard, looksLikeLoginPage, extractErrorMessage, parseTradeConfirmation } from './parsers.js';
import { holdReleaseAt, runTakeProfit } from './takeprofit.js';
import { pushEvent, runAlerts } from './alerts.js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
export const EXCHANGES = new Set(['Nasdaq', 'NYSE', 'TSX']);
export const RETRY_MS = 5 * 60 * 1000;
export const MAX_ATTEMPTS = 288;
const LOCK_MS = 90 * 1000;
const BUCKET = 5 * 60 * 1000;
const MIN_MS = 60 * 1000;
const HOUR = 3600 * 1000;
const TOP_N = 20;
const MAX_TRACKED = 30;
export const WINDOWS = { '5m': 5 * MIN_MS, '15m': 15 * MIN_MS, '1h': HOUR, '6h': 6 * HOUR, '24h': 24 * HOUR };

export const dayKey = (ms) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto' }).format(new Date(ms));

export function isMarketWindow(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Toronto',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
    weekday: 'short',
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map(p => [p.type, p.value]));
  const weekday = parts.weekday; // 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'
  const hour = parseInt(parts.hour, 10);
  const minute = parseInt(parts.minute, 10);
  const minutesOfDay = hour * 60 + minute;

  // Weekends: Saturday / Sunday
  if (weekday === 'Sat' || weekday === 'Sun') {
    return { active: false, isMarketHours: false, reason: 'Weekend — market closed' };
  }

  // 9:30 AM ET = 9 * 60 + 30 = 570
  // 4:00 PM ET = 16 * 60 = 960 (regular market close)
  // 4:35 PM ET = 16 * 60 + 35 = 995 (network scraper cutoff)
  const isMarketHours = minutesOfDay >= 570 && minutesOfDay <= 960;
  const isScrapingWindow = minutesOfDay >= 570 && minutesOfDay <= 995;

  let reason = 'Active market scraping window';
  if (minutesOfDay < 570) {
    reason = `Pre-market (opens 9:30 AM ET; current ${hour}:${minute.toString().padStart(2, '0')})`;
  } else if (minutesOfDay > 995) {
    reason = `After-hours (network pull stopped at 4:35 PM ET; current ${hour}:${minute.toString().padStart(2, '0')})`;
  }

  return { active: isScrapingWindow, isMarketHours, reason };
}

// One client = one session. Each tick or trade logs in once, which is what busts the site's page cache.
export function makeClient({ baseUrl, user, pass }) {
  const jar = new Map();
  const cookieHeader = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
  const capture = (res) => {
    for (const line of res.headers.getSetCookie?.() ?? []) {
      const [pair] = line.split(';');
      const eq = pair.indexOf('=');
      if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
  };
  const call = async (path, init = {}) => {
    const res = await fetch(baseUrl.replace(/\/$/, '') + path, {
      redirect: 'manual',
      signal: AbortSignal.timeout(20000),
      ...init,
      headers: { 'User-Agent': UA, Cookie: cookieHeader(), ...init.headers },
    });
    capture(res);
    return res;
  };
  const form = (obj) => ({
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(obj).toString(),
  });
  async function get(path) {
    const res = await call(path);
    const text = await res.text();
    if (res.status === 302 || looksLikeLoginPage(text)) throw new Error('session rejected');
    if (res.status !== 200) throw new Error(`GET ${path} -> HTTP ${res.status}`);
    return text;
  }

  return {
    call,
    get,
    async login() {
      jar.clear();
      await call('/private/game/login');
      const res = await call('/private/game/login', form({ teamname: user, teampassword: pass }));
      if (res.status !== 302) throw new Error(`investja login rejected (HTTP ${res.status}); check INVESTJA_USER / INVESTJA_PASS`);
    },
    async scrape() {
      const rankings = await get('/private/game/rankings');
      const { _complete, ...dashboard } = parseDashboard(await get('/private/game'));
      const leaderboard = parseLeaderboard(rankings);
      if (!leaderboard.length) throw new Error('rankings parsed to 0 teams (selectors changed?)');
      if (!_complete) throw new Error('dashboard parse incomplete (Cash/Loan rows not found)');
      return { dashboard, leaderboard };
    },
    async trade({ action, exchange, ticker, quantity }) {
      // Step 1: Initial trade submission
      const res1 = await call(`/private/game/${action}`, {
        ...form({ exchange, ticker, quantity: String(quantity), action: 'confirm' }),
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-Requested-With': 'XMLHttpRequest',
        },
      });

      if (res1.status === 302) {
        const loc = res1.headers.get('location') || '';
        if (/login/i.test(loc)) return { success: false, message: 'Session expired, try again' };
        // Follow redirect to check for rule rejections
        const follow = await call(loc.replace(/^https?:\/\/[^\/]+/, ''));
        const followHtml = await follow.text();
        const ruleErr = extractErrorMessage(followHtml);
        if (ruleErr) return { success: false, message: ruleErr };
        return { success: true, message: `${action.toUpperCase()} ${quantity} ${ticker} executed` };
      }

      if (res1.status !== 200) {
        return { success: false, message: `Server error (HTTP ${res1.status})` };
      }

      // Step 2: Handle 2-step confirmation token
      const text1 = await res1.text();
      const confirmData = parseTradeConfirmation(text1);
      if (!confirmData) {
        const err = extractErrorMessage(text1);
        return { success: false, message: err || 'Order rejected by server' };
      }

      // Execute Step 2 confirmation
      let endpoint = confirmData.actionUrl;
      if (endpoint.startsWith('http')) {
        try { endpoint = new URL(endpoint).pathname; } catch { /* noop */ }
      }

      const res2 = await call(endpoint, {
        ...form(confirmData.fields),
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-Requested-With': 'XMLHttpRequest',
        },
      });

      if (res2.status === 302) {
        const loc = res2.headers.get('location') || '';
        if (/login/i.test(loc)) return { success: false, message: 'Session expired, try again' };
        // Follow redirect to verify fill confirmation vs rule rejection
        const follow = await call(loc.replace(/^https?:\/\/[^\/]+/, ''));
        const followHtml = await follow.text();
        const ruleErr = extractErrorMessage(followHtml);
        if (ruleErr) return { success: false, message: ruleErr };
        return { success: true, message: `${action.toUpperCase()} ${quantity} ${ticker} executed` };
      }

      const text2 = await res2.text();
      const finalError = extractErrorMessage(text2);
      return { success: false, message: finalError || `Rejected by server (HTTP ${res2.status})` };
    },
  };
}

export function validateTrade(b) {
  const action = String(b?.action || '').toLowerCase();
  const exchange = EXCHANGES.has(b?.exchange) ? b.exchange : null;
  const ticker = String(b?.ticker || '').trim().toUpperCase();
  const quantity = Number(b?.quantity);
  if (action !== 'buy' && action !== 'sell') return { error: 'action must be buy or sell' };
  if (!exchange) return { error: 'exchange must be Nasdaq, NYSE or TSX' };
  if (!/^[A-Z0-9.\-]{1,10}$/.test(ticker)) return { error: 'invalid ticker' };
  if (!Number.isInteger(quantity) || quantity <= 0) return { error: 'quantity must be a positive integer' };
  return { trade: { action, exchange, ticker, quantity } };
}

// store: { get(key, fallback), set(key, value), del(key), list(prefix) } holding JSON
export async function logTrade(store, t, source, accountId = '11780') {
  const held = ((await store.get(`latest:${accountId}`, null))?.portfolio?.holdings ?? []).find((h) => h.ticker.toUpperCase() === t.ticker);
  const item = {
    id: crypto.randomUUID(), at: Date.now(), day: dayKey(Date.now()), action: t.action, exchange: t.exchange, ticker: t.ticker, quantity: t.quantity, source, account: accountId,
    price: t.price ?? held?.currentPrice ?? null, avg: t.avg ?? held?.avgBuyPrice ?? null,
  };
  const log = await store.get(`trades-log:${accountId}`, []);
  log.push(item);
  await store.set(`trades-log:${accountId}`, log.slice(-2000));
  if (accountId === '11780') {
    const globalLog = await store.get('trades-log', []);
    globalLog.push(item);
    await store.set('trades-log', globalLog.slice(-2000));
  }
}

// Executes due scheduled trades on an already-logged-in client.
export async function runDue(store, client, accountId = '11780') {
  const now = Date.now();
  let queue = await store.get('queue', []);
  // a sell whose 1 h hold we know is still open just waits: no point asking the server to reject it
  const log = await store.get(`trades-log:${accountId}`, []);
  const stillHeld = (t) => t.action === 'sell' && (holdReleaseAt(log, t.ticker, t.exchange) ?? 0) > now;
  const due = queue.filter((t) => (!t.account || t.account === accountId) && t.status !== 'failed' && t.executeAt <= now && !stillHeld(t) && (t.nextAttemptAt ?? 0) <= now && (t.lockedUntil ?? 0) <= now);
  const summary = { executed: 0, failed: 0, waiting: queue.length };
  if (!due.length) return summary;

  for (const t of due) t.lockedUntil = now + LOCK_MS;
  await store.set('queue', queue);

  for (const task of due) {
    let result;
    try { result = await client.trade(task); } catch (e) { result = { success: false, message: e.message }; }
    queue = await store.get('queue', []);
    const idx = queue.findIndex((t) => t.id === task.id);
    if (idx === -1) continue; // cancelled meanwhile
    if (result.success) {
      queue.splice(idx, 1);
      await logTrade(store, task, 'scheduled', accountId);
      summary.executed++;
    } else {
      const t = queue[idx];
      t.attempts = (t.attempts || 0) + 1;
      t.lastError = result.message;
      t.status = t.attempts >= MAX_ATTEMPTS ? 'failed' : 'retrying';
      t.nextAttemptAt = Date.now() + RETRY_MS;
      delete t.lockedUntil;
      summary.failed++;
    }
    await store.set('queue', queue);
  }
  summary.waiting = (await store.get('queue', [])).length;
  return summary;
}

const thin = (history, now) => {
  const seen = new Set();
  return history.filter((p) => {
    if (p.t < now - 24 * HOUR) return false;
    if (p.t >= now - 2 * HOUR) return true; // per-minute for the last 2 h
    const k = Math.floor(p.t / BUCKET); // then one point per 5 min
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};

function moversFor(leaderboard, base, target) {
  const rows = [];
  for (const t of leaderboard) {
    const b = base[t.name];
    if (b === undefined) continue;
    const delta = t.equity - b;
    rows.push({ name: t.name, rank: t.rank, equity: t.equity, delta, pct: b > 0 ? (delta / b) * 100 : 0 });
  }
  return {
    ready: true,
    gainers: rows.filter((r) => r.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, 10),
    losers: rows.filter((r) => r.delta < 0).sort((a, b) => a.delta - b.delta).slice(0, 10),
    me: rows.find((r) => r.name === target) ?? null,
  };
}

// Stores the latest scrape, per-minute history for you + top 20 + tracked teams, 5-minute
// full-field snapshots, and the gainers/losers for every window.
export async function ingest(store, live, now = Date.now(), target = 'Rahman Power Squared', accountId = '11780') {
  const { dashboard, leaderboard } = live;
  const equity = dashboard.holdings.reduce((s, h) => s + h.totalValue, 0) + dashboard.cash - dashboard.loan;
  const prev = (await store.get(`latest:${accountId}`, null)) ?? (accountId === '11780' ? await store.get('latest', null) : null);
  const date = dayKey(now);
  const anchorKey = `anchor:${accountId}`;
  let anchor = await store.get(anchorKey, null);
  if (!anchor || anchor.date !== date) {
    anchor = { date, equity, holdings: dashboard.holdings };
    await store.set(anchorKey, anchor);
  }
  const prevMap = new Map((prev?.teams ?? []).map((t) => [t.name, t.equity]));

  const teams = leaderboard.map((t) => {
    const r = { rank: t.rank, name: t.name, school: t.school, equity: t.equity };
    if (prevMap.has(t.name)) r.prevEquity = prevMap.get(t.name);
    return r;
  });
  const tradesLog = await store.get(`trades-log:${accountId}`, await store.get('trades-log', []));
  const todays = tradesLog.filter((x) => x.day === date);
  const trades = { buys: todays.filter((x) => x.action === 'buy').length, sells: todays.filter((x) => x.action === 'sell').length };

  // history for this account
  const tracked = await store.get('tracked', []);
  const names = new Set([...tracked, ...leaderboard.filter((t) => t.rank <= TOP_N).map((t) => t.name)]);
  const point = { t: now, eq: {} };
  for (const t of leaderboard) if (names.has(t.name)) point.eq[t.name] = [t.equity, t.rank];
  point.eq[target] = [equity, leaderboard.find((t) => t.name === target)?.rank ?? 0];

  const histKey = `history:${accountId}`;
  const prevHist = await store.get(histKey, accountId === '11780' ? await store.get('history', []) : []);
  const newHist = thin([...prevHist, point], now);
  await store.set(histKey, newHist);
  if (accountId === '11780') {
    await store.set('history', newHist);
  }

  // per-position price series (same thinning as team history) drives the position chart
  const pxKey = `px:${accountId}`;
  const px = { t: now, p: Object.fromEntries(dashboard.holdings.map((h) => [h.ticker, h.currentPrice])) };
  await store.set(pxKey, thin([...(await store.get(pxKey, [])), px], now));

  // 5-minute full-field snapshots (24 h) drive the long movers windows
  const cur = Object.fromEntries(leaderboard.map((t) => [t.name, t.equity]));
  const bucket = Math.floor(now / BUCKET);
  const meta = await store.get('meta', {});
  if (meta.lastSnap !== bucket) {
    await store.set(`snap-${bucket}`, { t: now, e: cur });
    meta.lastSnap = bucket;
    await store.set('meta', meta);
    for (const key of await store.list('snap-')) {
      if (Number(key.slice(5)) < bucket - (24 * HOUR) / BUCKET - 2) await store.del(key);
    }
  }

  const windows = { '1m': prev ? moversFor(leaderboard, Object.fromEntries(prevMap), target) : { ready: false, gainers: [], losers: [], me: null } };
  for (const [key, ms] of Object.entries(WINDOWS)) {
    const b = Math.floor((now - ms) / BUCKET);
    let snap = (await store.get(`snap-${b}`, null)) ?? (await store.get(`snap-${b - 1}`, null));
    if (snap && now - snap.t < ms * 0.5) snap = null;
    windows[key] = snap ? moversFor(leaderboard, snap.e, target) : { ready: false, gainers: [], losers: [], me: null };
  }

  const latestObj = { timestamp: now, accountId, targetTeam: target, teams, portfolio: dashboard, anchor, trades };
  await store.set(`latest:${accountId}`, latestObj);
  await store.set(`movers:${accountId}`, { t: now, windows });

  if (accountId === '11780') {
    await store.set('latest', latestObj);
    await store.set('movers', { t: now, windows });
  }
}

// One scheduled pass: log in once, run due trades, scrape, ingest. Runs 24/7.
export async function tickOnce(store, makeSession, target = 'Rahman Power Squared', accountId = '11780') {
  const now = Date.now();
  const windowStatus = isMarketWindow(new Date(now));
  const lockKey = `lock:${accountId}`;
  const lock = await store.get(lockKey, null);
  if (lock && lock.until > now) return { skipped: true, reason: 'locked' };
  await store.set(lockKey, { until: now + 3500 });
  try {
    const client = typeof makeSession === 'function' ? makeSession(accountId) : makeSession;
    await client.login();
    const trades = await runDue(store, client, accountId);
    let live = await client.scrape();
    const prevLatest = await store.get(`latest:${accountId}`, null);
    const emit = (ev) => pushEvent(store, accountId, ev);
    const tp = await runTakeProfit(store, client, live.dashboard.holdings, accountId, logTrade, Date.now(), emit);
    if (tp.sold) live = await client.scrape(); // positions changed, ingest the post-sell numbers
    await runAlerts(store, accountId, { live, prevLatest, target }).catch((e) => console.error('[alerts]', e.message));
    await ingest(store, live, Date.now(), target, accountId);
    await store.set(`status:${accountId}`, { at: Date.now(), error: null, window: windowStatus });
    if (accountId === '11780') {
      await store.set('status', { at: Date.now(), error: null, window: windowStatus });
    }
    return { ok: true, ...trades, window: windowStatus, accountId };
  } catch (e) {
    await store.set(`status:${accountId}`, { at: Date.now(), error: e.message, window: windowStatus });
    if (accountId === '11780') {
      await store.set('status', { at: Date.now(), error: e.message, window: windowStatus });
    }
    throw e;
  } finally {
    await store.set(lockKey, { until: 0 });
  }
}

export async function tickAll(store, makeSession) {
  const res1 = await tickOnce(store, makeSession, 'Rahman Power Squared', '11780').catch((e) => ({ error: e.message, accountId: '11780' }));
  const res2 = await tickOnce(store, makeSession, 'Rahman Power', '11778').catch((e) => ({ error: e.message, accountId: '11778' }));
  return { '11780': res1, '11778': res2 };
}

export async function trackTeam(store, name) {
  const tracked = await store.get('tracked', []);
  if (tracked.includes(name)) return;
  tracked.push(name);
  await store.set('tracked', tracked.slice(-MAX_TRACKED));
}
