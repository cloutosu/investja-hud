import { useEffect, useState } from 'react';
import { BellRing } from 'lucide-react';
import type { Portfolio } from '../types';
import { etParts, zonedToMs } from '../lib/market';

interface Props { portfolio: Portfolio | null; holds: Record<string, number> }

const WARN_BEFORE = 90 * 60 * 1000;

// Within 90 min of the 4:00 PM ET bell: countdown, plus positions whose hold won't clear in time.
export function CloseBanner({ portfolio, holds }: Props) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const p = etParts(now);
  if (p.wd < 1 || p.wd > 5) return null;
  const close = zonedToMs(p.y, p.m, p.d, 16, 0);
  const left = close - now;
  if (left <= 0 || left > WARN_BEFORE) return null;

  const stuck = (portfolio?.holdings ?? []).filter((h) => (holds[h.ticker] ?? 0) > close).map((h) => h.ticker);
  const mm = String(Math.floor(left / 60000)).padStart(2, '0');
  const ss = String(Math.floor((left % 60000) / 1000)).padStart(2, '0');

  return (
    <div className="flex items-start gap-3 rounded-2xl border border-warn/40 bg-warn/10 px-4 py-3 text-xs text-warn" role="status">
      <BellRing size={16} className="mt-0.5 shrink-0" />
      <div className="min-w-0">
        <div className="font-bold">Market closes in <span className="num">{mm}:{ss}</span></div>
        <div className="text-ink-2">
          {stuck.length
            ? `${stuck.join(', ')} won't clear the 1 h hold before the bell. Selling waits until the next open.`
            : 'Every position you bought here is sellable before the bell.'}
        </div>
      </div>
    </div>
  );
}
