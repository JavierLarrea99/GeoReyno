// Google Street View para el reto diario de Navarra Street.
// Las condiciones de Google obligan a usar su mapa junto a Street View, así que aquí está
// también el mapa de respuesta con Google Maps (misma interfaz que js/map.js).
// La clave (GOOGLE_MAPS_KEY) va en config.js / en los secretos de GitHub, restringida al dominio.

let loading = null;

export function loadGoogle(key) {
  if (window.google?.maps?.StreetViewPanorama) return Promise.resolve(window.google.maps);
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const cb = `__georeynoGoogle${Date.now()}`;
    window[cb] = () => {
      delete window[cb];
      resolve(window.google.maps);
    };
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly&language=es&region=ES&callback=${cb}`;
    s.async = true;
    s.onerror = () => reject(new Error("No se ha podido cargar Google Maps"));
    document.head.appendChild(s);
  });
  loading.catch(() => { loading = null; });
  return loading;
}

const PIN = (color) => ({
  path: "M12 0C5.4 0 0 5.2 0 11.7 0 20.5 12 32 12 32s12-11.5 12-20.3C24 5.2 18.6 0 12 0z",
  fillColor: color,
  fillOpacity: 1,
  strokeColor: "#ffffff",
  strokeWeight: 2,
  scale: 1,
  anchor: null,
});

// Mapa de respuesta con Google Maps: onPick, getGuess, showAnswer, reset, resize.
export async function createGoogleAnswerMap(container, data, key) {
  const gm = await loadGoogle(key);
  const [minX, minY, maxX, maxY] = data.bbox;
  const navBounds = new gm.LatLngBounds({ lat: minY, lng: minX }, { lat: maxY, lng: maxX });
  const map = new gm.Map(container, {
    center: navBounds.getCenter(),
    zoom: 8,
    disableDefaultUI: true,
    zoomControl: true,
    clickableIcons: false,
    streetViewControl: false, // sin el muñeco de Street View: sería hacer trampas
    gestureHandling: "greedy",
    mapTypeId: "roadmap",
  });
  map.fitBounds(navBounds, 12);
  // Contorno de Navarra (no recibe clics, para poder marcar encima).
  const polys = data.contorno.type === "Polygon" ? [data.contorno.coordinates] : data.contorno.coordinates;
  for (const poly of polys) {
    new gm.Polygon({
      map,
      paths: poly.map((ring) => ring.map(([lng, lat]) => ({ lat, lng }))),
      strokeColor: "#e5203d",
      strokeWeight: 2,
      fillOpacity: 0,
      clickable: false,
    });
  }
  const pin = (color) => ({ ...PIN(color), anchor: new gm.Point(12, 32) });
  let guess = null;
  let guessMarker = null;
  let answerMarker = null;
  let line = null;
  let locked = false;
  const listeners = [];

  map.addListener("click", (e) => {
    if (locked) return;
    guess = [e.latLng.lng(), e.latLng.lat()];
    if (!guessMarker) guessMarker = new gm.Marker({ map, icon: pin("#e5203d"), clickable: false });
    guessMarker.setPosition(e.latLng);
    guessMarker.setMap(map);
    listeners.forEach((fn) => fn(guess));
  });

  return {
    map,
    onPick(fn) { listeners.push(fn); },
    getGuess() { return guess; },
    showAnswer(answer) {
      locked = true;
      const pos = { lat: answer[1], lng: answer[0] };
      if (!answerMarker) answerMarker = new gm.Marker({ icon: pin("#2fc175"), clickable: false });
      answerMarker.setPosition(pos);
      answerMarker.setMap(map);
      const b = new gm.LatLngBounds();
      b.extend(pos);
      if (guess) {
        const g = { lat: guess[1], lng: guess[0] };
        b.extend(g);
        line = new gm.Polyline({
          map,
          path: [g, pos],
          strokeOpacity: 0,
          icons: [{ icon: { path: "M 0,-1 0,1", strokeOpacity: 1, strokeColor: "#1f1a17", scale: 3 }, offset: "0", repeat: "14px" }],
        });
        map.fitBounds(b, 70);
      } else {
        map.setCenter(pos);
        map.setZoom(12);
      }
    },
    reset() {
      locked = false;
      guess = null;
      guessMarker?.setMap(null);
      answerMarker?.setMap(null);
      line?.setMap(null);
      line = null;
      map.fitBounds(navBounds, 12);
    },
    resize() { /* Google Maps se ajusta solo al tamaño del contenedor */ },
  };
}

// Motor de fotos para Navarra Street con Google Street View.
export async function googleEngine(key) {
  const gm = await loadGoogle(key);
  const service = new gm.StreetViewService();
  let pano = null;
  return {
    name: "google",
    // Panorámica exterior más cercana (hasta 1 km) a un punto.
    async find(u) {
      try {
        const { data } = await service.getPanorama({
          location: { lat: u.lat, lng: u.lon },
          radius: 1000,
          source: gm.StreetViewSource.OUTDOOR,
          preference: gm.StreetViewPreference.NEAREST,
        });
        const ll = data.location.latLng;
        return { ...u, imagen: data.location.pano, lon: ll.lng(), lat: ll.lat(), autor: "" };
      } catch {
        return null;
      }
    },
    // Un solo visor para toda la partida: cambiar de sitio no crea uno nuevo.
    mount(container, loc, onImage) {
      pano = new gm.StreetViewPanorama(container, {
        pano: loc.imagen,
        pov: { heading: (loc.lon * 1e5) % 360, pitch: 0 },
        addressControl: false, // sin la dirección: daría la respuesta
        showRoadLabels: false,
        fullscreenControl: false,
        motionTracking: false,
        motionTrackingControl: false,
        enableCloseButton: false,
        panControl: false,
        zoomControl: true,
        linksControl: true,
        clickToGo: true,
      });
      pano.addListener("status_changed", () => onImage({ id: pano.getPano(), autor: "" }));
      onImage({ id: loc.imagen, autor: "" });
    },
    async show(loc) {
      pano.setPano(loc.imagen);
      pano.setPov({ heading: (loc.lon * 1e5) % 360, pitch: 0 });
    },
    credit() {
      return "Imágenes de Street View © Google";
    },
    remove() {
      pano = null;
    },
  };
}
