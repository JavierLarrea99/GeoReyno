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
import { getToken, forgetToken, TokenError, renderNoToken, mapillaryEngine } from "./mapillary.js";
import { googleEngine, createGoogleAnswerMap } from "./gmap.js";
import { getConfig } from "./cuenta.js";

const MODE = "street";
const ROUNDS = 5;
const MAX = 5000 * ROUNDS;
// Tiempo por ronda en las salas con amigos (?segundos=N lo acorta, útil para pruebas; nunca lo alarga).
const ROOM_SECONDS = Math.min(120, Number(new URLSearchParams(location.search).get("segundos")) || 120);
const params = gameParams();
const room = Boolean(params.seed);
const practice = params.practice || room;

const $ = (id) => document.getElementById(id);
const stage = $("stage");

let data;
let token = "";
let sample = false;
let engine = null; // motor de fotos: Google Street View o Mapillary
let googleKey = "";

// Ubicación lista para jugar: con id de foto y coordenadas reales de la foto.
async function resolveLocation(u) {
  return engine.find(u);
}

const noToken = (reason = "") => renderNoToken(stage, "Navarra Street", reason);

// Aviso sobre el motor de fotos (Google Street View o Mapillary).
function avisoChip(aviso) {
  if (!aviso) return "";
  if (aviso.tipo === "google") {
    return `<div class="sv-chip google fade">Juegas con Google Street View</div>`;
  }
  if (aviso.tipo === "agotado") {
    return `<div class="sv-chip fade">Hoy se acabaron las partidas con Google Street View · juegas con Mapillary</div>`;
  }
  return `<a class="sv-chip cta" href="perfil.html?registro&amp;volver=street.html">Crea tu cuenta gratis y juega con Google Street View</a>`;
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

async function play(finder, key, saved = [], aviso = null) {
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
        <div class="hud-box" id="hud-time" hidden><span>Tiempo</span><b id="hud-clock">${Math.floor(ROOM_SECONDS / 60)}:${String(ROOM_SECONDS % 60).padStart(2, "0")}</b></div>
      </div>
      ${avisoChip(aviso)}
      <div class="sv-wait" id="sv-wait" hidden>${loadingHTML("Esperando a los demás…")}</div>
      <button class="sv-btn sv-fs" id="fs" aria-label="Pantalla completa" title="Pantalla completa">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>
      </button>
      <p class="sv-credit" id="credit"></p>
      <div class="sv-map" id="mapbox">
        <button class="sv-map-toggle" id="map-toggle" aria-expanded="false"><span class="grip" aria-hidden="true"></span><span id="map-toggle-text">Abrir el mapa para adivinar</span></button>
        <div class="answer-map" id="map">${loadingHTML("Cargando mapa…")}</div>
        <div class="round-info" id="info">Toca el mapa para poner tu marca.</div>
        <button class="btn" id="confirm" disabled>Adivinar</button>
        <section class="sv-res" id="res" aria-live="polite">
          <div class="res-kicker" id="res-kicker"></div>
          <div class="res-pts"><b id="res-points">0</b><span>puntos</span></div>
          <div class="res-bar" aria-hidden="true"><i id="res-bar"></i></div>
          <p class="res-dist" id="res-dist"></p>
          <p class="res-place" id="res-place"></p>
          <p class="res-legend"><span class="lg lg-guess"></span>Tu marca <span class="lg lg-answer"></span>El sitio</p>
          <ol class="res-players" id="res-players" hidden></ol>
          <p class="res-credit" id="res-credit"></p>
          <button class="btn big" id="next">Siguiente ronda</button>
        </section>
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

  let answerMap;
  try {
    $("map").innerHTML = "";
    // Con Google Street View hay que responder en un mapa de Google (condiciones de Google).
    answerMap = engine.name === "google"
      ? await createGoogleAnswerMap($("map"), data, googleKey)
      : await createAnswerMap($("map"), data);
  } catch {
    stage.innerHTML = `<div class="card"><p>No se ha podido cargar el visor o el mapa. Comprueba la conexión y recarga la página.</p></div>`;
    return;
  }

  let round = results.length;
  let phase = "guess";
  let currentAuthor = locations[round].autor || "";
  let currentImage = locations[round].imagen;
  const photoCredit = (author, id, reveal) => engine.credit(author, id, reveal);

  engine.mount($("viewer"), await finder.get(results.length), (img) => {
    $("sv-loading")?.setAttribute("hidden", "");
    currentAuthor = img.autor || currentAuthor;
    currentImage = img.id || currentImage;
    $("credit").innerHTML = photoCredit(currentAuthor, currentImage, phase === "result");
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
    $("sv-wait").hidden = true;
    setOpen(false);
    $("confirm").disabled = true;
    currentAuthor = locations[round].autor || "";
    currentImage = locations[round].imagen;
    $("credit").innerHTML = photoCredit(currentAuthor, currentImage, false);
    answerMap.reset();
    drawProgress(results);
    if (round > 0 || saved.length) Promise.resolve(engine.show(locations[round])).catch(() => toast("No se ha podido cargar esta foto"));
  };

  answerMap.onPick(() => { if (phase === "guess") $("confirm").disabled = false; });

  // --- Fin de ronda ---
  let timer = null;
  let deadline = 0;
  const clearTimer = () => { clearInterval(timer); timer = null; };

  // Anima un número de 0 al valor final.
  const countUp = (el, to, ms = 900) => {
    const t0 = performance.now();
    const step = (t) => {
      const k = Math.min(1, (t - t0) / ms);
      el.textContent = formatNumber(Math.round(to * (1 - (1 - k) ** 3)));
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };

  const showRoundResult = async () => {
    if (phase === "result") return;
    phase = "result";
    clearTimer();
    $("sv-wait").hidden = true;
    const r = results[round];
    const loc = locations[round];
    const answer = [loc.lon, loc.lat];
    const m = loc.municipio || municipioAt(answer, data)?.nombre || "";
    const last = round === ROUNDS - 1;
    $("res-kicker").textContent = `Ronda ${round + 1} de ${ROUNDS}`;
    $("res-dist").innerHTML = r.km == null
      ? "No pusiste ninguna marca a tiempo."
      : `Tu marca estaba a <b>${r.km < 1 ? `${Math.round(r.km * 1000)} m` : `${r.km.toLocaleString("es-ES", { maximumFractionDigits: 1 })} km`}</b> del sitio.`;
    $("res-place").innerHTML = m ? `Era en <b>${esc(m)}</b>${loc.lugar ? ` · ${esc(loc.lugar)}` : ""}` : "";
    $("res-credit").innerHTML = photoCredit(currentAuthor, currentImage, true);
    $("next").textContent = last ? "Ver resultado final" : "Siguiente ronda";
    $("res-bar").style.width = "0";
    renderPlayers();
    sv.classList.add("result");
    setOpen(true);
    // Esperar a que el mapa tenga su nuevo tamaño antes de encuadrar la respuesta.
    await new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)));
    answerMap.resize();
    answerMap.showAnswer(answer);
    countUp($("res-points"), r.points);
    requestAnimationFrame(() => { $("res-bar").style.width = `${(100 * r.points) / 5000}%`; });
    $("credit").innerHTML = photoCredit(currentAuthor, currentImage, true);
    $("next").focus({ preventScroll: true });
  };

  // En una sala: puntos de cada jugador en esta ronda.
  let roomState = null;
  const renderPlayers = () => {
    const list = $("res-players");
    if (!room || !roomState) return (list.hidden = true);
    const rows = roomState.jugadores
      .map((j) => ({ ...j, pts: j.rounds?.[round] }))
      .sort((a, b) => (b.pts ?? -1) - (a.pts ?? -1));
    list.hidden = false;
    list.innerHTML = rows.map((j, i) => `<li class="${j.yo ? "me" : ""}"><span>${i + 1}. ${esc(j.name)}</span><b>${j.pts == null ? "—" : formatNumber(j.pts)}</b></li>`).join("");
  };
  const everyoneDone = () => {
    if (!roomState) return false;
    const active = roomState.jugadores.filter((j) => j.connected || j.rounds?.[round] != null);
    return active.length > 0 && active.every((j) => j.rounds?.[round] != null);
  };
  const updateWaiting = () => {
    if (phase !== "waiting") return;
    if (everyoneDone()) return showRoundResult();
    const active = roomState ? roomState.jugadores.filter((j) => j.connected) : [];
    const done = active.filter((j) => j.rounds?.[round] != null).length;
    $("sv-wait").querySelector("span").textContent = `Esperando a los demás… (${done}/${active.length || "?"} han respondido)`;
  };
  window.addEventListener("message", (e) => {
    if (e.origin !== location.origin || e.data?.georeyno !== "sala-estado") return;
    roomState = e.data;
    if (phase === "waiting") updateWaiting();
    if (phase === "result") renderPlayers();
  });

  const submit = (auto = false) => {
    if (phase !== "guess") return;
    const guess = answerMap.getGuess();
    if (!guess && !auto) return toast("Pon antes tu marca en el mapa");
    const loc = locations[round];
    const km = guess ? distanceKm(guess, [loc.lon, loc.lat]) : null;
    const pts = km == null ? 0 : roundPoints(km);
    results.push({ km: km == null ? null : Math.round(km * 10) / 10, points: pts, imagen: loc.imagen, autor: currentAuthor });
    if (!practice) savePref(`${MODE}:partida:${key}`, results);
    $("hud-score").textContent = formatNumber(results.reduce((n, x) => n + x.points, 0));
    reportRound(MODE, round, pts, 5000);
    drawProgress(results);
    if (room && Date.now() < deadline) {
      phase = "waiting";
      setOpen(false);
      $("sv-wait").hidden = false;
      return updateWaiting();
    }
    showRoundResult();
  };

  $("confirm").addEventListener("click", () => submit(false));
  $("next").addEventListener("click", async () => {
    sv.classList.remove("result");
    round++;
    if (round < ROUNDS) {
      await startRound();
      return startClock();
    }
    clearTimer();
    engine.remove();
    if (document.fullscreenElement) document.exitFullscreen();
    document.body.classList.remove("playing");
    finish(results, key);
  });

  // Tiempo por ronda en las salas.
  const startClock = () => {
    if (!room) return;
    clearTimer();
    deadline = Date.now() + ROOM_SECONDS * 1000;
    $("hud-time").hidden = false;
    const tick = () => {
      const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      $("hud-clock").textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
      $("hud-time").classList.toggle("urgent", left <= 15);
      if (left > 0) return;
      if (phase === "guess") submit(true);
      else if (phase === "waiting") showRoundResult();
    };
    tick();
    timer = setInterval(tick, 500);
  };
  // Primera ronda (o la siguiente si se recarga a mitad).
  await startRound();
  startClock();
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

  // Motor de fotos: Google Street View solo en el reto diario, para jugadores con cuenta y
  // mientras quede cupo hoy (lo cuenta el servidor). Si no, Mapillary, que es gratis.
  const cfg = await getConfig();
  googleKey = String(cfg.GOOGLE_MAPS_KEY || "").trim();
  let aviso = null;
  if (googleKey && !practice) {
    stage.innerHTML = `<div class="card">${loadingHTML("Preparando el reto…")}</div>`;
    try {
      const cuenta = await import("./cuenta.js");
      const user = await cuenta.currentUser();
      if (!user) aviso = { tipo: "login" };
      else {
        const r = await cuenta.reserveGoogle();
        if (r?.ok) {
          engine = await googleEngine(googleKey);
          aviso = { tipo: "google", quedan: r.quedan };
        } else aviso = { tipo: "agotado" };
      }
    } catch {
      engine = null;
    }
  }
  if (!engine) {
    token = await getToken();
    if (!token) return noToken();
    try {
      engine = await mapillaryEngine(token);
    } catch {
      stage.innerHTML = `<div class="card"><p>No se ha podido cargar el visor. Comprueba la conexión y recarga la página.</p></div>`;
      return;
    }
  }

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
  play(finder, key, savedRounds, aviso);
}

start();
