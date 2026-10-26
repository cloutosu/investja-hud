// Node 20 ESM — exit rules (take-profit, stop-loss, trailing stop): fire after the 1 h hold releases
export const HOLD_MS = 3600 * 1000;
const RULE_RETRY_MS = 60 * 1000;
const HOLD_REJECT = /hold|held|minimum|too soon|wait/i;
const KINDS = new Set(['tp', 'sl', 'trail']);

const num = (v) => (v === undefined || v === null || v === '' ? NaN : Number(v));
const pos = (v) => (num(v) > 0 ? num(v) : null);

export function validateRule(b) {
  const exchange = ['Nasdaq', 'NYSE', 'TSX'].includes(b?.exchange) ? b.exchange : null;
  const ticker = String(b?.ticker || '').trim().toUpperCase();
  const kind = b?.kind === undefined ? 'tp' : b.kind;
  const all = b?.quantity === undefined || b?.quantity === 'all';
  const quantity = all ? 'all' : Number(b?.quantity);
  if (!exchange) return { error: 'exchange must be Nasdaq, NYSE or TSX' };
  if (!/^[A-Z0-9.\-]{1,10}$/.test(ticker)) return { error: 'invalid ticker' };
  if (!KINDS.has(kind)) return { error: 'kind must be tp, sl or trail' };
  if (!all && (!Number.isInteger(quantity) || quantity <= 0)) return { error: "quantity must be a positive integer or 'all'" };
  const rule = { exchange, ticker, quantity, kind, targetPct: null, targetPrice: null, stopPct: null, stopPrice: null, trailPct: null };
  if (kind === 'tp') {
    rule.targetPct = pos(b.targetPct);
    rule.targetPrice = pos(b.targetPrice);
    if (!rule.targetPct && !rule.targetPrice) return { error: 'set targetPct (> 0) or targetPrice (> 0)' };
  } else if (kind === 'sl') {
    rule.stopPct = pos(b.stopPct);
    rule.stopPrice = pos(b.stopPrice);
    if (!rule.stopPct && !rule.stopPrice) return { error: 'set stopPct (> 0) or stopPrice (> 0)' };
    if (rule.stopPct && rule.stopPct >= 100) return { error: 'stopPct must be below 100' };
  } else {
    rule.trailPct = pos(b.trailPct);
    if (!rule.trailPct || rule.trailPct >= 100) return { error: 'trailPct must be between 0 and 100' };
  }
  return { rule };
}

// Earliest moment the server will let this position be sold, from our own buy log.
// Buys made directly on investja.org aren't logged, so null means "unknown, ask the server".
export function holdReleaseAt(tradesLog, ticker, exchange) {
  let last = 0;
  for (const t of tradesLog) {
    if (t.action === 'buy' && t.ticker === ticker && (!t.exchange || t.exchange === exchange)) last = Math.max(last, t.at);
  }
  return last ? last + HOLD_MS : null;
}

export function triggered(rule, holding) {
  if (!holding || !(holding.currentPrice > 0)) return false;
  const px = holding.currentPrice;
  const avg = holding.avgBuyPrice;
  const kind = rule.kind ?? 'tp';
  if (kind === 'tp') {
    if (rule.targetPrice && px >= rule.targetPrice) return true;
    return !!(rule.targetPct && avg > 0 && (px / avg - 1) * 100 >= rule.targetPct);
  }
  if (kind === 'sl') {
    if (rule.stopPrice && px <= rule.stopPrice) return true;
    return !!(rule.stopPct && avg > 0 && (px / avg - 1) * 100 <= -rule.stopPct);
  }
  return !!(rule.peak > 0 && px <= rule.peak * (1 - rule.trailPct / 100));
}
export const targetHit = triggered; // kept for the original take-profit call sites

export const KIND_LABEL = { tp: 'Take profit', sl: 'Stop loss', trail: 'Trailing stop' };

