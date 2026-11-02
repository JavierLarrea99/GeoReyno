// Quiz del día: 5 preguntas iguales para todos cada día.
// Con ?practica en la URL se juega con preguntas al azar y no se guarda el resultado.

import {
  todayKey, dayNumber, pickDaily, shuffle, seededRandom,
  getStats, getTodayResult, saveDailyResult, shareText, timeToNextDay,
} from "./engine.js";

const MODE = "quiz";
const ROUNDS = 5;
const practice = new URLSearchParams(location.search).has("practica");

const $ = (id) => document.getElementById(id);
const stage = $("stage");
const progress = $("progress");

// Escapa texto antes de meterlo en HTML (las preguntas vienen de un JSON, pero mejor prevenir).
function esc(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);
}

function toast(message) {
  const t = $("toast");
  t.textContent = message;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2200);
}

// Prepara cada pregunta con sus opciones barajadas. En el reto diario el orden es fijo para todos.
function prepare(questions, key) {
  return questions.map((q) => {
    const rand = practice ? Math.random : seededRandom(`${MODE}:${key}:${q.id}`);
    const order = shuffle(q.opciones.map((text, i) => ({ text, right: i === q.correcta })), rand);
    return { ...q, order };
  });
}

function drawProgress(answers, current) {
  progress.innerHTML = Array.from({ length: ROUNDS }, (_, i) => {
    if (i < answers.length) return `<i class="${answers[i] ? "ok" : "ko"}"></i>`;
    return `<i class="${i === current ? "now" : ""}"></i>`;
  }).join("");
}

function verdict(score) {
  if (score === 5) return "¡Perfecto! Conoces Navarra como la palma de tu mano.";
  if (score === 4) return "Muy bien, casi perfecto.";
  if (score === 3) return "Nada mal. Mañana, a por el pleno.";
  if (score >= 1) return "Hay margen de mejora. Mira las respuestas abajo.";
  return "Día difícil. Mañana hay otra oportunidad.";
}

function shareMessage(result, key) {
  const grid = result.answers.map((ok) => (ok ? "🟩" : "🟥")).join("");
  return `GeoReyno · Quiz #${dayNumber(key)}\n${grid} ${result.score}/${result.total}\n${location.origin}${location.pathname}`;
}

function playRound(rounds, index, answers, key) {
  drawProgress(answers, index);
  const q = rounds[index];

  stage.innerHTML = `
    <div class="card">
      <div class="topic">${esc(q.tema)} · ${index + 1} de ${ROUNDS}</div>
      <h2 class="question">${esc(q.pregunta)}</h2>
      <div class="options">
        ${q.order.map((o, i) => `<button class="option" data-i="${i}">${esc(o.text)}</button>`).join("")}
      </div>
      <div id="after"></div>
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
    drawProgress(answers, index + 1);

    const last = index === ROUNDS - 1;
    $("after").innerHTML = `
      <div class="explain">
        <strong>${picked.right ? "¡Correcto!" : "Casi…"}</strong>
        ${esc(q.explicacion)}
      </div>
      <div class="actions">
        <button class="btn" id="next">${last ? "Ver resultado" : "Siguiente"}</button>
      </div>`;
    const next = $("next");
    next.focus({ preventScroll: true });
    next.addEventListener("click", () => {
      if (!last) return playRound(rounds, index + 1, answers, key);
      const result = {
        score: answers.filter(Boolean).length,
        total: ROUNDS,
        answers,
        ids: rounds.map((r) => r.id),
      };
      if (!practice) saveDailyResult(MODE, result, key);
      showResult(result, rounds, key);
    });
  }));
}

function showResult(result, rounds, key) {
  drawProgress(result.answers, -1);
  const stats = getStats(MODE);
  const grid = result.answers.map((ok) => (ok ? "🟩" : "🟥")).join("");

  stage.innerHTML = `
    <div class="card result">
      <div class="topic">${practice ? "Práctica" : `Reto #${dayNumber(key)}`}</div>
      <div class="score">${result.score}/${result.total}</div>
      <p class="verdict">${verdict(result.score)}</p>
      <div class="grid" aria-label="${result.score} aciertos de ${result.total}">${grid}</div>
      <div class="actions">
        ${practice ? "" : `<button class="btn" id="share">Compartir resultado</button>`}
        <a class="btn ghost" href="quiz.html?practica">${practice ? "Otra partida" : "Practicar más"}</a>
      </div>
      ${practice ? "" : `
      <div class="stats">
        <div><b>${stats.played}</b><span>Jugados</span></div>
        <div><b>${stats.streak}</b><span>Racha</span></div>
        <div><b>${stats.best}</b><span>Mejor racha</span></div>
      </div>
      <p class="next">Próximo reto en <b id="countdown">${timeToNextDay()}</b></p>`}
      <div class="review">
        <h3>Respuestas</h3>
        ${rounds.map((q, i) => `
          <details>
            <summary>${result.answers[i] ? "🟩" : "🟥"} ${esc(q.pregunta)}</summary>
            <p><b>${esc(q.opciones[q.correcta])}.</b> ${esc(q.explicacion)}</p>
          </details>`).join("")}
      </div>
    </div>`;

  const share = $("share");
  if (share) {
    share.addEventListener("click", async () => {
      const how = await shareText(shareMessage(result, key));
      if (how === "copied") toast("Resultado copiado. ¡Pégalo en el grupo!");
      if (how === "failed") toast("No se ha podido copiar");
    });
  }

  const countdown = $("countdown");
  if (countdown) {
    const timer = setInterval(() => {
      countdown.textContent = timeToNextDay();
      if (todayKey() !== key) {
        clearInterval(timer);
        location.reload();
      }
    }, 1000);
  }
}

async function start() {
  const key = todayKey();
  $("title").textContent = practice ? "Práctica" : "Quiz del día";
  $("meta").textContent = practice ? "Preguntas al azar" : `Reto #${dayNumber(key)}`;

  let bank;
  try {
    const res = await fetch("data/preguntas.json");
    if (!res.ok) throw new Error(res.status);
    bank = await res.json();
  } catch {
    stage.innerHTML = `<div class="card"><p>No se han podido cargar las preguntas. Recarga la página.</p></div>`;
    return;
  }

  const byId = new Map(bank.map((q) => [q.id, q]));
  const done = practice ? null : getTodayResult(MODE, key);

  if (done) {
    // Ya jugado hoy: mostramos el resultado guardado con las mismas preguntas.
    const rounds = prepare(done.ids.map((id) => byId.get(id)).filter(Boolean), key);
    return showResult(done, rounds, key);
  }

  const chosen = practice ? shuffle(bank).slice(0, ROUNDS) : pickDaily(bank, ROUNDS, MODE, key);
  playRound(prepare(chosen, key), 0, [], key);
}

start();
