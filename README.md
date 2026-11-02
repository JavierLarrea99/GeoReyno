# GeoReyno

Juegos diarios de geografía e historia de Navarra. Un reto nuevo cada día, el mismo para todo el mundo.

## Modos

| Modo | Estado |
| --- | --- |
| Quiz del día (5 preguntas) | Listo |
| Pueblo misterioso (silueta del municipio) | Pendiente |
| Escudos | Pendiente |
| Desde el aire (ortofoto) | Pendiente |
| Navarra Street (Mapillary) | Pendiente |

## Cómo funciona

- Web estática: HTML, CSS y JavaScript sin dependencias ni paso de compilación.
- El reto diario se elige con una semilla basada en la fecha, así todos los jugadores ven las mismas preguntas sin necesidad de servidor.
- Estadísticas y rachas se guardan en el navegador (`localStorage`).
- `quiz.html?practica` permite jugar con preguntas al azar sin que cuente para la racha.

## Probar en local

```bash
python3 -m http.server 8000
```

Y abre <http://localhost:8000>. Hace falta un servidor: abriendo `index.html` directamente, el navegador bloquea la carga de `data/preguntas.json`.

## Publicar con GitHub Pages

1. En GitHub: Settings → Pages.
2. En «Source» elige «Deploy from a branch», rama `main`, carpeta `/ (root)`.
3. En unos minutos estará en `https://javierlarrea99.github.io/GeoReyno/`.

Con la cuenta gratuita de GitHub, Pages normalmente solo funciona con repositorios públicos.

## Estructura

```
index.html          portada con los modos
quiz.html           quiz del día
css/style.css       estilos comunes (claro y oscuro)
js/engine.js        motor común: fecha, semilla, estadísticas, compartir
js/quiz.js          lógica del quiz
data/preguntas.json banco de preguntas
img/icon.svg        icono
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
