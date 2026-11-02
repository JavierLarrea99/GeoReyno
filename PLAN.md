# Plan de GeoReyno

Documento de trabajo para retomar el proyecto en cualquier sesión. Las decisiones y el estado van aquí.

## Decisiones

- **Sin Google Maps ni Street View de Google.** Cuestan por uso y la factura crece con el tráfico.
- **Solo fuentes con licencia abierta**, siempre con atribución:
  - Mapillary (CC BY-SA 4.0): visor con movimiento, cobertura limitada en Navarra.
  - Panoramax (licencia abierta según instancia).
  - IDENA, Gobierno de Navarra (CC BY 4.0): límites municipales y ortofotos.
  - Mapa base: OpenStreetMap («© OpenStreetMap contributors»).
- **Lanzar primero lo que no depende de fotos de calle**: quiz, pueblos, escudos.
- **Hosting**: GitHub Pages mientras no haga falta servidor. Cloudflare (Workers + D1) cuando lleguen cuentas, ranking y salas.
- **Multijugador con amigos**: PeerJS (igual que en `adivina-el-juego`) como primera versión sin servidor.
- **Recompensas**: solo virtuales (rachas, insignias, niveles). Nada de premios reales.
- **Nombre**: no usar «GeoGuessr» ni parecidos (es marca registrada).
- **Cabecera y pie comunes** se generan con `js/layout.js` en cada página (`<header data-layout>` y `<footer data-layout>`), para no repetir el menú en 15 archivos. El logo y el contenido siguen en el HTML.
- **Menú**: en pantallas de menos de 1060 px se pliega en un botón «Menú». Los modos aún no hechos aparecen atenuados («Próximamente») gracias al campo `ready` de `MODES` en `js/engine.js`.
- **Tema claro/oscuro**: por defecto el del sistema; el botón del menú alterna sistema → claro → oscuro y se guarda en `localStorage` (`georeyno:theme`). `js/theme.js` lo aplica en el `<head>` para que no parpadee.
- **Esquema de resultado común** para todos los modos: `{ score, total, grid, label? , ...}`. `grid` son los cuadritos para compartir y el historial; `label` es el texto corto cuando no basta con `score/total` (p. ej. «3/6» intentos).
- **Salas con amigos**: el juego se abre dentro de un iframe con `?sala=CÓDIGO&semilla=XXXX`. Con `semilla` el reto se elige con esa semilla en vez de la fecha y no cuenta para la racha. El juego avisa a la sala de cada ronda con `postMessage` (`reportRound` / `reportFinal` del motor).
- **Pueblo misterioso**: el municipio del día sale de una permutación fija de los 272 (`dailyFromCycle`), así no se repite hasta pasados 272 días. El porcentaje de cercanía es `100 × (1 − d / dmáx)`, con dmáx la mayor distancia entre centroides de Navarra (~190 km). Se aceptan los nombres en castellano y en euskera por separado. Los intentos a medias se guardan para no perderlos al recargar. El mapa final es un SVG propio (sin teselas) para que cargue rápido.
- **Superficie** de cada municipio: calculada con la geometría del IGN antes de simplificar (aproximada; p. ej. Pamplona da 28,6 km² frente a los ~25 km² oficiales).
- **Quiz**: las preguntas nuevas usan el tema «Euskera»; la única antigua con tema «Lengua» se deja igual para no tocar lo publicado. Se descartaron preguntas con datos discutidos (etimología de Tudela, altitud exacta de la Mesa de los Tres Reyes, embalse más grande…).
- **Desde el aire**: los 5 puntos del día se eligen con la semilla: un municipio al azar y un punto a menos de 900 m de su centroide, comprobando que cae dentro del municipio. Así casi siempre se ve el pueblo o sus alrededores (un punto totalmente al azar suele caer en un campo o un bosque imposible de reconocer). WMS 1.1.1 con EPSG:4326 (orden lon,lat), que es lo que más servidores admiten. Las fuentes están en `data/ortofotos.json` para poder cambiarlas sin tocar código; si una falla se prueba la siguiente.
- **Escudos**: las imágenes se enlazan desde Commons (no se copian al repositorio). Sin URL guardada se usa `Special:FilePath`, que redirige al archivo. Antes de empezar se comprueba que cada imagen carga; si alguna falla se coge la siguiente.
- **Rama**: se trabaja en `claude/keen-turing-puhwzl` y se sube también a `main`, como se pidió.

## Estado

