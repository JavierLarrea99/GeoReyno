// Desde el aire: 5 recortes de ortofoto; el jugador marca en el mapa dónde están.
// Puntos por ronda: 5000 · e^(−d/30 km). Con ?antigua se usa la ortofoto de 1956-1957.

import {
  dayNumber, seededRandom, esc, toast, gameParams, formatNumber, distanceKm,
  getTodayResult, saveDailyResult, shareText, timeToNextDay, statsBlock, startCountdown,
  reportRound, reportFinal, loadPref, savePref,
} from "./engine.js";
import { loadMunicipios, pointInGeom } from "./geo.js";
import { createAnswerMap, roundPoints, pointsSquare } from "./map.js";

const ROUNDS = 5;
const MAX = 5000 * ROUNDS;
const params = gameParams();
const antigua = new URLSearchParams(location.search).has("antigua");
const MODE = antigua ? "aire-antigua" : "aire";
const room = Boolean(params.seed);
const practice = params.practice || room;

// Anchura de la foto en metros según el nivel de zoom (se puede alejar).
const WIDTHS = [1200, 2400, 4800];
const IMG_PX = 768;

const $ = (id) => document.getElementById(id);
const stage = $("stage");

let data;
let sources = [];
let workingSource = 0;

// Elige los 5 puntos del reto: un municipio al azar y un punto cerca de su centro (donde suele estar el pueblo).
function pickPoints(seedText) {
  const rand = seededRandom(seedText);
  const used = new Set();
  const points = [];
  while (points.length < ROUNDS) {
    const m = data.municipios[Math.floor(rand() * data.municipios.length)];
    if (used.has(m.ine)) continue;
    used.add(m.ine);
    let pt = m.centro;
    for (let i = 0; i < 30; i++) {
      const r = 0.9 * Math.sqrt(rand());
      const a = rand() * 2 * Math.PI;
      const cand = [
        m.centro[0] + (r * Math.cos(a)) / (111.32 * Math.cos((m.centro[1] * Math.PI) / 180)),
        m.centro[1] + (r * Math.sin(a)) / 110.57,
      ];
      if (pointInGeom(cand, m.geom)) {
        pt = cand;
        break;
      }
    }
    points.push({ pt: [Math.round(pt[0] * 1e5) / 1e5, Math.round(pt[1] * 1e5) / 1e5], ine: m.ine });
  }
  return points;
}

// URL GetMap (WMS 1.1.1, EPSG:4326: el orden del BBOX es lon,lat) de un recuadro de `meters` de lado.
function wmsUrl(source, [lon, lat], meters) {
  const half = meters / 2;
  const dLat = half / 110570;
  const dLon = half / (111320 * Math.cos((lat * Math.PI) / 180));
  const bbox = [lon - dLon, lat - dLat, lon + dLon, lat + dLat].map((v) => v.toFixed(6)).join(",");
  const q = new URLSearchParams({
    SERVICE: "WMS", VERSION: "1.1.1", REQUEST: "GetMap", LAYERS: source.capa, STYLES: "",
    SRS: "EPSG:4326", BBOX: bbox, WIDTH: IMG_PX, HEIGHT: IMG_PX, FORMAT: "image/jpeg",
  });
  return `${source.url}?${q}`;
}

// Carga la foto probando las fuentes en orden hasta que una funcione.
function loadPhoto(img, pt, meters, creditEl) {
  return new Promise((resolve) => {
    const tryFrom = (i) => {
      if (i >= sources.length) {
        img.removeAttribute("src");
        img.closest(".photo").classList.add("failed");
        creditEl.textContent = "";
        return resolve(false);
      }
      const src = sources[i];
      img.onload = () => {
        workingSource = i;
        img.closest(".photo").classList.remove("loading", "failed");
        creditEl.textContent = src.atribucion;
        resolve(true);
      };
      img.onerror = () => tryFrom(i + 1);
      img.closest(".photo").classList.add("loading");
      img.src = wmsUrl(src, pt, meters);
    };
    tryFrom(workingSource);
  });
}

function headerLabel(key) {
  if (room) return "Partida en sala";
  if (practice) return "Práctica";
  return `Reto #${dayNumber(key)}`;
}

