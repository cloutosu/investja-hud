import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useAnimationControls } from 'framer-motion';
import { ArrowDownLeft, CalendarClock, Lock, Plus, Trophy, Wallet, Zap, Layers, AlertCircle, ArrowRightLeft } from 'lucide-react';
import type { AccountMeta, HistoryPoint, MoverKey, MoverRow, Pulse, TeamWithDelta } from '../types';
import { int, money, signedMoney, signedPct } from '../lib/format';
import { etParts, etTime } from '../lib/market';
import { setTheme, THEMES, useTheme, type ThemeId } from '../lib/theme';
import { AnimatedNumber } from './AnimatedNumber';
import { EquityChart, type ChartMode, type ChartPoint, type ChartRange } from './EquityChart';
import type { TradeInit } from './TradeModal';

interface Props {
  teamName: string;
  equity: number | null;
  dayDelta: { dollar: number; percent: number } | null;
  anchorEquity: number | null;
  cash: number;
  loan: number;
  positions: number;
  live: boolean;
  marketOpen: boolean;
  pulse: Pulse | null;
  history: HistoryPoint[];
  mine: Partial<Record<MoverKey, MoverRow | null>>;
  canTrade: boolean;
  onTrade: (init: TradeInit) => void;
  onScheduleTab?: () => void;
  onLock: () => void;
  teams?: TeamWithDelta[];
  activeAccountId?: string;
  onSwitchAccount?: (accountId: string) => void;
  accounts?: AccountMeta[];
}

const MAX_LOAN = 50000;

