// Cuentas de usuario, envío de resultados y clasificaciones (Supabase).
//
// Sin configuración, GeoReyno funciona en «modo invitado»: todo se guarda solo en el navegador.
// Con SUPABASE_URL y SUPABASE_ANON_KEY en config.js, se activan el registro, el inicio de
// sesión, el perfil con estadísticas en todos tus dispositivos y las clasificaciones.
// La clave «anon» de Supabase es pública por diseño; la seguridad la ponen las políticas
// RLS de tools/supabase.sql.

import { MODES, getStats, loadPref, savePref } from "./engine.js";

const SUPABASE_JS = "https://unpkg.com/@supabase/supabase-js@2.45.4/dist/umd/supabase.js";

let clientPromise = null;
let userCache = undefined;

async function readConfig() {
  // Se pide siempre de nuevo (con un parámetro distinto) para que el navegador no use una copia
  // vieja, por ejemplo un «no encontrado» de antes de configurar los secretos.
  try {
    return await import(`../config.js?v=${Date.now()}`);
  } catch {
    return {};
  }
}

let configPromise = null;
export function getConfig() {
  configPromise ||= readConfig();
  return configPromise;
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error("No se ha podido cargar " + src));
    document.head.appendChild(s);
  });
}

// Cliente de Supabase, o null si las cuentas no están configuradas.
export function getClient() {
  clientPromise ||= (async () => {
    const cfg = await getConfig();
    if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) return null;
    if (!window.supabase?.createClient) await loadScript(SUPABASE_JS);
    return window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: "georeyno:auth" },
    });
  })().catch(() => null);
  return clientPromise;
}

export async function accountsEnabled() {
  return Boolean(await getClient());
}

// Nombre guardado localmente para pintar la cabecera al instante.
export function cachedUser() {
  return loadPref("cuenta", null);
}

// Usuario con sesión iniciada: { id, email, username } o null.
export async function currentUser(force = false) {
  if (userCache !== undefined && !force) return userCache;
  const sb = await getClient();
  if (!sb) return (userCache = null);
  const { data } = await sb.auth.getSession();
  const user = data?.session?.user;
  if (!user) {
    savePref("cuenta", null);
    return (userCache = null);
  }
  const { data: prof } = await sb.from("profiles").select("username").eq("id", user.id).maybeSingle();
  userCache = { id: user.id, email: user.email, username: prof?.username || user.user_metadata?.username || "jugador" };
  savePref("cuenta", { username: userCache.username });
  return userCache;
}

function friendlyError(error) {
  const msg = String(error?.message || error || "");
  if (/invalid login credentials/i.test(msg)) return "Correo o contraseña incorrectos.";
  if (/email not confirmed/i.test(msg)) return "Tienes que confirmar tu correo: revisa tu bandeja de entrada.";
  if (/already registered|already exists/i.test(msg)) return "Ya hay una cuenta con ese correo. Inicia sesión.";
  if (/password/i.test(msg) && /6|short|least/i.test(msg)) return "La contraseña debe tener al menos 6 caracteres.";
  if (/rate limit|too many/i.test(msg)) return "Demasiados intentos. Espera un poco y vuelve a probar.";
  if (/fetch|network/i.test(msg)) return "No hay conexión con el servidor de cuentas.";
  return "No se ha podido completar. " + msg;
}

export async function signUp({ email, password, username }) {
  const sb = await getClient();
  if (!sb) throw new Error("Las cuentas no están activadas.");
  const { data, error } = await sb.auth.signUp({
    email,
    password,
    options: { data: { username }, emailRedirectTo: new URL("perfil.html", location.href).href },
  });
  if (error) throw new Error(friendlyError(error));
  userCache = undefined;
  return { needsConfirm: !data.session };
}

export async function signIn({ email, password }) {
  const sb = await getClient();
  if (!sb) throw new Error("Las cuentas no están activadas.");
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw new Error(friendlyError(error));
  const user = await currentUser(true);
  await uploadLocalHistory();
  return user;
}

export async function signOut() {
  const sb = await getClient();
  if (sb) await sb.auth.signOut();
  userCache = null;
  savePref("cuenta", null);
}

export async function resetPassword(email) {
  const sb = await getClient();
  if (!sb) throw new Error("Las cuentas no están activadas.");
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: new URL("perfil.html", location.href).href });
  if (error) throw new Error(friendlyError(error));
}

export async function deleteAccount() {
  const sb = await getClient();
  if (!sb) return;
  const { error } = await sb.rpc("borrar_mi_cuenta");
  if (error) throw new Error(friendlyError(error));
  await signOut();
}

function row(user, mode, day, r) {
  return {
    user_id: user.id,
    mode,
    day,
    score: Math.max(0, Math.round(Number(r.score) || 0)),
    total: Math.max(1, Math.round(Number(r.total) || 1)),
    label: String(r.label || `${r.score}/${r.total}`).slice(0, 30),
    grid: String(r.grid || "").slice(0, 80),
  };
}

// Sube un resultado (se ignora si ya estaba subido ese día).
export async function submitResult(mode, day, result) {
  const user = await currentUser();
  if (!user || !MODES.some((m) => m.id === mode)) return false;
  const sb = await getClient();
  const { error } = await sb.from("results").upsert(row(user, mode, day, result), { onConflict: "user_id,mode,day", ignoreDuplicates: true });
  return !error;
}

