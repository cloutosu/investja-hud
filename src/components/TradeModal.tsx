import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Terminal, Copy, Check, ArrowUpRight, ArrowDownLeft, Clock, Lock } from 'lucide-react';
import type { Portfolio, TradeAction } from '../types';
import { api, session } from '../lib/api';
import { etTime, isMarketOpen, nextMarketOpen } from '../lib/market';
import { int, money } from '../lib/format';
import { Modal } from './Modal';
import { PositionSizer } from './PositionSizer';
import { recordBuy } from './PortfolioCard';
import { SwipeToConfirm, type ConfirmResult } from './SwipeToConfirm';
import { StatusGlyph } from './StatusGlyph';
import { useToast } from './Toaster';

export interface TradeInit {
  action?: TradeAction;
  exchange?: string;
  ticker?: string;
  quantity?: number;
  mode?: 'now' | 'schedule';
}

interface Props {
  portfolio: Portfolio | null;
  equity: number | null;
  init?: TradeInit;
  canTrade?: boolean;
  account?: string;
  teamName?: string;
  onElevate?: () => void;
  onClose: () => void;
  onDone: () => void;
}

interface ExecutedReceipt {
  action: TradeAction;
  exchange: string;
  ticker: string;
  quantity: number;
  price: number | null;
  total: number;
  command: string;
  time: string;
}

const EXCHANGES = ['Nasdaq', 'NYSE', 'TSX'];
const toLocalInput = (ms: number) =>
  new Date(ms - new Date(ms).getTimezoneOffset() * 60000).toISOString().slice(0, 16);

