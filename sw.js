// Install & activate
self.addEventListener('install', event => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

// Handle push notifications (requires backend web push to be truly reliable).
self.addEventListener('push', event => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (err) {
    payload = {};
  }

  const title = payload.title || 'Spend Some Time';
  const options = {
    body: payload.body || 'Time for a quick skill session.',
    icon: payload.icon || '/favicon-32x32.png',
    badge: payload.badge || '/favicon-32x32.png',
    tag: payload.tag || 'sst-push-reminder',
    data: payload.data || { url: '/index.html' }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Handle notification click
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const targetUrl = event.notification?.data?.url || '/index.html';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(clientList => {
        for (const client of clientList) {
          if (client.url.includes(targetUrl) && 'focus' in client) {
            return client.focus();
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
      })
  );
});
