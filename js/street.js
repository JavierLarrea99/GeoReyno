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
import { getToken, forgetToken, TokenError, nearestImage, loadViewerLib, photoCredit, renderNoToken } from "./mapillary.js";

const MODE = "street";
const ROUNDS = 5;
const MAX = 5000 * ROUNDS;
const params = gameParams();
const room = Boolean(params.seed);
const practice = params.practice || room;

const $ = (id) => document.getElementById(id);
const stage = $("stage");

let data;
let token = "";
let sample = false;

// Ubicación lista para jugar: con id de foto y coordenadas reales de la foto.
async function resolveLocation(u) {
  if (u.imagen) return { ...u };
  const found = await nearestImage(token, [u.lon, u.lat]);
  return found ? { ...u, imagen: found.id, lon: found.lon, lat: found.lat, autor: found.autor } : null;
}

const noToken = (reason = "") => renderNoToken(stage, "Navarra Street", reason);

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
    [mly, answerMap] = await Promise.all([loadViewerLib(), createAnswerMap(($("map").innerHTML = "", $("map")), data)]);
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
      <p class="verdict">de ${formatNumber(MAX)} puntos. ${result.score >= 22000 ? "¡Eres un GPS con patas!" : result.score >= 15000 ? "Muy bien: te conoces Navarra calle a calle." : result.score >= 8000 ? "Nada mal. Fíjate en los carteles y las montañas." : "Navarra es grande… ¡mañana más!"}</p>
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
  if (!list.length && !sample) {
    stage.innerHTML = `<div class="card"><p>No hay ubicaciones en <code>data/street.json</code>. Genera la lista con <code>tools/cobertura_mapillary.py</code>.</p></div>`;
    return;
  }

  stage.innerHTML = `<div class="card"><p>Buscando las fotos de hoy…</p></div>`;
  const rand = practice && !room ? Math.random : seededRandom(`${MODE}:${key}`);
  // Con la lista real se usan sus ubicaciones. Con la de ejemplo, se buscan fotos en vivo
  // alrededor del centro de municipios elegidos al azar (con la semilla del día).
  const order = sample
    ? shuffle(data.municipios, rand).slice(0, 30).map((m) => ({ lon: m.centro[0], lat: m.centro[1], ine: m.ine, municipio: m.nombre }))
    : shuffle(list, rand);
  const locations = [];
  try {
    // En tandas de 5 peticiones a la vez; se respeta el orden para que el reto sea igual para todos.
    for (let i = 0; i < order.length && locations.length < ROUNDS; i += 5) {
      const found = await Promise.all(order.slice(i, i + 5).map(resolveLocation));
      for (const loc of found) if (loc && locations.length < ROUNDS) locations.push(loc);
    }
  } catch (e) {
    if (e instanceof TokenError) {
      forgetToken();
      return noToken("Mapillary no ha aceptado el token. Revisa que sea el «Client Token» de tu aplicación.");
    }
    stage.innerHTML = `<div class="card"><p>No se ha podido conectar con Mapillary. Comprueba la conexión y recarga la página.</p></div>`;
    return;
  }
  if (!locations.length) {
    stage.innerHTML = `<div class="card"><p>No se han encontrado fotos de Mapillary cerca de las ubicaciones de la lista.</p></div>`;
    return;
  }
  // Si hay pocas fotos, se repiten para completar las 5 rondas.
  while (locations.length < ROUNDS) locations.push(locations[locations.length % Math.max(1, locations.length)]);

  const saved = practice ? [] : loadPref(`${MODE}:partida:${key}`, []);
  play(locations, key, Array.isArray(saved) ? saved : []);
}

start();
