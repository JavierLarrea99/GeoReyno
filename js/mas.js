// ¿Cuál tiene más? Dos municipios: elige el que tiene más superficie, habitantes o altitud
// (o el que está más al norte). 10 parejas al día. Solo se usan datos con fuente conocida.

import {
  dayNumber, seededRandom, shuffle, esc, toast, gameParams, formatNumber,
  getTodayResult, saveDailyResult, shareText, timeToNextDay, statsBlock, startCountdown,
  reportRound, reportFinal,
} from "./engine.js";
import { loadMunicipios, makeProjection, svgPath, geomBounds } from "./geo.js";

const MODE = "mas";
const ROUNDS = 10;
const params = gameParams();
const room = Boolean(params.seed);
const practice = params.practice || room;

const $ = (id) => document.getElementById(id);
const stage = $("stage");
const progress = $("progress");

// Categorías posibles. `get` devuelve el valor de un municipio o null si no hay dato.
// `minRatio` / `minDiff` evitan parejas casi empatadas.
function categories(extra, fuentes) {
  return [
    {
      id: "superficie",
      question: "¿Cuál tiene más superficie?",
      get: (m) => m.area_km2,
      fmt: (v) => `${v.toLocaleString("es-ES", { maximumFractionDigits: 1 })} km²`,
      minRatio: 1.15,
      source: "Superficie aproximada calculada a partir de los límites municipales del IGN (CC BY 4.0).",
    },
    {
      id: "norte",
      question: "¿Cuál está más al norte?",
      get: (m) => m.centro[1],
      fmt: (v) => `${v.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}° N`,
      minDiff: 0.06,
      source: "Latitud del centro del término municipal, calculada a partir de los límites del IGN (CC BY 4.0).",
    },
    {
      id: "poblacion",
      question: "¿Cuál tiene más habitantes?",
      get: (m) => extra[m.ine]?.poblacion ?? null,
      fmt: (v) => `${formatNumber(v)} hab.`,
      minRatio: 1.15,
      source: fuentes.poblacion,
      weight: 3,
    },
    {
      id: "altitud",
      question: "¿Cuál está a más altitud?",
      get: (m) => extra[m.ine]?.altitud ?? null,
      fmt: (v) => `${formatNumber(v)} m`,
      minDiff: 40,
      source: fuentes.altitud,
      weight: 2,
    },
  ].filter((c) => c.source);
}

function farEnough(cat, a, b) {
  const va = cat.get(a);
  const vb = cat.get(b);
  if (va == null || vb == null) return false;
  if (cat.minDiff) return Math.abs(va - vb) >= cat.minDiff;
  return Math.max(va, vb) / Math.max(Math.min(va, vb), 1e-9) >= cat.minRatio;
}

function buildRounds(munis, cats, rand) {
  const weighted = cats.flatMap((c) => Array(c.weight || 1).fill(c));
  const rounds = [];
  const used = new Set();
  let guard = 0;
  while (rounds.length < ROUNDS && guard++ < 5000) {
    const cat = weighted[Math.floor(rand() * weighted.length)];
    const pool = munis.filter((m) => cat.get(m) != null && !used.has(m.ine));
    if (pool.length < 2) continue;
    const a = pool[Math.floor(rand() * pool.length)];
    const b = pool[Math.floor(rand() * pool.length)];
    if (a === b || !farEnough(cat, a, b)) continue;
    used.add(a.ine);
    used.add(b.ine);
    rounds.push({ cat, pair: [a, b] });
  }
  return rounds;
}

function miniShape(m) {
  const size = 90;
  const project = makeProjection(geomBounds(m.geom), size, size, 6);
  return `<svg class="mini-shape" viewBox="0 0 ${size} ${size}" aria-hidden="true"><path d="${svgPath(m.geom, project)}" fill-rule="evenodd"/></svg>`;
}

function drawProgress(answers, current) {
  progress.innerHTML = Array.from({ length: ROUNDS }, (_, i) => {
    if (i < answers.length) return `<i class="${answers[i] ? "ok" : "ko"}"></i>`;
    return `<i class="${i === current ? "now" : ""}"></i>`;
  }).join("");
}

function label(key) {
  return room ? "Partida en sala" : practice ? "Práctica" : `Reto #${dayNumber(key)}`;
}

