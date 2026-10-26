import { useMemo, useState } from 'react';
import { Eye, X } from 'lucide-react';
import type { HistoryPoint, TeamWithDelta } from '../types';
import { api } from '../lib/api';
import { money, signedMoney } from '../lib/format';

const KEY = 'investja.rivals';
const load = (): string[] => {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
};

interface Props { teams: TeamWithDelta[]; history: HistoryPoint[]; myTeam: string; onOpenTeam: (name: string) => void }

function Spark({ values, tone }: { values: number[]; tone: string }) {
  if (values.length < 2) return <div className="h-7 w-20" />;
  const lo = Math.min(...values), hi = Math.max(...values), span = hi - lo || 1;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * 80},${26 - ((v - lo) / span) * 24}`).join(' ');
  return (
    <svg viewBox="0 0 80 28" className="h-7 w-20 shrink-0" aria-hidden>
      <polyline points={pts} fill="none" stroke={tone} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export function RivalWatch({ teams, history, myTeam, onOpenTeam }: Props) {
  const [pinned, setPinned] = useState<string[]>(load);
  const [input, setInput] = useState('');
  const me = teams.find((t) => t.name === myTeam);

  const save = (next: string[]) => {
    setPinned(next);
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* storage blocked */ }
  };

  function pin() {
    const hit = teams.find((t) => t.name.toLowerCase() === input.trim().toLowerCase());
    if (!hit || pinned.includes(hit.name) || pinned.length >= 5) return;
    save([...pinned, hit.name]);
    void api.track(hit.name).catch(() => {}); // server starts recording this team's per-minute history
    setInput('');
  }

  const rows = useMemo(
    () => pinned.map((name) => {
      const t = teams.find((x) => x.name === name);
      const series = history.map((p) => p.eq[name]?.[0]).filter((v): v is number => v != null).slice(-60);
      const hourAgo = series.length > 1 ? series[0] : null;
      return { name, t, series, change: t && hourAgo != null ? t.equity - hourAgo : null };
    }),
    [pinned, teams, history],
  );

  return (
    <section className="card p-5 sm:p-6">
      <div className="mb-4 flex items-center gap-2.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-warn/40 bg-warn/15 text-warn"><Eye size={18} /></div>
        <div>
          <h2 className="text-base font-bold tracking-tight text-ink">Rival Watch</h2>
          <p className="text-xs text-ink-3">Pin up to 5 teams and see the gap to you</p>
        </div>
      </div>

      <div className="mb-4 flex gap-2">
        <input list="rival-names" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && pin()} placeholder="Team name…" className="field py-2 text-xs" />
        <datalist id="rival-names">{teams.slice(0, 200).map((t) => <option key={t.name} value={t.name} />)}</datalist>
        <button type="button" onClick={pin} className="btn-primary px-4 text-xs">Pin</button>
      </div>

      {rows.length === 0 ? (
        <p className="text-xs text-ink-3">No rivals pinned. Pin the team above you to watch the gap close.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map(({ name, t, series, change }) => {
            const gap = t && me ? t.equity - me.equity : null;
            return (
              <li key={name} className="flex items-center gap-3 rounded-xl border border-line/60 bg-tint/30 px-3 py-2">
                <button type="button" onClick={() => onOpenTeam(name)} className="min-w-0 flex-1 text-left">
                  <div className="truncate text-sm font-semibold text-ink">{t ? `#${t.rank} ` : ''}{name}</div>
                  <div className="num text-[11px] text-ink-3">
                    {t ? money(t.equity, 0) : 'not on the board'}
                    {gap != null && <span className={gap > 0 ? ' text-loss' : ' text-gain'}> · {gap > 0 ? `${signedMoney(gap, 0)} ahead of you` : `${money(-gap, 0)} behind you`}</span>}
                  </div>
                </button>
                <Spark values={series} tone={change != null && change < 0 ? 'var(--loss)' : 'var(--gain)'} />
                <button type="button" onClick={() => save(pinned.filter((n) => n !== name))} aria-label={`Unpin ${name}`} className="text-ink-3 hover:text-loss"><X size={14} /></button>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-3 text-[11px] text-ink-3">Shows equity and rank only. The game doesn't expose other teams' trades.</p>
    </section>
  );
}
