#!/usr/bin/env python3
"""Genera data/fotos_municipios.json con fotos libres de cada municipio de Navarra.

Fuente: Wikimedia Commons. Para cada municipio se busca en Wikidata (por su código INE)
su imagen principal y su categoría de Commons, y se eligen hasta 4 fotos de licencia libre.

Uso (en tu ordenador, desde la carpeta del proyecto; solo biblioteca estándar):

    python3 tools/fotos_commons.py                  # licencias libres (dominio público, CC0, CC BY, CC BY-SA)
    python3 tools/fotos_commons.py --sin-atribucion # solo dominio público y CC0
    python3 tools/fotos_commons.py --por-municipio 4 --minimo 2

Qué hace:
  1. Pregunta a Wikidata por los municipios con código INE 31xxx: imagen principal (P18)
     y categoría de Commons (P373).
  2. En cada categoría (y sus subcategorías directas) busca fotos JPG horizontales de al
     menos 1200 px, descartando escudos, banderas, mapas, planos, logos y dibujos.
  3. Lee de Commons el autor y la licencia de cada foto y se queda solo con las libres.
  4. Escribe data/fotos_municipios.json y tools/revisar_fotos.html para revisarlas a ojo.
     Quita de data/fotos_municipios.json las fotos en las que se lea el nombre del pueblo
     o que no sirvan (por ejemplo, interiores).
"""

import argparse
import html
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
UA = "GeoReyno/1.0 (juego educativo sobre Navarra; script de mantenimiento)"
WIKIDATA = "https://query.wikidata.org/sparql"
COMMONS = "https://commons.wikimedia.org/w/api.php"

FREE = re.compile(r"^(public domain|pd\b|pd-|cc0|cc[- ]by(-sa)?[- ]?\d|cc by(-sa)? \d)", re.I)
NO_ATTRIB = re.compile(r"^(public domain|pd\b|pd-|cc0)", re.I)
SKIP = re.compile(r"escudo|coat|arms|blas|bandera|flag|mapa|map\b|_map|plano|logo|locator|localiza|situaci|"
                  r"diagram|esquema|dibujo|drawing|svg$|\.png$|\.gif$|\.tif|interior|retablo|altar|"
                  r"cartel|señal|sign|poster", re.I)


def get(url, params=None, accept="application/json"):
    if params:
        url = f"{url}?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": accept})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=60) as res:
                return json.load(res)
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503, 504):
                time.sleep(2 ** attempt + 1)
                continue
            raise
        except urllib.error.URLError:
            time.sleep(2 ** attempt)
    raise SystemExit(f"No se ha podido conectar con {url[:60]}…")


def api(params):
    return get(COMMONS, {**params, "format": "json", "formatversion": "2"})


def strip(text):
    text = re.sub(r"<[^>]+>", "", text or "")
    return re.sub(r"\s+", " ", html.unescape(text)).strip()


def wikidata_municipios():
    query = """
    SELECT ?ine ?img ?cat WHERE {
      ?item wdt:P772 ?code .
      FILTER(STRSTARTS(?code, "31"))
      BIND(SUBSTR(?code, 1, 5) AS ?ine)
      OPTIONAL { ?item wdt:P18 ?img }
      OPTIONAL { ?item wdt:P373 ?cat }
    }"""
    data = get(WIKIDATA, {"query": query, "format": "json"}, "application/sparql-results+json")
    out = {}
    for b in data["results"]["bindings"]:
        ine = b["ine"]["value"]
        e = out.setdefault(ine, {"imgs": set(), "cats": set()})
        if "img" in b:
            e["imgs"].add("File:" + urllib.parse.unquote(b["img"]["value"].rsplit("/", 1)[-1]).replace("_", " "))
        if "cat" in b:
            e["cats"].add("Category:" + b["cat"]["value"])
    return out


def category_files(cat, depth=1, limit=200):
    files, subcats, cont = [], [], {}
    while len(files) < limit:
        d = api({"action": "query", "list": "categorymembers", "cmtitle": cat, "cmtype": "file|subcat", "cmlimit": "200", **cont})
        for m in d.get("query", {}).get("categorymembers", []):
            (files if m["ns"] == 6 else subcats).append(m["title"])
        if "continue" not in d:
            break
        cont = d["continue"]
    if depth > 0:
        for sub in subcats[:15]:
            if SKIP.search(sub):
                continue
            files += category_files(sub, depth - 1, 60)
            time.sleep(0.1)
    return files


