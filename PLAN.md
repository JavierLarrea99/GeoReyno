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
- **Rediseño v2**: estilo oscuro por defecto (como las maquetas), el tema claro queda como opción. No se usa el escudo oficial de Navarra (su uso está regulado): el logo es una chincheta propia con el motivo de las cadenas. No se usan nombres tipo «NavarraGuessr» (GeoGuessr es marca registrada); la marca sigue siendo GeoReyno. Las imágenes de la portada son ilustraciones y mapas propios (sin fotos de terceros).
- **Tipografías** autoalojadas (Barlow, OFL) en lugar de Google Fonts, para no enviar la IP de los visitantes a Google.
- **Cuentas con Supabase**: es gratuito, funciona desde una web estática y protege los datos con políticas RLS (`tools/supabase.sql`). La clave «anon» es pública por diseño, pero igualmente va en `config.js` para cumplir la norma de no subir claves. Sin configuración, todo funciona en modo invitado. Los puntos de «Todos los juegos» se normalizan a 1000 por partida perfecta para que cada juego valga lo mismo.
- **Palabra del día**: los intentos deben ser palabras reales (diccionario libre MIT de ~10 900 palabras de 5 letras, más municipios y palabras en euskera de las soluciones). Se admite la ñ; las tildes no cuentan.
- **Adivina el municipio**: si no hay fotos propias, usa fotos normales (no panorámicas) de Mapillary dentro del término municipal, de secuencias distintas y separadas. El municipio del día es el siguiente del ciclo que tenga al menos 2 fotos.
- **Jugar con amigos solo con cuenta**: lo pidió el dueño. Sin cuentas activadas, la página explica que llegará pronto. Las invitaciones se consultan cada 8 s (sin servicio en tiempo real) y caducan a las 2 horas. Solo se puede invitar a amigos aceptados (lo exige la política RLS).
- **Google Street View**: descartado por ahora. Es de pago por uso (desde marzo de 2025 Google cambió el crédito mensual de 200 $ por cuotas gratuitas por producto), exige tarjeta, y sus condiciones no permiten mostrar Street View con un mapa que no sea de Google (habría que cambiar también el mapa de respuesta). Además, la norma del proyecto era no usar APIs de pago. Alternativa recomendada: Mapillary + fotos 360° propias.
- **Rama**: se trabaja en `claude/keen-turing-puhwzl` y se sube también a `main`, como se pidió.

## Estado

### Versión 2 (rediseño)
- [x] Portada nueva con estilo oscuro (azul noche y rojo), Navarra Street en grande como juego principal, mapa de Navarra con chinchetas, ilustración propia del paisaje (Bardenas, puente, Olite, Pirineo), retos del día, panel de clasificación semanal, bloque de amigos y «¿Cómo funciona?».
- [x] Retirados los modos Pueblo misterioso, Desde el aire, ¿Cuál tiene más? y Quiz de 5 preguntas (siguen en el historial de git).
- [x] Pregunta del día: una pregunta diaria del banco de 183, sin repetir hasta agotarlo.
- [x] Palabra del día (tipo Wordle): 42 palabras navarras con pista y diccionario de ~10 900 palabras para validar los intentos.
- [x] Adivina el municipio: fotos que se van destapando, 4 intentos con km y dirección.
- [x] Navarra Street busca fotos en vivo alrededor de municipios al azar mientras `data/street.json` sea de ejemplo.
- [x] Cuentas (Supabase): registro, inicio de sesión, recuperar contraseña, borrar cuenta; los resultados se suben solos; perfil con estadísticas mejores (rachas calculadas, acierto medio, últimos 14 días, historial); clasificación por juego y periodo; modo invitado si no está configurado.
- [x] Probado en móvil (390×844) y ordenador (1280×900), tema oscuro y claro, sin errores de consola: todos los juegos, perfil, clasificación (con Supabase simulado), salas con dos navegadores (palabra y municipio) y páginas legales. Mapillary y Supabase se probaron simulados porque desde aquí no hay acceso a esas webs.

### Versión 2.3
- [x] Navarra Street: pantalla de resultado de cada ronda (mapa grande con tu marca y el sitio, puntos con animación y barra, distancia, pueblo, autor de la foto y botón «Siguiente ronda»).
- [x] En salas: 2 minutos por ronda con reloj; tras responder se espera a los demás («1/2 han respondido») y el resultado sale cuando han respondido todos o se acaba el tiempo, con la tabla de puntos de esa ronda. Si se acaba el tiempo sin marcar, 0 puntos.

### Versión 2.2
- [x] Contorno de Navarra preciso en el mapa de Navarra Street: límite provincial del INE (vía geoBoundaries), simplificado a ~10 m con `tools/build_contorno.py`. El anterior (es-atlas) tenía errores grandes.
- [x] Corregida la pantalla negra del visor de Navarra Street (la hoja de estilos de MapillaryJS pisaba la posición del contenedor).
- [x] Adivina el municipio ya no usa Mapillary: solo fotos libres de Wikimedia Commons de `data/fotos_municipios.json`, generadas con `tools/fotos_commons.py`. Mientras no haya fotos, el modo dice «muy pronto».
- [x] Rueda de carga propia (la rueda del logo girando) en todas las esperas.
- [x] Mi perfil sin sesión muestra solo el formulario, sin estadísticas a cero.

