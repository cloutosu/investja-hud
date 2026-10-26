import { useSyncExternalStore } from 'react';

export type ThemeId = 'midnight' | 'frost' | 'dune';

// Mirrors the CSS variables; SVG attributes (recharts) can't read var().
export const THEMES: Record<ThemeId, { label: string; gain: string; loss: string; accent: string; ink: string; ink3: string; bar: string }> = {
  midnight: { label: 'Midnight', gain: '#2de2a0', loss: '#ff5d7a', accent: '#7c6cff', ink: '#f5f7fb', ink3: '#6f7890', bar: '#0a0c12' },
  frost: { label: 'Frost', gain: '#059669', loss: '#e11d48', accent: '#4f46e5', ink: '#0e1320', ink3: '#8a93a6', bar: '#eef1f6' },
  dune: { label: 'Dune', gain: '#15803d', loss: '#b91c1c', accent: '#c2410c', ink: '#26150e', ink3: '#a89489', bar: '#f4ece5' },
};

const KEY = 'investja.theme';
const read = (): ThemeId => {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'ember') return 'midnight'; // migrated from the old default theme
    if (v === 'midnight' || v === 'frost' || v === 'dune') return v;
  } catch { /* storage blocked */ }
  return 'midnight';
};

let current: ThemeId = read();
const subs = new Set<() => void>();

function apply() {
  document.documentElement.dataset.theme = current;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEMES[current].bar);
}

export function initTheme() { apply(); }

export function setTheme(t: ThemeId) {
  current = t;
  try { localStorage.setItem(KEY, t); } catch { /* storage blocked */ }
  apply();
  subs.forEach((f) => f());
}

export function useTheme() {
  const id = useSyncExternalStore((cb) => { subs.add(cb); return () => subs.delete(cb); }, () => current);
  return { id, colors: THEMES[id] };
}
