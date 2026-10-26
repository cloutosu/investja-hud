import { useCallback, useEffect, useState } from 'react';
import { motion, useAnimation } from 'framer-motion';
import { Check, CornerDownLeft, Delete, Lock, ShieldCheck, Trophy, Zap } from 'lucide-react';
import type { Role } from '../types';
import { api, session } from '../lib/api';

const MAX_LEN = 12;
const MIN_BOXES = 6;
const STEP_MS = 340;

interface AccountChoice {
  id: string;
  name: string;
  displayUser: string;
  roleHint: string;
  icon: typeof Trophy;
  color: string;
}

const AVAILABLE_ACCOUNTS: AccountChoice[] = [
  {
    id: '11780',
    name: 'Rahman Power Squared',
    displayUser: '11780',
    roleHint: 'Owner: 455535 · View: 11780',
    icon: Trophy,
    color: 'from-amber-500/20 to-orange-500/10 border-amber-500/40 text-amber-400',
  },
  {
    id: '11778',
    name: 'Rahman Power',
    displayUser: '11788',
    roleHint: 'Owner: 989154 · View: 11788',
    icon: Zap,
    color: 'from-cyan-500/20 to-blue-500/10 border-cyan-500/40 text-cyan-400',
  },
];

export function PinAuth({ onUnlock }: { onUnlock: (role: Role, accountId: string) => void }) {
  const [selectedAccount, setSelectedAccount] = useState<string>('11780');
  const [code, setCode] = useState('');
  const [stage, setStage] = useState<'entry' | 'checking' | 'sequence'>('entry');
  const [message, setMessage] = useState('');
  const [role, setRole] = useState<Role>('owner');
  const [activeAccountName, setActiveAccountName] = useState('Rahman Power Squared');
  const [activeAccountId, setActiveAccountId] = useState('11780');
  const [shown, setShown] = useState(0);
  const [barFull, setBarFull] = useState(false);
  const shake = useAnimation();

  const activeChoice = AVAILABLE_ACCOUNTS.find((a) => a.id === selectedAccount) || AVAILABLE_ACCOUNTS[0];

  const steps = [
    'Authenticating terminal authorization...',
    `Target account locked: ${activeAccountName} (${activeChoice.displayUser})`,
    'Establishing encrypted session token...',
    `Authorized clearance: ${role.toUpperCase()}`,
    'Connecting live investja.org pipeline...',
    `Welcome, ${activeAccountName}`,
  ];

  const press = useCallback((d: string) => {
    if (stage !== 'entry') return;
    setMessage('');
    setCode((c) => (c.length < MAX_LEN ? c + d : c));
  }, [stage]);

  const back = useCallback(() => setCode((c) => c.slice(0, -1)), []);

  const submit = useCallback(async () => {
    if (stage !== 'entry' || !code) return;
    setStage('checking');
    try {
      // Auto-switch selected account if code unambiguously belongs to the other account
      let targetAcc = selectedAccount;
      if (code === '989154' || code === '11788' || code === '11778') {
        targetAcc = '11778';
        setSelectedAccount('11778');
      } else if (code === '455535' || code === '11780') {
        targetAcc = '11780';
        setSelectedAccount('11780');
      }

      const r = await api.auth(code, targetAcc);
      if (r.token && r.role) {
        const accId = r.accountId || targetAcc;
        const team = r.teamName || (accId === '11778' ? 'Rahman Power' : 'Rahman Power Squared');
        session.set(r.token, r.role, accId);
        setRole(r.role);
        setActiveAccountId(accId);
        setActiveAccountName(team);
        setStage('sequence');
        return;
      }
      setMessage(r.message || 'Incorrect access code for selected account.');
    } catch (e) {
      setMessage((e as Error).message || 'Server connection unreachable.');
    }
    void shake.start({ x: [0, -10, 10, -10, 0], transition: { duration: 0.3 } });
    setCode('');
    setStage('entry');
  }, [code, stage, selectedAccount, shake]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') back();
      else if (e.key === 'Enter') void submit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [press, back, submit]);

  useEffect(() => {
    if (stage !== 'sequence') return;
    const id = setInterval(() => setShown((n) => Math.min(n + 1, steps.length)), STEP_MS);
    return () => clearInterval(id);
  }, [stage, steps.length]);

  useEffect(() => {
    if (shown < steps.length) return;
    const t = setTimeout(() => setBarFull(true), STEP_MS / 2);
    return () => clearTimeout(t);
  }, [shown, steps.length]);

  useEffect(() => {
    if (barFull) {
      const t = setTimeout(() => onUnlock(role, activeAccountId), 300);
      return () => clearTimeout(t);
    }
  }, [barFull, role, activeAccountId, onUnlock]);

  const boxes = Math.max(MIN_BOXES, code.length);

  return (
    <motion.div
      className="fixed inset-0 z-[70] flex items-center justify-center overflow-hidden bg-base p-4"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35 }}
    >
      <div className="ambient" />
      <motion.div
        animate={shake}
        className="relative z-10 w-full max-w-md rounded-[36px] border border-line-strong bg-elevated/95 p-6 sm:p-7 shadow-2xl shadow-black/70 backdrop-blur-3xl"
      >
        {/* Vault Icon Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent/15 border border-accent/30 text-accent shadow-inner">
              <Lock size={19} />
            </div>
            <div>
              <div className="label text-[9px] tracking-wider text-ink-3">TERMINAL VAULT · MULTI-ACCOUNT</div>
              <div className="font-bold text-sm text-ink flex items-center gap-1.5">
                InvestJA Live Hub <ShieldCheck size={14} className="text-gain" />
              </div>
            </div>
          </div>
          <span className="rounded-full bg-tint px-2.5 py-1 text-[10px] font-mono text-ink-3 border border-line">
            DUAL SYNC
          </span>
        </div>

        {stage !== 'sequence' ? (
          <>
            {/* Account Selector Cards */}
            <div className="mb-5">
              <div className="label text-[10px] text-ink-3 mb-2 uppercase tracking-wider font-semibold">
                Select Trading Account / Team
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                {AVAILABLE_ACCOUNTS.map((acc) => {
                  const isSelected = selectedAccount === acc.id;
                  const Icon = acc.icon;
                  return (
                    <button
                      key={acc.id}
                      type="button"
                      onClick={() => {
                        setSelectedAccount(acc.id);
                        setCode('');
                        setMessage('');
                      }}
                      className={`relative flex flex-col text-left p-3 rounded-2xl border transition-all cursor-pointer ${
                        isSelected
                          ? `border-accent bg-tint-2 shadow-lg shadow-accent/10 ring-1 ring-accent/40`
                          : 'border-line-strong bg-tint/40 opacity-70 hover:opacity-100 hover:border-line-focus'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <div className={`p-1.5 rounded-xl border bg-gradient-to-br ${acc.color}`}>
                          <Icon size={14} />
                        </div>
                        <span className="font-mono text-[10px] px-2 py-0.5 rounded-full bg-tint border border-line text-ink-2 font-semibold">
                          ID {acc.displayUser}
                        </span>
                      </div>
                      <div className="font-bold text-xs text-ink truncate mb-0.5">{acc.name}</div>
                      <div className="text-[9px] text-ink-3 font-mono truncate">{acc.roleHint}</div>
                      {isSelected && (
                        <div className="absolute top-2 right-2 h-2 w-2 rounded-full bg-accent animate-pulse" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mb-2 flex items-center justify-between">
              <h1 className="text-lg sm:text-xl font-bold tracking-tight text-ink">
                Enter PIN for <span className="text-accent">{activeChoice.name}</span>
              </h1>
            </div>
            <p className="text-[11px] text-ink-3 mb-4">
              Enter owner code to trade or view-only code to inspect.
            </p>

            {/* PIN Dots */}
            <div className="mb-4 flex justify-center gap-2">
              {Array.from({ length: boxes }, (_, i) => (
                <div
                  key={i}
                  className={`num flex h-12 min-w-0 flex-1 items-center justify-center rounded-2xl border bg-tint/60 text-lg font-bold transition-all ${
                    i === code.length
                      ? 'border-accent shadow-[0_0_12px_rgba(242,107,29,0.35)] bg-tint-2'
                      : i < code.length
                      ? 'border-line-focus text-accent'
                      : 'border-line-strong text-ink-3'
                  }`}
                >
                  {code[i] ? '•' : ''}
                </div>
              ))}
            </div>

            {/* Error / Alert Message */}
            {message && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-4 rounded-xl border border-loss/30 bg-loss/10 p-2.5 text-center text-xs font-medium text-loss"
              >
                {message}
              </motion.div>
            )}

            {/* Touch Keypad */}
            <div className="grid grid-cols-3 gap-2 sm:gap-2.5">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                <motion.button
                  key={n}
                  whileTap={{ scale: 0.92 }}
                  onClick={() => press(String(n))}
                  className="numx flex h-12 sm:h-13 items-center justify-center rounded-2xl border border-line-strong bg-tint/40 text-lg font-bold text-ink transition-colors hover:border-line-focus hover:bg-tint-2"
                >
                  {n}
                </motion.button>
              ))}
              <motion.button
                whileTap={{ scale: 0.92 }}
                onClick={back}
                aria-label="Backspace"
                className="flex h-12 sm:h-13 items-center justify-center rounded-2xl border border-line-strong bg-tint/40 text-ink-3 transition-colors hover:border-line-focus hover:bg-tint-2 hover:text-ink"
              >
                <Delete size={19} />
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.92 }}
                onClick={() => press('0')}
                className="numx flex h-12 sm:h-13 items-center justify-center rounded-2xl border border-line-strong bg-tint/40 text-lg font-bold text-ink transition-colors hover:border-line-focus hover:bg-tint-2"
              >
                0
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.92 }}
                onClick={() => void submit()}
                disabled={!code || stage === 'checking'}
                aria-label="Unlock"
                className="flex h-12 sm:h-13 items-center justify-center rounded-2xl bg-gradient-to-br from-accent to-[#d4520e] text-accent-ink font-bold shadow-lg shadow-accent/25 transition-transform hover:brightness-110 disabled:opacity-40"
              >
                <CornerDownLeft size={19} />
              </motion.button>
            </div>
          </>
        ) : (
          /* Boot Sequence Animation */
          <div className="space-y-3 py-4 font-mono text-xs">
            <div className="font-bold text-base text-ink mb-1">Access Authorized</div>
            {steps.slice(0, shown).map((st, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex items-center gap-2 text-ink-2"
              >
                <Check size={14} className="text-gain shrink-0" />
                <span>{st}</span>
              </motion.div>
            ))}
            <div className="mt-6 h-2.5 overflow-hidden rounded-full bg-tint-2">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-accent to-gain"
                initial={{ width: 0 }}
                animate={{ width: barFull ? '100%' : `${(shown / steps.length) * 100}%` }}
                transition={{ duration: 0.3 }}
              />
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
