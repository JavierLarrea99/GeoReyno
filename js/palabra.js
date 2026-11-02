// Palabra del día (tipo Wordle): una palabra navarra de 5 letras en 6 intentos.
// Verde: letra en su sitio · amarillo: está en otro sitio · gris: no está.
// Tras el tercer fallo se puede ver una pista.

import {
  dayNumber, dailyFromCycle, seededRandom, esc, toast, gameParams,
  getTodayResult, saveDailyResult, shareText, timeToNextDay, statsBlock, startCountdown,
  loadPref, savePref, reportRound, reportFinal,
} from "./engine.js";

const MODE = "palabra";
const LEN = 5;
const TRIES = 6;
const params = gameParams();
const room = Boolean(params.seed);
const practice = params.practice || room;

const $ = (id) => document.getElementById(id);
const stage = $("stage");

const ROWS = ["qwertyuiop", "asdfghjklñ", "zxcvbnm"];

let valid;
let target;
let pista;
let key;
let guesses = [];
let current = "";
let over = false;

// Quita tildes pero conserva la ñ.
function norm(text) {
  return String(text).toLowerCase().replace(/ñ/g, "\0").normalize("NFD")
    .replace(/[̀-ͯ]/g, "").replace(/\0/g, "ñ");
}

// Colores de un intento, contando bien las letras repetidas.
function score(guess, answer) {
  const res = Array(LEN).fill("x");
  const left = {};
  for (let i = 0; i < LEN; i++) {
    if (guess[i] === answer[i]) res[i] = "g";
    else left[answer[i]] = (left[answer[i]] || 0) + 1;
  }
  for (let i = 0; i < LEN; i++) {
    if (res[i] === "g") continue;
    if (left[guess[i]]) {
      res[i] = "y";
      left[guess[i]]--;
    }
  }
  return res;
}

function keyColors() {
  const rank = { g: 3, y: 2, x: 1 };
  const out = {};
  for (const g of guesses) {
    score(g, target).forEach((c, i) => {
      const l = g[i];
      if (!out[l] || rank[c] > rank[out[l]]) out[l] = c;
    });
  }
  return out;
}

function label() {
  return room ? "Partida en sala" : practice ? "Práctica" : `Reto #${dayNumber(key)}`;
}

function board(revealLast = false) {
  const rows = [];
  for (let r = 0; r < TRIES; r++) {
    const word = r < guesses.length ? guesses[r] : r === guesses.length ? current : "";
    const colors = r < guesses.length ? score(guesses[r], target) : null;
    rows.push(`<div class="w-row" id="row${r}">${Array.from({ length: LEN }, (_, i) => {
      const ch = word[i] || "";
      const cls = colors ? `${colors[i]}${revealLast && r === guesses.length - 1 ? " reveal" : ""}` : ch ? "filled" : "";
      const delay = revealLast && r === guesses.length - 1 ? ` style="animation-delay:${i * 0.12}s"` : "";
      return `<div class="tile ${cls}"${delay}>${esc(ch)}</div>`;
    }).join("")}</div>`);
  }
  return `<div class="wordle" role="grid" aria-label="Tablero">${rows.join("")}</div>`;
}

function keyboard() {
  const colors = keyColors();
  const k = (l) => `<button class="key ${colors[l] || ""}" data-k="${l}" aria-label="${l}">${l}</button>`;
  return `<div class="keyboard" aria-label="Teclado">
    <div class="k-row">${[...ROWS[0]].map(k).join("")}</div>
    <div class="k-row">${[...ROWS[1]].map(k).join("")}</div>
    <div class="k-row"><button class="key wide" data-k="enter">Enviar</button>${[...ROWS[2]].map(k).join("")}<button class="key wide" data-k="back" aria-label="Borrar">⌫</button></div>
  </div>`;
}

function render(reveal = false) {
  if (over) return;
  const fails = guesses.length;
  stage.innerHTML = `
    <div class="card">
      <div class="topic">${label()} · Intento ${Math.min(fails + 1, TRIES)} de ${TRIES}</div>
      ${board(reveal)}
      ${keyboard()}
      <div class="actions" style="justify-content:center">
        ${fails >= 3 ? `<button class="btn ghost small" id="hint">Ver pista</button>` : `<span class="hint" style="margin:0">Pista disponible tras 3 intentos.</span>`}
      </div>
      <p class="hint" id="hint-text" hidden></p>
    </div>`;
  stage.querySelectorAll(".key").forEach((b) => b.addEventListener("click", () => press(b.dataset.k)));
  $("hint")?.addEventListener("click", () => {
    const p = $("hint-text");
    p.textContent = `Pista: ${pista}`;
    p.hidden = false;
  });
}

function updateRow() {
  const row = $(`row${guesses.length}`);
  if (!row) return;
  [...row.children].forEach((t, i) => {
    t.textContent = current[i] || "";
    t.className = `tile ${current[i] ? "filled" : ""}`;
  });
}

