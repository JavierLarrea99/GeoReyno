// Navarra Street: fotos a pie de calle de Mapillary (MapillaryJS). Te mueves por la secuencia
// y marcas en el mapa dónde estás. 5 rondas, 5000 · e^(−d/30 km) por ronda.
// Necesita un token de cliente de Mapillary en config.js (no se sube al repositorio).

import {
  dayNumber, seededRandom, shuffle, esc, toast, gameParams, formatNumber, distanceKm,
  getTodayResult, saveDailyResult, shareText, timeToNextDay, statsBlock, startCountdown,
  reportRound, reportFinal, loadPref, savePref,
} from "./engine.js";
import { loadMunicipios, municipioAt } from "./geo.js";
import { createAnswerMap, roundPoints, pointsSquare } from "./map.js";

const MODE = "street";
const ROUNDS = 5;
const MAX = 5000 * ROUNDS;
const MAPILLARY = "https://unpkg.com/mapillary-js@4.1.2/dist/mapillary";
const params = gameParams();
const room = Boolean(params.seed);
const practice = params.practice || room;

const $ = (id) => document.getElementById(id);
const stage = $("stage");

let data;
let token = "";
let sample = false;

// Token: primero config.js (en el servidor), si no, el guardado en este navegador.
async function getToken() {
  try {
    const cfg = await import("../config.js");
    if (cfg.MAPILLARY_TOKEN) return String(cfg.MAPILLARY_TOKEN).trim();
  } catch {
    /* sin config.js: es lo normal en una copia recién descargada */
  }
  return String(loadPref("mapillary-token", "") || "").trim();
}

function loadMapillary() {
  if (window.mapillary) return Promise.resolve(window.mapillary);
  const load = (el) => new Promise((resolve, reject) => {
    el.onload = resolve;
    el.onerror = () => reject(new Error("No se ha podido cargar MapillaryJS"));
    document.head.appendChild(el);
  });
  const css = document.createElement("link");
  css.rel = "stylesheet";
  css.href = `${MAPILLARY}.css`;
  const js = document.createElement("script");
  js.src = `${MAPILLARY}.js`;
  return Promise.all([load(css), load(js)]).then(() => window.mapillary);
}

// Busca la foto de Mapillary más cercana a un punto (se prefieren las panorámicas).
async function nearestImage([lon, lat]) {
  for (const d of [0.002, 0.006]) {
    const q = new URLSearchParams({
      access_token: token,
      fields: "id,geometry,creator,captured_at,is_pano",
      bbox: [lon - d, lat - d, lon + d, lat + d].map((v) => v.toFixed(6)).join(","),
      limit: "30",
    });
    const res = await fetch(`https://graph.mapillary.com/images?${q}`);
    if (res.status === 401 || res.status === 403) throw Object.assign(new Error("token"), { code: "token" });
    if (!res.ok) throw new Error(`Mapillary ${res.status}`);
    const json = await res.json();
    const list = (json.data || []).filter((i) => i.geometry);
    if (list.length) {
      list.sort((a, b) => (b.is_pano - a.is_pano) ||
        (distanceKm([lon, lat], a.geometry.coordinates) - distanceKm([lon, lat], b.geometry.coordinates)));
      const best = list[0];
      return {
        imagen: best.id,
        lon: best.geometry.coordinates[0],
        lat: best.geometry.coordinates[1],
        autor: best.creator?.username || "",
      };
    }
  }
  return null;
}

// Ubicación lista para jugar: con id de foto y coordenadas reales de la foto.
async function resolveLocation(u) {
  if (u.imagen) return { ...u };
  const found = await nearestImage([u.lon, u.lat]);
  return found ? { ...u, ...found } : null;
}

function noToken(reason = "") {
  stage.innerHTML = `
    <div class="card prose-card">
      <div class="topic">Falta configurar Mapillary</div>
      <h2 class="question">Navarra Street necesita un token de Mapillary</h2>
      ${reason ? `<p class="note">${esc(reason)}</p>` : ""}
      <p>Las fotos de este modo vienen de <a href="https://www.mapillary.com" target="_blank" rel="noopener">Mapillary</a>, fotos a pie de calle hechas por voluntarios (licencia CC BY-SA 4.0). Para pedirlas hace falta un <b>token de cliente</b>, que es gratuito:</p>
      <ol>
        <li>Entra en <a href="https://www.mapillary.com/dashboard/developers" target="_blank" rel="noopener">mapillary.com/dashboard/developers</a> con tu cuenta.</li>
        <li>Pulsa «Register application», ponle un nombre (GeoReyno) y permiso de lectura.</li>
        <li>Copia el <b>Client Token</b> (empieza por <code>MLY|</code>).</li>
        <li>En la carpeta del proyecto, copia <code>config.example.js</code> como <code>config.js</code> y pega el token en <code>MAPILLARY_TOKEN</code>. Ese archivo no se sube al repositorio.</li>
      </ol>
      <p>Para probar ya, también puedes pegarlo aquí. Se guarda solo en este navegador:</p>
      <form class="guess-form" id="token-form" autocomplete="off">
        <label class="sr" for="token">Token de Mapillary</label>
        <input class="field" id="token" type="password" placeholder="MLY|…" spellcheck="false">
        <button class="btn" type="submit">Guardar</button>
      </form>
    </div>`;
  $("token-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const value = $("token").value.trim();
    if (!/^MLY\|/.test(value)) return toast("El token debe empezar por MLY|");
    savePref("mapillary-token", value);
    location.reload();
  });
}

