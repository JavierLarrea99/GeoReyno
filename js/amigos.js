// Jugar con amigos: salas con PeerJS (conexión directa entre navegadores).
// El anfitrión crea la sala (código de 6 letras) y manda el estado a todos.
// Cada jugador juega el modo elegido en un iframe con la misma semilla; el juego avisa
// de cada ronda con postMessage y la sala reenvía los puntos al anfitrión.

import { MODES, esc, toast, shareText, loadPref, savePref, formatNumber } from "./engine.js";

const PEERJS = "https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js";
const PREFIX = "georeyno-sala-";
const LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // sin I ni O para no confundirlas con 1 y 0
const MAX_PLAYERS = 12;
const HOST_KEY = "sala-anfitrion";
const GUEST_KEY = "sala-invitado";

const $ = (id) => document.getElementById(id);
const stage = $("stage");
const query = new URLSearchParams(location.search);

let peer = null;
let role = null; // "host" | "guest"
let room = null; // estado de la sala (en el anfitrión es el original; en invitados, la copia recibida)
const conns = new Map(); // anfitrión: pid -> conexión
let hostConn = null; // invitado: conexión con el anfitrión
let retryTimer = null;
let frameKey = ""; // qué partida está cargada en el iframe

const me = {
  pid: loadPref("pid") || (() => {
    const id = Math.random().toString(36).slice(2, 12);
    savePref("pid", id);
    return id;
  })(),
  name: loadPref("nombre", "") || loadPref("cuenta", null)?.username || "",
};

// --- Utilidades ---

function newCode() {
  let c = "";
  const buf = crypto.getRandomValues(new Uint32Array(6));
  for (const n of buf) c += LETTERS[n % LETTERS.length];
  return c;
}

function cleanCode(text) {
  return String(text || "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 6);
}

function cleanName(text) {
  return String(text || "").replace(/\s+/g, " ").trim().slice(0, 20);
}

function playableModes() {
  return MODES.filter((m) => m.ready !== false);
}

function modeById(id) {
  return MODES.find((m) => m.id === id) || MODES[0];
}

function peerOptions() {
  // Para pruebas en local: amigos.html?peerlocal usa un servidor PeerJS en localhost:9000.
  if (query.has("peerlocal") && location.hostname === "localhost") {
    return { host: "localhost", port: 9000, path: "/", secure: false };
  }
  return {};
}

function loadPeerJS() {
  if (window.Peer) return Promise.resolve(window.Peer);
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = PEERJS;
    s.onload = () => (window.Peer ? resolve(window.Peer) : reject(new Error("PeerJS")));
    s.onerror = () => reject(new Error("No se ha podido cargar PeerJS"));
    document.head.appendChild(s);
  });
}

function setStatus(text, kind = "") {
  const el = $("conn-status");
  if (!el) return;
  el.textContent = text;
  el.className = `conn-status ${kind}`;
}

function gameUrl() {
  const mode = modeById(room.mode);
  const url = new URL(mode.href, location.href);
  url.searchParams.set("sala", room.code);
  url.searchParams.set("semilla", room.seed);
  return url.pathname.split("/").pop() + url.search;
}

// --- Pantalla inicial ---

