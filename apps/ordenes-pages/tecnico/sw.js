// Service Worker - Global Pro Automotriz (App Tecnico)
const CACHE_NAME = 'globalpro-v1';
const ASSETS_TO_CACHE = [
    '/tecnico/app.html',
    '/tecnico/app.js',
    '/tecnico/manifest.json'
];

// Instalar: guardar archivos base en cache
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
    self.skipWaiting();
});

// Activar: limpiar caches viejas
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
            );
        })
    );
    self.clients.claim();
});

// Fetch: Network first, fallback a cache
self.addEventListener('fetch', (event) => {
    // No cachear llamadas a la API (siempre deben ir al servidor)
    if (event.request.url.includes('/api/')) {
        return;
    }

    // No cachear recursos externos (CDN)
    if (event.request.url.includes('cdn.jsdelivr.net') ||
        event.request.url.includes('cdnjs.cloudflare.com')) {
        return;
    }

    event.respondWith(
        fetch(event.request)
            .then((response) => {
                // Si la respuesta es valida, guardar en cache
                if (response && response.status === 200) {
                    const responseClone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseClone);
                    });
                }
                return response;
            })
            .catch(() => {
                // Si no hay internet, buscar en cache
                return caches.match(event.request).then((cachedResponse) => {
                    if (cachedResponse) {
                        return cachedResponse;
                    }
                    // Si no esta en cache y es la pagina principal, mostrar offline
                    if (event.request.url.includes('app.html')) {
                        return caches.match('/tecnico/app.html');
                    }
                });
            })
    );
});