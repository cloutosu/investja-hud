import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CalendarClock, Clock, House, Trophy } from 'lucide-react';
import type { DayAnchor, HistoryPoint, MoverKey, MoversData, Portfolio, Pulse, Role, TeamWithDelta } from './types';
import { api, session, setUnauthorizedHandler } from './lib/api';
import { computeDeltas } from './lib/deltas';
import { isMarketOpen } from './lib/market';
import { PinAuth } from './components/PinAuth';
import { TopBar } from './components/TopBar';
import { BottomNav, type Tab } from './components/BottomNav';
import { Leaderboard } from './components/Leaderboard';
import { PortfolioCard } from './components/PortfolioCard';
import { HistoryModal } from './components/HistoryModal';
import { TradeModal, type TradeInit } from './components/TradeModal';
import { ScheduledTrades } from './components/ScheduledTrades';
import { MoversPanel } from './components/MoversPanel';
import { ThreatRadar } from './components/ThreatRadar';
import { DailyReport } from './components/DailyReport';

const POLL_MS = 2000; // 2 seconds ultra-fast live update
const PULSE_MS = 3000;
const STALE_MS = 4 * 60_000;
const MOVER_KEYS: MoverKey[] = ['1m', '5m', '15m', '1h', '6h', '24h'];

const portfolioEquity = (p: Portfolio) => p.holdings.reduce((s, h) => s + h.totalValue, 0) + p.cash - p.loan;

function attributeTicker(prev: Portfolio, next: Portfolio, delta: number): string | null {
  const pm = new Map(prev.holdings.map((h) => [h.ticker, h.totalValue]));
  let best: { ticker: string; diff: number } | null = null;
  for (const h of next.holdings) {
    const diff = h.totalValue - (pm.get(h.ticker) ?? 0);
    if (Math.sign(diff) === Math.sign(delta) && (!best || Math.abs(diff) > Math.abs(best.diff))) {
      best = { ticker: h.ticker, diff };
    }
  }
  return best?.ticker ?? null;
}

