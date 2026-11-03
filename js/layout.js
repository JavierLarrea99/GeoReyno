// Cabecera, menú y pie comunes a todas las páginas.
// Cada página tiene <header class="top" data-layout> y <footer class="foot" data-layout>,
// y este módulo los rellena para no repetir el menú en cada archivo.

import { MODES, EXTRA_PAGES, esc, loadPref, savePref } from "./engine.js";

const current = location.pathname.split("/").pop() || "index.html";
const inRoom = window.parent !== window && new URLSearchParams(location.search).has("sala");

function link(page, cls = "") {
  if (page.ready === false) return `<span class="nav-soon" title="Próximamente">${esc(page.short)}</span>`;
  const here = page.href === current ? ' aria-current="page"' : "";
  return `<a href="${esc(page.href)}"${cls ? ` class="${cls}"` : ""}${here}>${esc(page.short)}</a>`;
}

const ICONS = {
  light: '<circle cx="12" cy="12" r="4.5"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/>',
  dark: '<path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z"/>',
};

// El botón muestra el tema al que se cambia.
function themeButton(theme) {
  const next = theme === "light" ? "dark" : "light";
  const label = next === "light" ? "Cambiar a tema claro" : "Cambiar a tema oscuro";
  return `<svg class="ico" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">${ICONS[next]}</svg><span class="theme-text">${label}</span>`;
}

function userLink() {
  const u = loadPref("cuenta", null);
  const here = current === "perfil.html" ? ' aria-current="page"' : "";
  return `<a href="perfil.html" class="nav-user" id="nav-user"${here}>${u?.username ? esc(u.username) : "Iniciar sesión"}</a>`;
}

function renderHeader(el) {
  const theme = loadPref("theme", "dark") === "light" ? "light" : "dark";
  const main = MODES.find((m) => m.featured);
  const others = MODES.filter((m) => !m.featured && !m.sub);
  const extras = EXTRA_PAGES.filter((p) => p.id !== "perfil");
  el.innerHTML = `
    <div class="wrap wide">
      <a class="brand" href="./" aria-label="GeoReyno, inicio">
        <img class="logo" src="img/logo.svg" alt="" width="28" height="37">
        <b>Geo<span>Reyno</span></b>
      </a>
      <button class="menu-btn" id="menu-btn" aria-expanded="false" aria-controls="site-nav">
        <span class="burger" aria-hidden="true"></span><span class="menu-text">Menú</span>
      </button>
      <nav class="site-nav" id="site-nav" aria-label="Juegos y páginas">
        <div class="nav-group">
          <span class="nav-title">Juego principal</span>
          ${link(main, "nav-main")}
        </div>
        <div class="nav-group">
          <span class="nav-title">Retos diarios</span>
          ${others.map((m) => link(m)).join("")}
        </div>
        <div class="nav-group">
          <span class="nav-title">Más</span>
          ${extras.map((p) => link(p)).join("")}
          <button class="theme-btn" id="theme-btn">${themeButton(theme)}</button>
          ${userLink()}
        </div>
      </nav>
    </div>`;

  const btn = el.querySelector("#menu-btn");
  const nav = el.querySelector("#site-nav");
  const close = () => {
    btn.setAttribute("aria-expanded", "false");
    nav.classList.remove("open");
  };
  btn.addEventListener("click", () => {
    const open = btn.getAttribute("aria-expanded") !== "true";
    btn.setAttribute("aria-expanded", String(open));
    nav.classList.toggle("open", open);
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
  document.addEventListener("click", (e) => { if (!el.contains(e.target)) close(); });

  const themeBtn = el.querySelector("#theme-btn");
  themeBtn.addEventListener("click", () => {
    const next = loadPref("theme", "dark") === "light" ? "dark" : "light";
    savePref("theme", next);
    if (next === "light") document.documentElement.setAttribute("data-theme", "light");
    else document.documentElement.removeAttribute("data-theme");
    themeBtn.innerHTML = themeButton(next);
    document.dispatchEvent(new CustomEvent("georeyno:theme"));
  });
}

function renderFooter(el) {
  const extra = el.innerHTML.trim();
  el.innerHTML = `
    <div class="wrap wide">
      ${extra ? `<div class="foot-extra">${extra}</div>` : ""}
      <nav class="foot-links" aria-label="Enlaces">
        <a href="como-se-juega.html">Cómo se juega</a>
        <a href="ranking.html">Clasificación</a>
        <a href="creditos.html">Créditos de datos</a>
        <a href="privacidad.html">Privacidad</a>
        <a href="cookies.html">Cookies</a>
        <a href="aviso-legal.html">Aviso legal</a>
      </nav>
      <p>GeoReyno es un proyecto independiente, sin relación con el Gobierno de Navarra ni con ninguna administración pública.</p>
      <p>Datos: IGN (CC BY 4.0) · © OpenStreetMap contributors · Mapillary (CC BY-SA 4.0) · Wikimedia Commons. <a href="creditos.html">Ver créditos</a>.</p>
    </div>`;
}

if (inRoom) document.documentElement.classList.add("in-room");

const header = document.querySelector("header[data-layout]");
const footer = document.querySelector("footer[data-layout]");
if (header) renderHeader(header);
if (footer) renderFooter(footer);

// Cuentas: comprueba la sesión y actualiza el nombre de la cabecera. También sube resultados.
import("./cuenta.js").then(async ({ currentUser, accountsEnabled }) => {
  if (!(await accountsEnabled())) return;
  const user = await currentUser();
  const a = document.getElementById("nav-user");
  if (a) a.textContent = user ? user.username : "Iniciar sesión";
}).catch(() => { /* sin cuentas */ });

// PWA básica: registra el service worker (fuera de las salas).
if ("serviceWorker" in navigator && !inRoom) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => { /* sin service worker la web funciona igual */ });
  });
}
