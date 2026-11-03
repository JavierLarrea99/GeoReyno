// Mi perfil: inicio de sesión / registro y estadísticas completas por modo.
// Sin sesión, las estadísticas salen de este navegador; con sesión, de tu cuenta (todos tus dispositivos).

import { MODES, getStats, resultLabel, resultGrid, esc, toast, todayKey, formatNumber, clearAllStats } from "./engine.js";
import * as cuenta from "./cuenta.js";

const $ = (id) => document.getElementById(id);
const authEl = $("auth");
const statsEl = $("stats");

// --- Estadísticas ---

// Historial por modo: { modo: { "AAAA-MM-DD": resultado } }, juntando servidor y navegador.
function localHistory() {
  const out = {};
  for (const m of MODES) out[m.id] = { ...getStats(m.id).history };
  return out;
}

function merge(local, remote) {
  if (!remote) return local;
  const out = { ...local };
  for (const r of remote) {
    out[r.mode] ||= {};
    out[r.mode][r.day] ||= { score: r.score, total: r.total, label: r.label, grid: r.grid };
  }
  return out;
}

function dayKey(offset) {
  return todayKey(new Date(Date.now() - offset * 864e5));
}

function streaks(days) {
  const set = new Set(days);
  let current = 0;
  // La racha sigue viva si jugaste hoy o ayer.
  let start = set.has(dayKey(0)) ? 0 : set.has(dayKey(1)) ? 1 : -1;
  if (start >= 0) while (set.has(dayKey(start + current))) current++;
  let best = 0;
  let run = 0;
  let prev = null;
  for (const d of [...set].sort()) {
    const t = Date.parse(d + "T12:00:00");
    run = prev !== null && Math.round((t - prev) / 864e5) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = t;
  }
  return { current, best };
}

const fmtDate = (key) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("es-ES", { day: "numeric", month: "short" });
};

function renderStats(history, title) {
  const modes = MODES.filter((m) => !m.sub);
  const perMode = modes.map((m) => {
    const h = history[m.id] || {};
    const days = Object.keys(h).sort().reverse();
    const pct = days.length ? Math.round(100 * days.reduce((n, d) => n + (h[d].total ? h[d].score / h[d].total : 0), 0) / days.length) : 0;
    const wins = days.filter((d) => h[d].score > 0).length;
    return { m, h, days, pct, wins, ...streaks(days) };
  });
  const totalPlayed = perMode.reduce((n, x) => n + x.days.length, 0);
  const bestStreak = Math.max(0, ...perMode.map((x) => x.best));
  const activeStreak = Math.max(0, ...perMode.map((x) => x.current));
  const today = todayKey();
  const doneToday = perMode.filter((x) => x.h[today]).length;
  const week = [...Array(7)].map((_, i) => dayKey(i));
  const weekPts = perMode.reduce((n, x) => n + week.reduce((a, d) => a + (x.h[d] ? Math.round((1000 * x.h[d].score) / x.h[d].total) : 0), 0), 0);

  statsEl.innerHTML = `
    <section class="card">
      <h2 class="question" style="margin-bottom:4px">${esc(title)}</h2>
      <div class="big-stats">
        <div><b>${totalPlayed}</b><span>Partidas jugadas</span></div>
        <div><b>${activeStreak}</b><span>Racha activa (días)</span></div>
        <div><b>${bestStreak}</b><span>Mejor racha</span></div>
        <div><b>${formatNumber(weekPts)}</b><span>Puntos esta semana</span></div>
      </div>
      <p class="empty" style="margin-top:10px">Hoy llevas ${doneToday} de ${modes.length} retos. Los puntos semanales valen 1000 por partida perfecta en cada modo.</p>
    </section>
    ${perMode.map((x) => {
      const last = [...Array(14)].map((_, i) => dayKey(13 - i));
      return `
      <section class="card stat-mode">
        <h2><a href="${esc(x.m.href)}">${esc(x.m.name)}</a></h2>
        <div class="stats">
          <div><b>${x.days.length}</b><span>Jugados</span></div>
          <div><b>${x.current}</b><span>Racha</span></div>
          <div><b>${x.best}</b><span>Mejor racha</span></div>
          <div><b>${x.days.length ? x.pct + "%" : "–"}</b><span>Acierto medio</span></div>
        </div>
        <div class="spark" title="Últimos 14 días" aria-label="Resultados de los últimos 14 días">
          ${last.map((d) => {
            const r = x.h[d];
            const v = r && r.total ? r.score / r.total : 0;
            return `<i class="${r ? "" : "zero"}" style="height:${r ? Math.max(8, Math.round(v * 100)) : 4}%" title="${esc(fmtDate(d))}: ${r ? esc(resultLabel(r)) : "sin jugar"}"></i>`;
          }).join("")}
        </div>
        ${x.days.length ? `<ul class="history">${x.days.slice(0, 10).map((d) => `
          <li><span class="h-date">${esc(fmtDate(d))}</span><span class="h-grid">${esc(resultGrid(x.h[d]))}</span><span class="h-score">${esc(resultLabel(x.h[d]))}</span></li>`).join("")}</ul>`
        : `<p class="empty">Aún no has jugado. <a href="${esc(x.m.href)}">Jugar ahora</a>.</p>`}
      </section>`;
    }).join("")}
    <div class="actions"><button class="btn ghost small" id="clear">Borrar las estadísticas de este navegador</button></div>`;

  $("clear").addEventListener("click", () => {
    if (!confirm("¿Borrar las estadísticas guardadas en este navegador? Las de tu cuenta no se borran.")) return;
    clearAllStats();
    toast("Estadísticas del navegador borradas");
    init();
  });
}