function renderStart(message = "") {
  const joinCode = cleanCode(new URLSearchParams(location.search).get("unirse"));
  const host = loadPref(HOST_KEY);
  const guest = loadPref(GUEST_KEY);
  const recent = (s) => s && Date.now() - (s.at || 0) < 6 * 3600e3;

  stage.innerHTML = `
    ${message ? `<p class="note">${esc(message)}</p>` : ""}
    ${recent(host) ? `<div class="card resume"><p>Tienes una sala abierta como anfitrión: <b>${esc(host.room.code)}</b>.</p>
      <div class="actions"><button class="btn" id="resume-host">Recuperar la sala</button>
      <button class="btn ghost" id="forget-host">Olvidarla</button></div></div>` : ""}
    ${!recent(host) && recent(guest) && (!joinCode || joinCode === guest.code) ? `<div class="card resume"><p>Estabas en la sala <b>${esc(guest.code)}</b>.</p>
      <div class="actions"><button class="btn" id="resume-guest">Volver a entrar</button></div></div>` : ""}
    <div class="card">
      <label class="field-label" for="name">Tu nombre</label>
      <input class="field" id="name" maxlength="20" placeholder="Cómo te verán los demás" value="${esc(me.name)}" autocomplete="nickname">
    </div>
    <div class="room-choices">
      <section class="card">
        <h2 class="question">Unirse a una sala</h2>
        <form class="guess-form" id="join-form" autocomplete="off">
          <label class="sr" for="code">Código de la sala</label>
          <input class="field code-input" id="code" maxlength="6" placeholder="ABCDEF" value="${esc(joinCode)}" autocapitalize="characters" spellcheck="false">
          <button class="btn" type="submit">Entrar</button>
        </form>
      </section>
      <section class="card">
        <h2 class="question">Crear una sala</h2>
        <label class="field-label" for="mode">Juego</label>
        <select class="field" id="mode">
          ${playableModes().map((m) => `<option value="${esc(m.id)}">${esc(m.name)}</option>`).join("")}
        </select>
        <div class="actions"><button class="btn" id="create">Crear sala</button></div>
      </section>
    </div>
    <p class="hint">La conexión es directa entre navegadores (PeerJS). Las partidas en sala no cuentan para tu racha diaria.</p>`;

  const nameOk = () => {
    me.name = cleanName($("name").value);
    if (!me.name) {
      toast("Escribe tu nombre");
      $("name").focus();
      return false;
    }
    savePref("nombre", me.name);
    return true;
  };

  $("join-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const code = cleanCode($("code").value);
    if (code.length !== 6) return toast("El código tiene 6 letras");
    if (nameOk()) joinRoom(code);
  });
  $("code").addEventListener("input", () => { $("code").value = cleanCode($("code").value); });
  $("create").addEventListener("click", () => { if (nameOk()) createRoom($("mode").value); });
  $("resume-host")?.addEventListener("click", () => { if (nameOk()) createRoom(host.room.mode, host.room); });
  $("forget-host")?.addEventListener("click", () => { savePref(HOST_KEY, null); renderStart(); });
  $("resume-guest")?.addEventListener("click", () => { if (nameOk()) joinRoom(guest.code); });
  if (joinCode) $("name").focus();
  else if (location.hash === "#unirse") $("code").focus();
}

// --- Anfitrión ---

async function createRoom(modeId, restored = null, attempt = 0) {
  let Peer;
  try {
    Peer = await loadPeerJS();
  } catch {
    return renderStart("No se ha podido cargar PeerJS. Comprueba la conexión.");
  }
  role = "host";
  const code = restored?.code || newCode();
  if (!room || room.code !== code) {
    room = restored
      ? { ...restored, players: restored.players.map((p) => ({ ...p, connected: p.pid === me.pid })) }
      : { code, mode: modeId, seed: "", status: "lobby", players: [] };
  }
  upsertPlayer(me.pid, me.name, true);
  stage.innerHTML = `<div class="card"><p>Creando la sala…</p></div>`;

  peer = new Peer(PREFIX + code, peerOptions());
  peer.on("open", () => {
    attempt = 0;
    setStatus("Conectado", "ok");
    saveHost();
    render();
  });
  peer.on("connection", (conn) => handleGuest(conn));
  peer.on("disconnected", () => {
    setStatus("Reconectando con el servidor…", "warn");
    setTimeout(() => peer && !peer.destroyed && peer.reconnect(), 1500);
  });
  peer.on("error", (err) => {
    if (err.type === "unavailable-id") {
      // El código ya está en uso: si es una sala nueva, otro código; si se está recuperando, se reintenta.
      peer.destroy();
      if (restored && attempt < 10) {
        stage.innerHTML = `<div class="card"><p>Recuperando la sala ${esc(code)}… (intento ${attempt + 1})</p></div>`;
        return setTimeout(() => createRoom(modeId, restored, attempt + 1), 3000);
      }
      if (!restored) {
        room = null;
        return createRoom(modeId);
      }
      savePref(HOST_KEY, null);
      return renderStart("No se ha podido recuperar la sala. Crea una nueva.");
    }
    if (err.type === "network" || err.type === "server-error" || err.type === "socket-error") {
      setStatus("Sin conexión con el servidor de salas", "bad");
      if (!peer.open && !room.players.some((p) => !p.host)) renderStart("No se ha podido conectar con el servidor de salas. Inténtalo de nuevo.");
    }
  });
}

