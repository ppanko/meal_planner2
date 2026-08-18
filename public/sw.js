const CACHE = 'meal-planner-v2'

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  if (
    event.request.method !== 'GET' ||
    new URL(event.request.url).origin !== self.location.origin
  ) {
    return
  }

  // Always try the network first for page navigation.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone()
          caches.open(CACHE).then((cache) => {
            cache.put(event.request, copy)
          })
          return response
        })
        .catch(() => caches.match(event.request)),
    )

    return
  }

  // Static hashed assets can safely be cache-first.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached

      return fetch(event.request).then((response) => {
        const copy = response.clone()

        caches.open(CACHE).then((cache) => {
          cache.put(event.request, copy)
        })

        return response
      })
    }),
  )
})
