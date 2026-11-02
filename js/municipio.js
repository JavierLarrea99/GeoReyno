// Adivina el municipio: fotos de un municipio navarro. Tienes 4 intentos; cada fallo destapa
// otra foto y te dice a qué distancia y en qué dirección está.
// Fotos: data/fotos_municipios.json (fotos propias o de Commons, con autor y licencia) y,
// si no hay suficientes, fotos de Mapillary buscadas en vivo dentro del municipio.

import {
  dayNumber, dailyFromCycle, shuffle, seededRandom, esc, toast, gameParams, normalize,
  getTodayResult, saveDailyResult, shareText, timeToNextDay, statsBlock, startCountdown,
  distanceKm, bearing, loadPref, savePref, reportRound, reportFinal,
} from "./engine.js";
import { loadMunicipios, searchMunicipios, findMunicipio, pointInGeom } from "./geo.js";
import { getToken, forgetToken, TokenError, imagesAround, photoCredit, renderNoToken } from "./mapillary.js";

const MODE = "municipio";
const TRIES = 4;
const params = gameParams();
const room = Boolean(params.seed);
const practice = params.practice || room;

const $ = (id) => document.getElementById(id);
const stage = $("stage");

let data;
let key;
let target;
let photos = [];
let guesses = [];
let shown = 0;

const DIRS = ["norte", "noreste", "este", "sureste", "sur", "suroeste", "oeste", "noroeste"];

function label() {
  return room ? "Partida en sala" : practice ? "Práctica" : `Reto #${dayNumber(key)}`;
}

function credit(p, reveal) {
  if (p.fuente === "mapillary") return photoCredit(p.autor, p.id, reveal);
  const lic = p.licencia_url ? `<a href="${esc(p.licencia_url)}" target="_blank" rel="noopener">${esc(p.licencia)}</a>` : esc(p.licencia || "");
  const src = reveal && p.pagina ? ` · <a href="${esc(p.pagina)}" target="_blank" rel="noopener">fuente</a>` : "";
  return `Foto: ${esc(p.autor || "autor desconocido")}${lic ? ` · ${lic}` : ""}${src}`;
}

// Elige hasta 4 fotos de Mapillary dentro del municipio, de secuencias distintas y separadas.
async function mapillaryPhotos(token, m) {
  const all = [];
  for (const d of [0.006, 0.014]) {
    const list = await imagesAround(token, m.centro, d, 100);
    all.push(...list.filter((i) => i.thumb && !i.pano && pointInGeom([i.lon, i.lat], m.geom)));
    if (all.length >= 8) break;
  }
  const chosen = [];
  const seqs = new Set();
  const sorted = all.sort((a, b) => b.fecha - a.fecha);
  for (const minKm of [0.25, 0.08, 0]) {
    for (const p of sorted) {
      if (chosen.length >= TRIES) break;
      if (chosen.includes(p)) continue;
      if (minKm && seqs.has(p.sequence)) continue;
      if (chosen.every((c) => distanceKm([c.lon, c.lat], [p.lon, p.lat]) >= minKm)) {
        chosen.push(p);
        seqs.add(p.sequence);
      }
    }
  }
  return chosen.map((p) => ({ ...p, url: p.thumb, fuente: "mapillary" }));
}

function evaluate(m) {
  if (m.ine === target.ine) return { ine: m.ine, ok: true };
  const km = distanceKm(m.centro, target.centro);
  return { ine: m.ine, ok: false, km, deg: bearing(m.centro, target.centro) };
}

function guessRow(g) {
  const m = data.byIne.get(g.ine);
  if (g.ok) return `<li class="guess ok"><span class="g-name">${esc(m.nombre)}</span><span class="g-km">¡Es este!</span><span>🎉</span></li>`;
  const s = Math.round(g.deg / 45) % 8;
  return `<li class="guess"><span class="g-name">${esc(m.nombre)}</span><span class="g-km">${Math.round(g.km)} km</span>
    <span title="Está hacia el ${DIRS[s]}" aria-label="Está hacia el ${DIRS[s]}"><span class="arrow" style="transform:rotate(${Math.round(g.deg)}deg)">↑</span></span></li>`;
}

function gallery(available, reveal) {
  const p = photos[shown];
  return `
    <div class="photo-main">
      <img src="${esc(p.url)}" alt="Foto del municipio misterioso" id="main-photo">
      <span class="photo-num">Foto ${shown + 1} de ${photos.length}</span>
    </div>
    <p class="credit" id="photo-credit">${credit(p, reveal)}</p>
    <div class="photo-thumbs">
      ${photos.map((ph, i) => i < available
        ? `<button data-i="${i}" class="${i === shown ? "on" : ""}" aria-label="Ver foto ${i + 1}"><img src="${esc(ph.url)}" alt=""></button>`
        : `<button disabled aria-label="Foto bloqueada">🔒</button>`).join("")}
    </div>`;
}

