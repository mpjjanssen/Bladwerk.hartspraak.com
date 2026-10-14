/*
 * Service worker van Bladwerk: bewaart de onderdelen van de app op je
 * computer, zodat hij snel opent en ook zonder internet PDF's kan tonen,
 * invullen en ondertekenen. Je documenten komen hier nooit in; alleen de
 * app zelf. Verwerking op de server (/api/) gaat altijd via internet.
 */
const VERSIE = 'bladwerk-v3';
const APP = [
  '/',
  '/css/app.css',
  '/js/app.js',
  '/js/bouwen.js',
  '/js/concept.js',
  '/js/handtekening.js',
  '/js/hulp.js',
  '/js/klussen.js',
  '/js/pdfbron.js',
  '/js/werkruimte.js',
  '/js/inloggen.js',
  '/js/i18n.js',
  '/js/vertalingen.js',
  '/img/logo.svg',
  '/img/icoon-192.png',
  '/manifest.webmanifest',
  '/fonts/DejaVuSans.ttf',
  '/vendor/pdfjs/pdf.min.mjs',
  '/vendor/pdfjs/pdf.worker.min.mjs',
  '/vendor/pdf-lib/pdf-lib.esm.min.js',
  '/vendor/fontkit/fontkit.umd.min.js',
  '/vendor/jszip/jszip.min.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSIE)
      .then((c) => Promise.all(APP.map((u) => c.add(new Request(u, { cache: 'reload' })).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((namen) => Promise.all(namen.filter((n) => n !== VERSIE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

const nooitBewaren = (url) =>
  url.pathname.startsWith('/api/') || ['/inloggen', '/uitloggen', '/gezond', '/sw.js'].includes(url.pathname);

async function eerstNetwerk(req) {
  const cache = await caches.open(VERSIE);
  try {
    const res = await fetch(req);
    if (res.ok && res.type === 'basic') cache.put(req, res.clone());
    return res;
  } catch (err) {
    const opgeslagen = await cache.match(req, { ignoreSearch: req.mode === 'navigate' });
    if (opgeslagen) return opgeslagen;
    if (req.mode === 'navigate') {
      const start = await cache.match('/');
      if (start) return start;
    }
    throw err;
  }
}

async function eerstBewaard(req) {
  const cache = await caches.open(VERSIE);
  const opgeslagen = await cache.match(req);
  if (opgeslagen) return opgeslagen;
  const res = await fetch(req);
  if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
  return res;
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    if (nooitBewaren(url)) return;
    if (url.pathname.startsWith('/vendor/') || url.pathname.startsWith('/fonts/')) {
      e.respondWith(eerstBewaard(req));
    } else {
      e.respondWith(eerstNetwerk(req));
    }
    return;
  }
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(eerstBewaard(req));
  }
});
