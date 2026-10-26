// Node 20 ESM — alert events (sell ready, rank drop, drawdown, exit fills) and Web Push delivery
import { holdReleaseAt } from './takeprofit.js';

const KEEP_EVENTS = 50;
const SEEN_MAX = 300;
const MIN = 60 * 1000;

// Appends an event the page polls for, and pushes it to subscribed browsers when VAPID keys are set.
export async function pushEvent(store, accountId, ev, env = process.env) {
  const key = `events:${accountId}`;
  const list = await store.get(key, []);
  const item = { id: (list.at(-1)?.id ?? 0) + 1, at: Date.now(), type: ev.type, title: ev.title, body: ev.body, tag: ev.tag ?? ev.type };
  list.push(item);
  await store.set(key, list.slice(-KEEP_EVENTS));
  await sendPush(store, accountId, item, env).catch((e) => console.error('[push]', e.message));
  return item;
}

export async function sendPush(store, accountId, item, env = process.env) {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return 0;
  const subs = (await store.get('push-subs', [])).filter((s) => s.account === accountId);
  if (!subs.length) return 0;
  const webpush = (await import('web-push')).default;
  webpush.setVapidDetails(env.VAPID_SUBJECT || 'mailto:admin@example.com', env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
  const payload = JSON.stringify({ title: item.title, body: item.body, tag: item.tag, id: item.id });
  const dead = new Set();
  let sent = 0;
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification(s.subscription, payload, { TTL: 3600 });
      sent++;
    } catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) dead.add(s.subscription.endpoint);
    }
  }));
  if (dead.size) await store.set('push-subs', (await store.get('push-subs', [])).filter((s) => !dead.has(s.subscription.endpoint)));
  return sent;
}

const money = (n) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Called once per tick with the fresh scrape, BEFORE ingest overwrites `latest` (so prev rank/equity are still readable).
export async function runAlerts(store, accountId, { live, prevLatest, target, now = Date.now(), env = process.env, emit }) {
  const fire = emit ?? ((ev) => pushEvent(store, accountId, ev, env));
  const fired = [];
  const seenKey = `alerts-seen:${accountId}`;
  const seen = await store.get(seenKey, []);
  const mark = (k) => { seen.push(k); };
  const log = await store.get(`trades-log:${accountId}`, []);

  // 1) SELL READY: the 1 h hold on a position we bought just ended
  for (const h of live.dashboard.holdings) {
    const rel = holdReleaseAt(log, h.ticker.toUpperCase(), h.exchange);
    if (!rel || rel > now || rel < now - 6 * 60 * MIN) continue;
    const k = `ready:${h.ticker}:${rel}`;
    if (seen.includes(k)) continue;
    mark(k);
    const pct = h.returnPercent !== undefined ? ` · ${h.returnPercent >= 0 ? '+' : ''}${h.returnPercent.toFixed(1)}%` : '';
    fired.push({ type: 'sell-ready', tag: `ready-${h.ticker}`, title: `SELL READY: ${h.ticker}`, body: `Hold is over. ${h.quantity} @ ${money(h.currentPrice)}${pct}` });
  }

  // 2) rank drop: someone passed you (only while you're in the top N, so mid-table jitter stays quiet)
  const topN = Number(env.ALERT_RANK_TOP || 50);
  const prevRank = prevLatest?.teams?.find((t) => t.name === target)?.rank;
  const nowRank = live.leaderboard.find((t) => t.name === target)?.rank;
  if (prevRank && nowRank && nowRank > prevRank && prevRank <= topN) {
    const passer = live.leaderboard.find((t) => t.rank === nowRank - 1);
    fired.push({ type: 'rank', tag: 'rank', title: `Rank #${prevRank} → #${nowRank}`, body: passer ? `${passer.name} passed you (${money(passer.equity)})` : 'You were passed on the leaderboard' });
  }

  // 3) drawdown vs 5 minutes ago, with a 15 min cooldown
  const equity = live.dashboard.holdings.reduce((s, h) => s + h.totalValue, 0) + live.dashboard.cash - live.dashboard.loan;
  const threshold = Number(env.ALERT_DRAWDOWN_PCT || 2);
  const hist = await store.get(`history:${accountId}`, []);
  const ref = [...hist].reverse().find((p) => p.t <= now - 5 * MIN && p.eq?.[target]);
  const cool = await store.get(`alerts-cool:${accountId}`, {});
  if (ref && ref.eq[target][0] > 0) {
    const dropPct = (1 - equity / ref.eq[target][0]) * 100;
    if (dropPct >= threshold && now - (cool.drawdown ?? 0) > 15 * MIN) {
      cool.drawdown = now;
      await store.set(`alerts-cool:${accountId}`, cool);
      fired.push({ type: 'drawdown', tag: 'drawdown', title: `Equity down ${dropPct.toFixed(1)}% in 5 min`, body: `${money(ref.eq[target][0])} → ${money(equity)}` });
    }
  }

  await store.set(seenKey, seen.slice(-SEEN_MAX));
  for (const ev of fired) await fire(ev);
  return fired;
}
