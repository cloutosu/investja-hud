// Service worker: shows Web Push alerts when the page is closed, and focuses the app on click
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { /* plain-text push */ }
  event.waitUntil(
    self.registration.showNotification(data.title || 'InvestJA', {
      body: data.body || '',
      tag: data.tag || 'investja',
      renotify: true,
      icon: '/icon.svg',
      badge: '/icon.svg',
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      const w = wins[0];
      return w ? w.focus() : self.clients.openWindow('/');
    }),
  );
});
