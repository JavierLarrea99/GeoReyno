# GeoReyno

Juegos diarios de geografía e historia de Navarra. Un reto nuevo cada día, el mismo para todo el mundo.

GeoReyno es un proyecto independiente, sin relación con el Gobierno de Navarra.

## Modos

| Modo | Página | Qué es |
| --- | --- | --- |
| Quiz del día | `quiz.html` | 5 preguntas tipo test de un banco de 183 (historia, geografía, tradiciones, gastronomía, naturaleza, personajes, euskera, topónimos). |
| Pueblo misterioso | `pueblo.html` | Silueta de un municipio; 6 intentos con distancia, flecha y % de cercanía. Mapa final y cuadritos para compartir. |
| Desde el aire | `aire.html` | 5 recortes de ortofoto (WMS de IDENA, con el PNOA del IGN de respaldo); marca el sitio en un mapa. 5000 · e^(−d/30 km) por ronda. `aire.html?antigua` usa la foto de 1956-1957. |
| Escudos | `escudos.html` | 5 escudos municipales de Wikimedia Commons, 4 opciones; autor y licencia de cada imagen. |
| ¿Cuál tiene más? | `mas.html` | 10 parejas de municipios: más superficie, más al norte y, con datos oficiales, más habitantes o más altitud. |
| Navarra Street | `street.html` | Fotos de Mapillary con movimiento (MapillaryJS); marca dónde estás. Necesita un token de Mapillary. |
| Jugar con amigos | `amigos.html` | Salas con PeerJS y código de 6 letras: todos juegan el mismo reto y ven la tabla por rondas. |

Además: `estadisticas.html` (partidas, rachas e historial por modo), `como-se-juega.html`, y las páginas legales (`privacidad.html`, `cookies.html`, `aviso-legal.html`, `creditos.html`).

## Cómo funciona

- Web estática: HTML, CSS y JavaScript con módulos ES, sin paso de compilación. Las librerías (MapLibre GL 4.7.1, MapillaryJS 4.1.2, PeerJS 1.5.4) se cargan desde unpkg con versión fija y solo en las páginas que las usan.
- El reto diario se elige con una semilla basada en la fecha, así todos los jugadores ven lo mismo sin servidor.
- Estadísticas, rachas y partidas a medias se guardan en el navegador (`localStorage`, siempre con `try/catch`). No hay cookies.
- `?practica` en cualquier juego permite partidas libres que no cuentan para la racha.
- En una sala, cada juego se abre en un iframe con `?sala=CÓDIGO&semilla=…` y avisa de cada ronda a la sala con `postMessage`.
- PWA básica: `manifest.json`, iconos y un service worker que deja abrir la web sin conexión.
- Modo claro y oscuro: automático según el sistema, o fijo con el botón del menú.

## Probar en local

```bash
python3 -m http.server 8000
```

Y abre <http://localhost:8000>. Hace falta un servidor: abriendo `index.html` directamente, el navegador bloquea la carga de los JSON y de los módulos.

Para Navarra Street, copia `config.example.js` como `config.js` y pon tu token de cliente de Mapillary. `config.js` está en `.gitignore`.

## Publicar con GitHub Pages

1. En GitHub: Settings → Pages.
2. En «Source» elige «Deploy from a branch», rama `main`, carpeta `/ (root)`.
3. En unos minutos estará en `https://javierlarrea99.github.io/GeoReyno/`.

Con la cuenta gratuita de GitHub, Pages normalmente solo funciona con repositorios públicos. Como `config.js` no se sube, en la web publicada Navarra Street pedirá el token; para darlo sin subirlo, usa la plantilla `tools/pages-con-token.yml` (instrucciones dentro).

## Estructura

```
index.html, quiz.html, pueblo.html, aire.html, escudos.html, mas.html,
street.html, amigos.html, estadisticas.html, como-se-juega.html,
privacidad.html, cookies.html, aviso-legal.html, creditos.html

css/style.css            estilos comunes (claro y oscuro)
js/engine.js             motor: fecha, semilla, estadísticas, compartir, registro de modos
js/layout.js             cabecera con menú, pie y registro del service worker
js/theme.js              aplica el tema guardado antes de pintar
js/geo.js                municipios, proyección a SVG, punto en polígono, búsqueda
js/map.js                mapa de respuesta con MapLibre y puntuación por distancia
js/quiz.js, pueblo.js, aire.js, escudos.js, mas.js, street.js, amigos.js   cada juego

data/preguntas.json        banco de preguntas del quiz
data/municipios.json       272 municipios (IGN vía es-atlas): nombre, INE, centro, superficie, geometría
data/ortofotos.json        fuentes WMS para Desde el aire
data/escudos.json          escudos (archivo, autor, licencia)
data/municipios_datos.json población y altitud (vacío hasta ejecutar el script)
data/street.json           ubicaciones de Navarra Street

tools/build_municipios.mjs   genera municipios.json desde es-atlas
tools/escudos_commons.py     genera escudos.json desde Wikimedia Commons
tools/datos_municipios.py    añade población (INE) y altitud (IGN)
tools/cobertura_mapillary.py mide la cobertura de Mapillary y genera street.json
tools/pages-con-token.yml    plantilla de GitHub Actions para publicar con el token

manifest.json, sw.js, img/   PWA e iconos
config.example.js            plantilla para el token de Mapillary
```

## Añadir preguntas

Cada pregunta en `data/preguntas.json`:

```json
{
  "id": "identificador-unico",
  "tema": "Historia",
  "pregunta": "Texto de la pregunta",
  "opciones": ["Correcta", "Incorrecta 1", "Incorrecta 2", "Incorrecta 3"],
  "correcta": 0,
  "explicacion": "Se muestra después de responder."
}
```

El orden de las opciones se baraja al jugar, así que puedes poner siempre la correcta primero. No cambies el `id` de una pregunta ya publicada: se usa para recordar el resultado de cada día.

## Añadir un modo nuevo

1. Regístralo en `MODES` de `js/engine.js` (id, nombre, página, descripción). Aparece solo en el menú, la portada, las estadísticas y las salas.
2. Guarda el resultado con `saveDailyResult(id, { score, total, grid, label? })`.
3. Para que funcione en salas, usa `gameParams()` (semilla) y llama a `reportRound` / `reportFinal`.

## Datos y licencias

Ver `creditos.html`. Resumen: IGN y Gobierno de Navarra (CC BY 4.0), © OpenStreetMap contributors (ODbL), Mapillary (CC BY-SA 4.0, con el autor de cada foto) y Wikimedia Commons (licencia de cada archivo).
