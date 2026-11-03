// Utilidades de Mapillary compartidas por «Navarra Street» y «Adivina el municipio»:
// token, búsqueda de fotos por zona, visor MapillaryJS y atribución.

import { esc, toast, loadPref, savePref, distanceKm } from "./engine.js";
import { getConfig } from "./cuenta.js";

const MAPILLARY_JS = "https://unpkg.com/mapillary-js@4.1.2/dist/mapillary";

// Token: primero config.js (en el servidor) y, si no, el guardado en este navegador.
export async function getToken() {
  const cfg = await getConfig();
  if (cfg.MAPILLARY_TOKEN) return String(cfg.MAPILLARY_TOKEN).trim();
  return String(loadPref("mapillary-token", "") || "").trim();
}

export function forgetToken() {
  savePref("mapillary-token", null);
}

export class TokenError extends Error {}

// Fotos de Mapillary dentro de un recuadro de ±`d` grados alrededor de [lon, lat].
export async function imagesAround(token, [lon, lat], d = 0.006, limit = 60) {
  const q = new URLSearchParams({
    access_token: token,
    fields: "id,geometry,creator,captured_at,is_pano,thumb_1024_url,sequence",
    bbox: [lon - d, lat - d, lon + d, lat + d].map((v) => v.toFixed(6)).join(","),
    limit: String(limit),
  });
  const res = await fetch(`https://graph.mapillary.com/images?${q}`);
  if (res.status === 401 || res.status === 403) throw new TokenError("token");
  if (!res.ok) throw new Error(`Mapillary ${res.status}`);
  const json = await res.json();
  return (json.data || []).filter((i) => i.geometry).map((i) => ({
    id: i.id,
    lon: i.geometry.coordinates[0],
    lat: i.geometry.coordinates[1],
    autor: i.creator?.username || "",
    fecha: i.captured_at || 0,
    pano: Boolean(i.is_pano),
    thumb: i.thumb_1024_url || "",
    sequence: i.sequence || "",
  }));
}

// La foto más cercana a un punto (se prefieren las panorámicas de 360°).
export async function nearestImage(token, pt) {
  for (const d of [0.002, 0.006]) {
    const list = await imagesAround(token, pt, d, 30);
    if (list.length) {
      list.sort((a, b) => (b.pano - a.pano) || (distanceKm(pt, [a.lon, a.lat]) - distanceKm(pt, [b.lon, b.lat])));
      return list[0];
    }
  }
  return null;
}

export function loadViewerLib() {
  if (window.mapillary) return Promise.resolve(window.mapillary);
  const load = (el) => new Promise((resolve, reject) => {
    el.onload = resolve;
    el.onerror = () => reject(new Error("No se ha podido cargar MapillaryJS"));
    document.head.appendChild(el);
  });
  const css = document.createElement("link");
  css.rel = "stylesheet";
  css.href = `${MAPILLARY_JS}.css`;
  const js = document.createElement("script");
  js.src = `${MAPILLARY_JS}.js`;
  return Promise.all([load(css), load(js)]).then(() => window.mapillary);
}

// Atribución de una foto. El enlace a la foto revela el sitio: solo se muestra al final.
export function photoCredit(author, imageId, reveal) {
  const who = author ? esc(author) : "colaborador de Mapillary";
  const link = reveal && imageId
    ? ` · <a href="https://www.mapillary.com/app/?pKey=${encodeURIComponent(imageId)}" target="_blank" rel="noopener">ver en Mapillary</a>`
    : "";
  return `Foto: ${who} · © Mapillary, <a href="https://creativecommons.org/licenses/by-sa/4.0/deed.es" target="_blank" rel="noopener">CC BY-SA 4.0</a>${link}`;
}

// Tarjeta que explica cómo configurar el token, con formulario para pegarlo.
export function renderNoToken(stage, modeName, reason = "") {
  stage.innerHTML = `
    <div class="card prose-card">
      <div class="topic">Falta configurar Mapillary</div>
      <h2 class="question">${esc(modeName)} necesita un token de Mapillary</h2>
      ${reason ? `<p class="note">${esc(reason)}</p>` : ""}
      <p>Las fotos de este modo vienen de <a href="https://www.mapillary.com" target="_blank" rel="noopener">Mapillary</a>: fotos a pie de calle hechas por voluntarios (licencia CC BY-SA 4.0). Para pedirlas hace falta un <b>token de cliente</b>, que es gratuito:</p>
      <ol>
        <li>Entra en <a href="https://www.mapillary.com/dashboard/developers" target="_blank" rel="noopener">mapillary.com/dashboard/developers</a> con tu cuenta.</li>
        <li>Pulsa «Register application», ponle un nombre (GeoReyno) y permiso de lectura.</li>
        <li>En la tabla, columna <b>Access Token</b>, pulsa «View» y copia el texto que empieza por <code>MLY|</code>.</li>
        <li>En la carpeta del proyecto, copia <code>config.example.js</code> como <code>config.js</code> y pega el token en <code>MAPILLARY_TOKEN</code>. Ese archivo no se sube al repositorio.</li>
      </ol>
      <p>Para probar ya, también puedes pegarlo aquí. Se guarda solo en este navegador:</p>
      <form class="guess-form" id="token-form" autocomplete="off">
        <label class="sr" for="token">Token de Mapillary</label>
        <input class="field" id="token" type="password" placeholder="MLY|…" spellcheck="false">
        <button class="btn" type="submit">Guardar</button>
      </form>
    </div>`;
  stage.querySelector("#token-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const value = stage.querySelector("#token").value.trim();
    if (!/^MLY\|/.test(value)) return toast("El token debe empezar por MLY|");
    savePref("mapillary-token", value);
    location.reload();
  });
}

// Motor de fotos para Navarra Street con Mapillary (misma interfaz que googleEngine).
export async function mapillaryEngine(token) {
  const mly = await loadViewerLib();
  let viewer = null;
  return {
    name: "mapillary",
    async find(u) {
      if (u.imagen) return { ...u };
      const f = await nearestImage(token, [u.lon, u.lat]);
      return f ? { ...u, imagen: f.id, lon: f.lon, lat: f.lat, autor: f.autor } : null;
    },
    mount(container, loc, onImage) {
      viewer = new mly.Viewer({
        accessToken: token,
        container,
        imageId: loc.imagen,
        component: { cover: false, attribution: false, bearing: false },
      });
      new ResizeObserver(() => viewer?.resize()).observe(container);
      viewer.on("image", (e) => onImage({ id: e.image?.id, autor: e.image?.creatorUsername || "" }));
    },
    show(loc) {
      return viewer.moveTo(loc.imagen);
    },
    credit(author, id, reveal) {
      return photoCredit(author, id, reveal);
    },
    remove() {
      viewer?.remove();
      viewer = null;
    },
  };
}
