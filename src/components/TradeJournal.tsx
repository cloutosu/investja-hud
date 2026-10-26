import { useCallback, useEffect, useMemo, useState } from 'react';
import { BookOpen } from 'lucide-react';
import type { JournalTrade } from '../types';
import { api } from '../lib/api';
import { etTime } from '../lib/market';
import { int, money, signedMoney } from '../lib/format';
import { useToast } from './Toaster';

interface Props { account: string; canTrade: boolean; refreshKey: number }

interface Closed { trade: JournalTrade; pnl: number; heldMs: number | null }

const dur = (ms: number) => {
  const m = Math.round(ms / 60000);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
};

// A sell counts as closed P&L when we logged both its fill price and the position's average cost.
export function summarize(trades: JournalTrade[]) {
  const lastBuy = new Map<string, number>();
  const closed: Closed[] = [];
  for (const t of [...trades].sort((a, b) => a.at - b.at)) {
    if (t.action === 'buy') { lastBuy.set(t.ticker, t.at); continue; }
    if (t.price == null || t.avg == null) continue;
    const bought = lastBuy.get(t.ticker);
    closed.push({ trade: t, pnl: (t.price - t.avg) * t.quantity, heldMs: bought ? t.at - bought : null });
  }
  const wins = closed.filter((c) => c.pnl > 0).length;
  const holds = closed.map((c) => c.heldMs).filter((x): x is number => x != null);
  return {
    closed,
    winRate: closed.length ? (wins / closed.length) * 100 : null,
    avgHold: holds.length ? holds.reduce((s, x) => s + x, 0) / holds.length : null,
    total: closed.reduce((s, c) => s + c.pnl, 0),
    best: closed.length ? closed.reduce((a, b) => (b.pnl > a.pnl ? b : a)) : null,
    worst: closed.length ? closed.reduce((a, b) => (b.pnl < a.pnl ? b : a)) : null,
  };
}

export function TradeJournal({ account, canTrade, refreshKey }: Props) {
  const toast = useToast();
  const [trades, setTrades] = useState<JournalTrade[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const load = useCallback(async () => {
    try { setTrades((await api.journal(account)).trades); } catch { /* keep current view */ }
  }, [account]);

  useEffect(() => {
    void load();
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, [load, refreshKey]);

  const stats = useMemo(() => summarize(trades), [trades]);
  const recent = useMemo(() => [...trades].sort((a, b) => b.at - a.at).slice(0, 12), [trades]);

  async function save(id: string) {
    try {
      await api.journalNote(id, draft, account);
      setTrades((prev) => prev.map((t) => (t.id === id ? { ...t, note: draft.trim() } : t)));
      setEditing(null);
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }

  const stat = (label: string, value: string, tone = 'text-ink') => (
    <div className="rounded-xl border border-line bg-tint/40 px-3 py-2">
      <div className="label text-[9px]">{label}</div>
      <div className={`num mt-0.5 text-sm font-bold ${tone}`}>{value}</div>
    </div>
  );

  return (
    <section className="card p-5 sm:p-7">
      <div className="mb-4 flex items-center gap-2.5 border-b border-line/60 pb-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-accent/40 bg-accent/15 text-accent">
          <BookOpen size={18} />
        </div>
        <div>
          <h2 className="text-base font-bold tracking-tight text-ink sm:text-lg">Trade Journal</h2>
          <p className="text-xs text-ink-3">Win rate, hold time and a note on every order</p>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2">
        {stat('Closed trades', int(stats.closed.length))}
        {stat('Win rate', stats.winRate == null ? '—' : `${stats.winRate.toFixed(0)}%`, stats.winRate != null && stats.winRate >= 50 ? 'text-gain' : 'text-loss')}
        {stat('Realized P&L', stats.closed.length ? signedMoney(stats.total) : '—', stats.total >= 0 ? 'text-gain' : 'text-loss')}
        {stat('Avg hold', stats.avgHold == null ? '—' : dur(stats.avgHold))}
        {stat('Best', stats.best ? `${stats.best.trade.ticker} ${signedMoney(stats.best.pnl, 0)}` : '—', 'text-gain')}
        {stat('Worst', stats.worst ? `${stats.worst.trade.ticker} ${signedMoney(stats.worst.pnl, 0)}` : '—', 'text-loss')}
      </div>

      {recent.length === 0 ? (
        <p className="text-xs text-ink-3">No orders logged yet. Trades placed here show up with their notes.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {recent.map((t) => (
            <li key={t.id} className="rounded-xl border border-line/60 bg-tint/30 px-3 py-2">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="font-semibold text-ink">
                  <span className={t.action === 'buy' ? 'text-gain' : 'text-loss'}>{t.action.toUpperCase()}</span> {int(t.quantity)} {t.ticker}
                  {t.price != null && <span className="font-mono text-ink-3"> @ {money(t.price)}</span>}
                </span>
                <span className="shrink-0 font-mono text-[10px] text-ink-3">{etTime(t.at)} · {t.source}</span>
              </div>
              {editing === t.id ? (
                <div className="mt-2 flex gap-2">
                  <input autoFocus value={draft} maxLength={500} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void save(t.id)} className="field py-1.5 text-xs" placeholder="Why this trade?" />
                  <button type="button" onClick={() => save(t.id)} className="btn-primary px-3 text-xs">Save</button>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={!canTrade}
                  onClick={() => { setEditing(t.id); setDraft(t.note ?? ''); }}
                  className="mt-1 block w-full text-left text-[11px] text-ink-3 enabled:hover:text-ink disabled:cursor-default"
                >
                  {t.note ? t.note : canTrade ? '+ add a note' : ''}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