function upsertPlayer(pid, name, host = false) {
  let p = room.players.find((x) => x.pid === pid);
  if (!p) {
    p = { pid, name, host, connected: true, rounds: [], final: null };
    room.players.push(p);
  }
  p.name = name;
  p.connected = true;
  return p;
}

function handleGuest(conn) {
  let pid = null;
  conn.on("data", (msg) => {
    if (!msg || typeof msg !== "object") return;
    if (msg.type === "hello") {
      const name = cleanName(msg.name) || "Jugador";
      pid = String(msg.pid || "").slice(0, 20) || conn.peer;
      const known = room.players.some((p) => p.pid === pid);
      if (!known && room.players.length >= MAX_PLAYERS) {
        conn.send({ type: "error", message: "La sala está llena." });
        return setTimeout(() => conn.close(), 500);
      }
      const old = conns.get(pid);
      if (old && old !== conn) old.close();
      conns.set(pid, conn);
      upsertPlayer(pid, name);
      broadcast();
      return;
    }
    if (!pid) return;
    applyProgress(pid, msg);
  });
  conn.on("close", () => {
    if (pid && conns.get(pid) === conn) {
      conns.delete(pid);
      const p = room.players.find((x) => x.pid === pid);
      if (p) p.connected = false;
      broadcast();
    }
  });
}

// Puntos de una ronda o resultado final (lo envía un invitado o el propio anfitrión).
function applyProgress(pid, msg) {
  const p = room.players.find((x) => x.pid === pid);
  if (!p || room.status !== "playing" || msg.seed !== room.seed) return;
  if (msg.type === "round") {
    const i = Number(msg.round);
    const pts = Number(msg.points);
    if (!Number.isInteger(i) || i < 0 || i > 20 || !Number.isFinite(pts)) return;
    p.rounds[i] = Math.max(0, Math.min(pts, 5000));
  }
  if (msg.type === "final" && msg.result) {
    const score = Number(msg.result.score);
    const total = Number(msg.result.total);
    if (!Number.isFinite(score) || !Number.isFinite(total)) return;
    p.final = { score, total, label: String(msg.result.label || `${score}/${total}`).slice(0, 30) };
  }
  const active = room.players.filter((x) => x.connected || x.final);
  if (active.length && active.every((x) => x.final)) room.status = "done";
  broadcast();
}

function broadcast() {
  if (role !== "host") return;
  saveHost();
  for (const conn of conns.values()) {
    if (conn.open) conn.send({ type: "state", room });
  }
  render();
}

function saveHost() {
  savePref(HOST_KEY, { at: Date.now(), room });
}

function startGame(modeId) {
  room.mode = modeId;
  room.seed = `${room.code}-${Date.now().toString(36)}`;
  room.status = "playing";
  room.players.forEach((p) => { p.rounds = []; p.final = null; });
  broadcast();
}

// --- Invitado ---

