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
- **Rama**: se trabaja en `claude/keen-turing-puhwzl` y se sube también a `main`, como se pidió.

## Estado

- [x] Motor común (`js/engine.js`): reto diario por semilla, rachas, compartir resultado.
- [x] Quiz del día con 34 preguntas.
- [x] Fase 1 · Base común: barra superior con todos los modos y menú plegable en el móvil, botón de tema, página de estadísticas (partidas, rachas, media e historial por modo, botón para borrar), página «Cómo se juega», pie con enlaces legales, registro de modos y esquema de resultado común en el motor.
- [ ] Revisar todas las preguntas contra una fuente fiable. Se escribieron de memoria y pueden tener errores.
- [ ] Ampliar el banco a 150 o más preguntas: con 34 se repiten en pocas semanas.
- [x] Fase 2 · Pueblo misterioso: `data/municipios.json` (272 municipios, 80 KB) generado con `tools/build_municipios.mjs` desde es-atlas 0.6.0; silueta, autocompletado sin tildes, 6 intentos con km, flecha y %, mapa final y compartir con cuadritos.
- [ ] Mejorar las siluetas: es-atlas es de baja resolución (algunos municipios tienen 10-15 vértices). Para siluetas más finas, descargar los límites municipales de IDENA (Gobierno de Navarra, CC BY 4.0) o las «Líneas límite municipales» del CNIG, y adaptar `tools/build_municipios.mjs` para leerlos.
- [ ] Escudos: imágenes con licencia que permita reutilizarlas; anotar la licencia de cada una.
- [ ] Desde el aire: ortofotos de IDENA por WMS, pedidas desde el navegador.
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