function playRound(rounds, index, answers, key) {
  drawProgress(answers, index);
  const { cat, pair } = rounds[index];
  stage.innerHTML = `
    <div class="card">
      <div class="topic">${label(key)} · ${index + 1} de ${ROUNDS}</div>
      <h2 class="question">${esc(cat.question)}</h2>
      <div class="versus">
        ${pair.map((m, i) => `
          <button class="vs-card" data-i="${i}">
            ${miniShape(m)}
            <span class="vs-name">${esc(m.nombre)}</span>
            <span class="vs-value" id="v${i}"></span>
          </button>`).join('<span class="vs-or" aria-hidden="true">o</span>')}
      </div>
      <div id="after"></div>
    </div>`;

  const buttons = [...stage.querySelectorAll(".vs-card")];
  const values = pair.map((m) => cat.get(m));
  const best = values[0] > values[1] ? 0 : 1;

  buttons.forEach((btn) => btn.addEventListener("click", () => {
    const pick = Number(btn.dataset.i);
    const ok = pick === best;
    buttons.forEach((b, i) => {
      b.disabled = true;
      $(`v${i}`).textContent = cat.fmt(values[i]);
      b.classList.add(i === best ? "right" : "less");
    });
    if (!ok) btn.classList.add("wrong");
    answers.push(ok);
    drawProgress(answers, index + 1);
    reportRound(MODE, index, ok ? 1 : 0, 1);

    const last = index === ROUNDS - 1;
    $("after").innerHTML = `
      <div class="explain"><strong>${ok ? "¡Correcto!" : "¡Pues no!"}</strong>
        ${esc(pair[best].nombre)}: ${esc(cat.fmt(values[best]))} · ${esc(pair[1 - best].nombre)}: ${esc(cat.fmt(values[1 - best]))}.
        <span class="source">Fuente: ${esc(cat.source)}</span></div>
      <div class="actions"><button class="btn" id="next">${last ? "Ver resultado" : "Siguiente"}</button></div>`;
    const next = $("next");
    next.focus({ preventScroll: true });
    next.addEventListener("click", () => {
      if (!last) return playRound(rounds, index + 1, answers, key);
      const result = {
        score: answers.filter(Boolean).length,
        total: ROUNDS,
        answers,
        grid: answers.map((a) => (a ? "🟩" : "🟥")).join(""),
        pairs: rounds.map((r) => ({ cat: r.cat.id, ines: r.pair.map((m) => m.ine) })),
      };
      if (!practice) saveDailyResult(MODE, result, key);
      reportFinal(MODE, result);
      showResult(result, rounds, key);
    });
  }));
}

function showResult(result, rounds, key) {
  drawProgress(result.answers, -1);
  stage.innerHTML = `
    <div class="card result">
      <div class="topic">${label(key)}</div>
      <div class="score">${result.score}/${result.total}</div>
      <p class="verdict">${result.score >= 9 ? "¡Tremendo! Te sabes Navarra de memoria." : result.score >= 6 ? "Bien jugado." : "Navarra engaña: ¡mañana otra!"}</p>
      <div class="grid">${result.grid}</div>
      <div class="actions">
        ${practice ? "" : `<button class="btn" id="share">Compartir resultado</button>`}
        ${room ? "" : `<a class="btn ghost" href="mas.html?practica">${practice ? "Otra partida" : "Practicar más"}</a>`}
      </div>
      ${practice ? "" : `${statsBlock(MODE)}
      <p class="next">Próximo reto en <b id="countdown">${timeToNextDay()}</b></p>`}
      <div class="review">
        <h3>Las parejas de hoy</h3>
        ${rounds.map((r, i) => {
          const [a, b] = r.pair;
          return `<details><summary>${result.answers[i] ? "🟩" : "🟥"} ${esc(r.cat.question)}</summary>
            <p>${esc(a.nombre)}: ${esc(r.cat.fmt(r.cat.get(a)))} · ${esc(b.nombre)}: ${esc(r.cat.fmt(r.cat.get(b)))}</p></details>`;
        }).join("")}
      </div>
    </div>`;

  $("share")?.addEventListener("click", async () => {
    const text = `GeoReyno · ¿Cuál tiene más? #${dayNumber(key)}\n${result.grid} ${result.score}/${result.total}\n${location.origin}${location.pathname}`;
    const how = await shareText(text);
    if (how === "copied") toast("Resultado copiado. ¡Pégalo en el grupo!");
    if (how === "failed") toast("No se ha podido copiar");
  });
  startCountdown($("countdown"), key);
}

async function start() {
  const key = room ? params.seed : params.key;
  $("meta").textContent = room ? "Sala con amigos" : practice ? "Parejas al azar" : `Reto #${dayNumber(key)}`;

  let data;
  let extra = { datos: {}, fuentes: {} };
  try {
    data = await loadMunicipios();
    const res = await fetch("data/municipios_datos.json");
    if (res.ok) extra = await res.json();
  } catch {
    if (!data) {
      stage.innerHTML = `<div class="card"><p>No se han podido cargar los datos. Recarga la página.</p></div>`;
      return;
    }
  }
  const cats = categories(extra.datos || {}, extra.fuentes || {});
  const byId = new Map(cats.map((c) => [c.id, c]));

  if (!practice) {
    const done = getTodayResult(MODE, key);
    if (done && done.pairs?.every((p) => byId.has(p.cat))) {
      const rounds = done.pairs.map((p) => ({ cat: byId.get(p.cat), pair: p.ines.map((i) => data.byIne.get(i)) }));
      return showResult(done, rounds, key);
    }
  }
  const rand = practice && !room ? Math.random : seededRandom(`${MODE}:${key}`);
  const rounds = buildRounds(shuffle(data.municipios, rand), cats, rand);
  playRound(rounds, 0, [], key);
}

start();