async function play(points, key, saved = []) {
  const results = saved.slice(0, ROUNDS - 1);
  stage.innerHTML = `
    <div class="geo-layout">
      <div class="card photo-card">
        <div class="topic" id="round-label"></div>
        <div class="photo loading">
          <img id="photo" alt="Ortofoto de un lugar de Navarra" width="${IMG_PX}" height="${IMG_PX}">
          <p class="photo-error">No se ha podido cargar la ortofoto. Comprueba la conexión y pulsa «Reintentar».</p>
        </div>
        <div class="photo-tools">
          <button class="btn ghost small" id="zoom-out">Alejar</button>
          <button class="btn ghost small" id="zoom-in" disabled>Acercar</button>
          <button class="btn ghost small" id="retry" hidden>Reintentar</button>
          <span class="photo-scale" id="scale"></span>
        </div>
        <p class="credit" id="credit"></p>
      </div>
      <div class="card map-card">
        <div class="answer-map" id="map"><p class="map-loading">Cargando mapa…</p></div>
        <div class="round-info" id="info">Toca el mapa para poner tu marca.</div>
        <div class="actions">
          <button class="btn" id="confirm" disabled>Confirmar</button>
        </div>
      </div>
    </div>`;

  let answerMap;
  try {
    $("map").innerHTML = "";
    answerMap = await createAnswerMap($("map"), data);
  } catch {
    $("map").innerHTML = `<p class="map-loading">No se ha podido cargar el mapa. Recarga la página.</p>`;
    return;
  }

  const img = $("photo");
  const credit = $("credit");
  let round = results.length;
  let zoom = 0;
  let phase = "guess";

  const showPhoto = () => {
    $("zoom-in").disabled = zoom === 0;
    $("zoom-out").disabled = zoom === WIDTHS.length - 1;
    $("scale").textContent = `${(WIDTHS[zoom] / 1000).toLocaleString("es-ES")} km de lado`;
    loadPhoto(img, points[round].pt, WIDTHS[zoom], credit).then((ok) => { $("retry").hidden = ok; });
  };

  const startRound = () => {
    phase = "guess";
    zoom = 0;
    $("round-label").textContent = `${headerLabel(key)}${antigua ? " · 1956-1957" : ""} · Ronda ${round + 1} de ${ROUNDS}`;
    $("info").textContent = "Toca el mapa para poner tu marca.";
    $("confirm").textContent = "Confirmar";
    $("confirm").disabled = true;
    answerMap.reset();
    showPhoto();
    drawProgress(results);
  };

  $("zoom-out").addEventListener("click", () => { if (zoom < WIDTHS.length - 1) { zoom++; showPhoto(); } });
  $("zoom-in").addEventListener("click", () => { if (zoom > 0) { zoom--; showPhoto(); } });
  $("retry").addEventListener("click", () => { workingSource = 0; showPhoto(); });

  answerMap.onPick(() => {
    if (phase === "guess") $("confirm").disabled = false;
  });

  $("confirm").addEventListener("click", () => {
    if (phase === "guess") {
      const guess = answerMap.getGuess();
      if (!guess) return toast("Pon antes tu marca en el mapa");
      const answer = points[round].pt;
      const km = distanceKm(guess, answer);
      const pts = roundPoints(km);
      const m = data.byIne.get(points[round].ine);
      results.push({ km: Math.round(km * 10) / 10, points: pts });
      if (!practice) savePref(`${MODE}:partida:${key}`, results);
      answerMap.showAnswer(answer);
      reportRound(MODE, round, pts, 5000);
      drawProgress(results);
      $("info").innerHTML = `<b>${formatNumber(pts)} puntos</b> · a ${km < 1 ? `${Math.round(km * 1000)} m` : `${km.toLocaleString("es-ES", { maximumFractionDigits: 1 })} km`}.
        Era en <b>${esc(m.nombre)}</b>.`;
      phase = "answer";
      $("confirm").textContent = round === ROUNDS - 1 ? "Ver resultado" : "Siguiente ronda";
      $("confirm").focus({ preventScroll: true });
      return;
    }
    round++;
    if (round < ROUNDS) return startRound();
    finish(results, points, key);
  });

  startRound();
}

function drawProgress(results) {
  $("progress").innerHTML = Array.from({ length: ROUNDS }, (_, i) => {
    const r = results[i];
    if (!r) return `<i class="${i === results.length ? "now" : ""}"></i>`;
    return `<i class="${r.points >= 2000 ? "ok" : r.points >= 500 ? "mid" : "ko"}"></i>`;
  }).join("");
}