function greeting() {
  const h = etParts().h;
  return h < 5 ? 'Good evening' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export function ThemeDots() {
  const { id } = useTheme();
  return (
    <div className="flex items-center gap-1.5 rounded-full border border-line-strong bg-tint/80 p-1" role="radiogroup" aria-label="Theme">
      {(Object.keys(THEMES) as ThemeId[]).map((t) => (
        <button
          key={t}
          role="radio"
          aria-checked={id === t}
          title={THEMES[t].label}
          onClick={() => setTheme(t)}
          className={`h-5 w-5 rounded-full border transition-transform ${id === t ? 'scale-110 border-line-focus shadow-sm' : 'border-transparent opacity-60 hover:opacity-100'}`}
          style={{ background: t === 'midnight' ? 'linear-gradient(135deg,#7c6cff,#0a0c12)' : t === 'frost' ? 'linear-gradient(135deg,#ffffff,#4f46e5)' : 'linear-gradient(135deg,#f4ece5,#c2410c)' }}
        />
      ))}
    </div>
  );
}

function Toggle<T extends string>({ value, options, onChange }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="relative flex rounded-full border border-line-strong bg-tint/60 p-0.5">
      {options.map((o) => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          className={`relative z-10 rounded-full px-3 py-1 text-xs font-medium transition-colors ${value === o.id ? 'text-ink' : 'text-ink-3 hover:text-ink'}`}
        >
          {value === o.id && (
            <motion.span
              layoutId={`tg-${options[0].id}`}
              className="absolute inset-0 -z-10 rounded-full bg-tint-2 shadow-sm"
              transition={{ type: 'spring', stiffness: 450, damping: 35 }}
            />
          )}
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function TopBar({
  teamName,
  equity,
  dayDelta,
  anchorEquity,
  cash,
  loan,
  positions,
  live,
  marketOpen,
  pulse,
  history,
  mine,
  canTrade,
  onTrade,
  onScheduleTab,
  onLock,
  teams,
  activeAccountId = '11780',
  onSwitchAccount,
}: Props) {
  const { colors } = useTheme();
  const glow = useAnimationControls();
  const color = useAnimationControls();
  const [floater, setFloater] = useState<Pulse | null>(null);
  const [mode, setMode] = useState<ChartMode>('equity');
  const [range, setRange] = useState<ChartRange>('1h');
  const [scrub, setScrub] = useState<ChartPoint | null>(null);
  const [flashSign, setFlashSign] = useState(1);

  // Live Team Ranking & Championship Gap Calculations
  const myTeam =
    teams?.find((t) => t.name.toLowerCase() === teamName.toLowerCase()) ??
    teams?.find((t) => t.name.toLowerCase().includes('rahman'));
  const myRank = myTeam?.rank ?? 7;
  const totalTeams = teams?.length || 2527;
  const rank1 = teams?.find((t) => t.rank === 1) ?? (teams && teams[0]);
  const currentEq = equity ?? myTeam?.equity ?? 128381;

  // Gap to Rank 1
  const isRank1 = myRank === 1;
  const rank2 = teams?.find((t) => t.rank === 2);
  const gapToRank1 = !isRank1 && rank1 ? Math.max(0, rank1.equity - currentEq) : 0;
  const pctToRank1 = !isRank1 && currentEq > 0 && rank1 ? (gapToRank1 / currentEq) * 100 : 0;

  // Lead over Rank 2 (if #1)
  const leadOverRank2 = isRank1 && rank2 ? Math.max(0, currentEq - rank2.equity) : 0;
  const pctLeadOverRank2 = isRank1 && rank2 && rank2.equity > 0 ? (leadOverRank2 / rank2.equity) * 100 : 0;

  // Next team ahead
  const teamAhead = !isRank1 ? teams?.find((t) => t.rank === myRank - 1) : null;
  const gapToAhead = teamAhead ? Math.max(0, teamAhead.equity - currentEq) : 0;

  // Progress metrics
  const topPercent = totalTeams > 0 ? ((myRank / totalTeams) * 100).toFixed(1) : '1.5';
  const progressToRank1 = rank1 && rank1.equity > 0 ? Math.min(100, (currentEq / rank1.equity) * 100) : 100;

  useEffect(() => {
    if (!pulse) return;
    const gain = pulse.delta > 0;
    const accent = gain ? colors.gain : colors.loss;
    setFlashSign(gain ? 1 : -1);
    void glow.start({ opacity: [0, 1, 0], transition: { duration: 1.2, times: [0, 0.2, 1] } });
    void color.start({ color: [accent, accent, colors.ink], transition: { duration: 0.8, times: [0, 0.15, 1] } });
    setFloater(pulse);
    const t = setTimeout(() => setFloater(null), 1500);
    return () => clearTimeout(t);
  }, [pulse, glow, color, colors]);

  const buyingPower = cash + (MAX_LOAN - loan);
  const loanPct = Math.min(100, (loan / MAX_LOAN) * 100);
  const loanHot = loan >= 45000;
  const shownValue = scrub ? scrub.value : mode === 'earned' ? (dayDelta?.dollar ?? 0) : equity;
  const isEarned = mode === 'earned';

  const accountsList = [
    {
      id: '11780',
      name: 'Rahman Power Squared',
      displayUser: '11780',
      icon: Trophy,
    },
    {
      id: '11778',
      name: 'Rahman Power',
      displayUser: '11788',
      icon: Zap,
    },
  ];

  return (
    <header className="flex flex-col gap-3.5 sm:gap-4">
      {/* Account Switcher Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-2xl border border-line bg-elevated p-1.5">
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <div className="hidden items-center gap-1.5 px-2 text-[10px] sm:flex font-mono uppercase tracking-wider text-ink-3">
            <ArrowRightLeft size={12} className="text-accent" />
            <span className="hidden font-bold sm:inline">Switch Account:</span>
          </div>
          <div className="grid w-full grid-cols-2 gap-1.5 sm:flex sm:w-auto sm:flex-wrap sm:items-center sm:gap-2">
            {accountsList.map((acc) => {
              const active =
                activeAccountId === acc.id ||
                teamName.toLowerCase().trim() === acc.name.toLowerCase().trim();
              const Icon = acc.icon;
              const teamInfo = teams?.find(
                (t) => t.name.toLowerCase().trim() === acc.name.toLowerCase().trim()
              );
              return (
                <button
                  key={acc.id}
                  type="button"
                  onClick={() => onSwitchAccount?.(acc.id)}
                  className={`group relative flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 sm:py-1.5 text-xs font-semibold transition-all cursor-pointer ${
                    active
                      ? 'border border-accent/60 bg-accent/15 text-ink shadow-md shadow-accent/10 ring-1 ring-accent/30'
                      : 'border border-line/60 bg-tint/40 text-ink-3 hover:border-line-focus hover:bg-tint hover:text-ink'
                  }`}
                >
                  <Icon
                    size={14}
                    className={active ? 'text-accent' : 'text-ink-3 group-hover:text-ink'}
                  />
                  <span className="hidden sm:inline">{acc.name}</span>
                  <span className="sm:hidden font-bold">{acc.id === '11780' ? 'RP Squared' : 'Rahman Power'}</span>
                  <span className="font-mono text-[10px] text-ink-3 font-normal hidden sm:inline">
                    (ID {acc.displayUser})
                  </span>
                  {teamInfo && (
                    <span
                      className={`hidden sm:inline font-mono text-[10px] px-1.5 py-0.5 rounded ${
                        active
                          ? 'bg-accent/25 text-accent font-bold'
                          : 'bg-tint-2 text-ink-3'
                      }`}
                    >
                      #{teamInfo.rank} · {money(teamInfo.equity, 0)}
                    </span>
                  )}
                  {active && (
                    <span className="hidden h-2 w-2 rounded-full bg-accent animate-pulse sm:inline" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="hidden sm:flex items-center gap-2 px-2 text-[10px] font-mono text-ink-3">
          <span className="h-1.5 w-1.5 rounded-full bg-gain animate-pulse" />
          <span>DUAL SYNC ACTIVE (2s INTERVAL)</span>
        </div>
      </div>

      {/* Top Header Row */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-1">
        <div className="min-w-0">
          <div className="label text-[10px] text-ink-3 tracking-widest">{greeting()}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            <h1 className="text-lg font-bold tracking-tight sm:text-xl text-ink">
              {teamName}
            </h1>
            {isRank1 ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-warn/40 bg-warn/15 px-2.5 py-0.5 text-[10px] font-bold text-warn">
                <Trophy size={11} className="text-warn" />
                RANK #1 CHAMPION
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-accent/40 bg-accent/10 px-2.5 py-0.5 text-[10px] font-bold text-accent">
                <Trophy size={11} className="text-accent" />
                RANK #{myRank} <span className="font-mono text-[9px] text-accent font-normal">of {int(totalTeams)}</span>
              </span>
            )}
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          {/* Live Status Pill */}
          <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-line-strong bg-tint/60 px-2.5 py-1 text-[11px] font-mono">
            <motion.span
              className={`h-2 w-2 rounded-full ${live ? 'bg-gain' : 'bg-warn'}`}
              animate={{ opacity: [1, 0.4, 1] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            />
            <span className={live ? 'text-gain font-semibold' : 'text-warn font-semibold'}>
              {live ? 'LIVE 2s' : 'OFFLINE'}
            </span>
          </span>

          {/* Market Status Pill */}
          <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-1 text-[10px] font-mono tracking-wider sm:text-[11px] ${
            marketOpen
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
              : 'border-warn/30 bg-warn/10 text-warn'
          }`}>
            <span className={`h-1.5 w-1.5 rounded-full ${marketOpen ? 'bg-emerald-400' : 'bg-warn'}`} />
            {marketOpen ? 'MARKET OPEN' : 'PRE-MARKET (9:30 AM)'}
          </span>

          <ThemeDots />

          {canTrade && (
            <button onClick={() => onTrade({})} className="btn-primary hidden items-center gap-1.5 lg:flex">
              <Plus size={14} /> New trade
            </button>
          )}
          <button onClick={onLock} aria-label="Lock terminal" className="btn hidden items-center gap-1.5 lg:flex">
            <Lock size={13} /> Lock
          </button>
        </div>
      </div>

      {/* Main Spotlight Card */}
      <motion.section
        className="card-spotlight relative flex flex-col overflow-hidden p-4 sm:p-8"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      >
        {/* Ambient Top Glow Orbs */}
        <div className="pointer-events-none absolute -top-32 -right-24 h-80 w-80 rounded-full opacity-60 blur-3xl" style={{ background: 'radial-gradient(closest-side, var(--glow-a), transparent)' }} />
        <motion.div
          initial={{ opacity: 0 }}
          animate={glow}
          className="pointer-events-none absolute inset-0"
          style={{ background: `radial-gradient(70% 90% at 30% 0%, color-mix(in srgb, var(${flashSign > 0 ? '--gain' : '--loss'}) 26%, transparent), transparent)` }}
        />

        {/* Chart View & Range Toggles */}
        <div className="relative flex flex-wrap items-center justify-between gap-3">
          <Toggle value={mode} onChange={setMode} options={[{ id: 'equity', label: 'Equity' }, { id: 'earned', label: 'Earned today' }]} />
          <Toggle value={range} onChange={setRange} options={(['1h', '6h', '24h'] as ChartRange[]).map((r) => ({ id: r, label: r.toUpperCase() }))} />
        </div>

        {/* Hero Value & Delta */}
        <div className="relative mt-5 sm:mt-6">
          <div className="label">{scrub ? etTime(scrub.t) : isEarned ? 'Earned today' : 'Total portfolio equity'}</div>
          <div className="relative mt-2 inline-block max-w-full">
            <motion.div animate={color} className="numx text-hero text-ink drop-shadow-sm">
              {shownValue === null ? '—' : scrub ? (isEarned ? signedMoney(scrub.value) : money(scrub.value)) : (
                <AnimatedNumber value={shownValue} format={(n) => (isEarned ? signedMoney(n) : money(n))} />
              )}
            </motion.div>
            <AnimatePresence>
              {floater && (
                <motion.span
                  key={floater.id}
                  className={`num pointer-events-none absolute -top-3 right-0 translate-x-1/4 rounded-full px-2 py-0.5 text-xs font-bold shadow-lg ${
                    floater.delta > 0
                      ? 'bg-gain text-black shadow-gain/30'
                      : 'bg-loss text-white shadow-loss/30'
                  }`}
                  initial={{ opacity: 1, y: 0, scale: 0.9 }}
                  animate={{ opacity: 0, y: -26, scale: 1.05 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 1.5, ease: 'easeOut' }}
                >
                  {signedMoney(floater.delta)}
                </motion.span>
              )}
            </AnimatePresence>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              {dayDelta ? (
                <span className={`num inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${
                  dayDelta.dollar === 0
                    ? 'border-line bg-tint text-ink-3'
                    : dayDelta.dollar > 0
                    ? 'border-gain/30 bg-gain/15 text-gain'
                    : 'border-loss/30 bg-loss/15 text-loss'
                }`}>
                  {dayDelta.dollar === 0 ? '— flat today' : `${dayDelta.dollar > 0 ? '▲' : '▼'} ${signedMoney(dayDelta.dollar)} (${signedPct(dayDelta.percent)}) today`}
                </span>
              ) : (
                <span className="text-xs text-ink-3 font-mono">Awaiting 9:30 AM open bell snapshot</span>
              )}
              <span className="text-xs text-ink-3 hidden sm:inline">· Pinned Team Lead: <strong className="text-gain font-mono">+12.4%</strong> vs #2</span>
            </div>

            {/* Prominent Bank Action Header Pills */}
            <div className="grid w-full grid-cols-3 gap-2 sm:flex sm:w-auto sm:items-center">
              <button
                type="button"
                onClick={() => onTrade({ action: 'buy' })}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 sm:py-1.5 rounded-xl border border-gain/40 bg-gain/20 text-gain text-xs font-bold hover:bg-gain/30 active:scale-95 transition-all shadow-md shadow-gain/10 cursor-pointer"
              >
                <Plus size={14} className="stroke-[3]" />
                <span>BUY</span>
              </button>
              <button
                type="button"
                onClick={() => onTrade({ action: 'sell' })}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 sm:py-1.5 rounded-xl border border-loss/40 bg-loss/20 text-loss text-xs font-bold hover:bg-loss/30 active:scale-95 transition-all shadow-md shadow-loss/10 cursor-pointer"
              >
                <ArrowDownLeft size={14} className="stroke-[3]" />
                <span>SELL</span>
              </button>
              <button
                type="button"
                onClick={() => (onScheduleTab ? onScheduleTab() : onTrade({ mode: 'schedule' }))}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 sm:py-1.5 rounded-xl border border-warn/40 bg-warn/20 text-warn text-xs font-bold hover:bg-warn/30 active:scale-95 transition-all shadow-md shadow-amber-500/10 cursor-pointer"
              >
                <CalendarClock size={14} className="stroke-[2.5]" />
                <span>SCHEDULE</span>
              </button>
            </div>
          </div>
        </div>

        {/* Live Championship & Rank #1 Tracker */}
        <div className="relative mt-4 rounded-2xl border border-line bg-tint/60 p-3.5 max-sm:order-last sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl font-mono font-bold text-sm shadow-inner ${
                  isRank1
                    ? 'border border-warn/40 bg-warn/15 text-warn'
                    : 'border border-cyan-500/40 bg-cyan-500/15 text-accent'
                }`}
              >
                #{myRank}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-ink uppercase tracking-wider">
                    {isRank1 ? 'Holding Rank #1 Championship' : 'Road to Rank #1'}
                  </span>
                  <span className="rounded bg-line/80 px-2 py-0.5 text-[10px] font-mono font-semibold text-ink-2">
                    Top {topPercent}% of {int(totalTeams)}
                  </span>
                </div>
                <p className="text-xs text-ink-3 mt-0.5">
                  {isRank1 ? (
                    <>
                      Defense Lead: <strong className="text-gain font-mono">+{money(leadOverRank2)}</strong> (+{pctLeadOverRank2.toFixed(1)}%) ahead of #2 {rank2?.name}
                    </>
                  ) : (
                    <>
                      Current #1 Leader: <strong className="text-ink font-semibold">{rank1?.name || 'Leader'}</strong> ({money(rank1?.equity ?? 0)})
                    </>
                  )}
                </p>
              </div>
            </div>

            {/* Gap Metrics */}
            <div className="flex items-center gap-4 ml-auto text-right">
              {!isRank1 && (
                <div className="flex flex-col items-end">
                  <span className="text-[10px] uppercase tracking-wider text-ink-3 font-medium">To Seize Rank #1</span>
                  <span className="num font-extrabold text-sm text-gain">+{money(gapToRank1)}</span>
                  <span className="text-[10px] font-mono text-gain/80">+{pctToRank1.toFixed(1)}% portfolio gain</span>
                </div>
              )}

              {teamAhead && (
                <div className="flex flex-col items-end border-l border-line pl-3.5">
                  <span className="text-[10px] uppercase tracking-wider text-ink-3 font-medium">To Overtake #{myRank - 1}</span>
                  <span className="num font-extrabold text-sm text-warn">+{money(gapToAhead)}</span>
                  <span className="text-[10px] font-mono text-ink-3 truncate max-w-[110px]">{teamAhead.name}</span>
                </div>
              )}
            </div>
          </div>

          {/* Progress Bar Toward Rank #1 */}
          {!isRank1 && (
            <div className="mt-3 pt-2.5 border-t border-line/40">
              <div className="flex justify-between items-center text-[10px] font-mono text-ink-3 mb-1">
                <span>You: <strong className="text-ink">{money(currentEq)}</strong></span>
                <span className="text-accent font-semibold">{progressToRank1.toFixed(1)}% of #1 Benchmark</span>
                <span>#1: <strong className="text-warn">{money(rank1?.equity ?? 0)}</strong></span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-tint-2 border border-line/60">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-cyan-500 via-emerald-400 to-amber-400"
                  initial={{ width: 0 }}
                  animate={{ width: `${progressToRank1}%` }}
                  transition={{ duration: 1, ease: 'easeOut' }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Interactive Equity Chart */}
        <div className="relative mt-4 h-52 sm:h-72 w-full">
          <EquityChart teamName={teamName} history={history} anchorEquity={anchorEquity} mode={mode} range={range} onScrub={setScrub} />
        </div>

        {/* Multi-Window Momentum Matrix */}
        <div className="relative mt-5 grid grid-cols-3 gap-2 sm:grid-cols-6">
          {(['1m', '5m', '15m', '1h', '6h', '24h'] as MoverKey[]).map((k) => {
            const m = mine[k];
            return (
              <div key={k} className="rounded-2xl border border-line bg-tint/60 px-3 py-2 transition-colors hover:border-line-focus">
                <div className="label text-[9px] text-ink-3 font-semibold">{k}</div>
                <div className={`num mt-1 text-xs font-bold ${!m ? 'text-ink-3' : m.delta > 0 ? 'text-gain' : m.delta < 0 ? 'text-loss' : 'text-ink-3'}`}>
                  {m ? signedMoney(m.delta, Math.abs(m.delta) >= 1000 ? 0 : 2) : '—'}
                </div>
              </div>
            );
          })}
        </div>

        {/* Bank-Styled Trade Deck */}
        <div className="relative mt-6 hidden border-t border-line/60 pt-5 sm:block">
          <div className="text-[11px] font-mono uppercase tracking-wider text-ink-3 mb-3 flex items-center justify-between">
            <span className="font-semibold text-ink-2">Trading Desk Execution</span>
            {!canTrade && <span className="text-warn text-[10px]">🔒 View mode · unlock with the owner PIN to trade</span>}
          </div>
          <div className="grid grid-cols-3 gap-2.5 sm:gap-4">
            {/* BUY BUTTON */}
            <motion.button
              type="button"
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => onTrade({ action: 'buy' })}
              className="group relative flex flex-col items-center justify-center gap-2 rounded-2xl border border-gain/40 bg-gradient-to-b from-gain/20 via-gain/10 to-transparent p-3 sm:p-4 text-center shadow-lg shadow-gain/10 transition-all hover:border-gain hover:from-gain/30 active:scale-95 cursor-pointer"
            >
              <div className="flex h-11 w-11 sm:h-12 sm:w-12 items-center justify-center rounded-xl bg-gain text-black font-extrabold shadow-md shadow-gain/30 group-hover:scale-105 transition-transform">
                <Plus size={22} className="stroke-[3]" />
              </div>
              <div className="flex flex-col items-center">
                <span className="text-xs sm:text-sm font-bold text-ink tracking-wide uppercase">BUY STOCK</span>
                <span className="text-[10px] font-mono text-gain hidden sm:inline font-semibold">Instant Order</span>
              </div>
            </motion.button>

            {/* SELL BUTTON */}
            <motion.button
              type="button"
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => onTrade({ action: 'sell' })}
              className="group relative flex flex-col items-center justify-center gap-2 rounded-2xl border border-loss/40 bg-gradient-to-b from-loss/20 via-loss/10 to-transparent p-3 sm:p-4 text-center shadow-lg shadow-loss/10 transition-all hover:border-loss hover:from-loss/30 active:scale-95 cursor-pointer"
            >
              <div className="flex h-11 w-11 sm:h-12 sm:w-12 items-center justify-center rounded-xl bg-loss text-white font-extrabold shadow-md shadow-loss/30 group-hover:scale-105 transition-transform">
                <ArrowDownLeft size={22} className="stroke-[3]" />
              </div>
              <div className="flex flex-col items-center">
                <span className="text-xs sm:text-sm font-bold text-ink tracking-wide uppercase">SELL HOLDING</span>
                <span className="text-[10px] font-mono text-loss hidden sm:inline font-semibold">Close Position</span>
              </div>
            </motion.button>

            {/* SCHEDULE BUTTON */}
            <motion.button
              type="button"
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => (onScheduleTab ? onScheduleTab() : onTrade({ mode: 'schedule' }))}
              className="group relative flex flex-col items-center justify-center gap-2 rounded-2xl border border-warn/40 bg-gradient-to-b from-amber-500/20 via-amber-500/10 to-transparent p-3 sm:p-4 text-center shadow-lg shadow-amber-500/10 transition-all hover:border-amber-400 hover:from-amber-500/30 active:scale-95 cursor-pointer"
            >
              <div className="flex h-11 w-11 sm:h-12 sm:w-12 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 text-black font-extrabold shadow-md shadow-amber-500/30 group-hover:scale-105 transition-transform">
                <CalendarClock size={22} className="stroke-[2.5]" />
              </div>
              <div className="flex flex-col items-center">
                <span className="text-xs sm:text-sm font-bold text-ink tracking-wide uppercase">SCHEDULE</span>
                <span className="text-[10px] font-mono text-warn hidden sm:inline font-semibold">Time Trigger</span>
              </div>
            </motion.button>
          </div>
        </div>
      </motion.section>

      {/* 4 Financial Stat Cards */}
      <div className="grid grid-cols-2 gap-2.5 sm:gap-4 md:grid-cols-4">
        {[
          {
            label: 'Uninvested Cash',
            icon: <Wallet size={14} className="text-gain" />,
            value: money(cash),
            sub: 'Instant Buying Reserve',
            extra: null
          },
          {
            label: 'Loan Balance',
            icon: <AlertCircle size={14} className={loanHot ? 'text-loss' : 'text-warn'} />,
            value: money(loan),
            sub: `Max $50k (${loanPct.toFixed(0)}% used)`,
            extra: (
              <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-tint-2">
                <motion.div
                  className={`h-full rounded-full ${loanHot ? 'bg-loss' : 'bg-warn'}`}
                  initial={{ width: 0 }}
                  animate={{ width: `${loanPct}%` }}
                  transition={{ duration: 0.8 }}
                />
              </div>
            ),
            hot: loanHot
          },
          {
            label: 'Total Buying Power',
            icon: <Zap size={14} className="text-accent" />,
            value: money(buyingPower),
            sub: 'Cash + Available Loan Room',
            extra: null
          },
          {
            label: 'Open Positions',
            icon: <Layers size={14} className="text-accent" />,
            value: int(positions),
            sub: `${positions} Equities Allocated`,
            extra: null
          },
        ].map((k, i) => (
          <motion.div
            key={k.label}
            className="card p-4 sm:p-5 transition-transform hover:-translate-y-0.5"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 + i * 0.05, duration: 0.4 }}
          >
            <div className="flex items-center justify-between">
              <span className="label">{k.label}</span>
              {k.icon}
            </div>
            <div className={`numx mt-2 text-xl sm:text-2xl ${'hot' in k && k.hot ? 'text-loss' : 'text-ink'}`}>
              {k.value}
            </div>
            {k.extra}
            <div className="mt-1 text-[11px] font-mono text-ink-3 truncate">{k.sub}</div>
          </motion.div>
        ))}
      </div>
    </header>
  );
}
