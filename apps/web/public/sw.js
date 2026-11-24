// Retire the previous offline worker. Authenticated pages and API data stay on the network.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", event => event.waitUntil((async () => {
  await Promise.all((await caches.keys()).map(key => caches.delete(key)));
  await self.registration.unregister();
})()));
