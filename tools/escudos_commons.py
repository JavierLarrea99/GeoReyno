#!/usr/bin/env python3
"""Genera data/escudos.json con los escudos municipales de Navarra de Wikimedia Commons.

Para cada imagen guarda el archivo, el autor y la licencia, tal y como aparecen
en Commons, para poder mostrar la atribución en el juego.

Uso (desde la carpeta del proyecto, con Python 3.9+ y conexión a Internet):

    python3 tools/escudos_commons.py

No necesita claves. Solo usa la biblioteca estándar.

Cómo funciona:
  1. Lee data/municipios.json (nombres y códigos INE).
  2. Recorre la categoría «Coats of arms of municipalities of Navarre» de Commons
     (y sus subcategorías directas) y empareja cada archivo con un municipio
     comparando nombres sin tildes ni mayúsculas.
  3. Para los municipios sin imagen en la categoría prueba títulos habituales
     («Escudo de X.svg», «Escudo de X.png»).
  4. Pide a la API de Commons el autor (Artist) y la licencia (LicenseShortName)
     de cada imagen y descarta las que no tengan una licencia libre conocida.
  5. Escribe data/escudos.json y un informe con los municipios que faltan.
"""

import html
import json
import re
import sys
import time
import unicodedata
import urllib.parse
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
API = "https://commons.wikimedia.org/w/api.php"
CATEGORY = "Category:Coats of arms of municipalities of Navarre"
UA = "GeoReyno/1.0 (juego educativo sobre Navarra; script de mantenimiento)"

# Licencias que permiten reutilizar la imagen con atribución.
FREE = re.compile(r"^(public domain|pd|cc0|cc by(-sa)? ?\d|cc-by(-sa)?-\d|gfdl|attribution)", re.I)


def api(params):
    params = {**params, "format": "json", "formatversion": "2"}
    url = f"{API}?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as res:
        return json.load(res)


def norm(text):
    text = unicodedata.normalize("NFD", text)
    text = "".join(c for c in text if unicodedata.category(c) != "Mn").lower()
    return re.sub(r"[^a-z0-9ñ]+", " ", text).strip()


def strip_html(text):
    text = re.sub(r"<[^>]+>", "", text or "")
    return re.sub(r"\s+", " ", html.unescape(text)).strip()


def category_files(category, depth=1):
    files, subcats = [], []
    cont = {}
    while True:
        data = api({"action": "query", "list": "categorymembers", "cmtitle": category,
                    "cmtype": "file|subcat", "cmlimit": "500", **cont})
        for m in data["query"]["categorymembers"]:
            if m["ns"] == 6:
                files.append(m["title"])
            elif m["ns"] == 14:
                subcats.append(m["title"])
        if "continue" not in data:
            break
        cont = data["continue"]
    if depth > 0:
        for sub in subcats:
            files += category_files(sub, depth - 1)
            time.sleep(0.2)
    return files


def file_info(titles):
    out = {}
    for i in range(0, len(titles), 40):
        chunk = titles[i:i + 40]
        data = api({"action": "query", "titles": "|".join(chunk), "prop": "imageinfo",
                    "iiprop": "url|extmetadata", "iiurlwidth": "320"})
        for page in data["query"]["pages"]:
            if page.get("missing") or not page.get("imageinfo"):
                continue
            info = page["imageinfo"][0]
            meta = info.get("extmetadata", {})
            out[page["title"]] = {
                "url": info.get("thumburl") or info.get("url"),
                "pagina": info.get("descriptionurl"),
                "autor": strip_html(meta.get("Artist", {}).get("value")),
                "licencia": strip_html(meta.get("LicenseShortName", {}).get("value")),
                "licencia_url": strip_html(meta.get("LicenseUrl", {}).get("value")),
            }
        time.sleep(0.3)
    return out


def main():
    munis = json.loads((ROOT / "data/municipios.json").read_text("utf-8"))["municipios"]
    print(f"{len(munis)} municipios. Leyendo la categoría de Commons…")
    files = category_files(CATEGORY)
    print(f"{len(files)} archivos en la categoría.")

    # Clave de cada archivo: el nombre sin «File:», «Escudo de», extensión, etc.
    def file_key(title):
        name = re.sub(r"^File:", "", title)
        name = re.sub(r"\.(svg|png|jpe?g|gif)$", "", name, flags=re.I)
        name = re.sub(r"^(escudo|coat of arms|blason|armas)( de| of)?( la villa de| la ciudad de)? ", "", name, flags=re.I)
        name = re.sub(r"\(navarra\)|navarra|navarre", "", name, flags=re.I)
        return norm(name)

    by_key = {}
    for t in files:
        # Preferimos SVG cuando hay varias versiones.
        k = file_key(t)
        if k not in by_key or t.lower().endswith(".svg"):
            by_key[k] = t

    chosen = {}
    for m in munis:
        for name in [m["nombre"], *m["nombres"]]:
            k = norm(name)
            if k in by_key:
                chosen[m["ine"]] = by_key[k]
                break

    # Títulos habituales para los que faltan.
    missing = [m for m in munis if m["ine"] not in chosen]
    guesses = {}
    for m in missing:
        for name in m["nombres"]:
            for ext in ("svg", "png"):
                guesses[f"File:Escudo de {name}.{ext}"] = m["ine"]
    print(f"Probando {len(guesses)} títulos para {len(missing)} municipios sin imagen en la categoría…")
    found = file_info(list(guesses))
    for title in found:
        chosen.setdefault(guesses[title], title)

    info = file_info(list(set(chosen.values()) - set(found))) | found
    escudos, skipped = [], []
    for m in munis:
        title = chosen.get(m["ine"])
        if not title or title not in info:
            continue
        meta = info[title]
        if not meta["licencia"] or not FREE.search(meta["licencia"]):
            skipped.append(f"{m['nombre']}: {title} (licencia: {meta['licencia'] or 'desconocida'})")
            continue
        escudos.append({
            "ine": m["ine"],
            "municipio": m["nombre"],
            "archivo": re.sub(r"^File:", "", title),
            "url": meta["url"],
            "pagina": meta["pagina"],
            "autor": meta["autor"] or "Desconocido (ver página del archivo)",
            "licencia": meta["licencia"],
            "licencia_url": meta["licencia_url"],
        })

    out = {
        "fuente": "Wikimedia Commons",
        "ejemplo": False,
        "generado": time.strftime("%Y-%m-%d"),
        "nota": "Generado con tools/escudos_commons.py. Autor y licencia tal como figuran en Commons.",
        "escudos": escudos,
    }
    (ROOT / "data/escudos.json").write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", "utf-8")
    print(f"\n{len(escudos)} escudos guardados en data/escudos.json")
    without = [m["nombre"] for m in munis if m["ine"] not in {e["ine"] for e in escudos}]
    print(f"{len(without)} municipios sin escudo utilizable.")
    if skipped:
        print("\nDescartados por licencia:")
        print("\n".join("  " + s for s in skipped))
    report = ROOT / "tools/escudos_faltan.txt"
    report.write_text("\n".join(without) + "\n", "utf-8")
    print(f"Lista de municipios sin escudo en {report.relative_to(ROOT)}")


if __name__ == "__main__":
    try:
        main()
    except urllib.error.URLError as e:
        sys.exit(f"No se ha podido conectar con Commons: {e}")
