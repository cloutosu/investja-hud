import type {
  AccountMeta,
  HistoryPoint,
  LiveData,
  QuoteResult,
  Role,
  ScheduleBody,
  ScheduledTrade,
  TakeProfitBody,
  TakeProfitRule,
  TradeBody,
  TradeResult,
} from '../types';

const API_BASE = import.meta.env.VITE_API_URL ?? '';
const TOKEN_KEY = 'investja.token';
const ROLE_KEY = 'investja.role';
const ACCOUNT_KEY = 'investja.account';

const read = (k: string) => { try { return sessionStorage.getItem(k); } catch { return null; } };

export const session = {
  token: () => read(TOKEN_KEY),
  role: (): Role | null => (read(ROLE_KEY) as Role | null),
  account: (): string => read(ACCOUNT_KEY) || '11780',
  set(token: string, role: Role, accountId: string = '11780') {
    try {
      sessionStorage.setItem(TOKEN_KEY, token);
      sessionStorage.setItem(ROLE_KEY, role);
      sessionStorage.setItem(ACCOUNT_KEY, accountId);
    } catch {
      /* storage blocked */
    }
  },
  setAccount(accountId: string) {
    try {
      sessionStorage.setItem(ACCOUNT_KEY, accountId);
    } catch {
      /* storage blocked */
    }
  },
  clear() {
    try {
      sessionStorage.clear();
    } catch {
      /* storage blocked */
    }
  },
};

let onUnauthorized: () => void = () => {};
export const setUnauthorizedHandler = (fn: () => void) => { onUnauthorized = fn; };

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = session.token();
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
    cache: 'no-store',
  });
  const data = await res.json().catch(() => null);
  if (res.status === 401 && path !== '/api/auth') onUnauthorized();
  if (!res.ok) {
    if (data && typeof data === 'object' && ('success' in data || path === '/api/auth')) return data as T;
    throw new Error((data && (data.error || data.message)) || `HTTP ${res.status}`);
  }
  return data as T;
}

const body = (method: string, b: unknown): RequestInit => ({ method, body: JSON.stringify(b) });

export const api = {
  auth: (code: string, account?: string) =>
    request<{
      token?: string;
      role?: Role;
      accountId?: string;
      teamName?: string;
      accounts?: AccountMeta[];
      message?: string;
    }>('/api/auth', body('POST', { code, account })),
  live: (account?: string) =>
    request<LiveData>(`/api/live${account ? `?account=${encodeURIComponent(account)}` : ''}`),
  history: (account?: string) =>
    request<{ points: HistoryPoint[] }>(`/api/history${account ? `?account=${encodeURIComponent(account)}` : ''}`),
  track: (name: string) => request<{ ok: boolean }>('/api/track', body('POST', { name })),
  trade: (b: TradeBody) => request<TradeResult>('/api/trade', body('POST', b)),
  quote: (ticker: string, exchange: string = 'Nasdaq', account?: string) =>
    request<QuoteResult>(
      `/api/quote?ticker=${encodeURIComponent(ticker)}&exchange=${encodeURIComponent(exchange)}${
        account ? `&account=${encodeURIComponent(account)}` : ''
      }`
    ),
  scheduleTrade: (b: ScheduleBody) => request<TradeResult>('/api/schedule-trade', body('POST', b)),
  scheduledTrades: (account?: string) =>
    request<ScheduledTrade[]>(`/api/scheduled-trades${account ? `?account=${encodeURIComponent(account)}` : ''}`),
  armTakeProfit: (b: TakeProfitBody) => request<TradeResult>('/api/take-profit', body('POST', b)),
  takeProfit: (account?: string) =>
    request<TakeProfitRule[]>(`/api/take-profit${account ? `?account=${encodeURIComponent(account)}` : ''}`),
  disarmTakeProfit: (id: string) => request<TradeResult>(`/api/take-profit/${id}`, { method: 'DELETE' }),
  cancelScheduled: (id: string) => request<TradeResult>(`/api/schedule-trade/${id}`, { method: 'DELETE' }),
};
