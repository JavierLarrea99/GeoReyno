// Utilidades geográficas compartidas: carga de municipios, proyección sencilla a SVG,
// punto dentro de polígono y puntos aleatorios dentro de Navarra.

import { normalize } from "./engine.js";

let cache = null;

// Carga data/municipios.json una sola vez y añade campos de búsqueda.
export async function loadMunicipios() {
  if (cache) return cache;
  const res = await fetch("data/municipios.json");
  if (!res.ok) throw new Error(`municipios.json: ${res.status}`);
  const data = await res.json();
  for (const m of data.municipios) {
    m.search = m.nombres.map(normalize);
  }
  data.byIne = new Map(data.municipios.map((m) => [m.ine, m]));
  cache = data;
  return data;
}

// Recorre todos los anillos exteriores e interiores de un Polygon o MultiPolygon.
function polygons(geom) {
  return geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;
}

export function geomBounds(geom) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const poly of polygons(geom)) {
    for (const [x, y] of poly[0]) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return [minX, minY, maxX, maxY];
}

// Proyección equirrectangular corregida por la latitud media: suficiente para un área
// del tamaño de Navarra. Devuelve una función [lon, lat] -> [x, y] que encaja `bounds`
// dentro de un rectángulo de `width` x `height` con `pad` de margen.
export function makeProjection(bounds, width, height, pad = 10) {
  const [minX, minY, maxX, maxY] = bounds;
  const k = Math.cos(((minY + maxY) / 2) * Math.PI / 180);
  const w = Math.max((maxX - minX) * k, 1e-9);
  const h = Math.max(maxY - minY, 1e-9);
  const s = Math.min((width - 2 * pad) / w, (height - 2 * pad) / h);
  const ox = (width - w * s) / 2;
  const oy = (height - h * s) / 2;
  const project = ([lon, lat]) => [ox + (lon - minX) * k * s, oy + (maxY - lat) * s];
  project.scale = s;
  project.k = k;
  return project;
}

// Atributo `d` de un <path> SVG para una geometría.
export function svgPath(geom, project) {
  let d = "";
  for (const poly of polygons(geom)) {
    for (const ring of poly) {
      ring.forEach((pt, i) => {
        const [x, y] = project(pt);
        d += `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
      });
      d += "Z";
    }
  }
  return d;
}

function inRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// ¿Está el punto [lon, lat] dentro de la geometría?
export function pointInGeom(pt, geom) {
  return polygons(geom).some((poly) => inRing(pt, poly[0]) && !poly.slice(1).some((hole) => inRing(pt, hole)));
}

// Municipio que contiene un punto (o null).
export function municipioAt(pt, data) {
  return data.municipios.find((m) => pointInGeom(pt, m.geom)) || null;
}

// Punto aleatorio dentro de Navarra (en un municipio) usando el generador `rand`.
export function randomPointInNavarra(data, rand, tries = 500) {
  const [minX, minY, maxX, maxY] = data.bbox;
  for (let i = 0; i < tries; i++) {
    const pt = [minX + rand() * (maxX - minX), minY + rand() * (maxY - minY)];
    const m = municipioAt(pt, data);
    if (m) return { pt: [Math.round(pt[0] * 1e5) / 1e5, Math.round(pt[1] * 1e5) / 1e5], municipio: m };
  }
  const m = data.municipios[0];
  return { pt: m.centro, municipio: m };
}

// Busca municipios por texto (sin tildes ni mayúsculas). Primero los que empiezan así.
export function searchMunicipios(data, text, limit = 8) {
  const q = normalize(text);
  if (!q) return [];
  const starts = [];
  const contains = [];
  for (const m of data.municipios) {
    if (m.search.some((n) => n.startsWith(q))) starts.push(m);
    else if (m.search.some((n) => n.includes(q))) contains.push(m);
  }
  return starts.concat(contains).slice(0, limit);
}

// Encuentra un municipio por nombre exacto (normalizado) en cualquiera de sus idiomas.
export function findMunicipio(data, text) {
  const q = normalize(text);
  return data.municipios.find((m) => m.search.includes(q) || normalize(m.nombre) === q) || null;
}
