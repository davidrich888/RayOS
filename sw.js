// RayOS Service Worker v1
const CACHE_NAME = 'rayos-v1';
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/style.css',
    '/js/data.js',
    '/js/config.js',
    '/js/state.js',
    '/js/navigation.js',
    '/js/notion-sync.js',
    '/js/settings.js',
    '/js/charts.js',
    '/js/wealth.js',
    '/js/ai-engine.js',
    '/js/business.js',
    '/js/trading.js',
    '/js/physic.js',
    '/js/daily.js',
    '/js/ideas.js',
    '/js/init.js',
    '/icons/icon-192.png',
    '/icons/icon-512.png'
];

// Install: pre-cache static assets
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(STATIC_ASSETS))
            .then(() => self.skipWaiting())
    );
});

// Activate: clean old caches
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(
                keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
            )
        ).then(() => self.clients.claim())
    );
});

// Fetch strategy
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // Skip non-GET requests
    if (event.request.method !== 'GET') return;

    // API calls: network only (don't cache)
    if (url.pathname.startsWith('/api/') ||
        url.hostname.includes('notion.com') ||
        url.hostname.includes('googleapis.com') ||
        url.hostname.includes('script.google.com') ||
        url.hostname.includes('anthropic.com') ||
        url.hostname.includes('googleusercontent.com')) {
        return;
    }

    // CDN resources: cache first, network fallback
    if (url.hostname.includes('cdn.jsdelivr.net') ||
        url.hostname.includes('fonts.googleapis.com') ||
        url.hostname.includes('fonts.gstatic.com')) {
        event.respondWith(
            caches.match(event.request).then(cached => {
                if (cached) return cached;
                return fetch(event.request).then(response => {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                    return response;
                });
            })
        );
        return;
    }

    // Static assets: network first, cache fallback (always get latest when online)
    event.respondWith(
        fetch(event.request)
            .then(response => {
                const clone = response.clone();
                caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                return response;
            })
            .catch(() => caches.match(event.request))
    );
});
