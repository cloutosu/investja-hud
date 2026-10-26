import { useCallback, useEffect, useState } from 'react';
import { Target, Trash2 } from 'lucide-react';
import type { ExitKind, Portfolio, TakeProfitRule } from '../types';
import { api } from '../lib/api';
import { int, money } from '../lib/format';
import { useToast } from './Toaster';

interface Props {
  portfolio: Portfolio | null;
  account: string;
  canTrade: boolean;
}

const KIND_LABEL: Record<ExitKind, string> = { tp: 'Take profit', sl: 'Stop loss', trail: 'Trailing stop' };
const KIND_TONE: Record<ExitKind, string> = { tp: 'text-gain', sl: 'text-loss', trail: 'text-warn' };

const left = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m ${s % 60}s`;
};

function goalText(r: TakeProfitRule): string {
  const k = r.kind ?? 'tp';
  if (k === 'tp') return r.targetPct ? `+${r.targetPct}%` : money(r.targetPrice ?? 0);
  if (k === 'sl') return r.stopPct ? `-${r.stopPct}%` : money(r.stopPrice ?? 0);
  return `-${r.trailPct}% from peak${r.peak ? ` (${money(r.peak)})` : ''}`;
}

function statusLine(r: TakeProfitRule, now: number): string {
  if (r.status === 'done') return `sold ${int(r.soldQuantity ?? 0)} @ ${money(r.soldPrice ?? 0)}`;
  if (r.status === 'no-position') return 'position gone, disarm';
  if (r.holdReleaseAt && now < r.holdReleaseAt) return `hold releases in ${left(r.holdReleaseAt - now)}`;
  if (r.status === 'holding') return r.lastError ?? 'server still holding, retrying';
  return r.lastError ? `retrying: ${r.lastError}` : 'armed, watching price';
}

export function TakeProfit({ portfolio, account, canTrade }: Props) {
  const toast = useToast();
  const [rules, setRules] = useState<TakeProfitRule[]>([]);
  const [now, setNow] = useState(Date.now());
  const [ticker, setTicker] = useState('');
  const [kind, setKind] = useState<ExitKind>('tp');
  const [mode, setMode] = useState<'pct' | 'price'>('pct');
  const [target, setTarget] = useState('');
  const [qty, setQty] = useState('all');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.takeProfit(account);
      setRules(Array.isArray(res) ? res : []);
    } catch {
      /* keep current view */
    }
  }, [account]);

  useEffect(() => {
    void load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const holdings = portfolio?.holdings ?? [];
  const picked = holdings.find((h) => h.ticker === ticker);
  const pctOnly = kind === 'trail';

  async function arm() {
    if (!picked || busy) return;
    const t = Number(target);
    if (!(t > 0)) return toast('Enter a value above 0', 'error');
    const q = qty === 'all' ? 'all' : Number(qty);
    const usePct = pctOnly || mode === 'pct';
    const field = kind === 'tp' ? (usePct ? 'targetPct' : 'targetPrice') : kind === 'sl' ? (usePct ? 'stopPct' : 'stopPrice') : 'trailPct';
    setBusy(true);
    try {
      const res = await api.armTakeProfit({ exchange: String(picked.exchange), ticker: picked.ticker, quantity: q, kind, [field]: t, account });
      if (!res.success) throw new Error(res.message);
      toast(`${KIND_LABEL[kind]} armed on ${picked.ticker}`, 'info');
      setTarget('');
      void load();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function disarm(r: TakeProfitRule) {
    try {
      await api.disarmTakeProfit(r.id);
      setRules((prev) => prev.filter((x) => x.id !== r.id));
      toast(`${KIND_LABEL[r.kind ?? 'tp']} on ${r.ticker} disarmed`, 'info');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }

  return (
    <section className="card p-5 sm:p-7">
      <div className="flex items-center gap-2.5 pb-4 mb-4 border-b border-line/60">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-gain/40 bg-gain/15 text-gain shadow-sm">
          <Target size={18} />
        </div>
        <div>
          <h2 className="text-base sm:text-lg font-bold tracking-tight text-ink">Exit Rules</h2>
          <p className="text-xs text-ink-3">Take profit, stop loss and trailing stop. Fires only after the 1 h hold; the first to fill cancels the others</p>
        </div>
      </div>

      {canTrade && (
        <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-6">
          <select value={ticker} onChange={(e) => setTicker(e.target.value)} className="col-span-2 rounded-xl border border-line bg-tint/40 px-3 py-2 text-xs">
            <option value="">Holding…</option>
            {holdings.map((h) => (
              <option key={h.ticker} value={h.ticker}>{h.ticker} · {int(h.quantity)}</option>
            ))}
          </select>
          <select value={kind} onChange={(e) => setKind(e.target.value as ExitKind)} className="rounded-xl border border-line bg-tint/40 px-3 py-2 text-xs">
            {(Object.keys(KIND_LABEL) as ExitKind[]).map((k) => (
              <option key={k} value={k}>{KIND_LABEL[k]}</option>
            ))}
          </select>
          <select
            value={pctOnly ? 'pct' : mode}
            onChange={(e) => setMode(e.target.value as 'pct' | 'price')}
            disabled={pctOnly}
            className="rounded-xl border border-line bg-tint/40 px-3 py-2 text-xs disabled:opacity-60"
          >
            <option value="pct">{pctOnly ? '% below peak' : kind === 'sl' ? '% below avg buy' : '% above avg buy'}</option>
            {!pctOnly && <option value="price">Price (CAD)</option>}
          </select>
          <input
            inputMode="decimal"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder={pctOnly || mode === 'pct' ? '5' : picked ? String(picked.currentPrice) : '0.00'}
            className="rounded-xl border border-line bg-tint/40 px-3 py-2 font-mono text-xs"
          />
          <div className="flex gap-2">
            <input
              value={qty}
              onChange={(e) => setQty(e.target.value.trim().toLowerCase())}
              placeholder="all"
              aria-label="Quantity"
              className="w-full min-w-0 rounded-xl border border-line bg-tint/40 px-3 py-2 font-mono text-xs"
            />
            <button
              type="button"
              onClick={arm}
              disabled={!picked || busy}
              className="rounded-xl border border-accent/40 bg-accent/15 px-3 py-2 text-xs font-bold text-accent hover:bg-accent/25 disabled:opacity-40 cursor-pointer"
            >
              Arm
            </button>
          </div>
        </div>
      )}

      {rules.length === 0 ? (
        <p className="text-xs text-ink-3">No exit rules armed.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rules.map((r) => {
            const k = r.kind ?? 'tp';
            const h = holdings.find((x) => x.ticker === r.ticker);
            return (
              <li key={r.id} className="flex items-center justify-between gap-3 rounded-xl border border-line/60 bg-tint/30 px-3 py-2">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-ink">
                    {r.ticker}{' '}
                    <span className={`text-[11px] font-bold uppercase tracking-wide ${KIND_TONE[k]}`}>{KIND_LABEL[k]}</span>{' '}
                    <span className="font-mono text-xs text-ink-3">→ {goalText(r)} · {r.quantity === 'all' ? 'all' : int(r.quantity)}</span>
                  </div>
                  <div className="truncate text-[11px] text-ink-3">
                    {statusLine(r, now)}
                    {h && r.status !== 'done' && <> · now {money(h.currentPrice)}</>}
                  </div>
                </div>
                {canTrade && r.status !== 'done' && (
                  <button type="button" onClick={() => disarm(r)} className="text-ink-3 hover:text-loss cursor-pointer" aria-label="Disarm">
                    <Trash2 size={15} />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
