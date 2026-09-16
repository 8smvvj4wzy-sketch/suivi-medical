/**
 * Service worker : l'application doit rester utilisable hors connexion
 * (la douleur ne prévient pas, le réseau non plus).
 * Stratégie : cache-first sur les ressources, mise à jour en arrière-plan.
 */

const CACHE = 'suivi-douleur-v1';
const RESSOURCES = [
  './',
  './index.html',
  './css/styles.css',
  './js/app.js',
  './js/analysis.js',
  './js/storage.js',
  './js/charts.js',
  './js/constants.js',
  './js/demo.js',
  './manifest.webmanifest',
  './icons/icone.svg',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(RESSOURCES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((cles) => Promise.all(cles.filter((c) => c !== CACHE).map((c) => caches.delete(c))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then((enCache) => {
      const reseau = fetch(e.request)
        .then((reponse) => {
          if (reponse && reponse.status === 200 && reponse.type === 'basic') {
            const copie = reponse.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copie));
          }
          return reponse;
        })
        .catch(() => enCache);
      return enCache || reseau;
    }),
  );
});