function finish(results, points, key) {
  const score = results.reduce((n, r) => n + r.points, 0);
  const result = {
    score,
    total: MAX,
    label: `${formatNumber(score)} pts`,
    grid: results.map((r) => pointsSquare(r.points)).join(""),
    rounds: results,
    points: points.map((p) => p.pt),
  };
  if (!practice) {
    saveDailyResult(MODE, result, key);
    savePref(`${MODE}:partida:${key}`, null);
  }
  reportFinal(MODE, result);
  showResult(result, key);
}

function verdict(score) {
  if (score >= 22000) return "¡Tienes ojo de halcón!";
  if (score >= 15000) return "Muy bien: conoces Navarra desde arriba.";
  if (score >= 8000) return "Nada mal. Fíjate en ríos, carreteras y pueblos.";
  return "Desde el aire todo se parece… ¡mañana más!";
}

function showResult(result, key) {
  drawProgress(result.rounds);
  const name = antigua ? "Desde el aire (1956)" : "Desde el aire";
  stage.innerHTML = `
    <div class="card result">
      <div class="topic">${esc(headerLabel(key))}</div>
      <div class="score">${formatNumber(result.score)}</div>
      <p class="verdict">de ${formatNumber(MAX)} puntos. ${verdict(result.score)}</p>
      <div class="grid">${result.grid}</div>
      <ol class="round-list">
        ${result.rounds.map((r, i) => `<li><span>Ronda ${i + 1}</span><span>${r.km.toLocaleString("es-ES")} km</span><b>${formatNumber(r.points)} pts</b></li>`).join("")}
      </ol>
      <div class="actions">
        ${practice ? "" : `<button class="btn" id="share">Compartir resultado</button>`}
        ${room ? "" : `<a class="btn ghost" href="aire.html?practica${antigua ? "&antigua" : ""}">${practice ? "Otra partida" : "Practicar más"}</a>`}
        ${room ? "" : `<a class="btn ghost" href="aire.html${antigua ? "" : "?antigua"}">${antigua ? "Foto actual" : "Probar con la foto de 1956"}</a>`}
      </div>
      ${practice ? "" : `${statsBlock(MODE)}
      <p class="next">Próximo reto en <b id="countdown">${timeToNextDay()}</b></p>`}
    </div>`;

  $("share")?.addEventListener("click", async () => {
    const text = `GeoReyno · ${name} #${dayNumber(key)}\n${result.grid} ${formatNumber(result.score)}/${formatNumber(MAX)}\n${location.origin}${location.pathname}${antigua ? "?antigua" : ""}`;
    const how = await shareText(text);
    if (how === "copied") toast("Resultado copiado. ¡Pégalo en el grupo!");
    if (how === "failed") toast("No se ha podido copiar");
  });
  startCountdown($("countdown"), key);
}

async function start() {
  const key = room ? params.seed : params.key;
  $("title").textContent = antigua ? "Desde el aire · 1956" : "Desde el aire";
  $("meta").textContent = room ? "Sala con amigos" : practice ? "Práctica" : `Reto #${dayNumber(key)}`;
  document.querySelectorAll("[data-variant]").forEach((a) => {
    a.classList.toggle("on", (a.dataset.variant === "antigua") === antigua);
    if (practice && !room) a.href += (a.href.includes("?") ? "&" : "?") + "practica";
  });

  try {
    const [muni, orto] = await Promise.all([
      loadMunicipios(),
      fetch("data/ortofotos.json").then((r) => (r.ok ? r.json() : Promise.reject(r.status))),
    ]);
    data = muni;
    sources = antigua ? orto.antigua : orto.actual;
  } catch {
    stage.innerHTML = `<div class="card"><p>No se han podido cargar los datos. Recarga la página.</p></div>`;
    return;
  }

  if (!practice) {
    const done = getTodayResult(MODE, key);
    if (done) return showResult(done, key);
  }
  const seed = practice && !room ? `${MODE}:${Math.random()}` : `${MODE}:${key}`;
  const saved = practice ? [] : loadPref(`${MODE}:partida:${key}`, []);
  play(pickPoints(seed), key, Array.isArray(saved) ? saved : []);
}

start();
