// Escudos: adivina el municipio por su escudo. 5 rondas, 4 opciones.
// Las imágenes se cargan desde Wikimedia Commons con su autor y licencia.

import {
  dayNumber, pickDaily, shuffle, seededRandom, esc, toast, gameParams,
  getTodayResult, saveDailyResult, shareText, timeToNextDay, statsBlock, startCountdown,
  reportRound, reportFinal,
} from "./engine.js";
import { loadMunicipios } from "./geo.js";

const MODE = "escudos";
const ROUNDS = 5;
const params = gameParams();
const room = Boolean(params.seed);
const practice = params.practice || room;

const $ = (id) => document.getElementById(id);
const stage = $("stage");
const progress = $("progress");

let sample = false;

// URL de la imagen: la guardada por el script o, si no hay, la redirección de Commons.
function imageUrl(e) {
  return e.url || `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(e.archivo)}?width=320`;
}

function pageUrl(e) {
  return e.pagina || `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(e.archivo.replace(/ /g, "_"))}`;
}

function credit(e) {
  if (sample) {
    return `Imagen: <a href="${esc(pageUrl(e))}" target="_blank" rel="noopener">${esc(e.archivo)}</a> ·
      Wikimedia Commons (autor y licencia en la página del archivo; pendiente de verificar)`;
  }
  const lic = e.licencia_url
    ? `<a href="${esc(e.licencia_url)}" target="_blank" rel="noopener">${esc(e.licencia)}</a>`
    : esc(e.licencia);
  return `Imagen: <a href="${esc(pageUrl(e))}" target="_blank" rel="noopener">${esc(e.archivo)}</a>,
    de ${esc(e.autor)} · ${lic} · Wikimedia Commons`;
}

// Comprueba que la imagen carga (con un tiempo máximo) para no enseñar rondas rotas.
function preload(e, ms = 8000) {
  return new Promise((resolve) => {
    const img = new Image();
    const timer = setTimeout(() => resolve(false), ms);
    img.onload = () => { clearTimeout(timer); resolve(true); };
    img.onerror = () => { clearTimeout(timer); resolve(false); };
    img.src = imageUrl(e);
  });
}

function prepare(rounds, names, key) {
  return rounds.map((e, i) => {
    const rand = practice && !room ? Math.random : seededRandom(`${MODE}:${key}:${e.ine}:${i}`);
    const others = shuffle(names.filter((n) => n !== e.municipio), rand).slice(0, 3);
    const order = shuffle([e.municipio, ...others], rand).map((text) => ({ text, right: text === e.municipio }));
    return { ...e, order };
  });
}

function drawProgress(answers, current, total) {
  progress.innerHTML = Array.from({ length: total }, (_, i) => {
    if (i < answers.length) return `<i class="${answers[i] ? "ok" : "ko"}"></i>`;
    return `<i class="${i === current ? "now" : ""}"></i>`;
  }).join("");
}

function sampleNote() {
  return sample ? `<p class="note">Modo con <b>datos de ejemplo</b>: solo hay unos pocos escudos y su autoría está pendiente de verificar en Commons.</p>` : "";
}

