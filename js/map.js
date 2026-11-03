// Mapa para responder (MapLibre + teselas de OpenStreetMap).
// Lo usa «Navarra Street». MapLibre se carga desde el CDN con versión fija.

const MAPLIBRE = "https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl";

let loading = null;

// Carga MapLibre (JS y CSS) una sola vez.
export function loadMapLibre() {
  if (window.maplibregl) return Promise.resolve(window.maplibregl);
  if (loading) return loading;
  const load = (el) => new Promise((resolve, reject) => {
    el.onload = resolve;
    el.onerror = () => reject(new Error("No se ha podido cargar MapLibre"));
    document.head.appendChild(el);
  });
  const css = document.createElement("link");
  css.rel = "stylesheet";
  css.href = `${MAPLIBRE}.css`;
  const js = document.createElement("script");
  js.src = `${MAPLIBRE}.js`;
  // Esperamos también a la hoja de estilos: sin ella el lienzo del mapa se crea con un tamaño erróneo.
  loading = Promise.all([load(css), load(js)]).then(() => {
    if (!window.maplibregl) throw new Error("MapLibre no disponible");
    return window.maplibregl;
  });
  loading.catch(() => { loading = null; });
  return loading;
}

function styleFor() {
  return {
    version: 8,
    sources: {
      osm: {
        type: "raster",
        tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
        tileSize: 256,
        maxzoom: 19,
        attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>',
      },
    },
    layers: [
      { id: "fondo", type: "background", paint: { "background-color": "#e8e2d6" } },
      { id: "osm", type: "raster", source: "osm" },
    ],
  };
}

// Crea el mapa de respuesta dentro de `container`.
// `data` es el contenido de municipios.json (se dibuja el contorno de Navarra).
export async function createAnswerMap(container, data) {
  const maplibregl = await loadMapLibre();
  const [minX, minY, maxX, maxY] = data.bbox;
  const map = new maplibregl.Map({
    container,
    style: styleFor(),
    bounds: [[minX, minY], [maxX, maxY]],
    fitBoundsOptions: { padding: 12 },
    maxBounds: [[minX - 1.2, minY - 0.8], [maxX + 1.2, maxY + 0.8]],
    attributionControl: false,
    dragRotate: false,
    pitchWithRotate: false,
    cooperativeGestures: false,
  });
  map.touchZoomRotate.disableRotation();
  map.addControl(new maplibregl.AttributionControl({
    compact: true,
    customAttribution: "Límite de Navarra: INE",
  }));
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

  await new Promise((resolve) => (map.loaded() ? resolve() : map.once("load", resolve)));
  // Si cambia el tamaño del contenedor (giro del móvil, columnas), el mapa se ajusta.
  new ResizeObserver(() => map.resize()).observe(container);

  map.addSource("navarra", { type: "geojson", data: { type: "Feature", geometry: data.contorno, properties: {} } });
  map.addLayer({ id: "navarra-borde", type: "line", source: "navarra", paint: { "line-color": "#b3122e", "line-width": 2, "line-opacity": 0.8 } });
  map.addSource("linea", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  map.addLayer({ id: "linea", type: "line", source: "linea", paint: { "line-color": "#1f1a17", "line-width": 2.5, "line-dasharray": [2, 1.5] } });

  let guess = null;
  let guessMarker = null;
  let answerMarker = null;
  let locked = false;
  const listeners = [];

  const makeEl = (cls) => {
    // MapLibre usa el `transform` del elemento para colocarlo: la chincheta girada va dentro.
    const el = document.createElement("div");
    el.className = "pin-wrap";
    el.innerHTML = `<div class="pin ${cls}"></div>`;
    return el;
  };

  map.on("click", (e) => {
    if (locked) return;
    guess = [e.lngLat.lng, e.lngLat.lat];
    if (!guessMarker) guessMarker = new maplibregl.Marker({ element: makeEl("pin-guess"), anchor: "bottom" });
    guessMarker.setLngLat(guess).addTo(map);
    listeners.forEach((fn) => fn(guess));
  });

  return {
    map,
    onPick(fn) { listeners.push(fn); },
    getGuess() { return guess; },
    // Muestra la respuesta correcta y la línea hasta la marca del jugador.
    showAnswer(answer) {
      locked = true;
      if (!answerMarker) answerMarker = new maplibregl.Marker({ element: makeEl("pin-answer"), anchor: "bottom" });
      answerMarker.setLngLat(answer).addTo(map);
      const coords = guess ? [guess, answer] : [answer];
      map.getSource("linea").setData({
        type: "FeatureCollection",
        features: guess ? [{ type: "Feature", geometry: { type: "LineString", coordinates: coords }, properties: {} }] : [],
      });
      const xs = coords.map((c) => c[0]);
      const ys = coords.map((c) => c[1]);
      map.fitBounds([[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]], { padding: 50, maxZoom: 13, duration: 600 });
    },
    // Deja el mapa listo para la ronda siguiente.
    reset() {
      locked = false;
      guess = null;
      guessMarker?.remove();
      answerMarker?.remove();
      map.getSource("linea").setData({ type: "FeatureCollection", features: [] });
      map.fitBounds([[minX, minY], [maxX, maxY]], { padding: 12, duration: 0 });
    },
    resize() { map.resize(); },
  };
}

// Puntos de una ronda: 5000 · e^(−d/30 km).
export function roundPoints(km) {
  return Math.round(5000 * Math.exp(-km / 30));
}

// Cuadrito según los puntos de una ronda.
export function pointsSquare(points) {
  if (points >= 4000) return "🟩";
  if (points >= 2000) return "🟨";
  if (points >= 500) return "🟧";
  return "🟥";
}
