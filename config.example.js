// Copia este archivo como config.js y rellena lo que uses.
// config.js está en .gitignore: nunca se sube al repositorio.

// Navarra Street y Adivina el municipio: token de cliente de Mapillary.
//   1. https://www.mapillary.com/dashboard/developers → «Register application» (permiso de lectura).
//   2. En la tabla, columna «Access Token» → «View». Empieza por MLY|.
export const MAPILLARY_TOKEN = "";

// Google Street View para el reto diario de Navarra Street (opcional, de pago por encima del cupo gratis).
//   Google Cloud → APIs y servicios → Credenciales → Clave de API, restringida a tu dominio
//   y a «Maps JavaScript API». Ver PLAN.md.
export const GOOGLE_MAPS_KEY = "";

// Cuentas, perfil y clasificaciones: proyecto gratuito de Supabase (ver PLAN.md).
//   Supabase → Project Settings → API: «Project URL» y la clave «anon public».
export const SUPABASE_URL = "";
export const SUPABASE_ANON_KEY = "";
