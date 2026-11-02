// Portada: tarjetas de los retos diarios y panel de clasificación semanal.

import { MODES, getStats, getTodayResult, resultLabel, esc, formatNumber, todayKey } from "./engine.js";

// Iconos de las tarjetas (trazo blanco).
export const MODE_ICONS = {
  camera: '<path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.5" r="4"/>',
  letters: '<rect x="2.5" y="7" width="5.5" height="5.5" rx="1"/><rect x="9.25" y="7" width="5.5" height="5.5" rx="1"/><rect x="16" y="7" width="5.5" height="5.5" rx="1"/><path d="M4 17h2M10.7 17h2.6M17.5 17h2.5"/>',
  shield: '<path d="M12 3l8 3v5c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6z"/><path d="M8 8.5l8 8M16 8.5l-8 8M12 7.5v10M7.5 12.5h9"/>',
  question: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.3a2.6 2.6 0 0 1 5 1c0 1.8-2.5 2.2-2.5 3.9"/><circle cx="12" cy="17.2" r=".6" fill="currentColor"/>',
  street: '<path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  friends: '<circle cx="9" cy="8.5" r="3"/><circle cx="17" cy="9.5" r="2.4"/><path d="M3.5 19c.5-3.3 2.7-5 5.5-5s5 1.7 5.5 5M14.5 14.6c.8-.4 1.6-.6 2.5-.6 2.3 0 4 1.4 4.4 4"/>',
};

export function modeIcon(name) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${MODE_ICONS[name] || MODE_ICONS.question}</svg>`;
}

function card(m) {
  const done = getTodayResult(m.id);
  const s = getStats(m.id);
  const status = done ? `Hoy: ${esc(resultLabel(done))} ✓` : s.streak ? `Racha: ${s.streak} 🔥` : "";
  return `
    <a class="mode" href="${esc(m.href)}">
      <div class="mode-art art-${esc(m.icon)}">
        <svg class="deco" aria-hidden="true"><rect width="100%" height="100%" fill="url(#cadenas)"/></svg>
        ${modeIcon(m.icon)}
      </div>
      <div class="mode-body">
        <span class="tag ${done ? "friends" : "live"}" style="align-self:flex-start">${done ? "Hecho hoy" : "Diario"}</span>
        <h3>${esc(m.name)}</h3>
        <p>${esc(m.desc)}</p>
        <span class="status">${status}</span>
      </div>
    </a>`;
}

document.getElementById("modes").innerHTML = MODES.filter((m) => !m.featured && !m.sub).map(card).join("");

// Panel de clasificación: con cuentas, el top semanal; sin cuentas, tu resumen local.
async function rankPanel() {
  const body = document.getElementById("rank-body");
  let rows = null;
  let user = null;
  try {
    const cuenta = await import("./cuenta.js");
    if (await cuenta.accountsEnabled()) {
      [rows, user] = await Promise.all([cuenta.ranking(null, "semana"), cuenta.currentUser()]);
    }
  } catch { /* sin cuentas */ }

  if (rows) {
    body.innerHTML = rows.length
      ? `<ol class="rank-list">${rows.slice(0, 6).map((r, i) => `
          <li class="${user && r.username === user.username ? "me" : ""}"><span class="pos">${i + 1}</span>
          <span class="who">${esc(r.username)}</span><span class="pts">${formatNumber(r.puntos)}</span></li>`).join("")}</ol>`
      : `<p class="empty">Aún no ha jugado nadie esta semana. ¡Sé el primero!</p>`
    body.insertAdjacentHTML("beforeend", `<a class="btn ghost" href="ranking.html">Ver clasificación completa</a>
      ${user ? "" : `<a class="btn" href="perfil.html">Crear mi perfil</a>`}`);
    return;
  }

  // Modo invitado: resumen de tu semana.
  const today = todayKey();
  const week = [...Array(7)].map((_, i) => todayKey(new Date(Date.now() - i * 864e5)));
  const all = MODES.map((m) => getStats(m.id));
  const playedWeek = all.reduce((n, s) => n + week.filter((d) => s.history[d]).length, 0);
  const doneToday = all.filter((s) => s.history[today]).length;
  const best = Math.max(0, ...all.map((s) => s.streak));
  body.innerHTML = `
    <ol class="rank-list">
      <li><span class="pos">🔥</span><span class="who">Mejor racha activa</span><span class="pts">${best}</span></li>
      <li><span class="pos">✓</span><span class="who">Retos hechos hoy</span><span class="pts">${doneToday}/${MODES.length}</span></li>
      <li><span class="pos">7</span><span class="who">Partidas esta semana</span><span class="pts">${playedWeek}</span></li>
    </ol>
    <p class="empty" style="margin-top:10px">La clasificación con otros jugadores llegará con las cuentas de usuario.</p>
    <a class="btn ghost" href="perfil.html">Ver mis estadísticas</a>`;
}

rankPanel();
