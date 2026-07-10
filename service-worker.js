const CACHE_NAME = 'sahyog-society-v2';
const ASSETS = [
  './',
  './index.html',
  './css/styles.css',
  './js/firebase-config.js',
  './js/utils.js',
  './js/auth.js',
  './js/members.js',
  './js/contributions.js',
  './js/loans.js',
  './js/reminders.js',
  './js/reports.js',
  './js/yearend.js',
  './js/dashboard.js',
  './js/settings.js',
  './js/app.js',
  './manifest.json'
];

self.addEventListener('install', (e)=>{
  e.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (e)=>{
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
    ))
  );
  self.clients.claim();
});

// Network-first for Firebase/API calls, cache-first for app shell
self.addEventListener('fetch', (e)=>{
  const url = e.request.url;
  if(url.includes('firestore.googleapis.com') || url.includes('identitytoolkit')){
    return; // let these go straight to network
  }
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
