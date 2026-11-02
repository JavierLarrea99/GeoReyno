// Cabecera, menú y pie comunes a todas las páginas.
// Cada página tiene <header class="top" data-layout> y <footer class="foot" data-layout>,
// y este módulo los rellena para no repetir el menú en cada archivo.

import { MODES, EXTRA_PAGES, esc, loadPref, savePref } from "./engine.js";

const current = location.pathname.split("/").pop() || "index.html";

function link(page) {
  if (page.ready === false) {
    return `<span class="nav-soon" title="Próximamente">${esc(page.short)}</span>`;
  }
  const here = page.href === current ? ' aria-current="page"' : "";
  return `<a href="${esc(page.href)}"${here}>${esc(page.short)}</a>`;
}

function themeLabel(theme) {
  return theme === "dark" ? "Tema oscuro" : theme === "light" ? "Tema claro" : "Tema del sistema";
}

const ICONS = {
  light: '<circle cx="12" cy="12" r="4.5"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/>',
  dark: '<path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z"/>',
  auto: '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5v17A8.5 8.5 0 0 0 12 3.5z" fill="currentColor"/>',
};

function themeIcon(theme) {
  return `<svg class="ico" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">${ICONS[theme] || ICONS.auto}</svg>`;
}

function renderHeader(el) {
  const theme = loadPref("theme", "auto");
  el.innerHTML = `
    <div class="wrap wide">
      <a class="brand" href="./">
        <img class="chain" src="img/icon.svg" alt="">
        <b>Geo<span>Reyno</span></b>
      </a>
      <button class="menu-btn" id="menu-btn" aria-expanded="false" aria-controls="site-nav">
        <span class="burger" aria-hidden="true"></span><span class="menu-text">Menú</span>
      </button>
      <nav class="site-nav" id="site-nav" aria-label="Juegos y páginas">
        <div class="nav-group">
          <span class="nav-title">Juegos</span>
          ${MODES.filter((m) => !m.sub).map(link).join("")}
        </div>
        <div class="nav-group">
          <span class="nav-title">Más</span>
          ${EXTRA_PAGES.map(link).join("")}
          <button class="theme-btn" id="theme-btn" title="${themeLabel(theme)}" aria-label="${themeLabel(theme)}">
            ${themeIcon(theme)}<span class="theme-text">${themeLabel(theme)}</span>
          </button>
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
    const order = ["auto", "light", "dark"];
    const next = order[(order.indexOf(loadPref("theme", "auto")) + 1) % order.length];
    savePref("theme", next);
    if (next === "auto") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", next);
    themeBtn.title = themeLabel(next);
    themeBtn.setAttribute("aria-label", themeLabel(next));
    themeBtn.innerHTML = `${themeIcon(next)}<span class="theme-text">${themeLabel(next)}</span>`;
    document.dispatchEvent(new CustomEvent("georeyno:theme"));
  });
}

function renderFooter(el) {
  const extra = el.innerHTML.trim();
  el.innerHTML = `
    <div class="wrap wide">
      ${extra ? `<div class="foot-extra">${extra}</div>` : ""}
      <nav class="foot-links" aria-label="Enlaces legales">
        <a href="como-se-juega.html">Cómo se juega</a>
        <a href="creditos.html">Créditos de datos</a>
        <a href="privacidad.html">Privacidad</a>
        <a href="cookies.html">Cookies</a>
        <a href="aviso-legal.html">Aviso legal</a>
      </nav>
      <p>GeoReyno es un proyecto independiente, sin relación con el Gobierno de Navarra ni con ninguna administración pública.</p>
      <p>Datos: IGN y Gobierno de Navarra (CC BY 4.0) · © OpenStreetMap contributors · Mapillary (CC BY-SA 4.0). <a href="creditos.html">Ver créditos</a>.</p>
    </div>`;
}

// Dentro de una sala de amigos (iframe) se ocultan cabecera y pie: la sala ya tiene los suyos.
if (window.parent !== window && new URLSearchParams(location.search).has("sala")) {
  document.documentElement.classList.add("in-room");
}

const header = document.querySelector("header[data-layout]");
const footer = document.querySelector("footer[data-layout]");
if (header) renderHeader(header);
if (footer) renderFooter(footer);

// PWA básica: registra el service worker (fuera de las salas y solo en https o localhost).
if ("serviceWorker" in navigator && !document.documentElement.classList.contains("in-room")) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => { /* sin service worker la web funciona igual */ });
  });
}
