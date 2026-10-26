import { useState, useEffect } from 'react';
import { Sparkles, Loader2 } from 'lucide-react';
import type { Holding } from '../types';
import { money } from '../lib/format';

interface Props {
  ticker: string;
  quantity: number;
  holdings: Holding[];
  equity: number | null;
  buyingPower?: number;
  action?: 'buy' | 'sell';
  exchange?: string;
  detectedPrice: number | null;
  isDetecting?: boolean;
  onSelectQty?: (q: number) => void;
}

const OVERSIZED_PCT = 60;
const COMMISSION = 25; // InvestJA $25 CAD per trade

export function PositionSizer({
  ticker,
  quantity,
  holdings,
  equity,
  buyingPower = 0,
  action = 'buy',
  exchange = 'Nasdaq',
  detectedPrice,
  isDetecting = false,
  onSelectQty,
}: Props) {
  const isUsStock = exchange === 'Nasdaq' || exchange === 'NYSE';
  const [manual, setManual] = useState('');

  const held = holdings.find((h) => h.ticker.toUpperCase() === ticker.toUpperCase() && h.quantity > 0);
  const heldUnit = held ? held.currentPrice || held.totalValue / held.quantity : null;

  // Sync manual input when price is detected
  useEffect(() => {
    if (detectedPrice && !manual) {
      setManual(String(detectedPrice));
    }
  }, [detectedPrice, manual]);

  const manualUnit = parseFloat(manual);
  const effectivePrice =
    detectedPrice ?? heldUnit ?? (Number.isFinite(manualUnit) && manualUnit > 0 ? manualUnit : null);

  const value = effectivePrice !== null && quantity > 0 ? effectivePrice * quantity : null;
  const totalCost = value !== null ? (action === 'buy' ? value + COMMISSION : value - COMMISSION) : null;
  const pct = value !== null && equity ? (value / equity) * 100 : null;

  // Max Afford & Quick Sizing based on CAD price
  const handleQuickPercent = (fraction: number) => {
    if (!onSelectQty || !effectivePrice || effectivePrice <= 0) return;
    if (action === 'buy') {
      const budget = Math.max(0, buyingPower - COMMISSION) * fraction;
      const count = Math.max(1, Math.floor(budget / effectivePrice));
      onSelectQty(count);
    } else {
      const maxShares = held?.quantity ?? 0;
      if (maxShares > 0) {
        const count = Math.max(1, Math.floor(maxShares * fraction));
        onSelectQty(count);
      }
    }
  };

  return (
    <div className="rounded-2xl border border-line bg-tint/60 p-4 backdrop-blur-md">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="label">Live Position Sizer</span>
          {isUsStock && (
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 font-semibold">
              1.43x CAD Multiplied
            </span>
          )}
        </div>
        {isDetecting ? (
          <span className="flex items-center gap-1.5 text-[11px] font-mono text-gain animate-pulse">
            <Loader2 size={12} className="animate-spin" /> Detecting price...
          </span>
        ) : effectivePrice ? (
          <span className="flex items-center gap-1 text-[11px] font-mono font-semibold text-gain bg-gain/10 border border-gain/20 px-2 py-0.5 rounded-full">
            <Sparkles size={11} /> ${effectivePrice.toFixed(2)} CAD
          </span>
        ) : null}
      </div>

      {!ticker ? (
        <p className="text-xs text-ink-3">Enter a ticker to auto-detect price and sizing</p>
      ) : (
        <>
          {effectivePrice === null && (
            <label className="mb-3 flex items-center gap-3 text-xs text-ink-3">
              Price / share (CAD)
              <input
                className="field num w-28 py-1 font-bold text-ink"
                inputMode="decimal"
                placeholder="0.00"
                value={manual}
                onChange={(e) => setManual(e.target.value)}
              />
            </label>
          )}

          {/* Quick Allocation & Max Afford Buttons */}
          {onSelectQty && effectivePrice && effectivePrice > 0 && (
            <div className="mb-3 flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] text-ink-3 uppercase mr-1">Quick Size:</span>
              {[0.25, 0.5, 0.75].map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => handleQuickPercent(f)}
                  className="px-2 py-0.5 rounded-lg border border-line bg-tint text-[11px] font-medium text-ink-2 hover:border-line-focus hover:text-ink active:scale-95 transition-all cursor-pointer"
                >
                  {f * 100}%
                </button>
              ))}
              <button
                type="button"
                onClick={() => handleQuickPercent(1.0)}
                className={`px-2.5 py-0.5 rounded-lg border text-[11px] font-bold active:scale-95 transition-all cursor-pointer ${
                  action === 'buy'
                    ? 'border-gain/40 bg-gain/15 text-gain hover:bg-gain/25 shadow-sm shadow-gain/10'
                    : 'border-loss/40 bg-loss/15 text-loss hover:bg-loss/25'
                }`}
              >
                {action === 'buy' ? 'MAX AFFORD' : 'SELL ALL'}
              </button>
            </div>
          )}

          {value === null ? (
            <p className="text-xs text-ink-3">
              {quantity > 0 ? 'Detecting price...' : 'Enter quantity to preview valuation in CAD'}
            </p>
          ) : (
            <dl className="num grid grid-cols-[1fr_auto] gap-x-6 gap-y-1.5 text-xs">
              <dt className="text-ink-3">Price Per Share</dt>
              <dd className="text-right text-ink font-semibold">
                ${effectivePrice?.toFixed(2)} CAD
                {isUsStock && (
                  <span className="text-[10px] font-mono text-cyan-400 block font-normal">
                    (x1.43 CAD converted)
                  </span>
                )}
              </dd>
              <dt className="text-ink-3">Order Subtotal</dt>
              <dd className="text-right text-ink font-mono">{money(value)} CAD</dd>
              <dt className="text-ink-3">Exchange Fee</dt>
              <dd className="text-right text-ink-3 font-mono">$25.00 CAD</dd>
              {action === 'sell' && held?.returnDollar !== undefined && (
                <>
                  <dt className="text-ink-3">All-Time Return on Stock</dt>
                  <dd
                    className={`text-right font-bold font-mono ${
                      held.returnDollar > 0 ? 'text-gain' : held.returnDollar < 0 ? 'text-loss' : 'text-ink-3'
                    }`}
                  >
                    {held.returnDollar > 0 ? '+' : ''}{money(held.returnDollar)} ({held.returnPercent !== undefined ? `${held.returnPercent > 0 ? '+' : ''}${held.returnPercent.toFixed(1)}%` : '0%'})
                  </dd>
                </>
              )}
              <dt className="text-ink font-semibold pt-1 border-t border-line">
                {action === 'buy' ? 'Total Required' : 'Estimated Net Proceeds'}
              </dt>
              <dd
                className={`text-right font-bold pt-1 border-t border-line font-mono ${
                  action === 'buy' ? 'text-gain' : 'text-ink'
                }`}
              >
                {money(totalCost ?? 0)} CAD
              </dd>
              <dt className="text-ink-3">% of Total Equity</dt>
              <dd className="text-right text-ink font-mono">{pct !== null ? `${pct.toFixed(1)}%` : '—'}</dd>
            </dl>
          )}

          {pct !== null && pct > OVERSIZED_PCT && (
            <p className="mt-2 text-[11px] text-loss">⚠ Oversized position (&gt;{OVERSIZED_PCT}% of equity).</p>
          )}

          {action === 'buy' && totalCost !== null && totalCost > buyingPower && (
            <p className="mt-2 text-[11px] text-loss font-semibold">
              ⚠ Exceeds available buying power ({money(buyingPower)} CAD max).
            </p>
          )}
        </>
      )}
    </div>
  );
}