function playRound(rounds, index, answers, key) {
  const total = rounds.length;
  drawProgress(answers, index, total);
  const q = rounds[index];
  stage.innerHTML = `
    <div class="card">
      <div class="topic">${room ? "Partida en sala" : practice ? "Práctica" : `Reto #${dayNumber(key)}`} · ${index + 1} de ${total}</div>
      <h2 class="question">¿De qué municipio es este escudo?</h2>
      <figure class="shield">
        <img src="${esc(imageUrl(q))}" alt="Escudo de un municipio de Navarra">
        <figcaption class="credit">${credit(q)}</figcaption>
      </figure>
      <div class="options">
        ${q.order.map((o, i) => `<button class="option" data-i="${i}">${esc(o.text)}</button>`).join("")}
      </div>
      <div id="after"></div>
      ${index === 0 ? sampleNote() : ""}
    </div>`;

  const buttons = [...stage.querySelectorAll(".option")];
  buttons.forEach((btn) => btn.addEventListener("click", () => {
    const picked = q.order[Number(btn.dataset.i)];
    buttons.forEach((b, i) => {
      b.disabled = true;
      if (q.order[i].right) b.classList.add("right");
    });
    if (!picked.right) btn.classList.add("wrong");
    answers.push(picked.right);
    drawProgress(answers, index + 1, total);
    reportRound(MODE, index, picked.right ? 1 : 0, 1);

    const last = index === total - 1;
    $("after").innerHTML = `
      <div class="explain"><strong>${picked.right ? "¡Correcto!" : "Casi…"}</strong>
        Es el escudo de ${esc(q.municipio)}.</div>
      <div class="actions"><button class="btn" id="next">${last ? "Ver resultado" : "Siguiente"}</button></div>`;
    const next = $("next");
    next.focus({ preventScroll: true });
    next.addEventListener("click", () => {
      if (!last) return playRound(rounds, index + 1, answers, key);
      const result = {
        score: answers.filter(Boolean).length,
        total,
        answers,
        grid: answers.map((ok) => (ok ? "🟩" : "🟥")).join(""),
        ids: rounds.map((r) => r.ine),
      };
      if (!practice) saveDailyResult(MODE, result, key);
      reportFinal(MODE, result);
      showResult(result, rounds, key);
    });
  }));
}

function showResult(result, rounds, key) {
  drawProgress(result.answers, -1, result.total);
  stage.innerHTML = `
    <div class="card result">
      <div class="topic">${room ? "Partida en sala" : practice ? "Práctica" : `Reto #${dayNumber(key)}`}</div>
      <div class="score">${result.score}/${result.total}</div>
      <p class="verdict">${result.score === result.total ? "¡Pleno! Eres todo un heraldista." : result.score >= 3 ? "Buen ojo para la heráldica." : "Los escudos tienen su truco. ¡Mañana más!"}</p>
      <div class="grid">${result.grid}</div>
      <div class="actions">
        ${practice ? "" : `<button class="btn" id="share">Compartir resultado</button>`}
        ${room ? "" : `<a class="btn ghost" href="escudos.html?practica">${practice ? "Otra partida" : "Practicar más"}</a>`}
      </div>
      ${practice ? "" : `${statsBlock(MODE)}
      <p class="next">Próximos escudos en <b id="countdown">${timeToNextDay()}</b></p>`}
      <div class="review">
        <h3>Los escudos de hoy</h3>
        <div class="shield-grid">
          ${rounds.map((r, i) => `
            <figure>
              <img src="${esc(imageUrl(r))}" alt="Escudo de ${esc(r.municipio)}" loading="lazy">
              <figcaption><b>${result.answers[i] ? "🟩" : "🟥"} ${esc(r.municipio)}</b><br>
                <span class="credit">${credit(r)}</span></figcaption>
            </figure>`).join("")}
        </div>
      </div>
      ${sampleNote()}
    </div>`;

  $("share")?.addEventListener("click", async () => {
    const text = `GeoReyno · Escudos #${dayNumber(key)}\n${result.grid} ${result.score}/${result.total}\n${location.origin}${location.pathname}`;
    const how = await shareText(text);
    if (how === "copied") toast("Resultado copiado. ¡Pégalo en el grupo!");
    if (how === "failed") toast("No se ha podido copiar");
  });
  startCountdown($("countdown"), key);
}

async function start() {
  const key = room ? params.seed : params.key;
  $("meta").textContent = room ? "Sala con amigos" : practice ? "Escudos al azar" : `Reto #${dayNumber(key)}`;

  let list;
  let names;
  try {
    const [res, muni] = await Promise.all([fetch("data/escudos.json"), loadMunicipios()]);
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    sample = Boolean(data.ejemplo);
    list = data.escudos.filter((e) => e.archivo && e.municipio);
    names = muni.municipios.map((m) => m.nombre);
  } catch {
    stage.innerHTML = `<div class="card"><p>No se han podido cargar los escudos. Recarga la página.</p></div>`;
    return;
  }

  const byIne = new Map(list.map((e) => [e.ine, e]));
  if (!practice) {
    const done = getTodayResult(MODE, key);
    if (done) {
      const rounds = done.ids.map((id) => byIne.get(id)).filter(Boolean);
      return showResult(done, rounds, key);
    }
  }

  // Elegimos más de 5 por si alguna imagen no carga.
  const pool = practice && !room ? shuffle(list) : pickDaily(list, list.length, MODE, key);
  const chosen = [];
  for (let i = 0; i < pool.length && chosen.length < ROUNDS; i += ROUNDS) {
    const batch = pool.slice(i, i + ROUNDS - chosen.length);
    const ok = await Promise.all(batch.map((e) => preload(e)));
    batch.forEach((e, j) => { if (ok[j]) chosen.push(e); });
  }
  if (!chosen.length) {
    stage.innerHTML = `<div class="card"><p>No se han podido cargar las imágenes de Wikimedia Commons. Comprueba la conexión y recarga la página.</p>${sampleNote()}</div>`;
    return;
  }
  playRound(prepare(chosen, names, key), 0, [], key);
}

start();