function bindGallery(available, reveal) {
  stage.querySelectorAll(".photo-thumbs button[data-i]").forEach((b) => b.addEventListener("click", () => {
    shown = Number(b.dataset.i);
    stage.querySelector(".photo-main img").src = photos[shown].url;
    stage.querySelector(".photo-num").textContent = `Foto ${shown + 1} de ${photos.length}`;
    $("photo-credit").innerHTML = credit(photos[shown], reveal);
    stage.querySelectorAll(".photo-thumbs button").forEach((x) => x.classList.toggle("on", x === b));
  }));
}

function render() {
  const finished = guesses.some((g) => g.ok) || guesses.length >= TRIES;
  if (finished) return finish();
  const available = Math.min(photos.length, guesses.length + 1);
  shown = Math.min(shown, available - 1);
  const left = TRIES - guesses.length;
  stage.innerHTML = `
    <div class="card">
      <div class="topic">${label()} · Intento ${guesses.length + 1} de ${TRIES}</div>
      ${gallery(available, false)}
      <form class="guess-form" id="form" autocomplete="off" style="margin-top:14px">
        <label class="sr" for="guess">Nombre del municipio</label>
        <div class="ac">
          <input id="guess" type="text" placeholder="¿Qué municipio es?" autocomplete="off" spellcheck="false"
            role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="ac-list">
          <ul class="ac-list" id="ac-list" role="listbox"></ul>
        </div>
        <button class="btn" type="submit">Probar</button>
      </form>
      <p class="hint">Te quedan ${left} ${left === 1 ? "intento" : "intentos"}. Cada fallo destapa otra foto. Vale el nombre en castellano o en euskera.</p>
      <ol class="guesses">${guesses.map(guessRow).join("")}</ol>
    </div>`;
  bindGallery(available, false);

  const input = $("guess");
  const list = $("ac-list");
  let options = [];
  let active = -1;
  const paint = () => list.querySelectorAll("li").forEach((li, i) => {
    li.classList.toggle("active", i === active);
    li.setAttribute("aria-selected", String(i === active));
  });
  const close = () => { list.innerHTML = ""; options = []; active = -1; input.setAttribute("aria-expanded", "false"); };

  input.addEventListener("input", () => {
    const used = new Set(guesses.map((g) => g.ine));
    options = searchMunicipios(data, input.value).filter((m) => !used.has(m.ine));
    active = options.length ? 0 : -1;
    list.innerHTML = options.map((m, i) => `<li role="option" data-i="${i}">${esc(m.nombre)}</li>`).join("");
    input.setAttribute("aria-expanded", String(options.length > 0));
    paint();
  });
  input.addEventListener("keydown", (e) => {
    if (!options.length) return;
    if (e.key === "ArrowDown") { active = (active + 1) % options.length; paint(); e.preventDefault(); }
    if (e.key === "ArrowUp") { active = (active - 1 + options.length) % options.length; paint(); e.preventDefault(); }
    if (e.key === "Escape") close();
  });
  list.addEventListener("mousedown", (e) => e.preventDefault());
  list.addEventListener("click", (e) => {
    const li = e.target.closest("li");
    if (li) { input.value = options[Number(li.dataset.i)].nombre; close(); submit(); }
  });

  function submit() {
    let m = findMunicipio(data, input.value);
    if (!m && options.length && active >= 0) m = options[active];
    if (!m) return toast(normalize(input.value) ? "No conozco ese municipio. Elige uno de la lista." : "Escribe el nombre de un municipio");
    if (guesses.some((g) => g.ine === m.ine)) return toast("Ya lo has probado");
    guesses.push(evaluate(m));
    if (!practice) savePref(`${MODE}:partida:${key}`, guesses.map((g) => g.ine));
    if (!guesses.some((g) => g.ok)) shown = Math.min(photos.length - 1, guesses.length);
    render();
    $("guess")?.focus();
  }
  $("form").addEventListener("submit", (e) => { e.preventDefault(); submit(); });
}

