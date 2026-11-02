// Service worker básico de GeoReyno: guarda una copia de los archivos propios para que la
// web abra sin conexión. Primero intenta la red (así siempre se ve la versión nueva) y,
// si no hay conexión, usa la copia. No toca peticiones a otros dominios (mapas, fotos…).
const CACHE = "georeyno-v1";
const CORE = [
  "./", "index.html", "quiz.html", "pueblo.html", "aire.html", "escudos.html", "mas.html",
  "street.html", "amigos.html", "estadisticas.html", "como-se-juega.html",
  "css/style.css", "js/theme.js", "js/engine.js", "js/layout.js", "js/geo.js",
  "data/preguntas.json", "data/municipios.json", "img/icon.svg", "manifest.json",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  if (url.pathname.endsWith("/config.js")) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true })),
  );
});
