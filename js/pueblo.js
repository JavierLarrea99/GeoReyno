// Pueblo misterioso: adivina el municipio por su silueta en 6 intentos.
// Pistas tras cada fallo: distancia, dirección y porcentaje de cercanía.

import {
  dayNumber, dailyFromCycle, seededRandom, esc, toast, gameParams, normalize,
  getTodayResult, saveDailyResult, shareText, timeToNextDay, statsBlock, startCountdown,
  distanceKm, bearing, loadPref, savePref, reportRound, reportFinal,
} from "./engine.js";
import { loadMunicipios, makeProjection, svgPath, geomBounds, searchMunicipios, findMunicipio } from "./geo.js";

const MODE = "pueblo";
const MAX_TRIES = 6;
const params = gameParams();
const room = Boolean(params.seed);
const practice = params.practice || room;

const $ = (id) => document.getElementById(id);
const stage = $("stage");

let data;
let maxDist = 200;

// Flechas en 8 direcciones para compartir (0° = norte).
const ARROWS = ["⬆️", "↗️", "➡️", "↘️", "⬇️", "↙️", "⬅️", "↖️"];
const DIRS = ["norte", "noreste", "este", "sureste", "sur", "suroeste", "oeste", "noroeste"];
const sector = (deg) => Math.round(deg / 45) % 8;

function closeness(km) {
  return Math.max(0, Math.round(100 * (1 - km / maxDist)));
}

// Cuadritos de cercanía, como en Worldle: 5 casillas.
function proximitySquares(pct) {
  const full = Math.floor(pct / 20);
  const half = pct - full * 20 >= 10 ? 1 : 0;
  return "🟩".repeat(full) + "🟨".repeat(half) + "⬜".repeat(5 - full - half);
}

function evaluate(target, guess) {
  if (guess.ine === target.ine) return { ine: guess.ine, km: 0, deg: 0, pct: 100, ok: true };
  const km = distanceKm(guess.centro, target.centro);
  return { ine: guess.ine, km, deg: bearing(guess.centro, target.centro), pct: closeness(km), ok: false };
}

function silhouette(m, size = 300) {
  const project = makeProjection(geomBounds(m.geom), size, size, 14);
  return `<svg class="silhouette" viewBox="0 0 ${size} ${size}" role="img" aria-label="Silueta del municipio misterioso">
    <path d="${svgPath(m.geom, project)}" fill-rule="evenodd"/>
  </svg>`;
}

// Mapa de Navarra con el municipio buscado resaltado y los intentos marcados.
function revealMap(target, guesses) {
  const W = 360;
  const H = 400;
  const project = makeProjection(data.bbox, W, H, 8);
  const others = data.municipios.map((m) => svgPath(m.geom, project)).join("");
  const dots = guesses.filter((g) => !g.ok).map((g, i) => {
    const m = data.byIne.get(g.ine);
    const [x, y] = project(m.centro);
    return `<circle class="guess-dot" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4"><title>${esc(m.nombre)}</title></circle>
      <text class="guess-num" x="${(x + 6).toFixed(1)}" y="${(y + 4).toFixed(1)}">${i + 1}</text>`;
  }).join("");
  return `<svg class="navmap" viewBox="0 0 ${W} ${H}" role="img" aria-label="Mapa de Navarra con ${esc(target.nombre)} resaltado">
    <path class="nm-all" d="${others}"/>
    <path class="nm-border" d="${svgPath(data.contorno, project)}"/>
    <path class="nm-target" d="${svgPath(target.geom, project)}"/>
    ${dots}
  </svg>
  <p class="map-credit">Límites municipales: © Instituto Geográfico Nacional (CC BY 4.0).</p>`;
}

