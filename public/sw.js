const CACHE = 'meal-planner-v2'

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  if (
    event.request.method !== 'GET' ||
    new URL(event.request.url).origin !== self.location.origin
  ) {
    return
  }

  // Always check the network first. This prevents an old deployment
  // from being served forever after GitHub Pages is updated.
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone()

        caches.open(CACHE).then((cache) => {
          cache.put(event.request, copy)
        })

        return response
      })
      .catch(() => caches.match(event.request))
  )
})
