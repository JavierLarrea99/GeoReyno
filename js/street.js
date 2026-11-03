// Navarra Street: fotos a pie de calle de Mapillary (MapillaryJS). Te mueves por la secuencia
// y marcas en el mapa dónde estás. 5 rondas, 5000 · e^(−d/30 km) por ronda.
// Necesita un token de cliente de Mapillary en config.js (no se sube al repositorio).

import {
  dayNumber, seededRandom, shuffle, esc, toast, gameParams, formatNumber, distanceKm,
  getTodayResult, saveDailyResult, shareText, timeToNextDay, statsBlock, startCountdown,
  reportRound, reportFinal, loadPref, savePref, loadingHTML,
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

async function play(finder, key, saved = []) {
  const locations = finder.list;
  const results = saved.slice(0, ROUNDS - 1);
  document.body.classList.add("playing");
  stage.innerHTML = `
    <div class="sv" id="sv">
      <div class="sv-view" id="viewer"></div>
      <div id="sv-loading">${loadingHTML("Cargando la foto…")}</div>
      <div class="sv-hud">
        <div class="hud-box"><span>Ronda</span><b id="round-label">1/${ROUNDS}</b></div>
        <div class="hud-box"><span>Puntos</span><b id="hud-score">0</b></div>
      </div>
      <button class="sv-btn sv-fs" id="fs" aria-label="Pantalla completa" title="Pantalla completa">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>
      </button>
      <p class="sv-credit" id="credit"></p>
      <div class="sv-map" id="mapbox">
        <button class="sv-map-toggle" id="map-toggle" aria-expanded="false"><span class="grip" aria-hidden="true"></span><span id="map-toggle-text">Abrir el mapa para adivinar</span></button>
        <div class="answer-map" id="map">${loadingHTML("Cargando mapa…")}</div>
        <div class="round-info" id="info">Toca el mapa para poner tu marca.</div>
        <button class="btn" id="confirm" disabled>Adivinar</button>
      </div>
    </div>`;

  const sv = $("sv");
  const mapbox = $("mapbox");
  const setOpen = (open) => {
    mapbox.classList.toggle("open", open);
    $("map-toggle").setAttribute("aria-expanded", String(open));
    $("map-toggle-text").textContent = open ? "Cerrar el mapa" : "Abrir el mapa para adivinar";
  };
  $("map-toggle").addEventListener("click", () => setOpen(!mapbox.classList.contains("open")));
  // Pantalla completa: API del navegador o, si no existe (iPhone), ocupar toda la ventana.
  $("fs").addEventListener("click", async () => {
    if (document.fullscreenElement) return document.exitFullscreen();
    if (sv.classList.contains("fake-fs")) return sv.classList.remove("fake-fs");
    try {
      if (sv.requestFullscreen) await sv.requestFullscreen();
      else throw new Error("sin API");
    } catch {
      sv.classList.add("fake-fs");
    }
  });

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
    imageId: (await finder.get(results.length)).imagen,
    component: { cover: false, attribution: false, bearing: false },
  });
  new ResizeObserver(() => viewer.resize()).observe($("viewer"));

  let round = results.length;
  let phase = "guess";
  let currentAuthor = locations[round].autor || "";
  let currentImage = locations[round].imagen;

  viewer.on("image", (e) => {
    $("sv-loading")?.setAttribute("hidden", "");
    currentAuthor = e.image?.creatorUsername || currentAuthor;
    currentImage = e.image?.id || currentImage;
    $("credit").innerHTML = photoCredit(currentAuthor, currentImage, phase === "answer");
  });

  const startRound = async () => {
    phase = "guess";
    const loc = await finder.get(round).catch(() => null);
    if (!loc) return toast("No se ha podido cargar la siguiente foto");
    locations[round] ||= loc;
    finder.get(round + 1).catch(() => {}); // ir buscando la siguiente
    $("round-label").textContent = `${round + 1}/${ROUNDS}`;
    $("hud-score").textContent = formatNumber(results.reduce((n, r) => n + r.points, 0));
    $("info").textContent = "Toca el mapa para poner tu marca.";
    $("confirm").textContent = "Adivinar";
    mapbox.classList.remove("big");
    setOpen(false);
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
      mapbox.classList.add("big");
      setOpen(true);
      answerMap.showAnswer(answer);
      $("hud-score").textContent = formatNumber(results.reduce((n, r) => n + r.points, 0));
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
    if (document.fullscreenElement) document.exitFullscreen();
    document.body.classList.remove("playing");
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

  stage.innerHTML = `<div class="card">${loadingHTML("Buscando las fotos de hoy…")}</div>`;
  const rand = practice && !room ? Math.random : seededRandom(`${MODE}:${key}`);
  // Con la lista real se usan sus ubicaciones. Con la de ejemplo, se buscan fotos en vivo
  // alrededor del centro de municipios elegidos al azar (con la semilla del día).
  const order = sample
    ? shuffle(data.municipios, rand).slice(0, 30).map((m) => ({ lon: m.centro[0], lat: m.centro[1], ine: m.ine, municipio: m.nombre }))
    : shuffle(list, rand);
  // Buscador progresivo: encuentra las fotos en orden (igual para todos) y en segundo plano,
  // así la partida empieza en cuanto aparece la primera.
  const finder = {
    list: [],
    next: 0,
    busy: null,
    async upTo(n) {
      while (this.list.length < n && this.next < order.length) {
        if (!this.busy) {
          const batch = order.slice(this.next, this.next + 5);
          this.next += 5;
          this.busy = Promise.all(batch.map(resolveLocation)).then((found) => {
            for (const loc of found) if (loc && this.list.length < ROUNDS) this.list.push(loc);
          }).finally(() => { this.busy = null; });
        }
        await this.busy;
      }
    },
    async get(i) {
      await this.upTo(i + 1);
      return this.list[i] || this.list[i % Math.max(1, this.list.length)];
    },
  };

  const saved = practice ? [] : loadPref(`${MODE}:partida:${key}`, []);
  const savedRounds = Array.isArray(saved) ? saved : [];
  try {
    await finder.get(Math.min(savedRounds.length, ROUNDS - 1));
  } catch (e) {
    if (e instanceof TokenError) {
      forgetToken();
      return noToken("Mapillary no ha aceptado el token. Revisa que sea el «Client Token» de tu aplicación.");
    }
    stage.innerHTML = `<div class="card"><p>No se ha podido conectar con Mapillary. Comprueba la conexión y recarga la página.</p></div>`;
    return;
  }
  if (!finder.list.length) {
    stage.innerHTML = `<div class="card"><p>No se han encontrado fotos de Mapillary cerca de las ubicaciones de la lista.</p></div>`;
    return;
  }
  play(finder, key, savedRounds);
}

start();
