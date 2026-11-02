#!/usr/bin/env python3
"""Rellena data/municipios_datos.json con población (INE) y altitud (IGN) de los municipios navarros.

No descarga nada por sí mismo: lee los archivos oficiales que tú descargas, para que
la fuente quede clara. Solo usa la biblioteca estándar.

1) Población · INE, «Cifras oficiales de población de los municipios españoles:
   Revisión del Padrón Municipal». En https://www.ine.es busca esa operación, elige
   Navarra, «Población por municipios y sexo», marca solo «Total» y el último año,
   y descarga en CSV (separado por «;»). Las filas tienen el municipio como
   «31001 Abáigar». Uso:

       python3 tools/datos_municipios.py --poblacion ruta/al/archivo_ine.csv --anio 2024

2) Altitud · IGN/CNIG, «Nomenclátor Geográfico de Municipios y Entidades de Población»
   (centro de descargas del CNIG, https://centrodedescargas.cnig.es, sección
   «Información geográfica de referencia» > «Nomenclátor»). Descarga el CSV de municipios;
   tiene columnas con el código INE (COD_INE) y la altitud (ALTITUD) del núcleo principal.

       python3 tools/datos_municipios.py --altitud ruta/al/MUNICIPIOS.csv

Puedes pasar los dos a la vez. Los datos que ya existan se conservan si no se pasan.
"""

import argparse
import csv
import io
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data/municipios_datos.json"


def read_text(path):
    raw = Path(path).read_bytes()
    for enc in ("utf-8-sig", "latin-1"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    raise SystemExit(f"No se puede leer {path}")


def sniff(text):
    try:
        return csv.Sniffer().sniff(text[:5000], delimiters=";,\t").delimiter
    except csv.Error:
        return ";"


def number(text):
    text = str(text).strip().replace(".", "").replace(" ", "").replace(",", ".")
    try:
        return float(text)
    except ValueError:
        return None


def load_population(path):
    """Busca filas que empiecen por un código «31xxx Nombre» y toma el primer número de la fila."""
    text = read_text(path)
    out = {}
    for row in csv.reader(io.StringIO(text), delimiter=sniff(text)):
        if not row:
            continue
        m = re.match(r"^\s*(31\d{3})\b", row[0])
        if not m:
            continue
        values = [number(c) for c in row[1:]]
        values = [v for v in values if v is not None]
        if values:
            out[m.group(1)] = int(values[0])
    return out


def load_altitude(path):
    """Lee un CSV con columnas de código INE y altitud (nombres flexibles)."""
    text = read_text(path)
    reader = csv.DictReader(io.StringIO(text), delimiter=sniff(text))
    cols = {c.upper().strip(): c for c in reader.fieldnames or []}
    ine_col = next((cols[c] for c in cols if c in ("COD_INE", "CODIGOINE", "INE_MUN", "COD_INE_MUN")), None)
    alt_col = next((cols[c] for c in cols if "ALTITUD" in c), None)
    if not ine_col or not alt_col:
        raise SystemExit(f"No encuentro las columnas de código INE y altitud en {path}: {list(cols)}")
    out = {}
    for row in reader:
        code = re.sub(r"\D", "", row[ine_col] or "")[:5]
        if code.startswith("31") and len(code) == 5:
            alt = number(row[alt_col])
            if alt is not None:
                out[code] = round(alt)
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--poblacion", help="CSV del INE con la población por municipios de Navarra")
    ap.add_argument("--anio", help="Año de las cifras de población (p. ej. 2024)")
    ap.add_argument("--altitud", help="CSV del Nomenclátor del IGN con la altitud de los municipios")
    args = ap.parse_args()

    munis = {m["ine"]: m["nombre"] for m in json.loads((ROOT / "data/municipios.json").read_text("utf-8"))["municipios"]}
    data = json.loads(OUT.read_text("utf-8")) if OUT.exists() else {"fuentes": {}, "datos": {}}
    datos = data.setdefault("datos", {})
    fuentes = data.setdefault("fuentes", {})

    if args.poblacion:
        pop = load_population(args.poblacion)
        for code, value in pop.items():
            if code in munis:
                datos.setdefault(code, {})["poblacion"] = value
        fuentes["poblacion"] = f"INE, Cifras oficiales de población de los municipios españoles (Padrón){' a 1 de enero de ' + args.anio if args.anio else ''}"
        print(f"Población: {len(pop)} municipios leídos.")

    if args.altitud:
        alt = load_altitude(args.altitud)
        for code, value in alt.items():
            if code in munis:
                datos.setdefault(code, {})["altitud"] = value
        fuentes["altitud"] = "IGN/CNIG, Nomenclátor Geográfico de Municipios y Entidades de Población (altitud del núcleo principal). CC BY 4.0"
        print(f"Altitud: {len(alt)} municipios leídos.")

    missing = [n for c, n in munis.items() if c not in datos]
    data["nota"] = "Generado con tools/datos_municipios.py a partir de archivos oficiales."
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", "utf-8")
    print(f"Guardado {OUT.relative_to(ROOT)}. Municipios sin ningún dato: {len(missing)}")


if __name__ == "__main__":
    main()
