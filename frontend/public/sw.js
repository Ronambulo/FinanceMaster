// Service worker mínimo: hace la app instalable y guarda solo los iconos.
// Páginas, JS y /api van siempre a la red, así un despliegue se ve en la
// siguiente apertura (el cliente además se recarga cuando cambia /version.json).
const CACHE_NAME = 'fm-shell-v1'
const APP_SHELL = [
  '/manifest.webmanifest',
  '/icon.svg?v=1',
  '/favicon-32x32.png?v=1',
  '/pwa-192x192.png?v=1',
  '/pwa-512x512.png?v=1',
  '/maskable-icon-512x512.png?v=1',
  '/apple-touch-icon-180x180.png?v=1',
]

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(APP_SHELL)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', event => {
  // Borra también las cachés del service worker anterior (workbox), que guardaba páginas y API.
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', event => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (!APP_SHELL.includes(url.pathname + url.search)) return
  event.respondWith(caches.match(request).then(hit => hit ?? fetch(request)))
})
