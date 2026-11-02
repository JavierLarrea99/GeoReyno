// Pregunta del día: una pregunta igual para todos cada día (no se repite hasta agotar el banco).
// Con ?practica en la URL se juega con preguntas al azar y no se guarda el resultado.

import {
  dayNumber, pickDaily, dailyFromCycle, shuffle, seededRandom, esc, toast, gameParams,
  getTodayResult, saveDailyResult, shareText, timeToNextDay, statsBlock, startCountdown,
  reportRound, reportFinal,
} from "./engine.js";

const MODE = "pregunta";
const ROUNDS = 1;
const params = gameParams();
// En una sala el reto lo fija la semilla de la sala y no cuenta para la racha.
const room = Boolean(params.seed);
const practice = params.practice || room;

const $ = (id) => document.getElementById(id);
const stage = $("stage");
const progress = $("progress");

// Prepara cada pregunta con sus opciones barajadas. En el reto diario el orden es fijo para todos.
function prepare(questions, key) {
  return questions.map((q) => {
    const rand = practice && !room ? Math.random : seededRandom(`${MODE}:${key}:${q.id}`);
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
  return score ? "¡Correcto! Mañana, otra." : "Esta vez no. Mañana hay otra pregunta.";
}

function shareMessage(result, key) {
  const grid = result.answers.map((ok) => (ok ? "🟩" : "🟥")).join("");
  return `GeoReyno · Pregunta del día #${dayNumber(key)}\n${grid} ${result.score}/${result.total}\n${location.origin}${location.pathname}`;
}

function playRound(rounds, index, answers, key) {
  drawProgress(answers, index);
  const q = rounds[index];

  stage.innerHTML = `
    <div class="card">
      <div class="topic">${esc(q.tema)}${ROUNDS > 1 ? ` · ${index + 1} de ${ROUNDS}` : ""}</div>
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
    reportRound(MODE, index, picked.right ? 1 : 0, 1);

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
        grid: answers.map((ok) => (ok ? "🟩" : "🟥")).join(""),
        ids: rounds.map((r) => r.id),
      };
      if (!practice) saveDailyResult(MODE, result, key);
      reportFinal(MODE, result);
      showResult(result, rounds, key);
    });
  }));
}

function showResult(result, rounds, key) {
  drawProgress(result.answers, -1);
  const grid = result.answers.map((ok) => (ok ? "🟩" : "🟥")).join("");

  stage.innerHTML = `
    <div class="card result">
      <div class="topic">${room ? "Partida en sala" : practice ? "Práctica" : `Reto #${dayNumber(key)}`}</div>
      <div class="score">${result.score}/${result.total}</div>
      <p class="verdict">${verdict(result.score)}</p>
      <div class="grid" aria-label="${result.score} aciertos de ${result.total}">${grid}</div>
      <div class="actions">
        ${practice ? "" : `<button class="btn" id="share">Compartir resultado</button>`}
        ${room ? "" : `<a class="btn ghost" href="pregunta.html?practica">${practice ? "Otra pregunta" : "Más preguntas"}</a>`}
      </div>
      ${practice ? "" : `
      ${statsBlock(MODE)}
      <p class="next">Próximo reto en <b id="countdown">${timeToNextDay()}</b></p>`}
      <div class="review">
        <h3>La respuesta</h3>
        ${rounds.map((q, i) => `
          <details${ROUNDS === 1 ? " open" : ""}>
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

  startCountdown($("countdown"), key);
}

async function start() {
  const key = room ? params.seed : params.key;
  $("title").textContent = practice && !room ? "Práctica" : "Pregunta del día";
  $("meta").textContent = room ? "Sala con amigos" : practice ? "Preguntas al azar" : `Reto #${dayNumber(key)}`;

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

  const chosen = practice && !room ? shuffle(bank).slice(0, ROUNDS) : (room ? pickDaily(bank, ROUNDS, MODE, key) : [dailyFromCycle(bank, MODE, key)]);
  playRound(prepare(chosen, key), 0, [], key);
}

start();