function label(key) {
  return room ? "Partida en sala" : practice ? "Práctica" : `Reto #${dayNumber(key)}`;
}

function drawProgress(results) {
  $("progress").innerHTML = Array.from({ length: ROUNDS }, (_, i) => {
    const r = results[i];
    if (!r) return `<i class="${i === results.length ? "now" : ""}"></i>`;
    return `<i class="${r.points >= 2000 ? "ok" : r.points >= 500 ? "mid" : "ko"}"></i>`;
  }).join("");
}

function photoCredit(author, imageId, reveal) {
  const who = author ? esc(author) : "autor desconocido";
  const link = reveal && imageId
    ? ` · <a href="https://www.mapillary.com/app/?pKey=${encodeURIComponent(imageId)}" target="_blank" rel="noopener">ver en Mapillary</a>`
    : "";
  return `Foto: ${who} · © Mapillary, <a href="https://creativecommons.org/licenses/by-sa/4.0/deed.es" target="_blank" rel="noopener">CC BY-SA 4.0</a>${link}`;
}

async function play(locations, key, saved = []) {
  const results = saved.slice(0, ROUNDS - 1);
  stage.innerHTML = `
    <div class="geo-layout">
      <div class="card photo-card">
        <div class="topic" id="round-label"></div>
        <div class="street-view" id="viewer"></div>
        <p class="credit" id="credit"></p>
        <p class="hint">Arrastra para mirar alrededor y usa las flechas para avanzar por la calle.</p>
      </div>
      <div class="card map-card">
        <div class="answer-map" id="map"><p class="map-loading">Cargando mapa…</p></div>
        <div class="round-info" id="info">Toca el mapa para poner tu marca.</div>
        <div class="actions"><button class="btn" id="confirm" disabled>Confirmar</button></div>
      </div>
    </div>`;

  let mly;
  let answerMap;
  try {
    [mly, answerMap] = await Promise.all([loadMapillary(), createAnswerMap(($("map").innerHTML = "", $("map")), data)]);
  } catch {
    stage.innerHTML = `<div class="card"><p>No se ha podido cargar el visor o el mapa. Comprueba la conexión y recarga la página.</p></div>`;
    return;
  }

  const viewer = new mly.Viewer({
    accessToken: token,
    container: $("viewer"),
    imageId: locations[results.length].imagen,
    component: { cover: false, attribution: false, bearing: false },
  });
  new ResizeObserver(() => viewer.resize()).observe($("viewer"));

  let round = results.length;
  let phase = "guess";
  let currentAuthor = locations[round].autor || "";
  let currentImage = locations[round].imagen;

  viewer.on("image", (e) => {
    currentAuthor = e.image?.creatorUsername || currentAuthor;
    currentImage = e.image?.id || currentImage;
    $("credit").innerHTML = photoCredit(currentAuthor, currentImage, phase === "answer");
  });

  const startRound = () => {
    phase = "guess";
    $("round-label").textContent = `${label(key)} · Ronda ${round + 1} de ${ROUNDS}`;
    $("info").textContent = "Toca el mapa para poner tu marca.";
    $("confirm").textContent = "Confirmar";
    $("confirm").disabled = true;
    currentAuthor = locations[round].autor || "";
    currentImage = locations[round].imagen;
    $("credit").innerHTML = photoCredit(currentAuthor, currentImage, false);
    answerMap.reset();
    drawProgress(results);
    if (round > 0 || saved.length) viewer.moveTo(locations[round].imagen).catch(() => toast("No se ha podido cargar esta foto"));
  };

  answerMap.onPick(() => { if (phase === "guess") $("confirm").disabled = false; });

  $("confirm").addEventListener("click", () => {
    if (phase === "guess") {
      const guess = answerMap.getGuess();
      if (!guess) return toast("Pon antes tu marca en el mapa");
      const loc = locations[round];
      const answer = [loc.lon, loc.lat];
      const km = distanceKm(guess, answer);
      const pts = roundPoints(km);
      results.push({ km: Math.round(km * 10) / 10, points: pts, imagen: loc.imagen, autor: currentAuthor });
      if (!practice) savePref(`${MODE}:partida:${key}`, results);
      answerMap.showAnswer(answer);
      reportRound(MODE, round, pts, 5000);
      drawProgress(results);
      phase = "answer";
      $("credit").innerHTML = photoCredit(currentAuthor, currentImage, true);
      const m = loc.municipio || municipioAt(answer, data)?.nombre || "";
      $("info").innerHTML = `<b>${formatNumber(pts)} puntos</b> · a ${km < 1 ? `${Math.round(km * 1000)} m` : `${km.toLocaleString("es-ES", { maximumFractionDigits: 1 })} km`}.
        ${m ? `Era en <b>${esc(m)}</b>${loc.lugar ? ` (${esc(loc.lugar)})` : ""}.` : ""}`;
      $("confirm").textContent = round === ROUNDS - 1 ? "Ver resultado" : "Siguiente ronda";
      return;
    }
    round++;
    if (round < ROUNDS) return startRound();
    viewer.remove();
    finish(results, key);
  });

  startRound();
}

