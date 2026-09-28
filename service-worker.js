// =====================================================================
// NETWORK-FIRST service worker
// Whenever the phone is online, every app file is fetched fresh from
// GitHub Pages (bypassing the browser's HTTP cache too), so updates
// appear on the next open/refresh — no clearing site data, no ?v=N.
// The cache below is ONLY a fallback for when there is no internet.
// You normally never need to edit this file again.
// =====================================================================
const CACHE_NAME = 'sahyog-society-v3';
const FETCH_TIMEOUT_MS = 6000;

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
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      // 'reload' skips the HTTP cache so we never pre-cache stale copies;
      // a single missing file must not break the whole install.
      Promise.all(ASSETS.map(a => cache.add(new Request(a, {cache:'reload'})).catch(()=>{})))
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e)=>{
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function fetchFresh(url){
  const ctrl = new AbortController();
  const timer = setTimeout(()=> ctrl.abort(), FETCH_TIMEOUT_MS);
  return fetch(url, {cache:'no-cache', signal: ctrl.signal}).finally(()=> clearTimeout(timer));
}

async function networkFirst(req){
  const cache = await caches.open(CACHE_NAME);
  try{
    const res = await fetchFresh(req.url);
    if(res && res.ok) cache.put(req, res.clone());
    return res;
  }catch(err){
    const cached = await cache.match(req, {ignoreSearch:true});
    if(cached) return cached;
    if(req.mode === 'navigate'){
      const shell = await cache.match('./index.html');
      if(shell) return shell;
    }
    return Response.error();
  }
}

self.addEventListener('fetch', (e)=>{
  const req = e.request;
  if(req.method !== 'GET') return;
  const url = new URL(req.url);
  // Only handle the app's own files. Firebase, fonts and the Excel
  // library are cross-origin and are left entirely to the browser.
  if(url.origin !== self.location.origin) return;
  e.respondWith(networkFirst(req));
});
