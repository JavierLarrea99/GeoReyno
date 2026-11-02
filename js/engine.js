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
