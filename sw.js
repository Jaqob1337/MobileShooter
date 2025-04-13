const CACHE_NAME = 'survivor-cache-v1'; // Change version to force update
const urlsToCache = [
    '/', // Cache the root (often serves index.html)
    '/index.html',
    '/style.css',
    '/script.js',
    // Add paths to your icons if you want them cached immediately
    '/icons/icon-192x192.png',
    '/icons/icon-512x512.png'
    // '/path/to/other/assets/like/sounds/or/sprites.png' // Add other core assets later
];

// Install event: Cache core assets
self.addEventListener('install', event => {
    console.log('Service Worker: Installing...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Service Worker: Caching app shell');
                return cache.addAll(urlsToCache);
            })
            .then(() => {
                console.log('Service Worker: Installation complete');
                self.skipWaiting(); // Activate the new SW immediately
            })
            .catch(error => {
                 console.error('Service Worker: Caching failed', error);
            })
    );
});

// Activate event: Clean up old caches
self.addEventListener('activate', event => {
    console.log('Service Worker: Activating...');
    const cacheWhitelist = [CACHE_NAME]; // Only keep the current cache version
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheWhitelist.indexOf(cacheName) === -1) {
                        console.log('Service Worker: Deleting old cache', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => {
             console.log('Service Worker: Activation complete');
             return self.clients.claim(); // Take control of open clients immediately
        })
    );
});


// Fetch event: Serve cached assets if available (Cache-first strategy)
self.addEventListener('fetch', event => {
    // console.log('Service Worker: Fetching ', event.request.url);
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                // Cache hit - return response
                if (response) {
                    // console.log('Service Worker: Serving from cache', event.request.url);
                    return response;
                }

                // Not in cache - fetch from network
                // console.log('Service Worker: Fetching from network', event.request.url);
                return fetch(event.request).then(
                    // Optional: Cache the new resource dynamically (be careful with what you cache)
                    networkResponse => {
                        // Check if we received a valid response
                        // Don't cache unsuccessful responses or non-GET requests
                        // if(!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic' || event.request.method !== 'GET') {
                        //     return networkResponse;
                        // }

                        // Optional: Clone the response stream as it can only be consumed once
                        // const responseToCache = networkResponse.clone();
                        // caches.open(CACHE_NAME)
                        //   .then(cache => {
                        //     cache.put(event.request, responseToCache);
                        //   });

                        return networkResponse;
                    }
                ).catch(error => {
                    console.error('Service Worker: Fetch failed both cache and network.', error);
                    // Optional: Return a fallback offline page if desired
                    // return caches.match('/offline.html');
                });
            })
    );
});