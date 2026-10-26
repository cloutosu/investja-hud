import { motion } from 'framer-motion';
import { CalendarClock, Clock, House, Lock, Trophy, Plus } from 'lucide-react';

export type Tab = 'home' | 'schedule' | 'board' | 'report';
interface Props {
  tab: Tab;
  onTab: (t: Tab) => void;
  onLock: () => void;
  onTrade?: () => void;
  scheduledCount?: number;
}

const items: { id: Tab; icon: typeof House; label: string }[] = [
  { id: 'home', icon: House, label: 'Overview' },
  { id: 'schedule', icon: CalendarClock, label: 'Schedule' },
  { id: 'board', icon: Trophy, label: 'Rankings' },
  { id: 'report', icon: Clock, label: 'Activity' },
];

export function BottomNav({ tab, onTab, onLock, onTrade, scheduledCount }: Props) {
  const cell = (it: (typeof items)[number]) => {
    const isActive = tab === it.id;
    return (
      <button
        key={it.id}
        onClick={() => onTab(it.id)}
        aria-label={it.label}
        className="relative flex flex-col items-center justify-center h-12 w-13 rounded-2xl transition-colors"
      >
        {isActive && (
          <motion.span
            layoutId="nav-pill"
            className="absolute inset-0 rounded-2xl bg-tint-2 border border-line-focus/40 shadow-sm"
            transition={{ type: 'spring', stiffness: 450, damping: 35 }}
          />
        )}
        <div className="relative">
          <it.icon size={18} className={`relative z-10 transition-colors ${isActive ? 'text-accent' : 'text-ink-3'}`} />
          {it.id === 'schedule' && !!scheduledCount && scheduledCount > 0 && (
            <span className="absolute -top-1.5 -right-2.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-amber-500 text-[8px] font-bold text-black shadow-sm">
              {scheduledCount}
            </span>
          )}
        </div>
        <span className={`relative z-10 text-[9px] font-medium tracking-tight mt-0.5 transition-colors ${isActive ? 'text-ink font-semibold' : 'text-ink-3'}`}>
          {it.label}
        </span>
      </button>
    );
  };

  return (
    <nav
      className="fixed inset-x-3 bottom-3 z-50 mx-auto flex max-w-md items-center justify-between rounded-3xl border border-line-strong bg-elevated/95 px-2 py-1.5 shadow-2xl shadow-black/70 backdrop-blur-2xl md:hidden"
      style={{ paddingBottom: 'calc(0.4rem + env(safe-area-inset-bottom, 8px))' }}
    >
      {cell(items[0])}
      {cell(items[1])}

      {/* Floating Glowing Trade Trigger */}
      {onTrade && (
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={onTrade}
          aria-label="New trade"
          className="relative -my-4 flex h-13 w-13 items-center justify-center rounded-full bg-gradient-to-br from-accent to-[#d4520e] p-1.5 shadow-lg shadow-accent/40 border-2 border-elevated-2 cursor-pointer"
        >
          <Plus size={22} className="text-accent-ink stroke-[2.5]" />
        </motion.button>
      )}

      {cell(items[2])}
      {cell(items[3])}

      <button
        onClick={onLock}
        aria-label="Lock terminal"
        className="flex flex-col items-center justify-center h-12 w-10 rounded-2xl text-ink-3 hover:text-ink transition-colors cursor-pointer"
      >
        <Lock size={16} />
        <span className="text-[9px] font-medium tracking-tight mt-0.5">Lock</span>
      </button>
    </nav>
  );
}
