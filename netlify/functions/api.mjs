import crypto from 'node:crypto';
import { ingest, logTrade, tickOnce, trackTeam, validateTrade, runDue } from '../../server/core.js';
import { holdReleaseAt, rulesFromExits, validateRule } from '../../server/takeprofit.js';
import { pushEvent } from '../../server/alerts.js';
import { authForCode, checkLock, clearFails, recordFail, signToken, verifyToken } from '../../server/auth.js';
import { env, getAllAccounts, openStore, resolveAccount, session } from './_shared.mjs';

const STALE_MS = 3 * 1000;
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ipOf = (req) => req.headers.get('x-nf-client-connection-ip') || (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';

export default async (req) => {
  const url = new URL(req.url);
  const path = url.pathname.replace(/\/$/, '');
  const store = openStore();
  const e = env();

  try {
    if (path === '/api/health' && req.method === 'GET') {
      return json({ ok: true, accounts: getAllAccounts() });
    }

    if (path === '/api/auth' && req.method === 'POST') {
      const ip = ipOf(req);
      const mins = await checkLock(store, ip);
      if (mins) return json({ message: `Too many attempts. Try again in ${mins} min.` }, 429);
      const body = (await req.json().catch(() => ({}))) ?? {};
      const { code, account } = body;
      const authRes = authForCode(e, String(code ?? ''), account);
      if (!authRes) {
        await sleep(700);
        return json({ message: `Incorrect code. ${await recordFail(store, ip)} attempts left.` }, 401);
      }
      await clearFails(store, ip);
      const token = signToken(e, authRes.role, authRes.accountId);
      return json({
        token,
        role: authRes.role,
        accountId: authRes.accountId,
        teamName: authRes.team,
        accounts: getAllAccounts(),
      });
    }

    const auth = verifyToken(e, (req.headers.get('authorization') || '').replace(/^Bearer /, ''));
    if (!auth) return json({ error: 'unauthorized' }, 401);
    const role = typeof auth === 'object' ? auth.role : auth;
    const defaultAccountId = typeof auth === 'object' ? auth.accountId : '11780';
    const owner = () => role === 'owner';
    const forbidden = () => json({ error: 'owner only' }, 403);

    const targetAccountId = resolveAccount(url.searchParams.get('account') || defaultAccountId).id;
    const targetMeta = resolveAccount(targetAccountId);

    if (path === '/api/live' && req.method === 'GET') {
      // Execute any due scheduled trades immediately on every live poll
      runDue(store, session(targetAccountId), targetAccountId).catch(() => {});

      let latest = await store.get(`latest:${targetAccountId}`, null);
      if (!latest || Date.now() - latest.timestamp > STALE_MS) {
        // Scheduler missed a beat or first request: scrape inline
        await tickOnce(store, session, targetMeta.team, targetAccountId).catch(() => {});
        latest = await store.get(`latest:${targetAccountId}`, latest);
      }
      if (!latest) {
        latest = await store.get('latest', null);
      }
      if (!latest) return json({ error: (await store.get(`status:${targetAccountId}`, null))?.error || 'no data yet' }, 503);

      const movers = await store.get(`movers:${targetAccountId}`, await store.get('movers', null));
      const status = await store.get(`status:${targetAccountId}`, await store.get('status', null));
      const buyLog = await store.get(`trades-log:${targetAccountId}`, []);
      const holds = {};
      for (const h of latest.portfolio?.holdings ?? []) {
        const at = holdReleaseAt(buyLog, h.ticker.toUpperCase(), h.exchange);
        if (at) holds[h.ticker] = at;
      }
      return json({
        ...latest,
        holds,
        events: (await store.get(`events:${targetAccountId}`, [])).slice(-20),
        targetAccount: targetMeta,
        accounts: getAllAccounts(),
        movers,
        status,
      });
    }

    if (path === '/api/history' && req.method === 'GET') {
      const points = await store.get(`history:${targetAccountId}`, await store.get('history', []));
      return json({ points });
    }

    if (path === '/api/track' && req.method === 'POST') {
      const { name } = (await req.json().catch(() => ({}))) ?? {};
      if (typeof name !== 'string' || !name || name.length > 120) return json({ error: 'name required' }, 400);
      await trackTeam(store, name);
      return json({ ok: true });
    }

    if (path === '/api/quote' && req.method === 'GET') {
      const ticker = (url.searchParams.get('ticker') || '').trim().toUpperCase();
      const exchange = url.searchParams.get('exchange') || 'Nasdaq';
      if (!ticker) return json({ error: 'ticker required' }, 400);

      const CAD_PER_USD = 1.43;
      const isUs = exchange === 'Nasdaq' || exchange === 'NYSE';

      // Check if ticker is in portfolio holdings first
      const latest = (await store.get(`latest:${targetAccountId}`, null)) ?? (await store.get('latest', null));
      const held = (latest?.portfolio?.holdings ?? []).find((h) => h.ticker.toUpperCase() === ticker);
      if (held) {
        const priceCad = held.currentPrice;
        const priceUsd = isUs ? Number((priceCad / CAD_PER_USD).toFixed(2)) : null;
        return json({
          ticker,
          exchange: held.exchange || exchange,
          price: priceCad,
          priceCad,
          priceUsd,
          fxRate: CAD_PER_USD,
          fxConverted: isUs,
          todayPrice: held.todayPrice,
          source: 'investja-portfolio',
          currency: 'CAD',
          quoteCurrency: isUs ? 'USD' : 'CAD',
        });
      }

      // External market query
      try {
        let sym = ticker;
        if (exchange === 'TSX' && !sym.endsWith('.TO')) sym = `${sym}.TO`;
        const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}`, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
            Accept: 'application/json',
          },
          signal: AbortSignal.timeout(6000),
        });
        if (res.ok) {
          const data = await res.json();
          const meta = data?.chart?.result?.[0]?.meta;
          if (meta && typeof meta.regularMarketPrice === 'number') {
            const rawPrice = Number(meta.regularMarketPrice.toFixed(2));
            // Quotes from NYSE and NASDAQ are converted to CAD using the official InvestJA 1.43 rate!
            const priceCad = isUs ? Number((rawPrice * CAD_PER_USD).toFixed(2)) : rawPrice;
            const priceUsd = isUs ? rawPrice : Number((rawPrice / CAD_PER_USD).toFixed(2));
            const rawPrev = Number((meta.previousClose || meta.chartPreviousClose || meta.regularMarketPrice).toFixed(2));
            const prevCloseCad = isUs ? Number((rawPrev * CAD_PER_USD).toFixed(2)) : rawPrev;

            return json({
              ticker,
              exchange,
              price: priceCad, // Primary price in CAD matching InvestJA portfolio & cash
              priceCad,
              priceUsd: isUs ? priceUsd : null,
              fxRate: CAD_PER_USD,
              fxConverted: isUs,
              prevClose: prevCloseCad,
              currency: 'CAD',
              quoteCurrency: isUs ? 'USD' : 'CAD',
              source: 'market',
            });
          }
        }
      } catch {
        // Fallback
      }

      return json({
        ticker,
        exchange,
        price: null,
        fxRate: CAD_PER_USD,
        message: 'Enter price manually or execute market order',
      });
    }

    if (path === '/api/trade' && req.method === 'POST') {
      if (!owner()) return forbidden();
      const body = await req.json().catch(() => null);
      const v = validateTrade(body);
      if (v.error) return json({ success: false, message: v.error }, 400);

      const tradeAccount = resolveAccount(body?.account || targetAccountId);
      const client = session(tradeAccount.id);
      await client.login();
      const result = await client.trade(v.trade);
      if (result.success) {
        await logTrade(store, v.trade, 'manual', tradeAccount.id);
        // Refresh the targeted account numbers immediately
        await ingest(store, await client.scrape(), Date.now(), tradeAccount.team, tradeAccount.id).catch((err) =>
          console.error('[post-trade ingest]', err.message)
        );
        // buy-then-auto-sell: arm exits on the position we just opened
        if (v.trade.action === 'buy' && body?.exits) {
          const latestNow = await store.get(`latest:${tradeAccount.id}`, null);
          const held = (latestNow?.portfolio?.holdings ?? []).find((h) => h.ticker.toUpperCase() === v.trade.ticker);
          const log = await store.get(`trades-log:${tradeAccount.id}`, []);
          const made = rulesFromExits(body.exits, {
            exchange: v.trade.exchange, ticker: v.trade.ticker, account: tradeAccount.id, team: tradeAccount.team,
            holdReleaseAt: holdReleaseAt(log, v.trade.ticker, v.trade.exchange), price: held?.currentPrice,
          });
          if (made.length) {
            const all = await store.get('tp-rules', []);
            const live = (r) => r.status !== 'done' && r.status !== 'cancelled';
            const kinds = new Set(made.map((m) => m.kind));
            const keep = all.filter((r) => !(r.account === tradeAccount.id && r.ticker === v.trade.ticker && kinds.has(r.kind ?? 'tp') && live(r)));
            await store.set('tp-rules', [...keep, ...made]);
          }
        }
      }
      return json({
        ...result,
        account: tradeAccount.id,
        team: tradeAccount.team,
        command: `curl -X POST "https://investja.org/private/game/${v.trade.action}" -H "X-Requested-With: XMLHttpRequest" -d "exchange=${v.trade.exchange}&ticker=${v.trade.ticker}&quantity=${v.trade.quantity}&action=confirm"`,
        payload: {
          action: v.trade.action,
          exchange: v.trade.exchange,
          ticker: v.trade.ticker,
          quantity: v.trade.quantity,
          account: tradeAccount.id,
          timestamp: Date.now(),
        },
      });
    }

    if (path === '/api/schedule-trade' && req.method === 'POST') {
      if (!owner()) return forbidden();
      const body = await req.json().catch(() => null);
      const v = validateTrade(body);
      if (v.error) return json({ success: false, message: v.error }, 400);
      const executeAt = Number(body.executeAt);
      if (!Number.isFinite(executeAt) || executeAt <= 0) return json({ success: false, message: 'executeAt must be unix milliseconds' }, 400);

      const tradeAccount = resolveAccount(body?.account || targetAccountId);
      const queue = await store.get('queue', []);
      const task = {
        id: crypto.randomUUID(),
        ...v.trade,
        account: tradeAccount.id,
        team: tradeAccount.team,
        executeAt,
        createdAt: Date.now(),
        attempts: 0,
        status: 'pending',
        lastError: null,
        nextAttemptAt: 0,
      };
      queue.push(task);
      queue.sort((a, b) => a.executeAt - b.executeAt);
      await store.set('queue', queue);
      return json({ success: true, message: 'scheduled', task }, 201);
    }

    if (path === '/api/scheduled-trades' && req.method === 'GET') {
      const queue = await store.get('queue', []);
      const filtered = queue.filter((t) => !t.account || t.account === targetAccountId);
      return json(filtered);
    }

    if (path === '/api/take-profit' && req.method === 'POST') {
      if (!owner()) return forbidden();
      const body = await req.json().catch(() => null);
      const v = validateRule(body);
      if (v.error) return json({ success: false, message: v.error }, 400);

      const acc = resolveAccount(body?.account || targetAccountId);
      const latest = await store.get(`latest:${acc.id}`, null);
      const held = (latest?.portfolio?.holdings ?? []).find((h) => h.ticker.toUpperCase() === v.rule.ticker);
      if (!held) return json({ success: false, message: `${v.rule.ticker} is not in this account's holdings` }, 400);

      const log = await store.get(`trades-log:${acc.id}`, []);
      const rules = await store.get('tp-rules', []);
      // one live rule per position and kind: re-arming replaces the old one
      const isLive = (r) => r.status !== 'done' && r.status !== 'cancelled';
      const kept = rules.filter((r) => !(r.account === acc.id && r.ticker === v.rule.ticker && (r.kind ?? 'tp') === v.rule.kind && isLive(r)));
      const rule = {
        id: crypto.randomUUID(),
        ...v.rule,
        ...(v.rule.kind === 'trail' ? { peak: held.currentPrice } : {}),
        account: acc.id,
        team: acc.team,
        createdAt: Date.now(),
        status: 'armed',
        attempts: 0,
        lastError: null,
        holdReleaseAt: holdReleaseAt(log, v.rule.ticker, v.rule.exchange),
      };
      kept.push(rule);
      await store.set('tp-rules', kept);
      return json({ success: true, message: 'armed', rule }, 201);
    }

    if (path === '/api/take-profit' && req.method === 'GET') {
      const rules = await store.get('tp-rules', []);
      const dayAgo = Date.now() - 24 * 3600 * 1000;
      return json(rules.filter((r) => r.account === targetAccountId && r.status !== 'cancelled' && (r.status !== 'done' || (r.firedAt ?? 0) > dayAgo)));
    }

    const tpDel = path.match(/^\/api\/take-profit\/([\w-]+)$/);
    if (tpDel && req.method === 'DELETE') {
      if (!owner()) return forbidden();
      const rules = await store.get('tp-rules', []);
      const next = rules.filter((r) => r.id !== tpDel[1]);
      if (next.length === rules.length) return json({ success: false, message: 'not found' }, 404);
      await store.set('tp-rules', next);
      return json({ success: true, message: 'disarmed' });
    }

    if (path === '/api/sell-ready' && req.method === 'POST') {
      if (!owner()) return forbidden();
      const acc = resolveAccount((await req.json().catch(() => ({})))?.account || targetAccountId);
      const client = session(acc.id);
      await client.login();
      const live = await client.scrape();
      const log = await store.get(`trades-log:${acc.id}`, []);
      const now = Date.now();
      const results = [];
      for (const h of live.dashboard.holdings) {
        const rel = holdReleaseAt(log, h.ticker.toUpperCase(), h.exchange);
        if (!rel || rel > now) continue; // only positions we KNOW are past the hold; never guess for site-side buys
        const t = { action: 'sell', exchange: String(h.exchange), ticker: h.ticker.toUpperCase(), quantity: h.quantity };
        const res = await client.trade(t).catch((e) => ({ success: false, message: e.message }));
        if (res.success) await logTrade(store, { ...t, price: h.currentPrice, avg: h.avgBuyPrice }, 'sell-ready', acc.id);
        results.push({ ticker: h.ticker, success: res.success, message: res.message });
      }
      if (results.some((x) => x.success)) {
        await ingest(store, await client.scrape(), Date.now(), acc.team, acc.id).catch(() => {});
      }
      return json({ success: results.some((x) => x.success), results });
    }

    if (path === '/api/journal' && req.method === 'GET') {
      const log = await store.get(`trades-log:${targetAccountId}`, []);
      return json({ trades: log.slice(-300) });
    }

    if (path === '/api/journal/note' && req.method === 'POST') {
      if (!owner()) return forbidden();
      const { id, note } = (await req.json().catch(() => ({}))) ?? {};
      if (typeof id !== 'string' || typeof note !== 'string' || note.length > 500) return json({ error: 'id and note (<= 500 chars) required' }, 400);
      const key = `trades-log:${targetAccountId}`;
      const log = await store.get(key, []);
      const item = log.find((t) => t.id === id);
      if (!item) return json({ error: 'not found' }, 404);
      item.note = note.trim();
      await store.set(key, log);
      return json({ ok: true });
    }

    if (path === '/api/prices' && req.method === 'GET') {
      return json({ points: await store.get(`px:${targetAccountId}`, []) });
    }

    if (path === '/api/push/key' && req.method === 'GET') {
      return json({ key: e.VAPID_PUBLIC_KEY || null });
    }

    if (path === '/api/push/subscribe' && req.method === 'POST') {
      const { subscription } = (await req.json().catch(() => ({}))) ?? {};
      if (!subscription?.endpoint || !subscription?.keys) return json({ error: 'subscription required' }, 400);
      const subs = (await store.get('push-subs', [])).filter((x) => x.subscription.endpoint !== subscription.endpoint);
      subs.push({ account: targetAccountId, subscription, at: Date.now() });
      await store.set('push-subs', subs.slice(-20));
      return json({ ok: true });
    }

    if (path === '/api/push/unsubscribe' && req.method === 'POST') {
      const { endpoint } = (await req.json().catch(() => ({}))) ?? {};
      await store.set('push-subs', (await store.get('push-subs', [])).filter((x) => x.subscription.endpoint !== endpoint));
      return json({ ok: true });
    }

    if (path === '/api/push/test' && req.method === 'POST') {
      await pushEvent(store, targetAccountId, { type: 'test', tag: 'test', title: 'Alerts are on', body: 'You will get SELL READY, exit fills, rank drops and drawdown warnings.' });
      return json({ ok: true });
    }

    const del = path.match(/^\/api\/schedule-trade\/([\w-]+)$/);
    if (del && req.method === 'DELETE') {
      const queue = await store.get('queue', []);
      const next = queue.filter((t) => t.id !== del[1]);
      if (next.length === queue.length) return json({ success: false, message: 'not found' }, 404);
      await store.set('queue', next);
      return json({ success: true, message: 'cancelled' });
    }

    return json({ error: 'not found' }, 404);
  } catch (err) {
    console.error(`[${req.method} ${path}]`, err.message);
    return json({ error: err.message }, 502);
  }
};

export const config = { path: '/api/*' };
