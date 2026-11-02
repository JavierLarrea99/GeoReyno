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

## Estado

- [x] Motor común (`js/engine.js`): reto diario por semilla, rachas, compartir resultado.
- [x] Quiz del día con 34 preguntas.
- [ ] Revisar todas las preguntas contra una fuente fiable. Se escribieron de memoria y pueden tener errores.
- [ ] Ampliar el banco a 150 o más preguntas: con 34 se repiten en pocas semanas.
- [ ] Pueblo misterioso: necesita el GeoJSON de municipios de IDENA (descargarlo y meterlo en `data/`).
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
