// Service worker: permite instalar la app y usarla sin conexión.
// Archivos propios: primero la red (así llegan las actualizaciones) y, sin conexión, el caché.
// three.js y fuentes (versiones fijas en CDN): primero el caché.
const CACHE = 'cubo-3d-v1';
const THREE = 'https://cdn.jsdelivr.net/npm/three@0.160.0/';
const PRECACHE = [
  './', 'index.html', 'app.js', 'geom.js', 'solvers.js', 'puzzle-worker.js', 'solver-worker.js',
  'vendor/cube.js', 'vendor/solve.js', 'manifest.json', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/favicon-64.png',
  ...['build/three.module.js', 'examples/jsm/controls/OrbitControls.js', 'examples/jsm/geometries/RoundedBoxGeometry.js',
    'examples/jsm/geometries/ConvexGeometry.js', 'examples/jsm/math/ConvexHull.js', 'examples/jsm/environments/RoomEnvironment.js'].map(p => THREE + p),
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(PRECACHE.map(u => c.add(u).catch(() => {})))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const sameOrigin = new URL(req.url).origin === self.location.origin;
  const save = res => { if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); } return res; };
  if (sameOrigin) {
    e.respondWith(fetch(req).then(save).catch(() => caches.match(req, { ignoreSearch: true })));
  } else {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(save)));
  }
});
