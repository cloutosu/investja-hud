import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Layers, Clock, TrendingUp, Plus } from 'lucide-react';
import type { Portfolio, Pulse } from '../types';
import { HOLD_MS, etTime } from '../lib/market';
import { int, money, signedMoney, signedPct } from '../lib/format';
import type { TradeInit } from './TradeModal';

const BUYS_KEY = 'investja.buys';
export function readBuys(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(BUYS_KEY) || '{}');
  } catch {
    return {};
  }
}
export function recordBuy(ticker: string) {
  try {
    localStorage.setItem(BUYS_KEY, JSON.stringify({ ...readBuys(), [ticker]: Date.now() }));
  } catch {
    /* storage blocked */
  }
}

interface Props {
  portfolio: Portfolio | null;
  pulse: Pulse | null;
  canTrade: boolean;
  /** server-side hold releases (ticker -> epoch ms); merged with this device's own buy record */
  holds?: Record<string, number>;
  onSell: (init: TradeInit) => void;
}

export function PortfolioCard({ portfolio, pulse, canTrade, holds = {}, onSell }: Props) {
  const [now, setNow] = useState(Date.now());
  const [dot, setDot] = useState<{ ticker: string; gain: boolean } | null>(null);

  const buys = readBuys();
  const releaseOf = (ticker: string) => Math.max(holds[ticker] ?? 0, (buys[ticker] ?? 0) + (buys[ticker] ? HOLD_MS : 0));
  const anyHeld = (portfolio?.holdings ?? []).some((h) => releaseOf(h.ticker) > now);

  // tick every second only while a countdown is on screen
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), anyHeld ? 1000 : 15000);
    return () => clearInterval(id);
  }, [anyHeld]);

  useEffect(() => {
    if (!pulse?.ticker) return;
    setDot({ ticker: pulse.ticker, gain: pulse.delta > 0 });
    const t = setTimeout(() => setDot(null), 3000);
    return () => clearTimeout(t);
  }, [pulse]);

  const holdings = portfolio?.holdings ?? [];
  const holdingsTotal = holdings.reduce((s, h) => s + h.totalValue, 0);
  const totalReturnDollar = holdings.reduce((s, h) => s + (h.returnDollar ?? 0), 0);
  const totalCostBasis = holdings.reduce((s, h) => s + (h.costBasis ?? h.totalValue), 0);
  const totalReturnPct = totalCostBasis > 0 ? (totalReturnDollar / totalCostBasis) * 100 : 0;

  const cash = portfolio?.cash ?? 0;
  const loan = portfolio?.loan ?? 0;
  const equity = holdingsTotal + cash - loan;

  return (
    <section className="card p-4 sm:p-6">
      {/* Header */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gain/10 border border-gain/20 text-gain">
            <Layers size={18} />
          </div>
          <div>
            <div className="flex items-baseline gap-2">
              <h2 className="text-base sm:text-lg font-bold tracking-tight text-ink">Active Positions</h2>
              <span className="num text-xs text-ink-3 font-semibold">({holdings.length} allocated)</span>
            </div>
            <p className="text-[11px] text-ink-3 hidden sm:block">Live stock holdings, average cost & profit / loss</p>
          </div>
        </div>

        <div className="text-right flex items-center gap-3 ml-auto">
          {holdings.length > 0 && totalReturnDollar !== 0 && (
            <div className="text-right">
              <span className="label text-[9px]">Unrealized Return</span>
              <div
                className={`num font-bold text-xs ${
                  totalReturnDollar > 0 ? 'text-gain' : 'text-loss'
                }`}
              >
                {signedMoney(totalReturnDollar, 0)} ({signedPct(totalReturnPct)})
              </div>
            </div>
          )}
          <div className="text-right border-l border-line pl-3">
            <span className="label text-[9px]">Total Value</span>
            <div className="num font-bold text-sm text-gain">{money(holdingsTotal)}</div>
          </div>
        </div>
      </div>

      {/* Holdings List */}
      <div className="space-y-2.5">
        <AnimatePresence initial={false}>
          {holdings.map((h) => {
            const holdUntil = releaseOf(h.ticker);
            const held = holdUntil > now;
            const everHeld = holdUntil > 0;
            const heldFor = Math.max(0, holdUntil - now);
            const holdPct = held ? Math.min(100, ((HOLD_MS - heldFor) / HOLD_MS) * 100) : 100;
            const mm = String(Math.floor(heldFor / 60000)).padStart(2, '0');
            const ss = String(Math.floor((heldFor % 60000) / 1000)).padStart(2, '0');
            const weight = equity > 0 ? ((h.totalValue / equity) * 100).toFixed(1) : '0';
            const hasReturn = h.returnDollar !== undefined;
            const isProfit = (h.returnDollar ?? 0) > 0;
            const isLoss = (h.returnDollar ?? 0) < 0;

            return (
              <motion.div
                key={`${h.exchange}:${h.ticker}`}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="group flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-tint/40 p-3.5 transition-all hover:border-line-focus hover:bg-tint/70"
              >
                {/* Left: Ticker & Exchange & Cost Info */}
                <div className="flex items-center gap-3 min-w-0">
                  <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-tint-2 font-mono font-extrabold text-sm text-ink border border-line-strong">
                    {h.ticker.slice(0, 4)}
                    {dot?.ticker === h.ticker && (
                      <motion.span
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className={`absolute -top-1 -right-1 h-3 w-3 rounded-full border-2 border-elevated shadow-sm ${
                          dot.gain ? 'bg-gain shadow-gain/50' : 'bg-loss shadow-loss/50'
                        }`}
                      />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-sm text-ink tracking-tight">{h.ticker}</span>
                      <span className="rounded bg-line/80 px-1.5 py-0.5 text-[9px] font-mono text-ink-2 uppercase">
                        {h.exchange}
                      </span>
                    </div>
                    <div className="num text-xs text-ink-3 mt-0.5">
                      {int(h.quantity)} shares
                      {h.avgBuyPrice ? ` @ avg ${money(h.avgBuyPrice)}` : ''} ·{' '}
                      <span className="text-ink-2 font-medium">{weight}%</span> weight
                    </div>
                    {everHeld && (
                      held ? (
                        <div className="mt-1.5 w-full max-w-[220px]" title={`Sellable at ${etTime(holdUntil)} ET`}>
                          <div className="flex items-center justify-between text-[10px] font-semibold text-warn">
                            <span className="inline-flex items-center gap-1"><Clock size={10} /> SELL IN</span>
                            <span className="num">{mm}:{ss}</span>
                          </div>
                          <div className="mt-1 h-1 overflow-hidden rounded-full bg-tint-2">
                            <div className="h-full rounded-full bg-warn transition-[width] duration-1000 ease-linear" style={{ width: `${holdPct}%` }} />
                          </div>
                        </div>
                      ) : (
                        <span className="mt-1.5 inline-flex items-center gap-1.5 rounded-full border border-gain/40 bg-gain/15 px-2 py-0.5 text-[10px] font-bold text-gain">
                          <span className="orb h-1.5 w-1.5 rounded-full bg-gain" /> SELL READY
                        </span>
                      )
                    )}
                  </div>
                </div>

                {/* Right: Total Value, Profit/Loss Pill, & Trade Actions */}
                <div className="flex w-full items-center justify-between gap-3 sm:w-auto sm:ml-auto sm:justify-end sm:gap-4">
                  <div className="text-right flex flex-col items-end">
                    <div className="num font-bold text-sm text-ink">{money(h.totalValue)}</div>
                    <div className="num text-[11px] text-ink-3">@{money(h.currentPrice)}</div>
                    {hasReturn && (
                      <div
                        className={`num mt-1 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold ${
                          isProfit
                            ? 'border border-gain/40 bg-gain/15 text-gain shadow-sm shadow-gain/10'
                            : isLoss
                            ? 'border border-loss/40 bg-loss/15 text-loss shadow-sm shadow-loss/10'
                            : 'border border-line bg-tint text-ink-3'
                        }`}
                      >
                        <span>{isProfit ? '▲ +' : isLoss ? '▼ ' : '— '}</span>
                        <span>{money(h.returnDollar ?? 0)}</span>
                        <span>({h.returnPercent !== undefined ? signedPct(h.returnPercent) : '0%'})</span>
                      </div>
                    )}
                  </div>

                  {canTrade && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        className="btn text-xs font-semibold px-3.5 py-2.5 sm:px-2.5 sm:py-1.5 rounded-xl border border-gain/40 text-gain hover:bg-gain/15 transition-all active:scale-95 flex items-center gap-1 shadow-sm cursor-pointer"
                        onClick={() =>
                          onSell({ action: 'buy', exchange: String(h.exchange), ticker: h.ticker, quantity: 100 })
                        }
                        title={`Buy more ${h.ticker}`}
                      >
                        <Plus size={12} /> Buy
                      </button>
                      <button
                        className={`btn text-xs font-semibold px-3.5 py-2.5 sm:px-2.5 sm:py-1.5 rounded-xl border transition-all active:scale-95 flex items-center gap-1 cursor-pointer ${
                          held ? 'opacity-60 border-warn/40 text-warn bg-warn/10' : 'border-loss/40 text-loss hover:bg-loss/15'
                        }`}
                        disabled={held}
                        title={held ? `1-hour lock until ${etTime(holdUntil)}` : `Sell ${h.ticker}`}
                        onClick={() =>
                          onSell({ action: 'sell', exchange: String(h.exchange), ticker: h.ticker, quantity: h.quantity })
                        }
                      >
                        {held ? (
                          <>
                            <Clock size={11} /> Held
                          </>
                        ) : (
                          everHeld ? 'Sell ✓' : 'Sell'
                        )}
                      </button>
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {holdings.length === 0 && (
          <div className="py-8 text-center rounded-2xl border border-dashed border-line bg-tint/20">
            <TrendingUp size={28} className="mx-auto text-ink-3 mb-2 opacity-50" />
            <div className="text-sm font-medium text-ink-2">No open positions</div>
            <div className="text-xs text-ink-3 mt-0.5">Holding 100% liquid cash. Ready to deploy buying power.</div>
          </div>
        )}
      </div>

      {/* Accounting Formula Banner */}
      <div className="num mt-4 border-t border-line pt-3.5 flex flex-wrap justify-between items-center text-xs text-ink-3 gap-2">
        <div>
          Holdings ({money(holdingsTotal)}) + Cash ({money(cash)}) − Loan ({money(loan)})
        </div>
        <div className="text-ink font-bold font-mono">
          = Total {money(equity)}
        </div>
      </div>
    </section>
  );
}
