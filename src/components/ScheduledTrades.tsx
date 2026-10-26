import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CalendarClock,
  Clock,
  Trash2,
  ArrowDownLeft,
  Plus,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  ShieldAlert,
} from 'lucide-react';
import type { ScheduledTrade } from '../types';
import type { TradeInit } from './TradeModal';
import { api } from '../lib/api';
import { etTime } from '../lib/market';
import { int } from '../lib/format';
import { useToast } from './Toaster';

interface Props {
  refreshKey: number;
  account?: string;
  onScheduleNew?: (init: TradeInit) => void;
  onTrade?: (init: TradeInit) => void;
}

function timeUntil(targetMs: number, now: number): string {
  const diff = targetMs - now;
  if (diff <= 0) return 'Executing now…';
  const totalSecs = Math.floor(diff / 1000);
  const hours = Math.floor(totalSecs / 3600);
  const mins = Math.floor((totalSecs % 3600) / 60);
  const secs = totalSecs % 60;

  if (hours > 0) return `in ${hours}h ${mins}m`;
  if (mins > 0) return `in ${mins}m ${secs}s`;
  return `in ${secs}s`;
}

export function ScheduledTrades({ refreshKey, account, onScheduleNew, onTrade }: Props) {
  const toast = useToast();
  const [items, setItems] = useState<ScheduledTrade[]>([]);
  const [loading, setLoading] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.scheduledTrades(account);
      setItems(Array.isArray(res) ? res : []);
    } catch {
      // Backend offline or error: retain current view
    } finally {
      setLoading(false);
    }
  }, [account]);

  useEffect(() => {
    void load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [load, refreshKey]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  async function cancel(trade: ScheduledTrade) {
    if (cancellingId) return;
    setCancellingId(trade.id);
    try {
      await api.cancelScheduled(trade.id);
      setItems((prev) => prev.filter((t) => t.id !== trade.id));
      toast(
        `Scheduled ${trade.action.toUpperCase()} order for ${int(trade.quantity)} ${trade.ticker} was cancelled.`,
        'info'
      );
    } catch (e) {
      toast(`Failed to cancel: ${(e as Error).message}`, 'error');
    } finally {
      setCancellingId(null);
    }
  }

  const sells = items.filter((t) => t.action === 'sell');

  return (
    <section className="card p-5 sm:p-7 relative overflow-hidden">
      {/* Background ambient decorative glow */}
      <div
        className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full opacity-30 blur-3xl"
        style={{ background: 'radial-gradient(circle, var(--accent), transparent)' }}
      />

      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 mb-4 border-b border-line/60">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-amber-500/40 bg-amber-500/15 text-amber-400 shadow-sm">
            <CalendarClock size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-bold tracking-tight text-ink">
                Scheduled Trades
              </h2>
              <span className="rounded-full bg-tint-2 border border-line px-2 py-0.5 text-[10px] font-mono font-bold text-ink-2">
                {items.length} {items.length === 1 ? 'ORDER' : 'ORDERS'}
              </span>
            </div>
            <p className="text-xs text-ink-3">
              Automated orders executed by the server when target time arrives
            </p>
          </div>
        </div>

        {/* Quick action buttons */}
        <div className="flex items-center gap-2">
          {onTrade && (
            <>
              <button
                type="button"
                onClick={() => onTrade({ action: 'buy' })}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-gain/40 bg-gain/15 text-gain text-xs font-bold hover:bg-gain/25 active:scale-95 transition-all shadow-sm cursor-pointer"
              >
                <Plus size={13} className="stroke-[3]" />
                <span>Buy Stock</span>
              </button>
              <button
                type="button"
                onClick={() => onTrade({ action: 'sell' })}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-loss/40 bg-loss/15 text-loss text-xs font-bold hover:bg-loss/25 active:scale-95 transition-all shadow-sm cursor-pointer"
              >
                <ArrowDownLeft size={13} className="stroke-[3]" />
                <span>Sell Holding</span>
              </button>
            </>
          )}
          {onScheduleNew && (
            <button
              type="button"
              onClick={() => onScheduleNew({ mode: 'schedule' })}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-amber-500/50 bg-amber-500/20 text-amber-300 text-xs font-bold hover:bg-amber-500/30 active:scale-95 transition-all shadow-sm cursor-pointer"
            >
              <CalendarClock size={13} />
              <span>+ Schedule Order</span>
            </button>
          )}
          <button
            type="button"
            onClick={load}
            disabled={loading}
            title="Refresh scheduled queue"
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-line bg-tint text-ink-3 hover:text-ink active:scale-95 transition-all cursor-pointer"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Critical Warning if any SELL orders are queued */}
      {sells.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-4 flex items-start gap-3 rounded-2xl border border-loss/40 bg-loss/10 p-3.5 text-xs text-loss"
        >
          <ShieldAlert size={18} className="shrink-0 text-loss mt-0.5" />
          <div className="flex-1">
            <span className="font-bold uppercase tracking-wider block">
              Notice: {sells.length} Scheduled Sale {sells.length === 1 ? 'Order' : 'Orders'} Active
            </span>
            <p className="text-[11px] text-ink-2 mt-0.5 leading-relaxed">
              When the scheduled timer expires, the server will automatically liquidate these shares on InvestJA.
              Review the sale list below or hit Cancel Sale if you want to keep your position.
            </p>
          </div>
        </motion.div>
      )}

      {/* Orders List */}
      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-line/60 bg-tint/20 py-10 px-4 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-line bg-tint text-ink-3 mb-3">
            <CalendarClock size={22} className="opacity-60" />
          </div>
          <h3 className="text-sm font-semibold text-ink">No Scheduled Trades</h3>
          <p className="text-xs text-ink-3 max-w-sm mt-1 mb-4">
            You have zero pending buy or sell orders. You can schedule trades to automatically execute at market open (9:35 AM ET) or any future time.
          </p>
          {onScheduleNew && (
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => onScheduleNew({ mode: 'schedule', action: 'buy' })}
                className="btn btn-primary text-xs font-bold px-3.5 py-1.5 cursor-pointer"
              >
                Schedule Buy
              </button>
              <button
                type="button"
                onClick={() => onScheduleNew({ mode: 'schedule', action: 'sell' })}
                className="btn text-xs font-bold px-3.5 py-1.5 cursor-pointer"
              >
                Schedule Sell
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <AnimatePresence initial={false}>
            {items.map((trade) => {
              const isSell = trade.action === 'sell';
              const runAt = Math.max(trade.executeAt, trade.effectiveAt ?? 0);
              const heldBack = runAt > trade.executeAt;
              const countdown = timeUntil(runAt, now);
              const isPast = runAt <= now;
              const isCancelling = cancellingId === trade.id;

              return (
                <motion.div
                  key={trade.id}
                  layout
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                  className={`group relative flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border p-4 transition-all ${
                    isSell
                      ? 'border-loss/40 bg-loss/5 hover:border-loss/60 shadow-sm shadow-loss/5'
                      : 'border-gain/40 bg-gain/5 hover:border-gain/60 shadow-sm shadow-gain/5'
                  }`}
                >
                  <div className="flex items-start gap-3.5 min-w-0">
                    <div
                      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl font-bold shadow-sm ${
                        isSell
                          ? 'border border-loss/40 bg-loss/20 text-loss'
                          : 'border border-gain/40 bg-gain/20 text-gain'
                      }`}
                    >
                      {isSell ? <TrendingDown size={20} /> : <TrendingUp size={20} />}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-mono font-extrabold uppercase tracking-wider ${
                            isSell
                              ? 'bg-loss/20 text-loss border border-loss/30'
                              : 'bg-gain/20 text-gain border border-gain/30'
                          }`}
                        >
                          {isSell ? '🚨 SCHEDULED SELL' : '⚡ SCHEDULED BUY'}
                        </span>
                        <span className="font-bold text-sm text-ink tracking-tight">
                          {int(trade.quantity)} {trade.ticker}
                        </span>
                        <span className="text-[11px] font-mono text-ink-3">
                          on {trade.exchange}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-2.5 mt-1.5 text-xs text-ink-2">
                        <span className="flex items-center gap-1 font-mono text-[11px] text-ink">
                          <Clock size={12} className="text-accent" />
                          <span>{etTime(runAt)} ET</span>
                        </span>
                        <span className="text-ink-3">·</span>
                        <span
                          className={`font-semibold font-mono text-[11px] px-1.5 py-0.5 rounded ${
                            isPast
                              ? 'bg-amber-500/20 text-amber-300'
                              : isSell
                              ? 'bg-loss/15 text-loss'
                              : 'bg-gain/15 text-gain'
                          }`}
                        >
                          {countdown}
                        </span>
                        {heldBack && (
                          <span className="text-[10px] font-mono text-warn">waits for the 1 h hold (was {etTime(trade.executeAt)})</span>
                        )}
                        {trade.attempts > 0 && (
                          <span className="text-[10px] font-mono text-warn">
                            (Attempt {trade.attempts})
                          </span>
                        )}
                      </div>

                      {isSell && (
                        <p className="text-[11px] text-loss/90 font-medium mt-1">
                          ⚠️ This order will liquidate {int(trade.quantity)} shares from your portfolio when the timer hits.
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Cancel Button */}
                  <div className="flex items-center sm:justify-end gap-2 pt-2 sm:pt-0 border-t sm:border-t-0 border-line/40">
                    <button
                      type="button"
                      disabled={isCancelling}
                      onClick={() => cancel(trade)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                        isSell
                          ? 'border-loss/50 bg-loss/20 text-loss hover:bg-loss/30 active:scale-95 shadow-sm shadow-loss/10'
                          : 'border-line-strong bg-tint/80 text-ink-2 hover:border-loss/60 hover:text-loss hover:bg-loss/10 active:scale-95'
                      }`}
                    >
                      <Trash2 size={13} className={isCancelling ? 'animate-spin' : ''} />
                      <span>{isSell ? 'Cancel Scheduled Sale' : 'Cancel Order'}</span>
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </section>
  );
}
