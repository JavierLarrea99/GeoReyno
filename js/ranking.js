// Clasificación: por modo y periodo. Necesita las cuentas (Supabase) activadas.

import { MODES, esc, formatNumber } from "./engine.js";
import * as cuenta from "./cuenta.js";

const $ = (id) => document.getElementById(id);
const PERIODS = [["hoy", "Hoy"], ["semana", "Esta semana"], ["mes", "Este mes"], ["siempre", "Siempre"]];
const state = { mode: null, period: "semana" };
let user = null;

function tabs() {
  const modes = [[null, "Todos los juegos"], ...MODES.filter((m) => !m.sub).map((m) => [m.id, m.short])];
  $("tabs").innerHTML = `
    <div class="tabs" role="tablist" aria-label="Juego">
      ${modes.map(([id, name]) => `<button role="tab" data-mode="${id ?? ""}" class="${state.mode === id ? "on" : ""}" aria-selected="${state.mode === id}">${esc(name)}</button>`).join("")}
    </div>
    <div class="tabs" role="tablist" aria-label="Periodo">
      ${PERIODS.map(([id, name]) => `<button role="tab" data-period="${id}" class="${state.period === id ? "on" : ""}" aria-selected="${state.period === id}">${esc(name)}</button>`).join("")}
    </div>`;
  $("tabs").querySelectorAll("[data-mode]").forEach((b) => b.addEventListener("click", () => { state.mode = b.dataset.mode || null; load(); }));
  $("tabs").querySelectorAll("[data-period]").forEach((b) => b.addEventListener("click", () => { state.period = b.dataset.period; load(); }));
}

async function load() {
  tabs();
  const body = $("board");
  body.innerHTML = `<p class="empty">Cargando…</p>`;
  const rows = await cuenta.ranking(state.mode, state.period);
  if (!rows) {
    body.innerHTML = `<p class="empty">No se ha podido cargar la clasificación. Inténtalo de nuevo.</p>`;
    return;
  }
  if (!rows.length) {
    body.innerHTML = `<p class="empty">Nadie ha puntuado todavía en este periodo. ¡Sé el primero!</p>`;
    return;
  }
  const unit = state.mode ? "Puntos" : "Puntos (1000 por partida perfecta)";
  body.innerHTML = `
    <div class="table-scroll">
      <table class="rank-table">
        <thead><tr><th>#</th><th>Jugador</th><th>Partidas</th><th>${unit}</th></tr></thead>
        <tbody>${rows.map((r, i) => `
          <tr class="${user && r.username === user.username ? "me" : ""}">
            <td>${["🥇", "🥈", "🥉"][i] || i + 1}</td><td>${esc(r.username)}</td>
            <td>${formatNumber(r.partidas)}</td><td><b>${formatNumber(r.puntos)}</b></td>
          </tr>`).join("")}</tbody>
      </table>
    </div>`;
}

async function init() {
  if (!(await cuenta.accountsEnabled())) {
    $("tabs").innerHTML = "";
    $("board").innerHTML = `
      <p>La clasificación estará disponible cuando se activen las cuentas de usuario.</p>
      <p class="hint">Mientras tanto, puedes ver tus propias estadísticas en <a href="perfil.html">tu perfil</a> o competir con tus amigos en una <a href="amigos.html">sala</a>.</p>`;
    return;
  }
  user = await cuenta.currentUser();
  if (!user) $("join").innerHTML = `<p class="note">Para aparecer aquí, <a href="perfil.html?registro">crea tu perfil</a> o <a href="perfil.html">inicia sesión</a>.</p>`;
  load();
}

init();
