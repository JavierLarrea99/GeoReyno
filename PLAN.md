# Plan de GeoReyno

Documento de trabajo para retomar el proyecto en cualquier sesión. Las decisiones y el estado van aquí.

## Decisiones

- **Sin Google Maps ni Street View de Google.** Cuestan por uso y la factura crece con el tráfico.
- **Solo fuentes con licencia abierta**, siempre con atribución:
  - Mapillary (CC BY-SA 4.0): visor con movimiento, cobertura limitada en Navarra.
  - Panoramax (licencia abierta según instancia).
  - IDENA, Gobierno de Navarra (CC BY 4.0): ortofotos. Límites municipales: IGN (CC BY 4.0) vía es-atlas.
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
- **¿Cuál tiene más?**: no se inventan cifras. Sin población ni altitud oficiales, se usan la superficie y la latitud calculadas de la geometría del IGN («¿cuál está más al norte?» se añadió para que haya variedad). Se descartan parejas casi empatadas (diferencia menor del 15 % en superficie/población, 40 m en altitud o 0,06° de latitud). Población y altitud salen más a menudo cuando existen.
- **Navarra Street**: el token se lee de `config.js` (import dinámico) y, si no existe, del `localStorage` del navegador. Sin `config.js` el navegador muestra un 404 en la consola: es esperado y no afecta. La respuesta correcta es la posición de la primera foto de la ronda, aunque el jugador se mueva. Se desactivan la atribución interna del visor y la brújula (revelaban el enlace a la foto y la orientación) y se muestra una atribución propia con el autor de la foto que se está viendo.
- **Salas**: el anfitrión es la fuente de verdad y reenvía el estado completo a todos en cada cambio (con 12 jugadores es poco). Si un jugador se desconecta sin acabar, no bloquea el final. Al reconectar, el juego del iframe empieza de nuevo y sus rondas se sobrescriben. En la sala se oculta la cabecera del juego (clase `in-room`). Para probar en local: `amigos.html?peerlocal` usa un PeerServer en `localhost:9000`.
- **PWA**: el service worker es «red primero»: siempre se ve la versión nueva y la copia solo se usa sin conexión. Si cambias mucho los archivos, sube `CACHE` en `sw.js` (`georeyno-v2`…) para limpiar copias viejas. No se registra dentro de las salas.
- **Legal**: sin cookies, solo `localStorage` técnico, así que no hace falta banner. Las páginas legales tienen huecos para los datos del titular.
- **Rama**: se trabaja en `claude/keen-turing-puhwzl` y se sube también a `main`, como se pidió.

## Estado

Hecho (fases 1-10, todo probado con Playwright a 390×844 y 1280×900, en claro y oscuro, sin errores de consola salvo el 404 esperado de `config.js` cuando no existe):

- [x] Motor común (`js/engine.js`): reto diario por semilla, rachas, compartir, registro de modos y esquema de resultado común.
- [x] Fase 1 · Base común: menú con todos los modos (plegable en el móvil), botón de tema, estadísticas por modo con historial, «Cómo se juega», pie con enlaces legales.
- [x] Fase 2 · Pueblo misterioso: `data/municipios.json` (272 municipios, 80 KB) con `tools/build_municipios.mjs` desde es-atlas 0.6.0; silueta, autocompletado sin tildes, 6 intentos con km, flecha y %, mapa final y compartir.
- [x] Fase 3 · Quiz ampliado de 34 a 183 preguntas, sin cambiar los ids existentes.
- [x] Fase 4 · Desde el aire: ortofoto por WMS, mapa MapLibre/OSM, 5000 · e^(−d/30 km), 5 rondas, variante 1956-1957.
- [x] Fase 5 · Escudos: 4 opciones, crédito por imagen; 5 ejemplos + script para Commons.
- [x] Fase 6 · ¿Cuál tiene más?: superficie y latitud del IGN; población y altitud listas para cargar.
- [x] Fase 7 · Navarra Street: MapillaryJS + mapa, autor de cada foto, explicación si no hay token; script de cobertura.
- [x] Fase 8 · Jugar con amigos: salas PeerJS con código de 6 letras, tabla por rondas, podio, reconexión básica (probado con un PeerServer local y dos navegadores, en quiz, pueblo y desde el aire).
- [x] Fase 9 · Legal y publicación: privacidad, cookies, aviso legal, créditos, aviso de independencia, manifest + iconos + service worker, metadatos para redes.
- [x] Fase 10 · Repaso final: todos los modos jugados de nuevo en móvil y ordenador; corregidos la tabla de la sala (total cortado) y la descripción de «¿Cuál tiene más?». README actualizado.

## Pendientes para ti (por orden de prioridad)

