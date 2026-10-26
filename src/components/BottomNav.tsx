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
        className="relative flex h-14 flex-1 flex-col items-center justify-center gap-0.5 transition-colors"
      >
        {isActive && (
          <motion.span
            layoutId="nav-indicator"
            className="absolute inset-x-5 top-0 h-0.5 rounded-full bg-accent"
            transition={{ type: 'spring', stiffness: 450, damping: 35 }}
          />
        )}
        <div className="relative">
          <it.icon size={22} className={`relative z-10 transition-colors ${isActive ? 'text-accent' : 'text-ink-3'}`} />
          {it.id === 'schedule' && !!scheduledCount && scheduledCount > 0 && (
            <span className="absolute -top-1.5 -right-2.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-amber-500 text-[8px] font-bold text-black shadow-sm">
              {scheduledCount}
            </span>
          )}
        </div>
        <span className={`relative z-10 text-[10px] font-medium tracking-tight transition-colors ${isActive ? 'text-accent font-semibold' : 'text-ink-3'}`}>
          {it.label}
        </span>
      </button>
    );
  };

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 flex items-stretch border-t border-line bg-elevated px-1 pt-1 md:hidden"
      style={{ paddingBottom: 'max(0.4rem, env(safe-area-inset-bottom))' }}
    >
      {cell(items[0])}
      {cell(items[1])}

      {/* Floating Glowing Trade Trigger */}
      {onTrade && (
        <div className="flex flex-1 items-start justify-center">
          <motion.button
            whileTap={{ scale: 0.92 }}
            onClick={onTrade}
            aria-label="New trade"
            className="-mt-5 flex h-14 w-14 items-center justify-center rounded-full border-4 border-[color:var(--bg)] bg-accent cursor-pointer"
            style={{ boxShadow: 'var(--shadow-glow)' }}
          >
            <Plus size={24} className="text-accent-ink stroke-[2.5]" />
          </motion.button>
        </div>
      )}

      {cell(items[2])}
      {cell(items[3])}

      <button
        onClick={onLock}
        aria-label="Lock terminal"
        className="flex h-14 w-14 flex-col items-center justify-center gap-0.5 text-ink-3 hover:text-ink transition-colors cursor-pointer"
      >
        <Lock size={20} />
        <span className="text-[10px] font-medium tracking-tight">Lock</span>
      </button>
    </nav>
  );
}