function finish(results, key) {
  const score = results.reduce((n, r) => n + r.points, 0);
  const result = {
    score,
    total: MAX,
    label: `${formatNumber(score)} pts`,
    grid: results.map((r) => pointsSquare(r.points)).join(""),
    rounds: results,
  };
  if (!practice) {
    saveDailyResult(MODE, result, key);
    savePref(`${MODE}:partida:${key}`, null);
  }
  reportFinal(MODE, result);
  showResult(result, key);
}

function showResult(result, key) {
  drawProgress(result.rounds);
  stage.innerHTML = `
    <div class="card result">
      <div class="topic">${esc(label(key))}</div>
      <div class="score">${formatNumber(result.score)}</div>
      <p class="verdict">de ${formatNumber(MAX)} puntos.</p>
      <div class="grid">${result.grid}</div>
      <ol class="round-list">
        ${result.rounds.map((r, i) => `<li><span>Ronda ${i + 1}</span><span>${r.km.toLocaleString("es-ES")} km</span><b>${formatNumber(r.points)} pts</b></li>`).join("")}
      </ol>
      <p class="credit">Fotos de ${[...new Set(result.rounds.map((r) => r.autor).filter(Boolean))].map(esc).join(", ") || "colaboradores de Mapillary"} · © Mapillary, CC BY-SA 4.0.</p>
      <div class="actions">
        ${practice ? "" : `<button class="btn" id="share">Compartir resultado</button>`}
        ${room ? "" : `<a class="btn ghost" href="street.html?practica">${practice ? "Otra partida" : "Practicar más"}</a>`}
      </div>
      ${practice ? "" : `${statsBlock(MODE)}
      <p class="next">Próximo reto en <b id="countdown">${timeToNextDay()}</b></p>`}
    </div>`;
  $("share")?.addEventListener("click", async () => {
    const how = await shareText(`GeoReyno · Navarra Street #${dayNumber(key)}\n${result.grid} ${formatNumber(result.score)}/${formatNumber(MAX)}\n${location.origin}${location.pathname}`);
    if (how === "copied") toast("Resultado copiado. ¡Pégalo en el grupo!");
    if (how === "failed") toast("No se ha podido copiar");
  });
  startCountdown($("countdown"), key);
}

async function start() {
  const key = room ? params.seed : params.key;
  $("meta").textContent = room ? "Sala con amigos" : practice ? "Práctica" : `Reto #${dayNumber(key)}`;

  if (!practice) {
    const done = getTodayResult(MODE, key);
    if (done) return showResult(done, key);
  }

  token = await getToken();
  if (!token) return noToken();

  let list;
  try {
    const [muni, res] = await Promise.all([loadMunicipios(), fetch("data/street.json")]);
    data = muni;
    if (!res.ok) throw new Error(res.status);
    const json = await res.json();
    sample = Boolean(json.ejemplo);
    list = json.ubicaciones || [];
  } catch {
    stage.innerHTML = `<div class="card"><p>No se han podido cargar las ubicaciones. Recarga la página.</p></div>`;
    return;
  }
  if (!list.length) {
    stage.innerHTML = `<div class="card"><p>No hay ubicaciones en <code>data/street.json</code>. Genera la lista con <code>tools/cobertura_mapillary.py</code>.</p></div>`;
    return;
  }

  stage.innerHTML = `<div class="card"><p>Buscando las fotos de hoy…</p></div>`;
  const rand = practice && !room ? Math.random : seededRandom(`${MODE}:${key}`);
  const order = shuffle(list, rand);
  const locations = [];
  try {
    for (const u of order) {
      if (locations.length >= ROUNDS) break;
      const loc = await resolveLocation(u);
      if (loc) locations.push(loc);
    }
  } catch (e) {
    if (e.code === "token") {
      savePref("mapillary-token", null);
      return noToken("Mapillary no ha aceptado el token. Revisa que sea el «Client Token» de tu aplicación.");
    }
    stage.innerHTML = `<div class="card"><p>No se ha podido conectar con Mapillary. Comprueba la conexión y recarga la página.</p></div>`;
    return;
  }
  if (!locations.length) {
    stage.innerHTML = `<div class="card"><p>No se han encontrado fotos de Mapillary cerca de las ubicaciones de la lista.</p></div>`;
    return;
  }
  // Con pocas ubicaciones (datos de ejemplo) se repiten para completar las 5 rondas.
  while (locations.length < ROUNDS) locations.push(locations[locations.length % Math.max(1, locations.length)]);
  if (sample) toast("Datos de ejemplo: pocas ubicaciones");

  const saved = practice ? [] : loadPref(`${MODE}:partida:${key}`, []);
  play(locations, key, Array.isArray(saved) ? saved : []);
}

start();