1. [ ] ⚠️ **Revisar preguntas antes de publicar.** Las 183 están escritas de memoria, solo con datos que se consideraron seguros y descartando los dudosos, pero hay que contrastarlas con una fuente fiable (sobre todo cifras y fechas). Se editan en `data/preguntas.json`; no cambies los `id`.
2. [ ] **Rellenar tus datos** en `aviso-legal.html`, `privacidad.html`, `cookies.html` y `creditos.html`: huecos en amarillo entre corchetes (`[NOMBRE Y APELLIDOS…]`, `[NIF]`, `[DOMICILIO]`, `[CORREO DE CONTACTO]`, `[DOMINIO]`, `[CIUDAD]`, `[FECHA]`, licencia del código).
3. [ ] **Verificar las capas WMS** de «Desde el aire» (desde aquí no había acceso a IDENA):
   - Abre <https://idena.navarra.es/ogc/wms?SERVICE=WMS&REQUEST=GetCapabilities> y busca el `<Name>` de la ortofoto más reciente y de la de 1956-1957 (y, si quieres, la de 1929-1931 para otra variante).
   - Ponlos en `data/ortofotos.json` (campo `capa`). Ahora hay `ortofoto_maxima_actualidad` y `ortofoto_1956_1957`, que son una suposición.
   - Si IDENA falla, el juego usa solo el PNOA del IGN (`OI.OrthoimageCoverage` en `https://www.ign.es/wms-inspire/pnoa-ma`) y, para la antigua, `AMS_1956-1957` en `https://www.ign.es/wms/pnoa-historico` (este nombre también hay que comprobarlo). Si no existe ninguna ortofoto antigua, quita el enlace «Foto de 1956» de `aire.html`.
4. [ ] **Completar los escudos** (desde aquí no había acceso a Wikimedia Commons). `data/escudos.json` tiene **5 ejemplos** marcados con `"ejemplo": true` y la autoría sin verificar. En tu ordenador, desde la carpeta del proyecto: `python3 tools/escudos_commons.py`. Reescribe `data/escudos.json` con archivo, autor y licencia reales y deja en `tools/escudos_faltan.txt` los municipios sin escudo.
5. [ ] **Población y altitud** para «¿Cuál tiene más?» (INE, datos.gob.es y Wikidata no eran accesibles desde aquí):
   - Población: <https://www.ine.es> → «Cifras oficiales de población de los municipios españoles: Revisión del Padrón Municipal» → Navarra → «Población por municipios y sexo». Solo «Total», último año, **CSV separado por «;»**.
   - Altitud: <https://centrodedescargas.cnig.es> → «Nomenclátor Geográfico de Municipios y Entidades de Población» → CSV de municipios (columnas `COD_INE` y `ALTITUD`).
   - `python3 tools/datos_municipios.py --poblacion RUTA_INE.csv --anio 2025 --altitud RUTA_MUNICIPIOS.csv` → rellena `data/municipios_datos.json`; el juego empieza a usar esas categorías solo.
6. [ ] **Mapillary**: copia `config.example.js` como `config.js` con tu Client Token y ejecuta `python3 tools/cobertura_mapillary.py` para generar `data/street.json` (ahora hay 5 plazas de ejemplo sin id de foto) y el informe `tools/cobertura_mapillary.txt`. Prueba el visor real (aquí solo se pudo probar con el visor y la API simulados).
7. [ ] **Token en la web publicada**: como `config.js` no se sube, en GitHub Pages el modo pedirá el token. Para que funcione para todos sin subirlo, usa `tools/pages-con-token.yml` (crea `config.js` desde un secreto al publicar). Un token de cliente siempre es visible en el navegador: usa uno solo de lectura.
8. [ ] **Siluetas más finas**: es-atlas es de baja resolución (algunos municipios tienen 10-15 vértices). Para mejorarlas, descarga los límites municipales de IDENA o las «Líneas límite municipales» del CNIG y adapta `tools/build_municipios.mjs`.
9. [ ] **Teselas de OpenStreetMap**: la política de tile.openstreetmap.org no permite tráfico alto. Si crece, pasar a MapTiler/Stadia (plan gratuito) o a teselas propias (Protomaps/PMTiles).
10. [ ] **Salas**: usan el servidor público gratuito de PeerJS. Si falla o se satura, montar un PeerServer propio o pasar a Cloudflare Workers + Durable Objects. Redes muy cerradas pueden necesitar un servidor TURN.
11. [ ] Si cambias de dominio, sustituye `https://javierlarrea99.github.io/GeoReyno/` en `og:url` y `og:image` de los HTML.
12. [ ] Dominio propio (cuando haya juego que enseñar).
13. [ ] Anuncios: solo con contenido y visitas, y con CMP certificada.

## Ideas guardadas

- Antes y después: ortofoto antigua frente a la actual, con deslizador.
- Topónimos y su significado (modo propio, no solo preguntas del quiz).
- Pista opcional en «Pueblo misterioso» (merindad o comarca) a cambio de puntos.
- Liga de pueblos: los jugadores suman puntos para su municipio.
- Mapa de colección que se rellena con los pueblos acertados.
- Insignia «Cartógrafo» para quien suba fotos de zonas sin cobertura.
