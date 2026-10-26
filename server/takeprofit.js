// Node 20 ESM — take-profit rules: arm a sell on a holding, fire once the 1 h hold is over and the target is hit
export const HOLD_MS = 3600 * 1000;
const RULE_RETRY_MS = 60 * 1000;
const HOLD_REJECT = /hold|held|minimum|too soon|wait/i;

const num = (v) => (v === undefined || v === null || v === '' ? NaN : Number(v));

export function validateRule(b) {
  const exchange = ['Nasdaq', 'NYSE', 'TSX'].includes(b?.exchange) ? b.exchange : null;
  const ticker = String(b?.ticker || '').trim().toUpperCase();
  const targetPct = num(b?.targetPct);
  const targetPrice = num(b?.targetPrice);
  const all = b?.quantity === 'all';
  const quantity = all ? 'all' : Number(b?.quantity);
  if (!exchange) return { error: 'exchange must be Nasdaq, NYSE or TSX' };
  if (!/^[A-Z0-9.\-]{1,10}$/.test(ticker)) return { error: 'invalid ticker' };
  if (!(targetPct > 0) && !(targetPrice > 0)) return { error: 'set targetPct (> 0) or targetPrice (> 0)' };
  if (!all && (!Number.isInteger(quantity) || quantity <= 0)) return { error: "quantity must be a positive integer or 'all'" };
  return {
    rule: {
      exchange,
      ticker,
      quantity,
      targetPct: targetPct > 0 ? targetPct : null,
      targetPrice: targetPrice > 0 ? targetPrice : null,
    },
  };
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

export function targetHit(rule, holding) {
  if (!holding || !(holding.currentPrice > 0)) return false;
  if (rule.targetPrice && holding.currentPrice >= rule.targetPrice) return true;
  if (rule.targetPct && holding.avgBuyPrice > 0) {
    return (holding.currentPrice / holding.avgBuyPrice - 1) * 100 >= rule.targetPct;
  }
  return false;
}

export function ruleProgress(rule, holding) {
  if (!holding) return null;
  const pct = holding.avgBuyPrice > 0 ? (holding.currentPrice / holding.avgBuyPrice - 1) * 100 : null;
  return { price: holding.currentPrice, pct };
}

// One pass over this account's rules against the fresh scrape. `client.trade` is only called when
// the target is hit AND the hold is (as far as we know) released; a server hold rejection re-arms the rule.
// Returns how many sells went through so the caller can re-scrape.
export async function runTakeProfit(store, client, holdings, accountId, logTrade, now = Date.now()) {
  const rules = await store.get('tp-rules', []);
  const mine = rules.filter((r) => r.account === accountId && r.status !== 'done');
  const out = { sold: 0, checked: mine.length };
  if (!mine.length) return out;

  const tradesLog = await store.get(`trades-log:${accountId}`, []);

  for (const rule of mine) {
    const holding = holdings.find((h) => h.ticker.toUpperCase() === rule.ticker);
    const release = holdReleaseAt(tradesLog, rule.ticker, rule.exchange);
    rule.holdReleaseAt = release;

    if (!holding) { rule.status = 'no-position'; rule.lastError = 'position no longer held'; continue; }
    rule.status = 'armed';
    rule.lastCheckAt = now;
    rule.lastPrice = holding.currentPrice;
    if (release && now < release) { rule.status = 'holding'; continue; }
    if (!targetHit(rule, holding)) continue;
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
      await logTrade(store, { action: 'sell', exchange: rule.exchange, ticker: rule.ticker, quantity }, 'take-profit', accountId);
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
