export interface Team {
  rank: number;
  name: string;
  school: string;
  location?: string;
  equity: number;
  prevEquity?: number;
}
export interface TeamWithDelta extends Team {
  deltaDollar: number;
  deltaPercent: number;
}
export type Exchange = 'Nasdaq' | 'NYSE' | 'TSX';
export interface Holding {
  exchange: Exchange | string;
  ticker: string;
  quantity: number;
  totalValue: number;
  currentPrice: number;
  returnDollar?: number;
  returnPercent?: number;
  costBasis?: number;
  avgBuyPrice?: number;
}
export interface Portfolio {
  cash: number;
  loan: number;
  holdings: Holding[];
}
export interface AccountMeta {
  id: string;
  user: string;
  team: string;
  displayUser: string;
  tag?: string;
}

export type TradeAction = 'buy' | 'sell';
export interface TradeBody { action: TradeAction; exchange: string; ticker: string; quantity: number; account?: string }
export interface TradeResult {
  success: boolean;
  message: string;
  command?: string;
  account?: string;
  team?: string;
  payload?: {
    action: TradeAction;
    exchange: string;
    ticker: string;
    quantity: number;
    account?: string;
    timestamp: number;
  };
}
export interface QuoteResult {
  ticker: string;
  exchange: string;
  price: number | null;
  priceCad?: number | null;
  priceUsd?: number | null;
  fxRate?: number;
  fxConverted?: boolean;
  prevClose?: number;
  currency?: string;
  quoteCurrency?: string;
  source?: string;
  message?: string;
}
export interface ScheduleBody extends TradeBody { executeAt: number }
export interface ScheduledTrade extends ScheduleBody {
  id: string;
  createdAt: number;
  attempts: number;
  status: 'pending' | 'retrying' | 'failed';
  lastError: string | null;
  nextAttemptAt: number;
}
export type Role = 'owner' | 'viewer';
export type MoverKey = '1m' | '5m' | '15m' | '1h' | '6h' | '24h';
export interface MoverRow { name: string; rank: number; equity: number; delta: number; pct: number }
export interface MoverWindow { ready: boolean; gainers: MoverRow[]; losers: MoverRow[]; me: MoverRow | null }
export interface MoversData { t: number; windows: Record<MoverKey, MoverWindow> }
export interface LiveData {
  timestamp: number;
  teams: Team[];
  portfolio: Portfolio;
  anchor: DayAnchor;
  trades: { buys: number; sells: number };
  movers: MoversData | null;
  /** ticker -> epoch ms when the 1 h hold ends, from our own buy log */
  holds?: Record<string, number>;
  status: { at: number; error: string | null } | null;
  targetAccount?: AccountMeta;
  accounts?: AccountMeta[];
}
export interface Snapshot {
  id?: number;
  teamName: string;
  timestamp: number;
  equity: number;
  rank: number;
}
export interface DayAnchor {
  date: string;
  equity: number;
  holdings: Holding[];
}
export interface ReportContributor {
  ticker: string;
  amount: number;
}
export interface DailyReportData {
  id?: number;
  date: string;
  pnl: number;
  pnlPercent: number;
  startEquity: number;
  endEquity: number;
  topContributor: ReportContributor | null;
  biggestDrag: ReportContributor | null;
  buys: number;
  sells: number;
  generatedAt: number;
}
export interface HistoryPoint {
  t: number;
  /** team name -> [equity, rank] */
  eq: Record<string, [number, number]>;
}
export interface Pulse {
  id: number;
  delta: number;
  ticker: string | null;
}

export interface TakeProfitBody {
  exchange: string;
  ticker: string;
  quantity: number | 'all';
  targetPct?: number;
  targetPrice?: number;
  account?: string;
}
export interface TakeProfitRule {
  id: string;
  exchange: string;
  ticker: string;
  quantity: number | 'all';
  targetPct: number | null;
  targetPrice: number | null;
  account: string;
  createdAt: number;
  status: 'armed' | 'holding' | 'no-position' | 'done';
  attempts: number;
  lastError: string | null;
  holdReleaseAt: number | null;
  lastPrice?: number;
  firedAt?: number;
  soldQuantity?: number;
  soldPrice?: number;
}
