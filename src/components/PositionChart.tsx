import { useEffect, useMemo, useState } from 'react';
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Holding, PricePoint, TakeProfitRule } from '../types';
import { api } from '../lib/api';
import { etTime } from '../lib/market';
import { money, signedPct } from '../lib/format';
import { useTheme } from '../lib/theme';
import { Modal } from './Modal';

interface Props { holding: Holding; account: string; onClose: () => void }

export function PositionChart({ holding, account, onClose }: Props) {
  const { colors } = useTheme();
  const [points, setPoints] = useState<PricePoint[]>([]);
  const [rules, setRules] = useState<TakeProfitRule[]>([]);

  useEffect(() => {
    api.prices(account).then((r) => setPoints(r.points)).catch(() => {});
    api.takeProfit(account).then((r) => setRules(Array.isArray(r) ? r.filter((x) => x.ticker === holding.ticker && x.status !== 'done') : [])).catch(() => {});
  }, [account, holding.ticker]);

  const data = useMemo(
    () => points.filter((p) => p.p[holding.ticker] !== undefined).map((p) => ({ t: p.t, price: p.p[holding.ticker] })),
    [points, holding.ticker],
  );

  const avg = holding.avgBuyPrice;
  // reference lines: entry, plus each armed exit resolved to a price where possible
  const lines: { y: number; label: string; color: string }[] = [];
  if (avg) lines.push({ y: avg, label: `Entry ${money(avg)}`, color: colors.ink3 });
  for (const r of rules) {
    const k = r.kind ?? 'tp';
    if (k === 'tp') {
      const y = r.targetPrice ?? (r.targetPct && avg ? avg * (1 + r.targetPct / 100) : null);
      if (y) lines.push({ y, label: `TP ${money(y)}`, color: colors.gain });
    } else if (k === 'sl') {
      const y = r.stopPrice ?? (r.stopPct && avg ? avg * (1 - r.stopPct / 100) : null);
      if (y) lines.push({ y, label: `SL ${money(y)}`, color: colors.loss });
    } else if (r.peak && r.trailPct) {
      const y = r.peak * (1 - r.trailPct / 100);
      lines.push({ y, label: `Trail ${money(y)}`, color: colors.accent });
    }
  }

  const ys = [...data.map((d) => d.price), ...lines.map((l) => l.y)];
  const lo = ys.length ? Math.min(...ys) : 0;
  const hi = ys.length ? Math.max(...ys) : 1;
  const pad = (hi - lo || hi * 0.01) * 0.12;
  const up = (holding.returnDollar ?? 0) >= 0;

  return (
    <Modal title={`${holding.ticker} · ${holding.exchange}`} onClose={onClose} width="sm:max-w-2xl">
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <div className="num text-2xl font-bold text-ink">{money(holding.currentPrice)}</div>
          <div className="text-xs text-ink-3">{holding.quantity} shares{avg ? ` @ avg ${money(avg)}` : ''}</div>
        </div>
        {holding.returnPercent !== undefined && (
          <span className={`num rounded-full border px-3 py-1 text-xs font-bold ${up ? 'border-gain/40 bg-gain/15 text-gain' : 'border-loss/40 bg-loss/15 text-loss'}`}>
            {signedPct(holding.returnPercent)}
          </span>
        )}
      </div>
      <div className="h-64 w-full">
        {data.length < 2 ? (
          <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-line text-xs text-ink-3">
            Price history builds up minute by minute. Check back shortly.
          </div>
        ) : (
          <ResponsiveContainer>
            <LineChart data={data} margin={{ top: 8, right: 96, bottom: 0, left: 0 }}>
              <CartesianGrid stroke={colors.ink3} strokeOpacity={0.12} vertical={false} />
              <XAxis dataKey="t" tickFormatter={(t) => etTime(t)} tick={{ fill: colors.ink3, fontSize: 10 }} axisLine={false} tickLine={false} minTickGap={48} />
              <YAxis domain={[lo - pad, hi + pad]} tickFormatter={(v) => v.toFixed(2)} tick={{ fill: colors.ink3, fontSize: 10 }} axisLine={false} tickLine={false} width={52} />
              <Tooltip
                formatter={(v) => [money(Number(v)), 'Price']}
                labelFormatter={(t) => etTime(Number(t))}
                contentStyle={{ background: 'var(--surface-2)', border: '1px solid var(--line-strong)', borderRadius: 12, fontSize: 12 }}
              />
              {lines.map((l) => (
                <ReferenceLine key={l.label} y={l.y} stroke={l.color} strokeDasharray="5 4" label={{ value: l.label, fill: l.color, fontSize: 10, position: 'right' }} />
              ))}
              <Line type="monotone" dataKey="price" stroke={up ? colors.gain : colors.loss} strokeWidth={2.2} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
      {!!lines.length && <p className="mt-3 text-[11px] text-ink-3">Dashed lines: your entry and any armed exit rules.</p>}
    </Modal>
  );
}