// Builds the live rules for a freshly bought position. `exits` = { tpPct, slPct, trailPct }.
export function rulesFromExits(exits, { exchange, ticker, account, team, holdReleaseAt: release, price }) {
  const out = [];
  const base = { exchange, ticker, quantity: 'all', account, team, createdAt: Date.now(), status: 'armed', attempts: 0, lastError: null, holdReleaseAt: release ?? null };
  const mk = (extra) => out.push({ id: crypto.randomUUID(), targetPct: null, targetPrice: null, stopPct: null, stopPrice: null, trailPct: null, ...base, ...extra });
  if (pos(exits?.tpPct)) mk({ kind: 'tp', targetPct: pos(exits.tpPct) });
  if (pos(exits?.slPct) && pos(exits.slPct) < 100) mk({ kind: 'sl', stopPct: pos(exits.slPct) });
  if (pos(exits?.trailPct) && pos(exits.trailPct) < 100) mk({ kind: 'trail', trailPct: pos(exits.trailPct), peak: price ?? null });
  return out;
}

// One pass over this account's rules against the fresh scrape. `client.trade` is only called when the rule
// fires AND the hold is (as far as we know) released; a server hold rejection re-arms the rule.
// Filling one exit cancels the others on the same position (one-cancels-other).
// Returns how many sells went through so the caller can re-scrape.
export async function runTakeProfit(store, client, holdings, accountId, logTrade, now = Date.now(), emit = async () => {}) {
  const rules = await store.get('tp-rules', []);
  const live = (r) => r.account === accountId && r.status !== 'done' && r.status !== 'cancelled';
  const mine = rules.filter(live);
  const out = { sold: 0, checked: mine.length };
  if (!mine.length) return out;

  const tradesLog = await store.get(`trades-log:${accountId}`, []);

  for (const rule of mine) {
    if (rule.status === 'done' || rule.status === 'cancelled') continue;
    const kind = rule.kind ?? 'tp';
    const holding = holdings.find((h) => h.ticker.toUpperCase() === rule.ticker);
    const release = holdReleaseAt(tradesLog, rule.ticker, rule.exchange);
    rule.holdReleaseAt = release;

    if (!holding) { rule.status = 'no-position'; rule.lastError = 'position no longer held'; continue; }
    rule.status = 'armed';
    rule.lastCheckAt = now;
    rule.lastPrice = holding.currentPrice;
    if (kind === 'trail') rule.peak = Math.max(rule.peak ?? 0, holding.currentPrice); // tracked through the hold too
    if (release && now < release) { rule.status = 'holding'; continue; }
    if (!triggered(rule, holding)) continue;
    if ((rule.nextAttemptAt ?? 0) > now) continue;

    const quantity = rule.quantity === 'all' ? holding.quantity : Math.min(rule.quantity, holding.quantity);
    let result;
    try {
      result = await client.trade({ action: 'sell', exchange: rule.exchange, ticker: rule.ticker, quantity });
    } catch (e) {
      result = { success: false, message: e.message };
    }

    if (result.success) {
      rule.status = 'done';
      rule.firedAt = now;
      rule.soldQuantity = quantity;
      rule.soldPrice = holding.currentPrice;
      rule.lastError = null;
      await logTrade(store, { action: 'sell', exchange: rule.exchange, ticker: rule.ticker, quantity, price: holding.currentPrice, avg: holding.avgBuyPrice }, `exit-${kind}`, accountId);
      for (const other of mine) {
        if (other !== rule && other.ticker === rule.ticker && other.status !== 'done' && other.status !== 'cancelled') {
          other.status = 'cancelled';
          other.lastError = `cancelled: ${KIND_LABEL[kind].toLowerCase()} filled`;
        }
      }
      const pct = holding.avgBuyPrice > 0 ? ((holding.currentPrice / holding.avgBuyPrice - 1) * 100).toFixed(1) : null;
      await emit({
        type: `fill-${kind}`,
        tag: `fill-${rule.id}`,
        title: `${KIND_LABEL[kind]} filled: ${rule.ticker}`,
        body: `Sold ${quantity} @ ${holding.currentPrice.toFixed(2)}${pct !== null ? ` (${pct >= 0 ? '+' : ''}${pct}% vs avg)` : ''}`,
      });
      out.sold++;
    } else {
      rule.attempts = (rule.attempts || 0) + 1;
      rule.lastError = result.message;
      rule.nextAttemptAt = now + RULE_RETRY_MS;
      rule.status = HOLD_REJECT.test(result.message || '') ? 'holding' : 'armed';
    }
  }

  // merge back by id: the API may have added/cancelled rules while we were trading
  const fresh = await store.get('tp-rules', []);
  const byId = new Map(mine.map((r) => [r.id, r]));
  const merged = fresh.map((r) => byId.get(r.id) ?? r);
  await store.set('tp-rules', merged);
  return out;
}