// Al iniciar sesión, sube los resultados de los últimos días jugados como invitado.
export async function uploadLocalHistory() {
  const user = await currentUser();
  if (!user) return;
  const sb = await getClient();
  const minDay = new Date(Date.now() - 2 * 864e5).toISOString().slice(0, 10);
  const rows = [];
  for (const m of MODES) {
    const h = getStats(m.id).history;
    for (const day of Object.keys(h)) if (day >= minDay) rows.push(row(user, m.id, day, h[day]));
  }
  if (rows.length) await sb.from("results").upsert(rows, { onConflict: "user_id,mode,day", ignoreDuplicates: true });
}

// Resultados del usuario en el servidor (para estadísticas en cualquier dispositivo).
export async function myResults() {
  const user = await currentUser();
  if (!user) return null;
  const sb = await getClient();
  const { data, error } = await sb.from("results")
    .select("mode,day,score,total,label,grid")
    .eq("user_id", user.id)
    .order("day", { ascending: false })
    .limit(2000);
  return error ? null : data;
}

// Clasificación. mode = id de modo o null (todos, con puntos normalizados a 1000 por partida).
// period = "hoy" | "semana" | "mes" | "siempre".
export async function ranking(mode = null, period = "semana") {
  const sb = await getClient();
  if (!sb) return null;
  const days = { hoy: 0, semana: 6, mes: 29, siempre: 36500 }[period] ?? 6;
  const desde = new Date(Date.now() - days * 864e5);
  const p_desde = `${desde.getFullYear()}-${String(desde.getMonth() + 1).padStart(2, "0")}-${String(desde.getDate()).padStart(2, "0")}`;
  const { data, error } = await sb.rpc("ranking", { p_mode: mode, p_desde });
  if (error) return null;
  return data;
}

// Cada resultado diario guardado en el navegador se sube si hay sesión.
window.addEventListener("georeyno:result", (e) => {
  const { mode, key, result } = e.detail || {};
  if (mode && key && result) submitResult(mode, key, result).catch(() => {});
});

// --- Amigos e invitaciones a salas ---

async function sbUser() {
  const user = await currentUser();
  if (!user) throw new Error("Inicia sesión primero.");
  return { sb: await getClient(), user };
}

// Lista de amistades: [{ id, otro: {id, username}, estado, mia (la pedí yo) }].
export async function friends() {
  const { sb, user } = await sbUser();
  const { data, error } = await sb.from("amistades").select("id,de,para,estado");
  if (error) throw new Error(friendlyError(error));
  const ids = [...new Set((data || []).map((a) => (a.de === user.id ? a.para : a.de)))];
  let names = new Map();
  if (ids.length) {
    const { data: profs } = await sb.from("profiles").select("id,username").in("id", ids);
    names = new Map((profs || []).map((p) => [p.id, p.username]));
  }
  return (data || []).map((a) => {
    const other = a.de === user.id ? a.para : a.de;
    return { id: a.id, otro: { id: other, username: names.get(other) || "jugador" }, estado: a.estado, mia: a.de === user.id };
  });
}

export async function addFriend(username) {
  const { sb, user } = await sbUser();
  const { data, error } = await sb.rpc("buscar_jugador", { nombre: username });
  if (error) throw new Error(friendlyError(error));
  const found = Array.isArray(data) ? data[0] : data;
  if (!found) throw new Error("No hay ningún jugador con ese nombre.");
  if (found.id === user.id) throw new Error("Ese eres tú 🙂");
  const list = await friends();
  const existing = list.find((f) => f.otro.id === found.id);
  if (existing) {
    // Si él ya me lo había pedido, aceptarlo directamente.
    if (existing.estado === "pendiente" && !existing.mia) return acceptFriend(existing.id);
    throw new Error(existing.estado === "aceptada" ? "Ya sois amigos." : "Ya le has enviado la solicitud.");
  }
  const { error: e2 } = await sb.from("amistades").insert({ de: user.id, para: found.id });
  if (e2) throw new Error(friendlyError(e2));
  return found.username;
}

export async function acceptFriend(id) {
  const { sb } = await sbUser();
  const { error } = await sb.from("amistades").update({ estado: "aceptada" }).eq("id", id);
  if (error) throw new Error(friendlyError(error));
}

export async function removeFriend(id) {
  const { sb } = await sbUser();
  const { error } = await sb.from("amistades").delete().eq("id", id);
  if (error) throw new Error(friendlyError(error));
}

export async function inviteFriend(friendId, sala, modo) {
  const { sb, user } = await sbUser();
  const { error } = await sb.from("invitaciones").insert({ de: user.id, para: friendId, sala, modo });
  if (error) throw new Error(friendlyError(error));
}

// Invitaciones recibidas en las últimas 2 horas: [{ id, sala, modo, de: username }].
export async function myInvites() {
  const { sb, user } = await sbUser();
  const since = new Date(Date.now() - 2 * 3600e3).toISOString();
  const { data, error } = await sb.from("invitaciones").select("id,de,sala,modo,created_at").eq("para", user.id).gte("created_at", since);
  if (error) return [];
  const ids = [...new Set((data || []).map((i) => i.de))];
  let names = new Map();
  if (ids.length) {
    const { data: profs } = await sb.from("profiles").select("id,username").in("id", ids);
    names = new Map((profs || []).map((p) => [p.id, p.username]));
  }
  return (data || []).sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .map((i) => ({ id: i.id, sala: i.sala, modo: i.modo, de: names.get(i.de) || "Un amigo" }));
}

export async function dismissInvite(id) {
  const { sb } = await sbUser();
  await sb.from("invitaciones").delete().eq("id", id);
}
