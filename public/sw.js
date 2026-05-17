// Medux Service Worker — handles Web Push for incoming calls + messages
self.addEventListener('install', (e) => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { title: 'Medux', body: event.data?.text() || '' }; }
  const title = data.title || 'Medux';
  const options = {
    body: data.body || '',
    icon: '/favicon.svg',
    badge: '/favicon.svg',
    tag: data.tag || 'medux',
    renotify: true,
    requireInteraction: data.type === 'incoming_call',
    data: data,
    actions: data.type === 'incoming_call' ? [
      { action: 'accept', title: 'Accept' },
      { action: 'decline', title: 'Decline' },
    ] : [],
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  let url = '/dashboard';
  if (data.type === 'incoming_call' && data.call_id) {
    url = event.action === 'decline' ? '/dashboard' : `/call/${data.call_id}`;
  } else if (data.type === 'message' && data.peer_id) {
    url = `/messages?peer=${data.peer_id}`;
  } else if (data.url) {
    url = data.url;
  }
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if ('focus' in w) { w.focus(); w.navigate?.(url); return; }
      }
      return self.clients.openWindow(url);
    })
  );
});
