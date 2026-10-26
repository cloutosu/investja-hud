import { motion } from 'framer-motion';
import { Clock, House, Lock, Trophy, Plus } from 'lucide-react';

export type Tab = 'home' | 'board' | 'report';
interface Props {
  tab: Tab;
  onTab: (t: Tab) => void;
  onLock: () => void;
  onTrade?: () => void;
}

const items: { id: Tab; icon: typeof House; label: string }[] = [
  { id: 'home', icon: House, label: 'Overview' },
  { id: 'board', icon: Trophy, label: 'Rankings' },
  { id: 'report', icon: Clock, label: 'Activity' },
];

export function BottomNav({ tab, onTab, onLock, onTrade }: Props) {
  const cell = (it: (typeof items)[number]) => {
    const isActive = tab === it.id;
    return (
      <button
        key={it.id}
        onClick={() => onTab(it.id)}
        aria-label={it.label}
        className="relative flex flex-col items-center justify-center h-12 w-14 rounded-2xl transition-colors"
      >
        {isActive && (
          <motion.span
            layoutId="nav-pill"
            className="absolute inset-0 rounded-2xl bg-tint-2 border border-line-focus/40 shadow-sm"
            transition={{ type: 'spring', stiffness: 450, damping: 35 }}
          />
        )}
        <it.icon size={19} className={`relative z-10 transition-colors ${isActive ? 'text-accent' : 'text-ink-3'}`} />
        <span className={`relative z-10 text-[10px] font-medium tracking-tight mt-0.5 transition-colors ${isActive ? 'text-ink font-semibold' : 'text-ink-3'}`}>
          {it.label}
        </span>
      </button>
    );
  };

  return (
    <nav
      className="fixed inset-x-4 bottom-3 z-50 mx-auto flex max-w-sm items-center justify-between rounded-3xl border border-line-strong bg-elevated/90 px-3 py-2 shadow-2xl shadow-black/60 backdrop-blur-2xl md:hidden"
      style={{ paddingBottom: 'calc(0.5rem + env(safe-area-inset-bottom, 8px))' }}
    >
      {cell(items[0])}
      {cell(items[1])}

      {/* Floating Glowing Trade Trigger */}
      {onTrade && (
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={onTrade}
          aria-label="New trade"
          className="relative -my-5 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-accent to-[#d4520e] p-1.5 shadow-lg shadow-accent/40 border-2 border-elevated-2"
        >
          <Plus size={24} className="text-accent-ink stroke-[2.5]" />
        </motion.button>
      )}

      {cell(items[2])}

      <button
        onClick={onLock}
        aria-label="Lock terminal"
        className="flex flex-col items-center justify-center h-12 w-12 rounded-2xl text-ink-3 hover:text-ink transition-colors"
      >
        <Lock size={18} />
        <span className="text-[10px] font-medium tracking-tight mt-0.5">Lock</span>
      </button>
    </nav>
  );
}