async function joinRoom(code, attempt = 0) {
  let Peer;
  try {
    Peer = await loadPeerJS();
  } catch {
    return renderStart("No se ha podido cargar PeerJS. Comprueba la conexión.");
  }
  role = "guest";
  savePref(GUEST_KEY, { at: Date.now(), code });
  if (!room) stage.innerHTML = `<div class="card"><p>Entrando en la sala ${esc(code)}…</p></div>`;

  const connect = () => {
    hostConn = peer.connect(PREFIX + code, { reliable: true });
    const timeout = setTimeout(() => { if (!hostConn.open) hostConn.close(); }, 8000);
    hostConn.on("open", () => {
      clearTimeout(timeout);
      attempt = 0;
      setStatus("Conectado", "ok");
      hostConn.send({ type: "hello", pid: me.pid, name: me.name });
    });
    hostConn.on("data", (msg) => {
      if (msg?.type === "state" && msg.room) {
        room = msg.room;
        render();
      }
      if (msg?.type === "error") renderStart(msg.message);
    });
    hostConn.on("close", () => {
      clearTimeout(timeout);
      if (role !== "guest") return;
      attempt++;
      if (attempt > 15) {
        if (room) setStatus("Sin conexión con el anfitrión", "bad");
        else renderStart(`No se ha encontrado la sala ${code}. Revisa el código.`);
        return;
      }
      setStatus("Reconectando…", "warn");
      clearTimeout(retryTimer);
      retryTimer = setTimeout(connect, room ? 2000 : 1000);
    });
  };

  if (peer && !peer.destroyed) peer.destroy();
  peer = new Peer(peerOptions());
  peer.on("open", connect);
  peer.on("disconnected", () => setTimeout(() => peer && !peer.destroyed && peer.reconnect(), 1500));
  peer.on("error", (err) => {
    if (err.type === "peer-unavailable") {
      // La sala no existe (todavía): la conexión se cerrará y se reintenta unas veces.
      if (!room && attempt >= 3) {
        role = null;
        peer.destroy();
        renderStart(`No se ha encontrado la sala ${code}. Revisa el código.`);
      }
      hostConn?.close();
    } else if (err.type === "network" || err.type === "server-error" || err.type === "socket-error") {
      setStatus("Sin conexión con el servidor de salas", "bad");
      if (!room) renderStart("No se ha podido conectar con el servidor de salas. Inténtalo de nuevo.");
    }
  });
}

// --- Mensajes del juego (iframe) ---

window.addEventListener("message", (e) => {
  if (e.origin !== location.origin || !e.data?.georeyno || !room || room.status !== "playing") return;
  const msg = { type: e.data.georeyno, seed: room.seed };
  if (msg.type === "round") Object.assign(msg, { round: e.data.round, points: e.data.points });
  else if (msg.type === "final") msg.result = e.data.result;
  else return;
  if (role === "host") applyProgress(me.pid, msg);
  else if (hostConn?.open) hostConn.send(msg);
});

// --- Pintado ---

function scoreboard() {
  const n = modeById(room.mode).rounds || Math.max(1, ...room.players.map((p) => p.rounds.length));
  const total = (p) => (p.final ? p.final.score : p.rounds.reduce((a, b) => a + (b || 0), 0));
  const rows = [...room.players].sort((a, b) => total(b) - total(a));
  return `
    <div class="table-scroll">
      <table class="board">
        <thead><tr><th>Jugador</th>${Array.from({ length: n }, (_, i) => `<th>${n === 1 ? "Puntos" : i + 1}</th>`).join("")}<th>Total</th></tr></thead>
        <tbody>
          ${rows.map((p) => `<tr class="${p.pid === me.pid ? "me" : ""}">
            <td class="b-name"><span class="dot ${p.connected ? "on" : "off"}" title="${p.connected ? "Conectado" : "Desconectado"}"></span>${esc(p.name)}${p.host ? " ★" : ""}</td>
            ${Array.from({ length: n }, (_, i) => `<td>${p.rounds[i] != null ? formatNumber(p.rounds[i]) : "·"}</td>`).join("")}
            <td class="b-total">${p.final && p.final.total <= 10 ? esc(p.final.label) : formatNumber(total(p))}${p.final ? " ✓" : ""}</td>
          </tr>`).join("")}
        </tbody>
      </table>
    </div>`;
}

function roomHeader() {
  const link = `${location.origin}${location.pathname}?unirse=${room.code}`;
  return `
    <div class="card room-head">
      <div>
        <span class="field-label">Código de la sala</span>
        <div class="room-code">${esc(room.code)}</div>
        <span class="conn-status" id="conn-status"></span>
      </div>
      <div class="actions">
        <button class="btn ghost small" id="copy-link" data-link="${esc(link)}">Invitar</button>
        <button class="btn ghost small" id="leave">Salir</button>
      </div>
    </div>`;
}