def file_info(titles):
    out = {}
    for i in range(0, len(titles), 40):
        d = api({"action": "query", "titles": "|".join(titles[i:i + 40]), "prop": "imageinfo",
                 "iiprop": "url|size|extmetadata|mime", "iiurlwidth": "1280"})
        for page in d.get("query", {}).get("pages", []):
            if page.get("missing") or not page.get("imageinfo"):
                continue
            ii = page["imageinfo"][0]
            meta = ii.get("extmetadata", {})
            out[page["title"]] = {
                "w": ii.get("width", 0), "h": ii.get("height", 0), "mime": ii.get("mime", ""),
                "url": ii.get("thumburl") or ii.get("url"), "pagina": ii.get("descriptionurl"),
                "autor": strip(meta.get("Artist", {}).get("value")),
                "licencia": strip(meta.get("LicenseShortName", {}).get("value")),
                "licencia_url": strip(meta.get("LicenseUrl", {}).get("value")),
            }
        time.sleep(0.2)
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--sin-atribucion", action="store_true", help="solo dominio público y CC0")
    ap.add_argument("--por-municipio", type=int, default=4)
    ap.add_argument("--minimo", type=int, default=2, help="fotos mínimas para que un municipio entre en el juego")
    args = ap.parse_args()
    lic_ok = NO_ATTRIB if args.sin_atribucion else FREE

    munis = {m["ine"]: m["nombre"] for m in json.loads((ROOT / "data/municipios.json").read_text("utf-8"))["municipios"]}
    print("Consultando Wikidata…")
    wd = wikidata_municipios()
    fotos, resumen = [], []
    for n, (ine, nombre) in enumerate(sorted(munis.items(), key=lambda x: x[1]), 1):
        e = wd.get(ine, {"imgs": set(), "cats": set()})
        candidates = list(e["imgs"])
        for cat in e["cats"]:
            try:
                candidates += category_files(cat)
            except SystemExit:
                pass
        candidates = [t for t in dict.fromkeys(candidates) if re.search(r"\.jpe?g$", t, re.I) and not SKIP.search(t)]
        info = file_info(candidates[:120]) if candidates else {}
        good = []
        for t in candidates:
            i = info.get(t)
            if not i or i["w"] < 1200 or i["w"] < i["h"] * 1.15 or not i["licencia"] or not lic_ok.search(i["licencia"]):
                continue
            good.append((t, i))
        # Primero la imagen principal de Wikidata, luego variedad (archivos con nombres distintos).
        good.sort(key=lambda x: (x[0] not in e["imgs"],))
        chosen, seen = [], set()
        for t, i in good:
            stem = re.sub(r"[\d_\- ()]+", "", t.lower())[:18]
            if stem in seen and len(good) > args.por_municipio:
                continue
            seen.add(stem)
            chosen.append({
                "ine": ine, "archivo": t.removeprefix("File:"), "url": i["url"], "pagina": i["pagina"],
                "autor": i["autor"] or "Desconocido", "licencia": i["licencia"], "licencia_url": i["licencia_url"],
            })
            if len(chosen) >= args.por_municipio:
                break
        if len(chosen) >= args.minimo:
            fotos += chosen
        resumen.append((nombre, len(chosen)))
        print(f"[{n:3}/{len(munis)}] {nombre}: {len(chosen)} fotos", flush=True)

    out = {
        "nota": "Generado con tools/fotos_commons.py desde Wikimedia Commons. Autor y licencia tal como figuran en Commons.",
        "fuente": "Wikimedia Commons",
        "solo_sin_atribucion": args.sin_atribucion,
        "generado": time.strftime("%Y-%m-%d"),
        "fotos": fotos,
    }
    (ROOT / "data/fotos_municipios.json").write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", "utf-8")

    cards = "".join(
        f'<figure><img src="{html.escape(f["url"])}" loading="lazy" alt=""><figcaption><b>{html.escape(munis[f["ine"]])}</b> · '
        f'<a href="{html.escape(f["pagina"])}">{html.escape(f["archivo"])}</a><br>{html.escape(f["autor"])} · {html.escape(f["licencia"])}</figcaption></figure>'
        for f in fotos
    )
    (ROOT / "tools/revisar_fotos.html").write_text(
        "<!doctype html><meta charset='utf-8'><title>Revisar fotos</title>"
        "<style>body{font-family:system-ui;margin:20px}main{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px}"
        "figure{margin:0;border:1px solid #ddd;border-radius:10px;overflow:hidden;font-size:12px}img{width:100%;height:170px;object-fit:cover}figcaption{padding:6px}</style>"
        f"<h1>Revisar fotos ({len(fotos)})</h1><p>Borra de data/fotos_municipios.json las que muestren el nombre del pueblo o no sirvan.</p><main>{cards}</main>",
        "utf-8",
    )
    con = sum(1 for _, c in resumen if c >= args.minimo)
    print(f"\n{len(fotos)} fotos de {con} municipios (de {len(munis)}).")
    print("Guardado data/fotos_municipios.json. Revisa tools/revisar_fotos.html antes de publicar.")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(1)