export function TradeModal({ portfolio, equity, init, canTrade = true, account = '11780', teamName = 'Rahman Power Squared', onElevate, onClose, onDone }: Props) {
  const toast = useToast();
  const [action, setAction] = useState<TradeAction>(init?.action ?? 'buy');
  const [exchange, setExchange] = useState(init?.exchange ?? 'Nasdaq');
  const [ticker, setTicker] = useState(init?.ticker ?? '');
  const [qty, setQty] = useState(init?.quantity ? String(init.quantity) : '');
  const [mode, setMode] = useState<'now' | 'schedule'>(init?.mode ?? 'now');
  const [when, setWhen] = useState(toLocalInput(Date.now() + 65 * 60000));
  const [copied, setCopied] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');

  // Price detection state
  const [detectedPrice, setDetectedPrice] = useState<number | null>(null);
  const [isDetecting, setIsDetecting] = useState(false);

  // Execution receipt terminal state
  const [receipt, setReceipt] = useState<ExecutedReceipt | null>(null);

  const quantity = parseInt(qty, 10) || 0;
  const valid = ticker.length > 0 && quantity > 0;
  const closed = !isMarketOpen();
  const buy = action === 'buy';
  const verb = buy ? 'Buy' : 'Sell';

  // Buying power = liquid cash + loan limit ($50k max)
  const buyingPower = Math.max(0, (portfolio?.cash ?? 0) + (50000 - (portfolio?.loan ?? 0)));

  const handleUnlock = async () => {
    if (!pinInput) return;
    setPinError('');
    try {
      const res = await api.auth(pinInput);
      if (res.token && res.role === 'owner') {
        session.set(res.token, 'owner');
        onElevate?.();
        toast('Unlocked as Owner');
      } else {
        setPinError('Incorrect code. Enter the owner PIN.');
      }
    } catch (e) {
      setPinError((e as Error).message);
    }
  };

  // Auto-detect price whenever ticker or exchange changes
  useEffect(() => {
    const clean = ticker.trim().toUpperCase();
    if (!clean) {
      setDetectedPrice(null);
      return;
    }

    // Check portfolio holdings first
    const held = portfolio?.holdings.find(
      (h) => h.ticker.toUpperCase() === clean && (h.exchange === exchange || !exchange)
    );
    if (held && held.currentPrice > 0) {
      setDetectedPrice(held.currentPrice);
      return;
    }

    let active = true;
    setIsDetecting(true);
    const timer = setTimeout(async () => {
      try {
        const q = await api.quote(clean, exchange);
        if (active && q && typeof q.price === 'number') {
          const isUs = exchange === 'Nasdaq' || exchange === 'NYSE';
          let finalPrice = q.price;
          // Ensure US quote is multiplied by 1.43 to always produce CAD
          if (isUs && (q.currency === 'USD' || !q.fxConverted)) {
            finalPrice = Number((q.price * 1.43).toFixed(2));
          }
          setDetectedPrice(finalPrice);
        } else if (active) {
          setDetectedPrice(null);
        }
      } catch {
        if (active) {
          setDetectedPrice(null);
        }
      } finally {
        if (active) setIsDetecting(false);
      }
    }, 350);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [ticker, exchange, portfolio]);

  const confirm = useCallback(async (): Promise<ConfirmResult> => {
    const body = { action, exchange, ticker, quantity, account };
    const price = detectedPrice;
    const total = price ? (quantity * price) + (buy ? 25 : -25) : 0;

    if (mode === 'now') {
      const r = await api.trade(body);
      if (!r.success) return { ok: false, message: r.message };
      if (buy) recordBuy(ticker);

      const generatedCommand =
        r.command ||
        `curl -X POST "https://investja.org/private/game/${action}" -H "X-Requested-With: XMLHttpRequest" -d "exchange=${exchange}&ticker=${ticker}&quantity=${quantity}&action=confirm"`;

      setReceipt({
        action,
        exchange,
        ticker,
        quantity,
        price,
        total,
        command: generatedCommand,
        time: etTime(Date.now()),
      });
      return { ok: true };
    }

    const executeAt = new Date(when).getTime();
    if (!Number.isFinite(executeAt) || executeAt <= Date.now()) {
      return { ok: false, message: 'Pick a time in the future' };
    }
    const r = await api.scheduleTrade({ ...body, executeAt });
    if (!r.success) return { ok: false, message: r.message };
    toast(`${verb} scheduled for ${etTime(executeAt)}`);

    setReceipt({
      action,
      exchange,
      ticker,
      quantity,
      price,
      total,
      command: `# Scheduled for ${new Date(executeAt).toISOString()}\ncurl -X POST "https://investja.org/private/game/${action}" -H "X-Requested-With: XMLHttpRequest" -d "exchange=${exchange}&ticker=${ticker}&quantity=${quantity}&action=confirm"`,
      time: `Scheduled: ${etTime(executeAt)}`,
    });
    return { ok: true };
  }, [action, exchange, ticker, quantity, account, mode, when, buy, verb, toast, detectedPrice]);

  const handleCopyCommand = () => {
    if (!receipt) return;
    navigator.clipboard.writeText(receipt.command).then(() => {
      setCopied(true);
      toast('Command copied to clipboard');
      setTimeout(() => setCopied(false), 2500);
    });
  };

  const presets = [
    { label: '+1h', ms: () => Date.now() + 3600e3 },
    { label: '+65m', ms: () => Date.now() + 65 * 60e3 },
    { label: 'Next open', ms: () => nextMarketOpen() },
  ];

  return (
    <Modal
      title={receipt ? undefined : mode === 'now' ? 'Execute Trade' : 'Schedule Trade'}
      onClose={onClose}
      hideClose={false}
    >
      <AnimatePresence mode="wait">
        {receipt ? (
          <motion.div
            key="receipt-terminal"
            className="flex flex-col gap-4 py-2"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 280, damping: 26 }}
          >
            {/* Success Hero Badge */}
            <div className="flex items-center gap-3.5 p-4 rounded-2xl border border-gain/30 bg-gain/10 text-gain">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gain text-black shadow-lg shadow-gain/20">
                <StatusGlyph phase="success" size={24} stroke={2.5} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm tracking-tight text-ink uppercase">
                    Order {receipt.action} Filled
                  </span>
                  <span className="rounded bg-gain/20 px-1.5 py-0.2 text-[10px] font-mono font-bold text-gain">
                    HTTP 302 FOUND
                  </span>
                </div>
                <p className="text-xs text-ink-2 mt-0.5">
                  {int(receipt.quantity)} {receipt.ticker} on {receipt.exchange} · {receipt.time}
                </p>
              </div>
            </div>

            {/* Generated Script & Command Box */}
            <div className="rounded-2xl border border-line bg-black/80 p-4 text-xs font-mono shadow-inner">
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-line/60 text-ink-3">
                <div className="flex items-center gap-1.5">
                  <Terminal size={14} className="text-accent" />
                  <span className="text-[11px] font-semibold text-ink-2">Execution Command / Payload</span>
                </div>
                <button
                  onClick={handleCopyCommand}
                  className="flex items-center gap-1 px-2 py-0.5 rounded-lg border border-line-strong bg-tint text-[10px] text-ink hover:text-white transition-all active:scale-95"
                  title="Copy command to clipboard"
                >
                  {copied ? <Check size={12} className="text-gain" /> : <Copy size={12} />}
                  <span>{copied ? 'Copied' : 'Copy Command'}</span>
                </button>
              </div>

              <pre className="overflow-x-auto text-ink-2 leading-relaxed text-[11px] select-all whitespace-pre-wrap break-all">
                {receipt.command}
              </pre>

              {receipt.price && (
                <div className="mt-3 pt-2.5 border-t border-line/40 flex justify-between items-center text-[11px]">
                  <span className="text-ink-3">Executed Valuation:</span>
                  <span className="font-bold text-ink">
                    {money(receipt.total)} (@ ${receipt.price.toFixed(2)})
                  </span>
                </div>
              )}
            </div>

            <button
              onClick={() => {
                onDone();
                onClose();
              }}
              className="btn btn-primary w-full py-2.5 text-xs font-bold uppercase tracking-wider mt-2"
            >
              Done & Return to Terminal
            </button>
          </motion.div>
        ) : (
          <motion.div
            key="form"
            className="flex flex-col gap-4"
            exit={{ opacity: 0, transition: { duration: 0.12 } }}
          >
            {/* Active Account Execution Badge */}
            <div className="flex items-center justify-between rounded-xl border border-line bg-tint/60 px-3 py-2 text-xs">
              <span className="text-[10px] font-mono text-ink-3 uppercase tracking-wider">Trading Account</span>
              <span className="font-bold text-accent flex items-center gap-1.5 font-mono">
                {teamName} <span className="text-ink-3 font-normal text-[10px]">({account === '11778' ? '11788' : '11780'})</span>
              </span>
            </div>

            {closed && (
              <div className="rounded-2xl border border-warn/30 bg-warn/10 px-3.5 py-2.5 text-xs text-warn flex items-center gap-2">
                <Clock size={14} className="shrink-0" />
                <span>
                  Market closed. Orders run 9:35–16:00 ET. The terminal uses the `X-Requested-With` header to bypass server hours check.
                </span>
              </div>
            )}

            {/* Action Toggle */}
            <div className="flex rounded-full border border-line-strong bg-tint/80 p-1">
              {(['buy', 'sell'] as TradeAction[]).map((a) => (
                <button
                  key={a}
                  onClick={() => setAction(a)}
                  className={`flex-1 rounded-full py-2 text-xs font-bold uppercase tracking-wider transition-all duration-300 flex items-center justify-center gap-1.5 ${
                    action === a
                      ? a === 'buy'
                        ? 'bg-gain text-black shadow-lg shadow-gain/20'
                        : 'bg-loss text-white shadow-lg shadow-loss/20'
                      : 'text-ink-3 hover:text-ink'
                  }`}
                >
                  {a === 'buy' ? <ArrowDownLeft size={14} /> : <ArrowUpRight size={14} />}
                  <span>{a}</span>
                </button>
              ))}
            </div>

            {/* Input Grid */}
            <div className="grid grid-cols-3 gap-3">
              <label className="flex flex-col gap-1">
                <span className="label text-[10px]">Exchange</span>
                <select
                  className="field text-xs py-2"
                  value={exchange}
                  onChange={(e) => setExchange(e.target.value)}
                >
                  {EXCHANGES.map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <span className="label text-[10px]">Ticker</span>
                  {detectedPrice && (
                    <span className="text-[10px] text-gain font-mono font-bold">
                      ${detectedPrice.toFixed(2)} CAD
                    </span>
                  )}
                </div>
                <input
                  className="field font-mono uppercase text-xs py-2 tracking-wider font-bold"
                  value={ticker}
                  maxLength={10}
                  onChange={(e) =>
                    setTicker(e.target.value.toUpperCase().replace(/[^A-Z0-9.\-]/g, ''))
                  }
                  placeholder="AIOK"
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="label text-[10px]">Quantity</span>
                <input
                  className="field num text-xs py-2 font-bold"
                  inputMode="numeric"
                  value={qty}
                  onChange={(e) => setQty(e.target.value.replace(/\D/g, ''))}
                  placeholder="100"
                />
              </label>
            </div>

            {/* Dynamic Position Sizer & Auto-Price Detector */}
            <PositionSizer
              ticker={ticker}
              quantity={quantity}
              holdings={portfolio?.holdings ?? []}
              equity={equity}
              buyingPower={buyingPower}
              action={action}
              exchange={exchange}
              detectedPrice={detectedPrice}
              isDetecting={isDetecting}
              onSelectQty={(q) => setQty(String(q))}
            />

            {mode === 'schedule' && (
              <div className="flex flex-col gap-2 rounded-2xl border border-line bg-tint/40 p-3.5">
                <span className="label text-[10px]">Execute At (Local Time)</span>
                <input
                  type="datetime-local"
                  className="field num text-xs py-1.5"
                  value={when}
                  onChange={(e) => setWhen(e.target.value)}
                />
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {presets.map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      className="px-2 py-0.5 rounded-lg border border-line bg-tint text-[10px] text-ink-2 hover:text-ink active:scale-95"
                      onClick={() => setWhen(toLocalInput(p.ms()))}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Interactive Swipe to Confirm OR Unlock Gate */}
            {!canTrade ? (
              <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-center">
                <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-amber-400 mb-2">
                  <Lock size={14} /> Owner Authorization Required
                </div>
                <p className="text-[11px] text-ink-3 mb-3">
                  Terminal is currently in view-only mode. Enter the owner PIN to unlock instant trading.
                </p>
                <div className="flex items-center gap-2 max-w-xs mx-auto">
                  <input
                    type="password"
                    maxLength={10}
                    placeholder="Enter PIN..."
                    value={pinInput}
                    onChange={(e) => setPinInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void handleUnlock();
                    }}
                    className="field text-center font-mono tracking-widest text-sm py-2"
                  />
                  <button
                    type="button"
                    onClick={handleUnlock}
                    className="btn btn-primary text-xs font-bold px-4 py-2 shrink-0 cursor-pointer"
                  >
                    Unlock
                  </button>
                </div>
                {pinError && <p className="text-[11px] text-loss mt-2">{pinError}</p>}
              </div>
            ) : (
              <div className="pt-1">
                <SwipeToConfirm
                  key={`${mode}-${action}-${ticker}`}
                  tone={buy ? 'gain' : 'loss'}
                  label={mode === 'now' ? `Swipe to ${action.toUpperCase()}` : `Swipe to schedule ${action.toUpperCase()}`}
                  processingLabel={mode === 'now' ? 'Executing Order Script' : 'Scheduling'}
                  successLabel={mode === 'now' ? 'Order Executed' : 'Scheduled'}
                  disabled={!valid}
                  onConfirm={confirm}
                  onSettled={(r) => {
                    if (r.ok) {
                      onDone();
                    }
                  }}
                />
              </div>
            )}

            <button
              type="button"
              className="self-center text-xs text-ink-3 transition-colors hover:text-ink"
              onClick={() => setMode((m) => (m === 'now' ? 'schedule' : 'now'))}
            >
              {mode === 'now' ? 'Schedule for later time →' : '← Trade immediately'}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </Modal>
  );
}