function finish(saved = null) {
  const won = guesses.some((g) => g.ok);
  const result = saved || {
    score: won ? TRIES + 1 - guesses.length : 0,
    total: TRIES,
    won,
    tries: guesses.length,
    label: won ? `${guesses.length}/${TRIES}` : `X/${TRIES}`,
    grid: guesses.map((g) => (g.ok ? "🟩" : g.km < 15 ? "🟨" : "🟥")).join(""),
    target: target.ine,
    guesses: guesses.map((g) => g.ine),
  };
  if (!saved) {
    if (!practice) {
      saveDailyResult(MODE, result, key);
      savePref(`${MODE}:partida:${key}`, null);
    }
    reportRound(MODE, 0, result.score, result.total, { label: result.label });
    reportFinal(MODE, result);
  }
  shown = 0;
  stage.innerHTML = `
    <div class="card result">
      <div class="topic">${label()}</div>
      <div class="score">${esc(result.label)}</div>
      <p class="verdict">${won ? (result.tries === 1 ? "¡A la primera! Conoces bien Navarra." : "¡Lo has sacado!") : "Esta vez no ha podido ser."}</p>
      <h2 class="question" style="margin:4px 0 14px">${esc(target.nombre)}</h2>
      ${photos.length ? gallery(photos.length, true) : ""}
      <ol class="guesses">${guesses.map(guessRow).join("")}</ol>
      <div class="actions">
        ${practice ? "" : `<button class="btn" id="share">Compartir resultado</button>`}
        ${room ? "" : `<a class="btn ghost" href="municipio.html?practica">${practice ? "Otro municipio" : "Practicar más"}</a>`}
      </div>
      ${practice ? "" : `${statsBlock(MODE)}
      <p class="next">Próximo municipio en <b id="countdown">${timeToNextDay()}</b></p>`}
    </div>`;
  if (photos.length) bindGallery(photos.length, true);
  $("share")?.addEventListener("click", async () => {
    const how = await shareText(`GeoReyno · Adivina el municipio #${dayNumber(key)} ${result.label}\n${result.grid}\n${location.origin}${location.pathname}`);
    if (how === "copied") toast("Resultado copiado. ¡Pégalo en el grupo!");
    if (how === "failed") toast("No se ha podido copiar");
  });
  startCountdown($("countdown"), key);
}

async function start() {
  key = room ? params.seed : params.key;
  $("meta").textContent = room ? "Sala con amigos" : practice ? "Municipio al azar" : `Reto #${dayNumber(key)}`;

  let own = [];
  try {
    data = await loadMunicipios();
    const res = await fetch("data/fotos_municipios.json");
    if (res.ok) own = (await res.json()).fotos || [];
  } catch {
    if (!data) {
      stage.innerHTML = `<div class="card"><p>No se han podido cargar los datos. Recarga la página.</p></div>`;
      return;
    }
  }

  // Fotos propias agrupadas por municipio (solo cuentan los que tienen al menos 2).
  const byIne = new Map();
  for (const f of own) {
    if (!f.ine || !f.url) continue;
    if (!byIne.has(f.ine)) byIne.set(f.ine, []);
    byIne.get(f.ine).push({ ...f, fuente: f.fuente || "propia" });
  }
  for (const [ine, list] of byIne) if (list.length < 2) byIne.delete(ine);

  // Orden de candidatos del día: igual para todos.
  let order;
  if (room) order = shuffle(data.municipios, seededRandom(`${MODE}:${key}`));
  else if (practice) order = shuffle(data.municipios);
  else {
    const first = dailyFromCycle(data.municipios, MODE, key);
    order = [first, ...shuffle(data.municipios, seededRandom(`${MODE}:${key}`)).filter((m) => m !== first)];
  }

  const done = practice ? null : getTodayResult(MODE, key);
  if (done) order = [data.byIne.get(done.target), ...order.filter((m) => m.ine !== done.target)];

  const token = await getToken();
  if (!byIne.size && !token) return renderNoToken(stage, "Adivina el municipio");

  stage.innerHTML = `<div class="card"><p>Buscando las fotos del municipio de hoy…</p></div>`;
  try {
    for (const m of order.slice(0, 25)) {
      if (byIne.has(m.ine)) {
        photos = shuffle(byIne.get(m.ine), seededRandom(`${MODE}:${key}:fotos`)).slice(0, TRIES);
      } else if (token) {
        photos = await mapillaryPhotos(token, m);
      } else {
        photos = [];
      }
      if (photos.length >= 2) {
        target = m;
        break;
      }
    }
  } catch (e) {
    if (e instanceof TokenError) {
      forgetToken();
      return renderNoToken(stage, "Adivina el municipio", "Mapillary no ha aceptado el token. Revisa que sea el «Access Token» de tu aplicación.");
    }
    stage.innerHTML = `<div class="card"><p>No se ha podido conectar con Mapillary. Comprueba la conexión y recarga la página.</p></div>`;
    return;
  }
  if (!target) {
    stage.innerHTML = `<div class="card"><p>No se han encontrado fotos para el reto de hoy. Inténtalo más tarde.</p></div>`;
    return;
  }

  if (done && done.target === target.ine) {
    guesses = (done.guesses || []).map((ine) => data.byIne.get(ine)).filter(Boolean).map(evaluate);
    return finish(done);
  }
  if (!practice) {
    const saved = loadPref(`${MODE}:partida:${key}`, []);
    guesses = (Array.isArray(saved) ? saved : []).map((ine) => data.byIne.get(ine)).filter(Boolean).slice(0, TRIES).map(evaluate);
    shown = Math.min(photos.length - 1, guesses.length);
  }
  render();
}

start();