// --- Cuenta ---

// Tras iniciar sesión, volver a la página de la que venías (p. ej. una sala con amigos).
function goBack() {
  const back = new URLSearchParams(location.search).get("volver");
  if (back && /^[a-z-]+\.html(\?[A-Za-z0-9=&_-]*)?$/.test(back)) {
    location.href = back;
    return true;
  }
  return false;
}

function authForm(mode = "login", message = "") {
  const reg = mode === "registro";
  const reset = mode === "reset";
  authEl.innerHTML = `
    <section class="card auth-box">
      <h2 class="question">${reg ? "Crea tu perfil" : reset ? "Recuperar contraseña" : "Inicia sesión"}</h2>
      <p class="hint">${reg ? "Guarda tus rachas en todos tus dispositivos y entra en la clasificación." : reset ? "Te enviaremos un enlace para elegir una contraseña nueva." : "Para guardar tus resultados en tu cuenta y competir en la clasificación."}</p>
      ${message ? `<p class="note">${esc(message)}</p>` : ""}
      <form id="auth-form" novalidate>
        ${reg ? `<div class="form-row"><label class="field-label" for="username">Nombre de jugador</label>
          <input class="field" id="username" maxlength="20" minlength="3" autocomplete="nickname" required placeholder="Lo verán los demás en la clasificación"></div>` : ""}
        <div class="form-row"><label class="field-label" for="email">Correo electrónico</label>
          <input class="field" id="email" type="email" autocomplete="email" required></div>
        ${reset ? "" : `<div class="form-row"><label class="field-label" for="password">Contraseña</label>
          <input class="field" id="password" type="password" minlength="6" autocomplete="${reg ? "new-password" : "current-password"}" required></div>`}
        ${reg ? `<p class="hint">Al crear la cuenta aceptas la <a href="privacidad.html">política de privacidad</a>. Solo guardamos tu correo, tu nombre de jugador y tus resultados.</p>` : ""}
        <button class="btn" type="submit" style="width:100%">${reg ? "Crear cuenta" : reset ? "Enviar enlace" : "Entrar"}</button>
      </form>
      <p class="auth-switch">
        ${reg ? `¿Ya tienes cuenta? <button data-go="login">Inicia sesión</button>`
          : reset ? `<button data-go="login">Volver</button>`
          : `¿No tienes cuenta? <button data-go="registro">Crea tu perfil</button> · <button data-go="reset">¿Olvidaste la contraseña?</button>`}
      </p>
    </section>`;
  authEl.querySelectorAll("[data-go]").forEach((b) => b.addEventListener("click", () => authForm(b.dataset.go)));
  $("auth-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector("button[type=submit]");
    const email = $("email").value.trim();
    const password = $("password")?.value || "";
    const username = $("username")?.value.trim() || "";
    if (!/^\S+@\S+\.\S+$/.test(email)) return toast("Escribe un correo válido");
    if (!reset && password.length < 6) return toast("La contraseña debe tener al menos 6 caracteres");
    if (reg && !/^[\p{L}\d_.-]{3,20}$/u.test(username)) return toast("El nombre: 3-20 letras, números, punto, guion o guion bajo");
    btn.disabled = true;
    try {
      if (reg) {
        const { needsConfirm } = await cuenta.signUp({ email, password, username });
        if (needsConfirm) return authForm("login", "¡Cuenta creada! Te hemos enviado un correo para confirmarla. Después, inicia sesión.");
        await cuenta.uploadLocalHistory();
        if (goBack()) return;
        toast("¡Bienvenido a GeoReyno!");
        return init();
      }
      if (reset) {
        await cuenta.resetPassword(email);
        return authForm("login", "Si el correo está registrado, te llegará un enlace para cambiar la contraseña.");
      }
      await cuenta.signIn({ email, password });
      if (goBack()) return;
      toast("Sesión iniciada");
      init();
    } catch (err) {
      toast(err.message);
      btn.disabled = false;
    }
  });
}

