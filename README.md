# GeoReyno

¿Sabrías decir dónde estás? Juegos diarios de Navarra: un reto nuevo cada día, el mismo para todo el mundo, solo o con amigos.

GeoReyno es un proyecto independiente, sin relación con el Gobierno de Navarra.

## Juegos

| Juego | Página | Qué es |
| --- | --- | --- |
| **Navarra Street** (principal) | `street.html` | Apareces en una calle de Navarra (fotos de Mapillary, con movimiento), a pantalla completa, con el mapa abajo para marcar dónde estás. 5 rondas, 5000 · e^(−d/30 km) puntos por ronda. |
| Adivina el municipio | `municipio.html` | Fotos libres (Wikimedia Commons) de un municipio; 4 intentos, cada fallo destapa otra foto y da distancia y dirección. |
| Palabra del día | `palabra.html` | Tipo Wordle: palabra navarra de 5 letras en 6 intentos, con pista tras el tercero. |
| Escudos | `escudos.html` | 5 escudos municipales (Wikidata/Commons); escribes el municipio con autocompletado. Autor y licencia al responder. |
| Pregunta del día | `pregunta.html` | Una pregunta al día de un banco de 183 (historia, tradiciones, euskera, topónimos…). |
| Jugar con amigos | `amigos.html` | Solo con sesión iniciada: añade amigos por su nombre de jugador, invítales a una sala o entra con un código de 6 letras. Todos juegan el mismo reto y ven la tabla por rondas. |

Además: `perfil.html` (registro, inicio de sesión y estadísticas por juego), `ranking.html` (clasificación por juego y periodo), `como-se-juega.html` y las páginas legales.

## Cómo funciona

- Web estática: HTML, CSS y JavaScript con módulos ES, sin paso de compilación. Librerías desde unpkg con versión fija y solo donde hacen falta: MapLibre GL 4.7.1, MapillaryJS 4.1.2, PeerJS 1.5.4, supabase-js 2.45.4.
- El reto diario se elige con una semilla basada en la fecha: todos ven lo mismo sin servidor.
- **Sin cuenta**, estadísticas y rachas se guardan en el navegador (`localStorage`, siempre con `try/catch`).
- **Con cuenta** (Supabase, gratuito), los resultados se suben también al servidor: estadísticas en cualquier dispositivo y clasificación. Si no está configurado, la web funciona igual en modo invitado.
- `?practica` en cualquier juego da partidas libres que no cuentan para la racha.
- Diseño oscuro por defecto con tema claro opcional; tipografías Barlow autoalojadas (`fonts/`, licencia OFL).
- PWA básica: `manifest.json`, iconos y service worker para abrir sin conexión.

## Probar en local

Hace falta Python 3. En la carpeta del proyecto:

```bash
python3 -m http.server 8000
```

En Windows:

```bash
py -m http.server 8000
```

Abre <http://localhost:8000>. No vale con abrir `index.html` con doble clic: el navegador bloquea los módulos y los JSON.

## Configuración (`config.js`)

Copia `config.example.js` como `config.js` (está en `.gitignore`, nunca se sube) y rellena:

- `MAPILLARY_TOKEN`: token de cliente de Mapillary, para Navarra Street. Se saca en mapillary.com/dashboard/developers → tu aplicación → columna «Access Token» → «View».
- `SUPABASE_URL` y `SUPABASE_ANON_KEY`: para cuentas y clasificación (ver PLAN.md, «Activar las cuentas»).

En la web publicada, esos valores salen de los secretos del repositorio (ver «Publicar con GitHub Pages»).

## Publicar con GitHub Pages

1. En GitHub: Settings → Secrets and variables → Actions → añade el secreto `MAPILLARY_TOKEN` (y, cuando actives las cuentas, `SUPABASE_URL` y `SUPABASE_ANON_KEY`).
2. Settings → Pages → Source: **GitHub Actions**.
3. Cada push a `main` lo publica `.github/workflows/pages.yml`, que crea `config.js` con los secretos. Estará en `https://javierlarrea99.github.io/GeoReyno/`.

## Estructura

```
index.html                 portada (Navarra Street en grande, retos del día, amigos, clasificación)
street.html, municipio.html, palabra.html, escudos.html, pregunta.html, amigos.html
perfil.html, ranking.html, como-se-juega.html, privacidad.html, cookies.html, aviso-legal.html, creditos.html
estadisticas.html          redirige a perfil.html (enlaces antiguos)

css/style.css              estilos (tema oscuro y claro)
fonts/                     Barlow y Barlow Condensed (OFL)
js/engine.js               motor: fecha, semilla, estadísticas, compartir, registro de modos
js/layout.js               cabecera, menú, pie, sesión y service worker
js/cuenta.js               cuentas, envío de resultados y clasificación (Supabase)
js/mapillary.js            token, búsqueda de fotos, visor y atribución de Mapillary
js/geo.js, js/map.js       municipios, búsqueda sin tildes, mapa de respuesta con MapLibre
js/portada.js, perfil.js, ranking.js, street.js, municipio.js, palabra.js, escudos.js, pregunta.js, amigos.js

data/preguntas.json        banco de preguntas
data/palabras.json         soluciones con pista y palabras válidas
data/municipios.json       272 municipios (IGN vía es-atlas)
data/escudos.json          escudos (archivo, autor, licencia)
data/fotos_municipios.json fotos propias para Adivina el municipio (opcional)
data/street.json           ubicaciones de Navarra Street (opcional)

tools/supabase.sql           base de datos de cuentas y clasificación
.github/workflows/pages.yml    publicar con secretos en GitHub Actions
tools/escudos_commons.py     genera escudos.json desde Commons
tools/fotos_commons.py       genera fotos_municipios.json (fotos libres de cada municipio)
tools/build_contorno.py      contorno preciso de Navarra (INE vía geoBoundaries)
tools/cobertura_mapillary.py mide cobertura de Mapillary y genera street.json
tools/build_palabras.py      genera palabras.json
tools/build_municipios.mjs   genera municipios.json desde es-atlas
tools/build_mapa_svg.mjs     genera img/navarra.svg
```

## Añadir contenido

- **Preguntas**: en `data/preguntas.json`, con `id`, `tema`, `pregunta`, `opciones` (la correcta primero), `correcta: 0` y `explicacion`. No cambies el `id` de una pregunta publicada.
- **Palabras**: edita la lista `SOLUCIONES` de `tools/build_palabras.py` y vuelve a generarlo.
- **Fotos de municipios**: en `data/fotos_municipios.json`, al menos 2 por municipio, con `ine`, `url`, `autor`, `licencia`, `licencia_url` y `pagina`.
- **Juego nuevo**: regístralo en `MODES` de `js/engine.js`, guarda con `saveDailyResult(id, { score, total, grid, label? })` y, para salas, usa `gameParams()` y `reportRound` / `reportFinal`. Añade el id a la lista de `mode` de `tools/supabase.sql`.

## Datos y licencias

Ver `creditos.html`: IGN (CC BY 4.0), © OpenStreetMap contributors (ODbL), Mapillary (CC BY-SA 4.0, con el autor de cada foto), Wikimedia Commons (licencia de cada archivo), diccionario an-array-of-spanish-words (MIT).
