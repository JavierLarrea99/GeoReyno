// Genera img/navarra.svg (mapa decorativo de la portada) a partir de data/municipios.json.
// Uso: node tools/build_mapa_svg.mjs
import fs from "node:fs";
const root = new URL("..", import.meta.url).pathname;
const data = JSON.parse(fs.readFileSync(root + "data/municipios.json", "utf8"));
const W = 470, H = 520, PAD = 14;
const [minX, minY, maxX, maxY] = data.bbox;
const k = Math.cos(((minY + maxY) / 2) * Math.PI / 180);
const s = Math.min((W - 2 * PAD) / ((maxX - minX) * k), (H - 2 * PAD) / (maxY - minY));
const ox = (W - (maxX - minX) * k * s) / 2, oy = (H - (maxY - minY) * s) / 2;
const P = ([x, y]) => [ox + (x - minX) * k * s, oy + (maxY - y) * s];
const path = (g) => (g.type === "Polygon" ? [g.coordinates] : g.coordinates)
  .map((poly) => poly.map((ring) => ring.map((p, i) => { const [a, b] = P(p); return `${i ? "L" : "M"}${a.toFixed(1)} ${b.toFixed(1)}`; }).join("") + "Z").join("")).join("");
const munis = data.municipios.map((m) => path(m.geom)).join("");
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Mapa de Navarra">
<defs><linearGradient id="f" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a3a55"/><stop offset="1" stop-color="#3a1422"/></linearGradient></defs>
<path d="${path(data.contorno)}" fill="url(#f)"/>
<path d="${munis}" fill="none" stroke="#5a6b88" stroke-width="0.5" stroke-opacity="0.55"/>
<path d="${path(data.contorno)}" fill="none" stroke="#ff3b57" stroke-width="2.6" stroke-linejoin="round"/>
</svg>`;
fs.writeFileSync(root + "img/navarra.svg", svg);
const at = (ine) => { const [a, b] = P(data.municipios.find((m) => m.ine === ine).centro); return `left:${(100 * a / W).toFixed(1)}%;top:${(100 * b / H).toFixed(1)}%`; };
console.log(`${(svg.length / 1024).toFixed(0)} KB`, "Pamplona", at("31201"), "Tudela", at("31232"), "Baztan", at("31050"), "Isaba", at("31128"));