function guessRow(g, i) {
  const m = data.byIne.get(g.ine);
  if (g.ok) {
    return `<li class="guess ok"><span class="g-name">${i + 1}. ${esc(m.nombre)}</span><span class="g-km">¡Es este!</span><span class="g-dir">🎉</span><span class="g-pct">100%</span></li>`;
  }
  const s = sector(g.deg);
  return `<li class="guess"><span class="g-name">${i + 1}. ${esc(m.nombre)}</span>
    <span class="g-km">${Math.round(g.km)} km</span>
    <span class="g-dir" title="Está hacia el ${DIRS[s]}" aria-label="Está hacia el ${DIRS[s]}"><span class="arrow" style="transform: rotate(${Math.round(g.deg)}deg)">↑</span></span>
    <span class="g-pct">${g.pct}%</span></li>`;
}

function shareMessage(result, key) {
  const lines = result.guesses.map((g) => (g.ok ? "🟩🟩🟩🟩🟩🎉" : proximitySquares(g.pct) + ARROWS[sector(g.deg)]));
  return `GeoReyno · Pueblo misterioso #${dayNumber(key)} ${result.label}\n${lines.join("\n")}\n${location.origin}${location.pathname}`;
}

function buildResult(target, guesses) {
  const won = guesses.some((g) => g.ok);
  const tries = guesses.length;
  return {
    score: won ? MAX_TRIES + 1 - tries : 0,
    total: MAX_TRIES,
    won,
    tries,
    label: won ? `${tries}/${MAX_TRIES}` : `X/${MAX_TRIES}`,
    grid: guesses.map((g) => (g.ok ? "🟩" : g.pct >= 80 ? "🟨" : "⬜")).join(""),
    target: target.ine,
    guesses,
  };
}

