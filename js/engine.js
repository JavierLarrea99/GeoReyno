// Motor común de GeoReyno: fechas, azar con semilla, estadísticas y compartir.
// Todos los modos usan estas funciones para que el reto diario sea el mismo para todo el mundo.

// Día 1 de GeoReyno. Sirve para numerar los retos ("GeoReyno #12").
const LAUNCH = "2026-11-02";

// Fecha local de hoy como "AAAA-MM-DD".
export function todayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Número de reto: días desde el lanzamiento + 1.
export function dayNumber(key = todayKey()) {
  const ms = Date.parse(key + "T00:00:00Z") - Date.parse(LAUNCH + "T00:00:00Z");
  return Math.floor(ms / 864e5) + 1;
}

// Convierte un texto en un número de 32 bits (hash FNV-1a).
function hashString(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Generador pseudoaleatorio con semilla (mulberry32): misma semilla, misma secuencia.
export function seededRandom(seedText) {
  let a = hashString(seedText);
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Baraja una copia del array (Fisher-Yates). Sin `rand` usa Math.random.
export function shuffle(items, rand = Math.random) {
  const copy = items.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// Elige `n` elementos para el reto de hoy de un modo. Igual para todos los jugadores.
export function pickDaily(items, n, mode, key = todayKey()) {
  return shuffle(items, seededRandom(`${mode}:${key}`)).slice(0, n);
}

// --- Almacenamiento local (puede fallar en modo privado: nunca debe romper el juego) ---

function readStore(name, fallback) {
  try {
    const raw = localStorage.getItem(name);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeStore(name, value) {
  try {
    localStorage.setItem(name, JSON.stringify(value));
  } catch {
    /* sin almacenamiento: el juego sigue funcionando sin guardar */
  }
}

const STATS_KEY = "georeyno:stats";

function emptyStats() {
  return { played: 0, streak: 0, best: 0, lastDay: null, history: {} };
}

// Estadísticas de un modo: partidas, racha actual, mejor racha e historial por día.
export function getStats(mode) {
  const all = readStore(STATS_KEY, {});
  return { ...emptyStats(), ...(all[mode] || {}) };
}

// Resultado de hoy de un modo, si ya se ha jugado.
export function getTodayResult(mode, key = todayKey()) {
  return getStats(mode).history[key] || null;
}

// Guarda el resultado del reto de hoy y actualiza la racha. Ignora repeticiones del mismo día.
export function saveDailyResult(mode, result, key = todayKey()) {
  const all = readStore(STATS_KEY, {});
  const stats = { ...emptyStats(), ...(all[mode] || {}) };
  if (stats.history[key]) return stats;

  const yesterday = todayKey(new Date(Date.parse(key + "T12:00:00") - 864e5));
  stats.streak = stats.lastDay === yesterday ? stats.streak + 1 : 1;
  stats.best = Math.max(stats.best, stats.streak);
  stats.played += 1;
  stats.lastDay = key;
  stats.history[key] = result;

  all[mode] = stats;
  writeStore(STATS_KEY, all);
  return stats;
}

// Comparte un texto: menú nativo en el móvil, portapapeles en el ordenador.
export async function shareText(text) {
  try {
    if (navigator.share) {
      await navigator.share({ text });
      return "shared";
    }
  } catch {
    /* el usuario cerró el menú: probamos con el portapapeles */
  }
  try {
    await navigator.clipboard.writeText(text);
    return "copied";
  } catch {
    return "failed";
  }
}

// Texto del contador hasta el próximo reto (medianoche local).
export function timeToNextDay(now = new Date()) {
  const next = new Date(now);
  next.setHours(24, 0, 0, 0);
  const s = Math.max(0, Math.floor((next - now) / 1000));
  const h = String(Math.floor(s / 3600)).padStart(2, "0");
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const sec = String(s % 60).padStart(2, "0");
  return `${h}:${m}:${sec}`;
}

// --- Registro de modos ---
// Todos los modos guardan su resultado con el mismo esquema:
//   { score: número, total: máximo posible, grid: "🟩🟥…" (cuadritos para compartir),
//     label?: texto corto ("3/6", "18 450 pts"), ...datos propios del modo }
// Así la página de estadísticas y la portada pueden mostrar cualquier modo.
export const MODES = [
  { id: "quiz", ready: true, name: "Quiz del día", short: "Quiz", href: "quiz.html",
    desc: "Cinco preguntas sobre historia, geografía y tradiciones de Navarra." },
  { id: "pueblo", ready: true, name: "Pueblo misterioso", short: "Pueblo", href: "pueblo.html",
    desc: "Adivina el municipio por su silueta, con pistas de distancia y dirección." },
  { id: "aire", ready: true, name: "Desde el aire", short: "Aire", href: "aire.html",
    desc: "Cinco ortofotos: marca en el mapa dónde se tomaron." },
  { id: "aire-antigua", ready: true, sub: true, name: "Desde el aire · foto antigua", short: "Aire antiguo", href: "aire.html?antigua",
    desc: "La misma idea con la ortofoto de 1956-1957." },
  { id: "escudos", ready: true, name: "Escudos", short: "Escudos", href: "escudos.html",
    desc: "¿De qué municipio es este escudo? Cinco escudos, cuatro opciones." },
  { id: "mas", ready: true, name: "¿Cuál tiene más?", short: "¿Cuál tiene más?", href: "mas.html",
    desc: "Dos municipios: elige el que tiene más superficie, altitud o habitantes." },
  { id: "street", ready: true, name: "Navarra Street", short: "Street", href: "street.html",
    desc: "Muévete por las calles con fotos de Mapillary y marca dónde estás." },
];

export const EXTRA_PAGES = [
  { id: "amigos", ready: true, name: "Jugar con amigos", short: "Amigos", href: "amigos.html" },
  { id: "estadisticas", name: "Estadísticas", short: "Estadísticas", href: "estadisticas.html" },
  { id: "ayuda", name: "Cómo se juega", short: "Cómo se juega", href: "como-se-juega.html" },
];

export function modeInfo(id) {
  return MODES.find((m) => m.id === id) || null;
}

// Texto corto de un resultado ("3/5", "12 340 / 25 000"…).
export function resultLabel(result) {
  if (!result) return "";
  if (result.label) return result.label;
  return `${formatNumber(result.score)}/${formatNumber(result.total)}`;
}

// Cuadritos de un resultado (los resultados antiguos del quiz no guardaban `grid`).
export function resultGrid(result) {
  if (!result) return "";
  if (result.grid) return result.grid;
  if (Array.isArray(result.answers)) return result.answers.map((ok) => (ok ? "🟩" : "🟥")).join("");
  return "";
}

// Estadísticas de todos los modos de una vez.
export function getAllStats() {
  return MODES.map((m) => ({ mode: m, stats: getStats(m.id) }));
}

// Borra todas las estadísticas guardadas en este navegador.
export function clearAllStats() {
  try {
    localStorage.removeItem(STATS_KEY);
  } catch {
    /* nada que borrar */
  }
}

// --- Utilidades de interfaz compartidas ---

// Escapa texto antes de meterlo en HTML.
export function esc(text) {
  return String(text ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);
}

// Número con separador de miles español (12 345).
export function formatNumber(n) {
  return Number(n).toLocaleString("es-ES");
}

// Mensaje flotante breve. Usa el elemento #toast si existe, si no lo crea.
export function toast(message) {
  let t = document.getElementById("toast");
  if (!t) {
    t = document.createElement("div");
    t.id = "toast";
    t.className = "toast";
    t.setAttribute("role", "status");
    document.body.appendChild(t);
  }
  t.textContent = message;
  t.classList.add("show");
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove("show"), 2200);
}

// Normaliza un texto para comparar sin tildes ni mayúsculas.
export function normalize(text) {
  return String(text ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9ñ]+/g, " ")
    .trim();
}

// Lectura y escritura genérica para preferencias (tema, nombre en salas…).
export function loadPref(name, fallback = null) {
  return readStore(`georeyno:${name}`, fallback);
}
export function savePref(name, value) {
  writeStore(`georeyno:${name}`, value);
}

// Contador hasta el próximo reto que recarga la página al cambiar el día.
export function startCountdown(el, key) {
  if (!el) return;
  const timer = setInterval(() => {
    el.textContent = timeToNextDay();
    if (todayKey() !== key) {
      clearInterval(timer);
      location.reload();
    }
  }, 1000);
}

// Bloque HTML de estadísticas (jugados, racha, mejor racha) de un modo.
export function statsBlock(mode) {
  const s = getStats(mode);
  return `
    <div class="stats">
      <div><b>${s.played}</b><span>Jugados</span></div>
      <div><b>${s.streak}</b><span>Racha</span></div>
      <div><b>${s.best}</b><span>Mejor racha</span></div>
    </div>`;
}

// Distancia en km entre dos puntos [lon, lat] (fórmula del haversine).
export function distanceKm([lon1, lat1], [lon2, lat2]) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Rumbo en grados (0 = norte, 90 = este) de a hacia b.
export function bearing([lon1, lat1], [lon2, lat2]) {
  const toRad = (d) => (d * Math.PI) / 180;
  const y = Math.sin(toRad(lon2 - lon1)) * Math.cos(toRad(lat2));
  const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lon2 - lon1));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

// Parámetros de la URL comunes a todos los modos:
//   ?practica        partida libre que no cuenta para la racha
//   ?sala=XXXXXX     partida dentro de una sala con amigos (el reto lo fija la sala)
//   ?reto=AAAA-MM-DD reto de un día concreto (lo usan las salas)
export function gameParams() {
  const p = new URLSearchParams(location.search);
  const reto = p.get("reto");
  return {
    practice: p.has("practica"),
    room: p.get("sala"),
    key: reto && /^\d{4}-\d{2}-\d{2}$/.test(reto) ? reto : todayKey(),
    seed: p.get("semilla"),
  };
}

// --- Comunicación con la sala de amigos ---
// Dentro de una sala, el juego se abre en un iframe y avisa a la sala de cada ronda.
function inRoomFrame() {
  return window.parent !== window && new URLSearchParams(location.search).has("sala");
}

export function reportRound(mode, round, points, max, extra = {}) {
  if (!inRoomFrame()) return;
  window.parent.postMessage({ georeyno: "round", mode, round, points, max, ...extra }, location.origin);
}

export function reportFinal(mode, result) {
  if (!inRoomFrame()) return;
  window.parent.postMessage({ georeyno: "final", mode, result }, location.origin);
}

// Elemento del día recorriendo una permutación fija: no se repite hasta agotar la lista.
// Útil para modos con un único elemento diario (pueblo misterioso).
export function dailyFromCycle(items, mode, key = todayKey()) {
  const order = shuffle(items, seededRandom(`${mode}:ciclo`));
  const n = dayNumber(key) - 1;
  return order[((n % order.length) + order.length) % order.length];
}