export default function App() {
  const [role, setRole] = useState<Role | null>(() => session.role());
  const [currentAccountId, setCurrentAccountId] = useState<string>(() => session.account() || '11780');
  const [teams, setTeams] = useState<TeamWithDelta[]>([]);
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [anchor, setAnchor] = useState<DayAnchor | null>(null);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [movers, setMovers] = useState<MoversData | null>(null);
  const [trades, setTrades] = useState<{ buys: number; sells: number } | null>(null);
  const [syncedAt, setSyncedAt] = useState<number | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const [pulse, setPulse] = useState<Pulse | null>(null);
  const [historyTeam, setHistoryTeam] = useState<string | null>(null);
  const [trade, setTrade] = useState<TradeInit | null>(null);
  const [scheduleTick, setScheduleTick] = useState(0);
  const [scheduledCount, setScheduledCount] = useState(0);
  const [tab, setTab] = useState<Tab>('home');
  const show = (t: Tab) => (tab === t ? '' : 'max-md:hidden');
  const canTrade = role === 'owner';

  const activeTeamName =
    currentAccountId === '11778' || currentAccountId === '11788'
      ? 'Rahman Power'
      : 'Rahman Power Squared';

  const lock = useCallback(() => {
    session.clear();
    setRole(null);
    lastTs.current = 0;
  }, []);
  useEffect(() => { setUnauthorizedHandler(lock); }, [lock]);

  // Queue listener for scheduled count badge
  useEffect(() => {
    let active = true;
    const checkQueue = async () => {
      try {
        const q = await api.scheduledTrades(currentAccountId);
        if (active && Array.isArray(q)) setScheduledCount(q.length);
      } catch {
        // quiet failure
      }
    };
    void checkQueue();
    const id = setInterval(checkQueue, 4000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [currentAccountId, scheduleTick]);

  const pollLiveData = useCallback(async (targetAcc = currentAccountId) => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const d = await api.live(targetAcc);
      setError(null);
      setServerError(d.status?.error ?? null);
      if (d.timestamp === lastTs.current && d.targetAccount?.id === targetAcc) return;
      lastTs.current = d.timestamp;

      // Seed previous equities map
      if (prevEquitiesRef.current.size === 0) {
        prevEquitiesRef.current = new Map(d.teams.flatMap((t) => (t.prevEquity !== undefined ? [[t.name, t.prevEquity] as [string, number]] : [])));
      }
      const withDeltas = computeDeltas(d.teams, prevEquitiesRef.current);
      prevEquitiesRef.current = new Map(d.teams.map((t) => [t.name, t.equity]));

      const myEquity = portfolioEquity(d.portfolio);
      const prevEq = prevMyEquityRef.current;
      if (prevEq !== null && Math.abs(myEquity - prevEq) >= 0.005) {
        const delta = myEquity - prevEq;
        const prevPf = prevPortfolioRef.current;
        setPulse({ id: ++pulseSeq.current, delta, ticker: prevPf ? attributeTicker(prevPf, d.portfolio, delta) : null });
      }
      prevMyEquityRef.current = myEquity;
      prevPortfolioRef.current = d.portfolio;

      setTeams(withDeltas);
      setPortfolio(d.portfolio);
      setAnchor(d.anchor);
      setMovers(d.movers);
      setTrades(d.trades);
      setSyncedAt(d.timestamp);
      api.history(targetAcc).then((h) => setHistory(h.points)).catch(() => {});
    } catch (e) {
      console.warn('[poll] failed:', (e as Error).message);
    } finally {
      inFlight.current = false;
    }
  }, [currentAccountId]);

  const handleSwitchAccount = useCallback((newAccId: string) => {
    const resolvedId = newAccId === '11788' ? '11778' : newAccId;
    setCurrentAccountId(resolvedId);
    session.setAccount(resolvedId);
    lastTs.current = 0;
    prevMyEquityRef.current = null;
    prevPortfolioRef.current = null;
    prevEquitiesRef.current.clear();
    void pollLiveData(resolvedId);
    setScheduleTick((n) => n + 1);
  }, [pollLiveData]);

  const lastTs = useRef<number>(0);
  const inFlight = useRef(false);
  const pulseSeq = useRef(0);
  const prevMyEquityRef = useRef<number | null>(null);
  const prevPortfolioRef = useRef<Portfolio | null>(null);
  const prevEquitiesRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    if (!role) return;
    void pollLiveData(currentAccountId);
    const id = setInterval(() => void pollLiveData(currentAccountId), POLL_MS);
    return () => clearInterval(id);
  }, [role, pollLiveData, currentAccountId]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!pulse) return;
    const t = setTimeout(() => setPulse((p) => (p === pulse ? null : p)), PULSE_MS);
    return () => clearTimeout(t);
  }, [pulse]);

  const equity = portfolio ? portfolioEquity(portfolio) : teams.find((t) => t.name === activeTeamName)?.equity ?? null;
  const dayDelta = useMemo(() => {
    if (equity === null || !anchor) return null;
    const dollar = equity - anchor.equity;
    return { dollar, percent: anchor.equity > 0 ? (dollar / anchor.equity) * 100 : 0 };
  }, [equity, anchor]);
  const mine = useMemo(
    () => Object.fromEntries(MOVER_KEYS.map((k) => [k, movers?.windows[k]?.ready ? movers.windows[k].me : null])),
    [movers],
  );

  const age = syncedAt ? now - syncedAt : null;
  const stale = age !== null && age > STALE_MS;
  const bannerWarn = stale || !!serverError || !!error;

  return (
    <>
      <AnimatePresence>
        {!role && (
          <PinAuth
            key="pin"
            onUnlock={(r, accId) => {
              setRole(r);
              if (accId) handleSwitchAccount(accId);
            }}
          />
        )}
      </AnimatePresence>

      {role && (
        <motion.div
          key="terminal"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.35 }}
          className="mx-auto flex min-h-screen max-w-7xl flex-col gap-4 p-3 pb-24 sm:gap-5 sm:p-5 md:p-6 lg:p-8"
        >
          {bannerWarn && (
            <div className="rounded-2xl border border-loss/40 bg-loss/10 p-3 text-xs text-loss font-mono">
              ⚠️ {error || serverError || `Feed stale (${Math.floor((age ?? 0) / 1000)}s old). Reconnecting…`}
            </div>
          )}

          <div>
            <TopBar
              teamName={activeTeamName}
              activeAccountId={currentAccountId}
              onSwitchAccount={handleSwitchAccount}
              equity={equity}
              dayDelta={dayDelta}
              anchorEquity={anchor?.equity ?? null}
              cash={portfolio?.cash ?? 0}
              loan={portfolio?.loan ?? 0}
              positions={portfolio?.holdings.length ?? 0}
              live={!bannerWarn && syncedAt !== null}
              marketOpen={isMarketOpen(now)}
              pulse={pulse}
              history={history}
              mine={mine}
              teams={teams}
              canTrade={canTrade}
              onTrade={setTrade}
              onScheduleTab={() => setTab('schedule')}
              onLock={lock}
            />
          </div>

          {/* Tablet & Desktop Navigation Strip */}
          <div className="hidden md:flex items-center justify-between gap-3 rounded-2xl border border-line-strong bg-elevated/80 p-2 backdrop-blur-md shadow-sm">
            <div className="flex items-center gap-2">
              {[
                { id: 'home' as Tab, label: 'Overview', icon: House },
                { id: 'schedule' as Tab, label: 'Scheduled Trades', icon: CalendarClock, count: scheduledCount },
                { id: 'board' as Tab, label: 'Leaderboard & Radar', icon: Trophy },
                { id: 'report' as Tab, label: 'Activity & Reports', icon: Clock },
              ].map((it) => {
                const active = tab === it.id;
                const Icon = it.icon;
                return (
                  <button
                    key={it.id}
                    type="button"
                    onClick={() => setTab(it.id)}
                    className={`relative flex items-center gap-2 rounded-xl px-3.5 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
                      active
                        ? 'border border-accent/60 bg-accent/20 text-ink shadow-sm ring-1 ring-accent/30'
                        : 'border border-line/60 bg-tint/40 text-ink-3 hover:text-ink hover:bg-tint'
                    }`}
                  >
                    <Icon size={14} className={active ? 'text-accent' : 'text-ink-3'} />
                    <span>{it.label}</span>
                    {!!it.count && it.count > 0 && (
                      <span className="rounded-full bg-amber-500 px-1.5 py-0.2 font-mono text-[10px] font-bold text-black shadow-sm">
                        {it.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setTrade({ action: 'buy' })}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-gain/40 bg-gain/15 text-gain text-xs font-bold hover:bg-gain/25 active:scale-95 transition-all shadow-sm cursor-pointer"
              >
                + Buy Stock
              </button>
              <button
                type="button"
                onClick={() => setTrade({ action: 'sell' })}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-loss/40 bg-loss/15 text-loss text-xs font-bold hover:bg-loss/25 active:scale-95 transition-all shadow-sm cursor-pointer"
              >
                Sell Holding
              </button>
              <button
                type="button"
                onClick={() => setTab('schedule')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-amber-500/40 bg-amber-500/15 text-amber-300 text-xs font-bold hover:bg-amber-500/25 active:scale-95 transition-all shadow-sm cursor-pointer"
              >
                View Scheduled ({scheduledCount})
              </button>
            </div>
          </div>

          {/* Main Layout Views */}
          {tab === 'schedule' ? (
            <div className="w-full">
              <ScheduledTrades
                refreshKey={scheduleTick}
                account={currentAccountId}
                onScheduleNew={setTrade}
                onTrade={setTrade}
              />
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:gap-5 md:grid-cols-12 md:gap-5 lg:gap-6">
              <div className="flex flex-col gap-4 sm:gap-5 md:col-span-7 lg:col-span-8 lg:gap-6">
                <div className={show('home')}>
                  <PortfolioCard portfolio={portfolio} pulse={pulse} canTrade={canTrade} onSell={setTrade} />
                </div>
                <div className={show('board')}>
                  <Leaderboard teams={teams} myTeam={activeTeamName} onOpenTeam={setHistoryTeam} />
                </div>
              </div>
              <div className="flex flex-col gap-4 sm:gap-5 md:col-span-5 lg:col-span-4 lg:gap-6">
                <div className={show('board')}>
                  <MoversPanel movers={movers} myTeam={activeTeamName} onOpenTeam={setHistoryTeam} />
                </div>
                <div className={show('board')}>
                  <ThreatRadar teams={teams} myTeam={activeTeamName} />
                </div>
                <div className={show('report')}>
                  <ScheduledTrades
                    refreshKey={scheduleTick}
                    account={currentAccountId}
                    onScheduleNew={setTrade}
                    onTrade={setTrade}
                  />
                </div>
                <div className={show('report')}>
                  <DailyReport portfolio={portfolio} equity={equity} anchor={anchor} trades={trades} />
                </div>
              </div>
            </div>
          )}

          <BottomNav
            tab={tab}
            onTab={setTab}
            onLock={lock}
            onTrade={() => setTrade({})}
            scheduledCount={scheduledCount}
          />
        </motion.div>
      )}

      <AnimatePresence>
        {historyTeam && <HistoryModal key={historyTeam} teamName={historyTeam} history={history} onClose={() => setHistoryTeam(null)} />}
        {trade && (
          <TradeModal
            key={`trade-${currentAccountId}`}
            portfolio={portfolio}
            equity={equity}
            init={trade}
            canTrade={canTrade}
            account={currentAccountId}
            teamName={activeTeamName}
            onElevate={() => setRole('owner')}
            onClose={() => setTrade(null)}
            onDone={() => { void pollLiveData(currentAccountId); setScheduleTick((n) => n + 1); }}
          />
        )}
      </AnimatePresence>
    </>
  );
}