function render(target, guesses, key) {
  const finished = guesses.some((g) => g.ok) || guesses.length >= MAX_TRIES;
  if (finished) return showResult(target, guesses, key);

  const left = MAX_TRIES - guesses.length;
  stage.innerHTML = `
    <div class="card pueblo">
      <div class="topic">${room ? "Partida en sala" : practice ? "Práctica" : `Reto #${dayNumber(key)}`} · Intento ${guesses.length + 1} de ${MAX_TRIES}</div>
      <div class="sil-wrap">${silhouette(target)}<span class="north" aria-hidden="true">N ↑</span></div>
      <form class="guess-form" id="form" autocomplete="off">
        <label class="sr" for="guess">Nombre del municipio</label>
        <div class="ac">
          <input id="guess" type="text" placeholder="Escribe un municipio…" autocomplete="off" spellcheck="false"
            role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="ac-list">
          <ul class="ac-list" id="ac-list" role="listbox"></ul>
        </div>
        <button class="btn" type="submit">Probar</button>
      </form>
      <p class="hint">Te quedan ${left} ${left === 1 ? "intento" : "intentos"}. Vale el nombre en castellano o en euskera.</p>
      <ol class="guesses">${guesses.map(guessRow).join("")}</ol>
    </div>`;

  const input = $("guess");
  const list = $("ac-list");
  let options = [];
  let active = -1;

  const close = () => {
    list.innerHTML = "";
    options = [];
    active = -1;
    input.setAttribute("aria-expanded", "false");
  };
  const paint = () => {
    list.querySelectorAll("li").forEach((li, i) => {
      li.classList.toggle("active", i === active);
      li.setAttribute("aria-selected", String(i === active));
    });
  };
  const choose = (m) => {
    input.value = m.nombre;
    close();
    submit();
  };

  input.addEventListener("input", () => {
    const used = new Set(guesses.map((g) => g.ine));
    options = searchMunicipios(data, input.value).filter((m) => !used.has(m.ine));
    active = options.length ? 0 : -1;
    list.innerHTML = options.map((m, i) => `<li role="option" id="ac-${i}" data-i="${i}">${esc(m.nombre)}</li>`).join("");
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
    if (li) choose(options[Number(li.dataset.i)]);
  });

  function submit() {
    const text = input.value;
    let m = findMunicipio(data, text);
    if (!m && options.length && active >= 0) m = options[active];
    if (!m) {
      toast(normalize(text) ? "No conozco ese municipio. Elige uno de la lista." : "Escribe el nombre de un municipio");
      return;
    }
    if (guesses.some((g) => g.ine === m.ine)) {
      toast("Ya lo has probado");
      return;
    }
    guesses.push(evaluate(target, m));
    if (!practice) savePref(`${MODE}:partida:${key}`, guesses.map((g) => g.ine));
    render(target, guesses, key);
    if (!guesses.some((g) => g.ok) && guesses.length < MAX_TRIES) $("guess")?.focus();
  }

  $("form").addEventListener("submit", (e) => {
    e.preventDefault();
    submit();
  });
  input.focus({ preventScroll: true });
}

function showResult(target, guesses, key, saved = null) {
  const result = saved || buildResult(target, guesses);
  if (!saved) {
    if (!practice) {
      saveDailyResult(MODE, result, key);
      savePref(`${MODE}:partida:${key}`, null);
    }
    reportRound(MODE, 0, result.score, result.total, { label: result.label });
    reportFinal(MODE, result);
  }
  const won = result.won;
  stage.innerHTML = `
    <div class="card result pueblo">
      <div class="topic">${room ? "Partida en sala" : practice ? "Práctica" : `Reto #${dayNumber(key)}`}</div>
      <div class="score">${esc(result.label)}</div>
      <p class="verdict">${won
        ? (result.tries === 1 ? "¡A la primera! Impresionante." : `¡Bien! Lo has sacado en ${result.tries} intentos.`)
        : "Esta vez no ha podido ser."}</p>
      <h2 class="reveal-name">${esc(target.nombre)}</h2>
      <p class="reveal-meta">Código INE ${esc(target.ine)} · ${target.area_km2.toLocaleString("es-ES")} km² aprox.</p>
      ${revealMap(target, guesses)}
      <ol class="guesses">${guesses.map(guessRow).join("")}</ol>
      <div class="actions">
        ${practice ? "" : `<button class="btn" id="share">Compartir resultado</button>`}
        ${room ? "" : `<a class="btn ghost" href="pueblo.html?practica">${practice ? "Otro pueblo" : "Practicar más"}</a>`}
      </div>
      ${practice ? "" : `${statsBlock(MODE)}
      <p class="next">Próximo pueblo en <b id="countdown">${timeToNextDay()}</b></p>`}
    </div>`;

  $("share")?.addEventListener("click", async () => {
    const how = await shareText(shareMessage(result, key));
    if (how === "copied") toast("Resultado copiado. ¡Pégalo en el grupo!");
    if (how === "failed") toast("No se ha podido copiar");
  });
  startCountdown($("countdown"), key);
}

async function start() {
  const key = room ? params.seed : params.key;
  $("title").textContent = room ? "Pueblo misterioso" : practice ? "Práctica" : "Pueblo misterioso";
  $("meta").textContent = room ? "Sala con amigos" : practice ? "Pueblo al azar" : `Reto #${dayNumber(key)}`;

  try {
    data = await loadMunicipios();
  } catch {
    stage.innerHTML = `<div class="card"><p>No se han podido cargar los municipios. Recarga la página.</p></div>`;
    return;
  }
  for (const a of data.municipios) {
    for (const b of data.municipios) {
      if (a.ine < b.ine) maxDist = Math.max(maxDist, distanceKm(a.centro, b.centro));
    }
  }

  let target;
  if (room) target = data.municipios[Math.floor(seededRandom(`${MODE}:${key}`)() * data.municipios.length)];
  else if (practice) target = data.municipios[Math.floor(Math.random() * data.municipios.length)];
  else target = dailyFromCycle(data.municipios, MODE, key);

  if (!practice) {
    const done = getTodayResult(MODE, key);
    if (done && done.target === target.ine) return showResult(target, done.guesses, key, done);
    const inProgress = loadPref(`${MODE}:partida:${key}`, []);
    const guesses = (Array.isArray(inProgress) ? inProgress : [])
      .map((ine) => data.byIne.get(ine)).filter(Boolean).slice(0, MAX_TRIES)
      .map((m) => evaluate(target, m));
    return render(target, guesses, key);
  }
  render(target, [], key);
}

start();
