import type { AppEvent } from '../types';
import { api } from './api';

const PREF_KEY = 'investja.alerts';
const CURSOR_KEY = 'investja.alerts.cursor';

const read = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* storage blocked */ } };

export const alertsSupported = () => typeof Notification !== 'undefined' && 'serviceWorker' in navigator;
export const alertsOn = () => alertsSupported() && Notification.permission === 'granted' && read(PREF_KEY) === '1';

export async function registerSW() {
  if (!('serviceWorker' in navigator)) return null;
  try { return await navigator.serviceWorker.register('/sw.js'); } catch { return null; }
}

const b64ToBytes = (b64: string) => {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

/** Asks for permission, subscribes to Web Push when the server has VAPID keys, and remembers the choice. */
export async function enableAlerts(account?: string): Promise<{ ok: boolean; push: boolean; message?: string }> {
  if (!alertsSupported()) return { ok: false, push: false, message: 'This browser does not support notifications.' };
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return { ok: false, push: false, message: 'Notifications are blocked. Allow them in the browser site settings.' };
  write(PREF_KEY, '1');
  const reg = (await registerSW()) ?? (await navigator.serviceWorker.ready);
  let push = false;
  try {
    const { key } = await api.pushKey();
    if (key && 'PushManager' in window) {
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(key) }));
      await api.pushSubscribe(sub.toJSON(), account);
      push = true;
    }
  } catch { /* in-page alerts still work */ }
  return { ok: true, push };
}

export async function disableAlerts() {
  write(PREF_KEY, '0');
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (sub) { await api.pushUnsubscribe(sub.endpoint); await sub.unsubscribe(); }
  } catch { /* nothing to clean up */ }
}

/** Shows browser notifications for events newer than the stored cursor. First call only sets the cursor (no replay). */
export async function deliver(events: AppEvent[] | undefined, account: string, inPage: (e: AppEvent) => void) {
  if (!events?.length) return;
  const ck = `${CURSOR_KEY}:${account}`;
  const stored = read(ck);
  const top = Math.max(...events.map((e) => e.id));
  if (stored === null) { write(ck, String(top)); return; }
  const fresh = events.filter((e) => e.id > Number(stored)).sort((a, b) => a.id - b.id);
  if (!fresh.length) return;
  write(ck, String(top));
  const reg = alertsOn() ? await navigator.serviceWorker.getRegistration() : undefined;
  for (const e of fresh) {
    inPage(e);
    // when Web Push is subscribed the SW already showed it; only add a local one if this tab can't be reached by push
    if (reg && document.visibilityState === 'hidden') {
      void reg.showNotification(e.title, { body: e.body, tag: e.tag, icon: '/icon.svg' });
    }
  }
}
