// Genera data/municipios.json a partir del paquete npm es-atlas (TopoJSON del IGN).
//
// Uso (desde una carpeta cualquiera con las dependencias instaladas):
//   npm i es-atlas@0.6.0 topojson-client topojson-simplify d3-geo
//   node /ruta/a/GeoReyno/tools/build_municipios.mjs /ruta/a/node_modules /ruta/a/GeoReyno/data/municipios.json
//
// Extrae los municipios cuyo código INE empieza por 31 (Navarra), simplifica la
// geometría manteniendo los bordes compartidos, redondea coordenadas a 4 decimales
// (unos 10 m) y calcula centroide y superficie aproximada.

import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const [nm, out] = process.argv.slice(2);
if (!nm || !out) {
  console.error("Uso: node build_municipios.mjs <node_modules> <salida.json>");
  process.exit(1);
}
const require = createRequire(path.join(nm, "x.js"));
const topo = require("es-atlas/es/municipalities.json");
const { feature, merge } = require("topojson-client");
const { presimplify, simplify, quantile } = require("topojson-simplify");
const d3 = require("d3-geo");

// Nos quedamos solo con Navarra antes de simplificar.
topo.objects = {
  municipios: {
    type: "GeometryCollection",
    geometries: topo.objects.municipalities.geometries.filter((g) => String(g.id).startsWith("31")),
  },
};

// Superficie con la geometría original (antes de simplificar).
const R = 6371.0088;
const fullArea = new Map(
  feature(topo, topo.objects.municipios).features.map((f) => [f.id, d3.geoArea(f) * R * R]),
);

const pre = presimplify(topo);
// es-atlas ya viene bastante simplificado: solo quitamos los puntos que no aportan nada.
const simple = simplify(pre, quantile(pre, 0));

const round = (c) => (Array.isArray(c[0]) ? c.map(round) : [Math.round(c[0] * 1e4) / 1e4, Math.round(c[1] * 1e4) / 1e4]);
function clean(geom) {
  return { type: geom.type, coordinates: round(geom.coordinates) };
}

const names = (raw) => raw.split("/").map((s) => s.trim()).filter(Boolean);

const municipios = feature(simple, simple.objects.municipios).features.map((f) => {
  const nombres = names(f.properties.name);
  const c = d3.geoCentroid(f);
  return {
    ine: String(f.id),
    nombre: nombres.join(" / "),
    nombres,
    centro: [Math.round(c[0] * 1e4) / 1e4, Math.round(c[1] * 1e4) / 1e4],
    area_km2: Math.round(fullArea.get(f.id) * 100) / 100,
    geom: clean(f.geometry),
  };
}).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

// Contorno de Navarra: unión de todos los municipios, sin huecos interiores (Bardenas,
// Aralar, Urbasa… son terrenos comunales que no pertenecen a ningún municipio).
const merged = merge(simple, simple.objects.municipios.geometries);
const contorno = clean({
  type: "MultiPolygon",
  coordinates: (merged.type === "Polygon" ? [merged.coordinates] : merged.coordinates).map((poly) => [poly[0]]),
});
const bbox = d3.geoBounds({ type: "Feature", geometry: contorno, properties: {} });

const data = {
  fuente: "Instituto Geográfico Nacional (IGN), vía el paquete npm es-atlas 0.6.0. Geometría simplificada para GeoReyno.",
  licencia: "CC BY 4.0 · © Instituto Geográfico Nacional",
  nota: "Superficie (area_km2) calculada a partir de la geometría del IGN antes de simplificar; es aproximada.",
  bbox: bbox.flat().map((v) => Math.round(v * 1e4) / 1e4),
  contorno,
  municipios,
};

fs.writeFileSync(out, JSON.stringify(data));
console.log(`${municipios.length} municipios · ${(fs.statSync(out).size / 1024).toFixed(0)} KB`);
