#!/usr/bin/env python3
"""Genera data/palabras.json para «Palabra del día».

- soluciones: palabras navarras de 5 letras con su pista (lista de abajo; edítala aquí).
- validas: palabras que se aceptan como intento. Salen del diccionario libre
  «an-array-of-spanish-words» (MIT, derivado de la lista de Letterpress), más los
  nombres de municipios navarros de 5 letras y las soluciones.

Uso:
    npm pack an-array-of-spanish-words@2.0.0 && tar xzf an-array-of-spanish-words-2.0.0.tgz
    python3 tools/build_palabras.py package/index.json
"""
import json
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

SOLUCIONES = [
    ("iruña", "Nombre en euskera de Pamplona."),
    ("olite", "Villa del Palacio Real que mandó construir Carlos III el Noble."),
    ("viana", "Última localidad navarra del Camino de Santiago; allí murió César Borgia."),
    ("isaba", "Villa del valle de Roncal, a los pies de Belagua."),
    ("gares", "Nombre en euskera de Puente la Reina."),
    ("lerin", "Villa de Tierra Estella, en lo alto de un cerro junto al Ega."),
    ("funes", "Localidad cercana a la unión del Arga con el Aragón."),
    ("aibar", "Villa de la merindad de Sangüesa; en euskera, Oibar."),
    ("garde", "Uno de los pueblos del valle de Roncal."),
    ("sesma", "Municipio de Tierra Estella, entre Lodosa y Los Arcos."),
    ("irati", "Selva y río del Pirineo navarro."),
    ("andia", "Sierra que forma parque natural junto con Urbasa."),
    ("leyre", "Monasterio que se asoma al embalse de Yesa."),
    ("codes", "Sierra de Tierra Estella con un santuario de la Virgen."),
    ("larra", "Macizo kárstico del Pirineo, famoso por sus simas."),
    ("lokiz", "Sierra de Tierra Estella, al sur de Urbasa."),
    ("alaiz", "Sierra al sur de la cuenca de Pamplona, llena de aerogeneradores."),
    ("fuero", "Conjunto de leyes e instituciones propias de Navarra."),
    ("foral", "Navarra es una Comunidad…"),
    ("reino", "Lo que fue Navarra durante siglos."),
    ("navas", "Las ___ de Tolosa: batalla de 1212 en la que luchó Sancho VII."),
    ("peñas", "Agrupaciones festivas que llenan la plaza en Sanfermines."),
    ("toros", "Corren cada mañana del 7 al 14 de julio en Pamplona."),
    ("mozos", "Los corredores del encierro."),
    ("plaza", "La del Castillo es el corazón de Pamplona."),
    ("gaita", "Instrumento que acompaña a los gigantes y cabezudos."),
    ("jotas", "Cantos típicos de la Ribera."),
    ("queso", "El de Roncal fue el primero de España con Denominación de Origen."),
    ("migas", "Plato pastoril de pan frito, típico de las Bardenas."),
    ("hayas", "Árboles que, con los abetos, forman la Selva de Irati."),
    ("abeto", "Árbol que, con el haya, forma la Selva de Irati."),
    ("roble", "Árbol muy común en los bosques del norte de Navarra."),
    ("valle", "Baztan, Roncal, Salazar, Aezkoa… Navarra está llena de ellos."),
    ("cerco", "El ___ de Artajona: recinto amurallado medieval."),
    ("torre", "Las de Olite tienen almenas y tejados picudos."),
    ("mendi", "«Monte» en euskera."),
    ("herri", "«Pueblo» en euskera."),
    ("etxea", "«La casa» en euskera."),
    ("zubia", "«El puente» en euskera."),
    ("ibaia", "«El río» en euskera."),
    ("txoko", "Sociedad gastronómica donde se cocina y se come entre amigos."),
    ("boina", "Prenda de cabeza muy tradicional en el campo navarro."),
]

# Palabras con letras raras para un Wordle castellano (tz, tx, k) que también se aceptan.
EXTRA_VALIDAS = ["mendi", "herri", "etxea", "zubia", "ibaia", "txoko", "lokiz", "alaiz", "andia", "irati", "leyre"]


def norm(text):
    text = text.lower().replace("ñ", "\0")
    text = "".join(c for c in unicodedata.normalize("NFD", text) if unicodedata.category(c) != "Mn")
    return text.replace("\0", "ñ")


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    words = json.loads(Path(sys.argv[1]).read_text("utf-8"))
    validas = {w for w in (norm(x) for x in words) if len(w) == 5 and w.isalpha() and all(c in "abcdefghijklmnñopqrstuvwxyz" for c in w)}
    munis = json.loads((ROOT / "data/municipios.json").read_text("utf-8"))["municipios"]
    for m in munis:
        for n in m["nombres"]:
            w = norm(n)
            if len(w) == 5 and w.isalpha():
                validas.add(w)
    sol = [(norm(w), p) for w, p in SOLUCIONES]
    for w, _ in sol:
        assert len(w) == 5, w
        validas.add(w)
    validas.update(EXTRA_VALIDAS)
    out = {
        "fuente": "Soluciones y pistas: GeoReyno. Palabras válidas: an-array-of-spanish-words 2.0.0 (MIT, lista de Letterpress) y municipios de Navarra.",
        "soluciones": [{"palabra": w, "pista": p} for w, p in sol],
        "validas": " ".join(sorted(validas)),
    }
    (ROOT / "data/palabras.json").write_text(json.dumps(out, ensure_ascii=False) + "\n", "utf-8")
    print(f"{len(sol)} soluciones · {len(validas)} palabras válidas")


if __name__ == "__main__":
    main()