function render() {
  if (!room) return;
  const mode = modeById(room.mode);
  const isHost = role === "host";
  const statusText = $("conn-status")?.textContent || "Conectado";
  const statusKind = $("conn-status")?.className.replace("conn-status", "").trim() || "ok";

  if (room.status === "playing") {
    const key = `${room.seed}`;
    if (frameKey !== key || !$("game-frame")) {
      frameKey = key;
      stage.innerHTML = `
        ${roomHeader()}
        <div class="room-play">
          <div class="card board-card"><h2 class="question">${esc(mode.name)}</h2><div id="board">${scoreboard()}</div></div>
          <iframe class="game-frame" id="game-frame" title="${esc(mode.name)}" src="${esc(gameUrl())}"></iframe>
        </div>`;
      bindHeader();
    } else {
      $("board").innerHTML = scoreboard();
    }
    setStatus(statusText, statusKind);
    return;
  }

  frameKey = "";
  if (room.status === "done") {
    const sorted = [...room.players].filter((p) => p.final).sort((a, b) => b.final.score - a.final.score);
    stage.innerHTML = `
      ${roomHeader()}
      <div class="card result">
        <div class="topic">${esc(mode.name)} · Resultado final</div>
        <ol class="podium">
          ${sorted.map((p, i) => `<li class="${p.pid === me.pid ? "me" : ""}"><span class="pos">${["🥇", "🥈", "🥉"][i] || `${i + 1}.`}</span>
            <span class="p-name">${esc(p.name)}</span><b>${esc(p.final.label)}</b></li>`).join("")}
        </ol>
        <h3>Por rondas</h3>
        ${scoreboard()}
        ${isHost ? lobbyControls("Otra partida") : `<p class="hint">Esperando a que el anfitrión empiece otra partida…</p>`}
      </div>`;
  } else {
    stage.innerHTML = `
      ${roomHeader()}
      <div class="card">
        <h2 class="question">Jugadores (${room.players.length})</h2>
        <ul class="players">
          ${room.players.map((p) => `<li><span class="dot ${p.connected ? "on" : "off"}"></span>${esc(p.name)}${p.host ? " <small>(anfitrión)</small>" : ""}${p.pid === me.pid ? " <small>(tú)</small>" : ""}</li>`).join("")}
        </ul>
        ${isHost ? lobbyControls("Empezar") : `<p class="hint">Juego: <b>${esc(mode.name)}</b>. Esperando a que el anfitrión empiece…</p>`}
        <p class="hint">Comparte el código o el enlace de «Invitar». Todos jugaréis el mismo reto a la vez.</p>
      </div>`;
  }
  bindHeader();
  setStatus(statusText, statusKind);
  $("start")?.addEventListener("click", () => startGame($("room-mode").value));
}

function lobbyControls(label) {
  return `
    <div class="lobby-controls">
      <label class="field-label" for="room-mode">Juego</label>
      <select class="field" id="room-mode">
        ${playableModes().map((m) => `<option value="${esc(m.id)}" ${m.id === room.mode ? "selected" : ""}>${esc(m.name)}</option>`).join("")}
      </select>
      <div class="actions"><button class="btn" id="start">${esc(label)}</button></div>
    </div>`;
}

function bindHeader() {
  $("copy-link")?.addEventListener("click", async (e) => {
    const link = e.currentTarget.dataset.link;
    const how = await shareText(`¡Juega conmigo a GeoReyno! Sala ${room.code}: ${link}`);
    if (how === "copied") toast("Enlace copiado");
    if (how === "failed") toast(`Código: ${room.code}`);
  });
  $("leave")?.addEventListener("click", () => {
    if (!confirm(role === "host" ? "Si sales, la sala se cierra para todos. ¿Salir?" : "¿Salir de la sala?")) return;
    savePref(role === "host" ? HOST_KEY : GUEST_KEY, null);
    role = null;
    clearTimeout(retryTimer);
    peer?.destroy();
    peer = null;
    room = null;
    conns.clear();
    history.replaceState(null, "", location.pathname + (query.has("peerlocal") ? "?peerlocal" : ""));
    renderStart();
  });
}

window.addEventListener("beforeunload", () => peer?.destroy());

renderStart();
