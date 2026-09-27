// BIBE - service worker, version 0.4.8
const CACHE = "bibe-0.4.8";
const SOCLE = ["./", "./index.html", "./manifest.webmanifest",
               "./icone-192.png", "./icone-512.png", "./apple-touch-icon.png"];
const DONNEES = "./points-de-vente.json";
// Les logos servent des le premier ecran des marques : gardes d'avance.
// Les photos des laits, plus lourdes, sont gardees a la premiere vue.
const LOGOS = ["./img/m/aptamil.webp", "./img/m/bledilait.webp", "./img/m/candia-baby.webp", "./img/m/france-lait.webp", "./img/m/gallia.webp", "./img/m/guigoz.webp", "./img/m/inostime.webp", "./img/m/lactel-eveil.webp", "./img/m/milsani.webp", "./img/m/modilac.webp", "./img/m/nan.webp", "./img/m/nidal.webp", "./img/m/novalac.webp", "./img/m/physiolac.webp", "./img/m/picot.webp", "./img/m/babybio.webp", "./img/m/biostime.webp", "./img/m/france-bebe-bio.webp", "./img/m/good-gout.webp", "./img/m/hipp-bio.webp", "./img/m/holle.webp", "./img/m/juneo.webp", "./img/m/les-recoltes-bio.webp", "./img/m/nactalia.webp", "./img/m/popote.webp", "./img/m/capricare.webp", "./img/m/kabrita.webp", "./img/m/pure-goat.webp", "./img/m/alfamino.webp", "./img/m/alfare.webp", "./img/m/althera.webp", "./img/m/infatrini.webp", "./img/m/neocate.webp", "./img/m/novalac-allernova.webp", "./img/m/nutramigen.webp"];

self.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll(SOCLE);
    // Les donnees sont lourdes : leur echec ne doit pas empecher
    // l'installation, elles seront recuperees a la premiere recherche.
    try { await c.add(DONNEES); } catch (err) {}
    try { await c.addAll(LOGOS); } catch (err) {}
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    const noms = await caches.keys();
    await Promise.all(noms.filter((n) => n !== CACHE).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // La sonde de version ne sort JAMAIS du cache.
  if (url.pathname.endsWith("version.json")) {
    e.respondWith(fetch(req, { cache: "no-store" }).catch(() => caches.match(req)));
    return;
  }

  // La page : reseau d'abord, pour recuperer un nouveau depot.
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req).then((rep) => {
        const copie = rep.clone();
        caches.open(CACHE).then((c) => c.put("./index.html", copie));
        return rep;
      }).catch(() => caches.match("./index.html"))
    );
    return;
  }

  // Le reste, donnees comprises : cache d'abord. Les donnees sont
  // renouvelees a chaque nouvelle version, par changement de nom du cache.
  e.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((rep) => {
      if (rep && rep.status === 200) {
        const copie = rep.clone();
        caches.open(CACHE).then((c) => c.put(req, copie));
      }
      return rep;
    }))
  );
});

/* ------------------------------------------------------------------ */
/* La question posee quelques heures apres un itineraire               */
/* ------------------------------------------------------------------ */

/* Personne ne revient dans une application pour dire qu'il a trouve son
   lait. La question vient donc a lui, une fois, quelques heures apres
   qu'il a demande l'itineraire, avec deux boutons dans la notification
   elle-meme : il repond sans ouvrir BIBE.

   La reponse est ecrite ici, dans le service worker, et non dans la
   page : celle-ci est fermee. Elle transite par un magasin que la page
   relira a sa prochaine ouverture. */

const ATTENTE = "bibe-reponses-en-attente";

async function garderReponse(reponse) {
  const c = await caches.open(ATTENTE);
  const cle = "./reponse-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);
  await c.put(new Request(cle), new Response(JSON.stringify(reponse), {
    headers: { "Content-Type": "application/json" },
  }));
}

self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = {}; }
  if (!d.pdv || !d.lait) return;
  const titre = "Avez-vous trouvé " + d.lait + " ?";
  e.waitUntil(self.registration.showNotification(titre, {
    body: d.lieu || "",
    tag: "bibe-retour-" + d.pdv,
    icon: "./icone-192.png",
    badge: "./icone-192.png",
    data: d,
    // Les deux boutons evitent d'ouvrir l'application pour un oui ou un
    // non. Certains telephones ne les affichent pas : on gere alors le
    // simple appui sur la notification, qui ouvre l'ecran de la question.
    actions: [
      { action: "oui", title: "Oui" },
      { action: "non", title: "Non" },
    ],
  }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const d = e.notification.data || {};
  if (e.action === "oui" || e.action === "non") {
    e.waitUntil(garderReponse({ pdv: d.pdv, cle: d.cle, v: e.action, date: d.date || "" }));
    return;
  }
  // Sans bouton : on ouvre BIBE sur la question, plutot que sur l'accueil.
  e.waitUntil((async () => {
    const ouverts = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const cible = "./?retour=" + encodeURIComponent((d.pdv || "") + "|" + (d.cle || ""));
    for (const c of ouverts) {
      if ("focus" in c) { c.postMessage({ bibe: "retour", d }); return c.focus(); }
    }
    if (self.clients.openWindow) return self.clients.openWindow(cible);
  })());
});