function shake() {
  const row = $(`row${guesses.length}`);
  row?.classList.remove("shake");
  void row?.offsetWidth;
  row?.classList.add("shake");
}

function press(k) {
  if (over) return;
  if (k === "back") {
    current = current.slice(0, -1);
    return updateRow();
  }
  if (k === "enter") {
    if (current.length < LEN) {
      shake();
      return toast("Faltan letras");
    }
    if (!valid.has(current)) {
      shake();
      return toast("No está en la lista de palabras");
    }
    guesses.push(current);
    current = "";
    if (!practice) savePref(`${MODE}:partida:${key}`, guesses);
    const won = guesses[guesses.length - 1] === target;
    if (won || guesses.length >= TRIES) {
      render(true);
      return setTimeout(finish, 900);
    }
    return render(true);
  }
  if (/^[a-zñ]$/.test(k) && current.length < LEN) {
    current += k;
    updateRow();
  }
}

document.addEventListener("keydown", (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey || !valid) return;
  if (e.key === "Enter") press("enter");
  else if (e.key === "Backspace") press("back");
  else {
    const l = norm(e.key);
    if (/^[a-zñ]$/.test(l)) press(l);
  }
});

function grid() {
  const em = { g: "🟩", y: "🟨", x: "⬛" };
  return guesses.map((g) => score(g, target).map((c) => em[c]).join("")).join("\n");
}

function buildResult() {
  const won = guesses.includes(target);
  return {
    score: won ? TRIES + 1 - guesses.length : 0,
    total: TRIES,
    won,
    tries: guesses.length,
    label: won ? `${guesses.length}/${TRIES}` : `X/${TRIES}`,
    grid: guesses.map((g) => (g === target ? "🟩" : score(g, target).filter((c) => c === "g").length >= 3 ? "🟨" : "⬛")).join(""),
    guesses: [...guesses],
    word: target,
  };
}

function finish(saved = null) {
  over = true;
  const result = saved || buildResult();
  if (!saved) {
    if (!practice) {
      saveDailyResult(MODE, result, key);
      savePref(`${MODE}:partida:${key}`, null);
    }
    reportRound(MODE, 0, result.score, result.total, { label: result.label });
    reportFinal(MODE, result);
  }
  stage.innerHTML = `
    <div class="card result">
      <div class="topic">${label()}</div>
      <div class="score">${esc(result.label)}</div>
      <p class="verdict">${result.won ? (result.tries === 1 ? "¡A la primera! Increíble." : "¡Muy bien!") : "Esta vez no ha salido."}</p>
      <div class="word-reveal">${esc(target.toUpperCase())}</div>
      <p class="hint">${esc(pista)}</p>
      ${board()}
      <div class="actions">
        ${practice ? "" : `<button class="btn" id="share">Compartir resultado</button>`}
        ${room ? "" : `<a class="btn ghost" href="palabra.html?practica">${practice ? "Otra palabra" : "Practicar más"}</a>`}
      </div>
      ${practice ? "" : `${statsBlock(MODE)}
      <p class="next">Próxima palabra en <b id="countdown">${timeToNextDay()}</b></p>`}
      <p class="credit">Diccionario: an-array-of-spanish-words (MIT).</p>
    </div>`;
  $("share")?.addEventListener("click", async () => {
    const how = await shareText(`GeoReyno · Palabra del día #${dayNumber(key)} ${result.label}\n${grid()}\n${location.origin}${location.pathname}`);
    if (how === "copied") toast("Resultado copiado. ¡Pégalo en el grupo!");
    if (how === "failed") toast("No se ha podido copiar");
  });
  startCountdown($("countdown"), key);
}

async function start() {
  key = room ? params.seed : params.key;
  $("meta").textContent = room ? "Sala con amigos" : practice ? "Palabra al azar" : `Reto #${dayNumber(key)}`;
  let data;
  try {
    const res = await fetch("data/palabras.json");
    if (!res.ok) throw new Error(res.status);
    data = await res.json();
  } catch {
    stage.innerHTML = `<div class="card"><p>No se han podido cargar las palabras. Recarga la página.</p></div>`;
    return;
  }
  valid = new Set(data.validas.split(" "));
  let sol;
  if (room) sol = data.soluciones[Math.floor(seededRandom(`${MODE}:${key}`)() * data.soluciones.length)];
  else if (practice) sol = data.soluciones[Math.floor(Math.random() * data.soluciones.length)];
  else sol = dailyFromCycle(data.soluciones, MODE, key);
  target = norm(sol.palabra);
  pista = sol.pista;

  if (!practice) {
    const done = getTodayResult(MODE, key);
    if (done && done.word === target) {
      guesses = done.guesses || [];
      return finish(done);
    }
    const saved = loadPref(`${MODE}:partida:${key}`, []);
    guesses = (Array.isArray(saved) ? saved : []).filter((g) => typeof g === "string" && g.length === LEN).slice(0, TRIES);
    if (guesses.includes(target) || guesses.length >= TRIES) return finish();
  }
  render();
}

start();