- [x] Motor común (`js/engine.js`): reto diario por semilla, rachas, compartir resultado.
- [x] Quiz del día con 34 preguntas.
- [x] Fase 1 · Base común: barra superior con todos los modos y menú plegable en el móvil, botón de tema, página de estadísticas (partidas, rachas, media e historial por modo, botón para borrar), página «Cómo se juega», pie con enlaces legales, registro de modos y esquema de resultado común en el motor.
- [x] Fase 3 · Quiz ampliado a 183 preguntas (historia, geografía, tradiciones, gastronomía, naturaleza, personajes, euskera, topónimos, patrimonio y Camino de Santiago). Los 34 ids anteriores no cambian.
- [ ] ⚠️ **Revisar preguntas antes de publicar.** Están escritas de memoria, solo con datos que se consideraron seguros y descartando los dudosos, pero hay que contrastarlas con una fuente fiable (sobre todo cifras y fechas: superficie, población, años).
- [x] Fase 2 · Pueblo misterioso: `data/municipios.json` (272 municipios, 80 KB) generado con `tools/build_municipios.mjs` desde es-atlas 0.6.0; silueta, autocompletado sin tildes, 6 intentos con km, flecha y %, mapa final y compartir con cuadritos.
- [ ] Mejorar las siluetas: es-atlas es de baja resolución (algunos municipios tienen 10-15 vértices). Para siluetas más finas, descargar los límites municipales de IDENA (Gobierno de Navarra, CC BY 4.0) o las «Líneas límite municipales» del CNIG, y adaptar `tools/build_municipios.mjs` para leerlos.
- [x] Fase 5 · Escudos: 5 rondas con 4 opciones (el municipio correcto y 3 al azar de los 272), crédito de cada imagen (archivo, autor, licencia, enlace a Commons), las imágenes que no cargan se saltan.
- [ ] **Completar los escudos** (desde aquí no había acceso a Wikimedia Commons). Ahora `data/escudos.json` tiene **5 ejemplos** marcados con `"ejemplo": true` y la autoría sin verificar. Para generar la lista real:
  1. En tu ordenador, desde la carpeta del proyecto: `python3 tools/escudos_commons.py` (solo usa la biblioteca estándar, no necesita claves).
  2. El script recorre la categoría «Coats of arms of municipalities of Navarre», empareja cada archivo con su municipio, pide autor y licencia a la API de Commons, descarta lo que no tenga licencia libre y reescribe `data/escudos.json` (con `"ejemplo": false`).
  3. Revisa `tools/escudos_faltan.txt` (municipios sin escudo) y, si quieres, añade a mano entradas con el mismo formato.
- [x] Fase 4 · Desde el aire: 5 rondas con recorte de ortofoto pedido por WMS desde el navegador (1,2 km de lado, se puede alejar a 2,4 y 4,8 km), mapa MapLibre con teselas de OSM y contorno de Navarra, 5000 · e^(−d/30 km) por ronda, partida a medias guardada. Variante con la foto de 1956-1957 (`aire.html?antigua`), que cuenta como modo aparte en estadísticas.
- [ ] **Verificar las capas WMS** (desde aquí no había acceso a IDENA). Abre en el navegador:
  - <https://idena.navarra.es/ogc/wms?SERVICE=WMS&REQUEST=GetCapabilities> y busca el `<Name>` de la ortofoto más reciente y de la de 1956-1957 (y, si quieres, la de 1929-1931).
  - Pon esos nombres en `data/ortofotos.json` (campo `capa`). Ahora mismo están `ortofoto_maxima_actualidad` y `ortofoto_1956_1957`, que son una suposición.
  - Si IDENA falla, el juego usa automáticamente el PNOA del IGN (`OI.OrthoimageCoverage`, verificado como capa estándar INSPIRE) y, para la antigua, el vuelo americano del IGN (`AMS_1956-1957` en `https://www.ign.es/wms/pnoa-historico`, también por verificar).
- [ ] Teselas de OpenStreetMap: la política de uso de tile.openstreetmap.org no permite tráfico alto. Si el juego crece, pasar a un proveedor con plan gratuito (MapTiler, Stadia) o a teselas propias (Protomaps/PMTiles en GitHub Pages).
- [ ] Navarra Street: medir antes la cobertura de Mapillary; visor MapillaryJS.
- [ ] Salas con amigos (PeerJS).
- [ ] Páginas legales: privacidad, cookies, aviso legal, créditos de datos.
- [ ] Dominio propio (cuando haya juego que enseñar).
- [ ] Anuncios: solo con contenido y visitas, y con CMP certificada.

## Ideas guardadas

- Antes y después: ortofoto antigua frente a la actual.
- ¿Cuál tiene más? (habitantes, altitud).
- Topónimos y su significado.
- Liga de pueblos: los jugadores suman puntos para su municipio.
- Mapa de colección que se rellena con los pueblos acertados.
- Insignia «Cartógrafo» para quien suba fotos de zonas sin cobertura.
