import { memo, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronDown, ChevronUp, Search, Trophy, ShieldAlert, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import type { TeamWithDelta } from '../types';
import { deltaDecimals, int, money, signedMoney, tone } from '../lib/format';

type SortKey = 'rank' | 'equity' | 'delta';
const DEFAULT_ROWS = 50;
const ANIMATE_LIMIT = 200;

interface Props {
  teams: TeamWithDelta[];
  myTeam: string;
  onOpenTeam: (name: string) => void;
}

interface RowProps {
  team: TeamWithDelta;
  isMe: boolean;
  animate: boolean;
  onOpen: (name: string) => void;
}

const Row = memo(function Row({ team, isMe, animate, onOpen }: RowProps) {
  const d = team.deltaDollar;
  const isTop3 = team.rank <= 3;
  const isDangerZone = team.rank === 2 || team.rank === 3;

  const cells = (
    <>
      {/* Rank Column */}
      <td className="num w-10 pl-3 text-xs sm:w-16 sm:pl-4 sm:text-sm">
        {team.rank === 1 ? (
          <span className="inline-flex items-center gap-1 font-extrabold text-amber-400">
            🥇 <span className="hidden sm:inline">#1</span>
          </span>
        ) : team.rank === 2 ? (
          <span className="inline-flex items-center gap-1 font-bold text-slate-300">
            🥈 <span className="hidden sm:inline">#2</span>
          </span>
        ) : team.rank === 3 ? (
          <span className="inline-flex items-center gap-1 font-bold text-amber-600">
            🥉 <span className="hidden sm:inline">#3</span>
          </span>
        ) : (
          <span className="text-ink-3">#{int(team.rank)}</span>
        )}
      </td>

      {/* Team Name Column */}
      <td className="max-w-[9.5rem] truncate pr-2 sm:max-w-64 sm:pr-4 py-3">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={`font-semibold tracking-tight text-xs sm:text-sm ${isMe ? 'text-gain font-bold' : 'text-ink'}`}>
            {team.name}
          </span>
          {isMe && (
            <span className="num rounded-full bg-gain px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-black shadow-[0_0_10px_rgba(0,245,155,0.4)]">
              YOUR TEAM
            </span>
          )}
          {isDangerZone && !isMe && (
            <span className="rounded bg-rose-500/20 px-1.5 py-0.5 text-[9px] font-bold text-rose-300 border border-rose-500/30 hidden sm:inline-flex items-center gap-0.5">
              <ShieldAlert size={9} /> THREAT
            </span>
          )}
        </div>
        <div className="text-[11px] text-ink-3 truncate md:hidden">{team.school}</div>
      </td>

      {/* School Column */}
      <td className="hidden max-w-48 truncate pr-4 text-xs text-ink-3 md:table-cell">
        {team.school}
      </td>

      {/* Equity Column */}
      <td className="num pr-3 text-right text-xs font-bold sm:pr-4 sm:text-sm text-ink">
        {money(team.equity)}
      </td>

      {/* Delta Column */}
      <td className={`num pr-3 text-right text-xs sm:pr-4 sm:text-sm font-semibold ${tone(d)}`}>
        {d === 0 ? (
          <span className="text-ink-3">—</span>
        ) : (
          <span className="inline-flex items-center gap-0.5">
            {d > 0 ? <ArrowUpRight size={13} className="text-gain shrink-0" /> : <ArrowDownRight size={13} className="text-loss shrink-0" />}
            {signedMoney(d, deltaDecimals(d))}
          </span>
        )}
      </td>
    </>
  );

  let rowCls = `group h-13 cursor-pointer text-sm transition-all border-b border-line/40 `;
  if (isMe) {
    rowCls += `bg-gain/10 border-l-4 border-l-gain shadow-[inset_0_0_20px_rgba(0,245,155,0.06)] hover:bg-gain/15`;
  } else if (isTop3) {
    rowCls += `hover:bg-tint/80`;
  } else {
    rowCls += `hover:bg-tint/60`;
  }

  return animate ? (
    <motion.tr layout transition={{ duration: 0.22 }} className={rowCls} onClick={() => onOpen(team.name)}>
      {cells}
    </motion.tr>
  ) : (
    <tr className={rowCls} onClick={() => onOpen(team.name)}>
      {cells}
    </tr>
  );
});

function Th({
  label,
  k,
  sort,
  dir,
  onSort,
  className = ''
}: {
  label: string;
  k?: SortKey;
  sort: SortKey;
  dir: 1 | -1;
  onSort: (k: SortKey) => void;
  className?: string;
}) {
  const active = k === sort;
  return (
    <th className={`label h-9 text-left font-semibold tracking-wider ${className}`}>
      {k ? (
        <button
          onClick={() => onSort(k)}
          className={`inline-flex items-center gap-1 uppercase transition-colors hover:text-ink ${active ? 'text-accent font-bold' : 'text-ink-3'}`}
        >
          {label}
          {active && (dir === 1 ? <ChevronUp size={12} className="text-accent" /> : <ChevronDown size={12} className="text-accent" />)}
        </button>
      ) : (
        label
      )}
    </th>
  );
}

export function Leaderboard({ teams, myTeam, onOpenTeam }: Props) {
  const [showAll, setShowAll] = useState(false);
  const [sort, setSort] = useState<SortKey>('rank');
  const [dir, setDir] = useState<1 | -1>(1);
  const [query, setQuery] = useState('');

  const onSort = (k: SortKey) => {
    if (k === sort) setDir((d) => (d === 1 ? -1 : 1));
    else {
      setSort(k);
      setDir(k === 'rank' ? 1 : -1);
    }
  };

  const sorted = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q ? teams.filter((t) => t.name.toLowerCase().includes(q) || t.school.toLowerCase().includes(q)) : teams;
    const val = (t: TeamWithDelta) => (sort === 'rank' ? t.rank : sort === 'equity' ? t.equity : t.deltaDollar);
    return [...base].sort((a, b) => (val(a) - val(b)) * dir || a.rank - b.rank);
  }, [teams, sort, dir, query]);

  const visible = showAll || query ? sorted : sorted.slice(0, DEFAULT_ROWS);
  const animate = visible.length <= ANIMATE_LIMIT;

  return (
    <section className="card p-4 sm:p-6">
      {/* Header Row */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
            <Trophy size={18} />
          </div>
          <div>
            <div className="flex items-baseline gap-2">
              <h2 className="text-base sm:text-lg font-bold tracking-tight text-ink">Leaderboard</h2>
              <span className="num text-xs text-ink-3 font-semibold">({int(teams.length)} teams)</span>
            </div>
            <p className="text-[11px] text-ink-3 hidden sm:block">Click any row to inspect historical equity curve & trade projections</p>
          </div>
        </div>

        {/* Search & Filter Controls */}
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-56">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
            <input
              className="field !rounded-full !py-1.5 pl-8 pr-3 text-xs w-full"
              placeholder="Filter team or school..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <button className="btn shrink-0 text-xs" onClick={() => setShowAll((s) => !s)}>
            {showAll ? `Show top ${DEFAULT_ROWS}` : 'Show all'}
          </button>
        </div>
      </div>

      {/* Leaderboard Table */}
      <div className={`overflow-x-auto rounded-xl border border-line ${showAll ? 'max-h-[70vh]' : ''}`}>
        <table className="w-full border-collapse">
          <thead className="sticky top-0 z-10 bg-elevated/95 backdrop-blur-md border-b border-line">
            <tr>
              <Th label="Rank" k="rank" sort={sort} dir={dir} onSort={onSort} className="pl-3 sm:pl-4" />
              <Th label="Team" sort={sort} dir={dir} onSort={onSort} className="pl-2" />
              <Th label="School" sort={sort} dir={dir} onSort={onSort} className="hidden md:table-cell" />
              <Th label="Current Equity" k="equity" sort={sort} dir={dir} onSort={onSort} className="pr-3 text-right sm:pr-4" />
              <Th label="Live Δ" k="delta" sort={sort} dir={dir} onSort={onSort} className="pr-3 text-right sm:pr-4" />
            </tr>
          </thead>
          <tbody>
            {visible.map((t) => (
              <Row
                key={t.name}
                team={t}
                isMe={t.name === myTeam}
                animate={animate}
                onOpen={onOpenTeam}
              />
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={5} className="py-10 text-center text-sm text-ink-3">
                  No matching teams found for "{query}".
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
