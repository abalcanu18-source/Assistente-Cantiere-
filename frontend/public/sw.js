// Service worker: keeps the app installable as a PWA and receives push
// notifications even when the app itself isn't open, which is what makes
// the 6:30 / 17:00 "alarm" actually work on a phone.

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = { title: 'Assistente Cantieri', body: 'Apri l\'app.', type: 'generic' };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    // ignore malformed payloads, fall back to defaults above
  }

  const options = {
    body: data.body,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    vibrate: [400, 200, 400, 200, 400],
    requireInteraction: true,
    data: { type: data.type, url: '/' },
    tag: 'cantieri-alarm',
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          client.postMessage({ type: 'alarm-tapped', alarmType: event.notification.data?.type });
          return client.focus();
        }
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});