### Versión 2.1
- [x] Logo nuevo (chincheta con la rueda de cadenas) y silueta de Navarra nueva, vectorizados a partir de las imágenes del dueño (`img/logo.svg`, `img/navarra.svg`), usados en la portada, la cabecera, los iconos de la app y la imagen para redes.
- [x] Navarra Street a pantalla completa: visor ocupando la pantalla, marcador de ronda y puntos, botón de pantalla completa y mapa abajo (panel desplegable en el móvil; recuadro que se agranda al pasar el ratón en el ordenador). Empieza en cuanto encuentra la primera foto y busca las siguientes mientras juegas.
- [x] Jugar con amigos solo con sesión iniciada: amigos por nombre de jugador (solicitud y aceptación), invitaciones a la sala que llegan al amigo, entrada por código y el nombre de la cuenta como nombre en la sala. Tablas `amistades` e `invitaciones` en `tools/supabase.sql`.
- [x] Publicación con `.github/workflows/pages.yml`: crea `config.js` en el servidor a partir de los secretos del repositorio.

### Versión 1
- [x] Motor común, menú, estadísticas, páginas legales, PWA, salas con amigos, escudos y Navarra Street (ver historial de git).

## Pendientes para ti (por orden de prioridad)

1. [ ] **Activar las cuentas y la clasificación** (gratis):
   1. Crea un proyecto en <https://supabase.com> (elige la región de la UE, p. ej. Fráncfort).
   2. SQL Editor → New query → pega `tools/supabase.sql` → Run.
   3. Authentication → URL Configuration: en «Site URL» pon la dirección de tu web (y añade `http://localhost:8000` en «Redirect URLs» para probar en local).
   4. Project Settings → API: copia «Project URL» y la clave «anon public» en `config.js` (`SUPABASE_URL`, `SUPABASE_ANON_KEY`).
   5. Para la web publicada, añade los mismos valores como secretos y usa `.github/workflows/pages.yml`.
   6. Rellena en `privacidad.html` la región del proyecto.
2. [ ] **Mapillary en la web publicada**: en GitHub, Settings → Secrets and variables → Actions → secreto `MAPILLARY_TOKEN`; y Settings → Pages → Source: «GitHub Actions». El flujo `.github/workflows/pages.yml` ya está en el repositorio. Opcional: `python3 tools/cobertura_mapillary.py` para generar `data/street.json` con ubicaciones elegidas (más rápido y mejor que la búsqueda en vivo).
3. [ ] ⚠️ **Revisar preguntas antes de publicar.** Las 183 están escritas de memoria, solo con datos que se consideraron seguros, pero hay que contrastarlas (sobre todo cifras y fechas). Revisa también las 42 pistas de la Palabra del día (`tools/build_palabras.py`).
4. [ ] **Escudos**: los 5 de ejemplo tienen nombres de archivo puestos a mano y algunos no corresponden. Ejecuta `python3 tools/escudos_commons.py`: genera la lista real con autor y licencia y la página `tools/revisar_escudos.html` para revisarlos a ojo; borra de `data/escudos.json` los que no cuadren.
5. [ ] **Rellenar tus datos** en `aviso-legal.html`, `privacidad.html`, `cookies.html` y `creditos.html`: huecos en amarillo entre corchetes.
6. [ ] **Fotos para Adivina el municipio** (necesario para activar el modo): en tu ordenador, `python3 tools/fotos_commons.py` (o `--sin-atribucion` para solo dominio público y CC0). Revisa `tools/revisar_fotos.html` y borra de `data/fotos_municipios.json` las fotos en las que se lea el nombre del pueblo. Después súbelo a GitHub. También puedes añadir fotos tuyas con el mismo formato.
7. [ ] Teselas de OpenStreetMap: con mucho tráfico, pasar a MapTiler/Stadia (plan gratuito) o teselas propias (PMTiles).
8. [ ] Salas: usan el servidor público gratuito de PeerJS. Si falla o se satura, montar un PeerServer propio.
9. [ ] La clasificación confía en lo que envía el navegador (con límites: un resultado por día y juego, fechas cercanas y puntos dentro del máximo). Si hay trampas, mover la puntuación a una función del servidor (Supabase Edge Functions).
10. [ ] Versión en euskera (botón ES / EU como en las maquetas).
11. [ ] Dominio propio y, si cambia, actualizar `og:url` y `og:image` de los HTML.

## Ideas guardadas

- Antes y después: ortofoto antigua frente a la actual, con deslizador.
- Topónimos y su significado (modo propio, no solo preguntas del quiz).
- Pista opcional en «Pueblo misterioso» (merindad o comarca) a cambio de puntos.
- Liga de pueblos: los jugadores suman puntos para su municipio.
- Mapa de colección que se rellena con los pueblos acertados.
- Insignia «Cartógrafo» para quien suba fotos de zonas sin cobertura.
