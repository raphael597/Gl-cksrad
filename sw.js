/*
 * sw.js – Service Worker: macht das Glücksrad offline nutzbar.
 *
 * Strategie "Netz zuerst": Solange eine Verbindung besteht, kommt immer die
 * aktuelle Version vom Server (neue Deployments sind sofort da). Nur wenn das
 * Netz fehlt, wird die zuletzt gespeicherte Kopie verwendet.
 *
 * Läuft nur über HTTPS (oder localhost) – so verlangen es die Browser.
 */
const CACHE = 'gluecksrad-v2';

const DATEIEN = [
  './',
  'index.html',
  'impressum.html',
  'datenschutz.html',
  'manifest.webmanifest',
  'css/style.css',
  'js/design.js',
  'js/logik.js',
  'js/speicher.js',
  'js/effekte.js',
  'js/rad.js',
  'js/admin.js',
  'js/app.js',
  'js/einstellungen.js',
  'js/listen.js',
  'js/teams.js',
  'js/statistik.js',
  'js/werkzeuge.js',
  'js/pwa.js',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (ereignis) => {
  ereignis.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(DATEIEN))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (ereignis) => {
  // Alte Cache-Versionen aufräumen
  ereignis.waitUntil(
    caches
      .keys()
      .then((namen) => Promise.all(namen.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (ereignis) => {
  const anfrage = ereignis.request;
  const url = new URL(anfrage.url);
  if (anfrage.method !== 'GET' || url.origin !== self.location.origin || url.pathname.endsWith('/healthz')) return;

  ereignis.respondWith(
    fetch(anfrage)
      .then((antwort) => {
        if (antwort.ok) {
          const kopie = antwort.clone();
          caches.open(CACHE).then((cache) => cache.put(anfrage, kopie));
        }
        return antwort;
      })
      .catch(() =>
        caches
          .match(anfrage, { ignoreSearch: true })
          .then((treffer) => treffer || (anfrage.mode === 'navigate' ? caches.match('./') : Response.error()))
      )
  );
});