function profileHeader(user) {
  authEl.innerHTML = `
    <section class="card">
      <div class="profile-head">
        <div class="avatar" aria-hidden="true">${esc(user.username[0] || "?")}</div>
        <div>
          <h2>${esc(user.username)}</h2>
          <p>${esc(user.email || "")}</p>
        </div>
        <div class="actions">
          <a class="btn ghost small" href="ranking.html">Clasificación</a>
          <button class="btn ghost small" id="logout">Cerrar sesión</button>
        </div>
      </div>
      <details style="margin-top:14px"><summary class="hint" style="cursor:pointer">Opciones de la cuenta</summary>
        <p class="hint">Borrar la cuenta elimina tu perfil y todos tus resultados del servidor. No se puede deshacer.</p>
        <button class="btn ghost small" id="delete">Borrar mi cuenta</button>
      </details>
    </section>`;
  $("logout").addEventListener("click", async () => {
    await cuenta.signOut();
    document.getElementById("nav-user").textContent = "Iniciar sesión";
    toast("Sesión cerrada");
    init();
  });
  $("delete").addEventListener("click", async () => {
    if (!confirm("¿Seguro que quieres borrar tu cuenta y todos tus resultados? No se puede deshacer.")) return;
    try {
      await cuenta.deleteAccount();
      toast("Cuenta borrada");
      init();
    } catch (err) {
      toast(err.message);
    }
  });
}

async function init() {
  const enabled = await cuenta.accountsEnabled();
  if (!enabled) {
    authEl.innerHTML = `
      <section class="card">
        <h2 class="question">Perfil de invitado</h2>
        <p>Las cuentas de usuario todavía no están activadas en esta web, así que tus partidas y rachas se guardan solo en este navegador.</p>
        <p class="hint">Cuando se activen podrás registrarte, ver tus estadísticas en todos tus dispositivos y competir en la clasificación.</p>
      </section>`;
    return renderStats(localHistory(), "Tus estadísticas en este dispositivo");
  }
  const user = await cuenta.currentUser(true);
  if (!user) {
    authForm(new URLSearchParams(location.search).has("registro") ? "registro" : "login");
    return renderStats(localHistory(), "Tus estadísticas en este dispositivo");
  }
  profileHeader(user);
  const nav = document.getElementById("nav-user");
  if (nav) nav.textContent = user.username;
  statsEl.innerHTML = `<div class="card"><p>Cargando tus estadísticas…</p></div>`;
  const remote = await cuenta.myResults();
  renderStats(merge(localHistory(), remote), "Tus estadísticas");
}

init();
