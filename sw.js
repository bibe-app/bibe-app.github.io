// BIBE - service worker
// Version : 0.1.0
const CACHE = "bibe-0.1.0";
const SOCLE = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icone-192.png",
  "./icone-512.png",
  "./apple-touch-icon.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SOCLE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((noms) => Promise.all(noms.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // La sonde de version ne doit JAMAIS sortir du cache, sinon elle annonce
  // eternellement la version installee.
  if (url.pathname.endsWith("version.json")) {
    e.respondWith(fetch(req, { cache: "no-store" }).catch(() => caches.match(req)));
    return;
  }

  // La page : reseau d'abord pour recuperer un nouveau depot, cache en secours.
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((rep) => {
          const copie = rep.clone();
          caches.open(CACHE).then((c) => c.put("./index.html", copie));
          return rep;
        })
        .catch(() => caches.match("./index.html"))
    );
    return;
  }

  // Le reste : cache d'abord, reseau en secours.
  e.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((rep) => {
      if (rep && rep.status === 200 && rep.type === "basic") {
        const copie = rep.clone();
        caches.open(CACHE).then((c) => c.put(req, copie));
      }
      return rep;
    }))
  );
});
