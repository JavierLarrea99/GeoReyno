#!/usr/bin/env python3
"""Mide la cobertura de Mapillary en Navarra y genera data/street.json para «Navarra Street».

Uso (en tu ordenador, desde la carpeta del proyecto; solo biblioteca estándar):

    MAPILLARY_TOKEN='MLY|...' python3 tools/cobertura_mapillary.py

o bien con el token en config.js (se lee de ahí si no hay variable de entorno), o
con --token. Opciones:

    --por-municipio N   fotos que se guardan como máximo por municipio (por defecto 2)
    --desde AAAA        descarta fotos tomadas antes de ese año (por defecto 2015)
    --solo-pano         guarda solo fotos panorámicas de 360°
    --pausa S           segundos entre peticiones (por defecto 0.15)

Qué hace:
  1. Lee data/municipios.json.
  2. En cada municipio pregunta a la API de Mapillary por las fotos de varios
     recuadros pequeños (el centro del término y una rejilla de puntos de unos 2 km
     dentro del municipio, hasta 8 recuadros).
  3. Se queda con las fotos que caen dentro del municipio, prefiere panorámicas y
     recientes, y elige hasta N separadas entre sí.
  4. Escribe data/street.json (lista para el juego, con el autor de cada foto) y
     tools/cobertura_mapillary.txt (informe: municipios con y sin fotos).

El token no se guarda en ningún archivo de salida.
"""

import argparse
import json
import math
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
API = "https://graph.mapillary.com/images"


def read_token(arg):
    if arg:
        return arg.strip()
    if os.environ.get("MAPILLARY_TOKEN"):
        return os.environ["MAPILLARY_TOKEN"].strip()
    cfg = ROOT / "config.js"
    if cfg.exists():
        m = re.search(r"MAPILLARY_TOKEN\s*=\s*[\"']([^\"']+)[\"']", cfg.read_text("utf-8"))
        if m:
            return m.group(1).strip()
    sys.exit("Falta el token: usa MAPILLARY_TOKEN=..., --token o config.js")


def in_ring(x, y, ring):
    inside = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i]
        xj, yj = ring[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


def in_geom(x, y, geom):
    polys = [geom["coordinates"]] if geom["type"] == "Polygon" else geom["coordinates"]
    return any(in_ring(x, y, p[0]) and not any(in_ring(x, y, h) for h in p[1:]) for p in polys)


def bounds(geom):
    polys = [geom["coordinates"]] if geom["type"] == "Polygon" else geom["coordinates"]
    xs = [c[0] for p in polys for c in p[0]]
    ys = [c[1] for p in polys for c in p[0]]
    return min(xs), min(ys), max(xs), max(ys)


def km(a, b):
    r = 6371
    la1, la2 = math.radians(a[1]), math.radians(b[1])
    dla = la2 - la1
    dlo = math.radians(b[0] - a[0])
    h = math.sin(dla / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin(dlo / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


def query(token, lon, lat, half=0.006):
    params = {
        "access_token": token,
        "fields": "id,geometry,creator,captured_at,is_pano",
        "bbox": ",".join(f"{v:.6f}" for v in (lon - half, lat - half, lon + half, lat + half)),
        "limit": "100",
    }
    url = f"{API}?{urllib.parse.urlencode(params)}"
    for attempt in range(4):
        try:
            with urllib.request.urlopen(url, timeout=30) as res:
                return json.load(res).get("data", [])
        except urllib.error.HTTPError as e:
            if e.code in (401, 403):
                sys.exit("Mapillary ha rechazado el token (¿es el Client Token?).")
            if e.code == 429 or e.code >= 500:
                time.sleep(2 ** attempt)
                continue
            raise
        except urllib.error.URLError:
            time.sleep(2 ** attempt)
    return []


def sample_points(m, step_km=2.0, limit=8):
    pts = [tuple(m["centro"])]
    x0, y0, x1, y1 = bounds(m["geom"])
    dy = step_km / 110.57
    dx = step_km / (111.32 * math.cos(math.radians((y0 + y1) / 2)))
    y = y0 + dy / 2
    grid = []
    while y < y1:
        x = x0 + dx / 2
        while x < x1:
            if in_geom(x, y, m["geom"]):
                grid.append((x, y))
            x += dx
        y += dy
    # Los puntos más cercanos al centro primero (suele estar el pueblo).
    grid.sort(key=lambda p: km(p, m["centro"]))
    for p in grid:
        if len(pts) >= limit:
            break
        if all(km(p, q) > 1.0 for q in pts):
            pts.append(p)
    return pts


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--token")
    ap.add_argument("--por-municipio", type=int, default=2)
    ap.add_argument("--desde", type=int, default=2015)
    ap.add_argument("--solo-pano", action="store_true")
    ap.add_argument("--pausa", type=float, default=0.15)
    args = ap.parse_args()
    token = read_token(args.token)

    munis = json.loads((ROOT / "data/municipios.json").read_text("utf-8"))["municipios"]
    min_ms = int(time.mktime(date(args.desde, 1, 1).timetuple()) * 1000)

    ubicaciones, report = [], []
    total_imgs = 0
    for n, m in enumerate(munis, 1):
        seen, cands = set(), []
        for lon, lat in sample_points(m):
            for img in query(token, lon, lat):
                if img["id"] in seen or not img.get("geometry"):
                    continue
                seen.add(img["id"])
                x, y = img["geometry"]["coordinates"]
                if not in_geom(x, y, m["geom"]):
                    continue
                if (img.get("captured_at") or 0) < min_ms:
                    continue
                if args.solo_pano and not img.get("is_pano"):
                    continue
                cands.append(img)
            time.sleep(args.pausa)
        total_imgs += len(cands)
        cands.sort(key=lambda i: (not i.get("is_pano"), -(i.get("captured_at") or 0)))
        chosen = []
        for img in cands:
            p = img["geometry"]["coordinates"]
            if all(km(p, c["geometry"]["coordinates"]) > 1.5 for c in chosen):
                chosen.append(img)
            if len(chosen) >= args.por_municipio:
                break
        for img in chosen:
            x, y = img["geometry"]["coordinates"]
            ubicaciones.append({
                "imagen": img["id"],
                "lon": round(x, 6),
                "lat": round(y, 6),
                "ine": m["ine"],
                "municipio": m["nombre"],
                "autor": (img.get("creator") or {}).get("username", ""),
                "fecha": time.strftime("%Y-%m-%d", time.gmtime((img.get("captured_at") or 0) / 1000)),
                "pano": bool(img.get("is_pano")),
            })
        report.append((m["nombre"], len(cands), sum(1 for c in cands if c.get("is_pano"))))
        print(f"[{n:3}/{len(munis)}] {m['nombre']}: {len(cands)} fotos válidas, {len(chosen)} elegidas", flush=True)

    con = [r for r in report if r[1] > 0]
    out = {
        "ejemplo": False,
        "generado": date.today().isoformat(),
        "nota": "Generado con tools/cobertura_mapillary.py. Fotos de Mapillary (CC BY-SA 4.0); 'autor' es el usuario que la subió.",
        "ubicaciones": ubicaciones,
    }
    (ROOT / "data/street.json").write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", "utf-8")

    lines = [
        f"Cobertura de Mapillary en Navarra · {date.today().isoformat()}",
        f"Municipios con fotos (desde {args.desde}{', solo 360°' if args.solo_pano else ''}): {len(con)} de {len(report)} ({100 * len(con) / len(report):.0f} %)",
        f"Fotos válidas encontradas: {total_imgs} · Ubicaciones guardadas: {len(ubicaciones)}",
        "",
        "Municipio;fotos;panorámicas",
        *[f"{a};{b};{c}" for a, b, c in sorted(report, key=lambda r: -r[1])],
    ]
    (ROOT / "tools/cobertura_mapillary.txt").write_text("\n".join(lines) + "\n", "utf-8")
    print("\n" + "\n".join(lines[:3]))
    print("Guardado data/street.json y tools/cobertura_mapillary.txt")


if __name__ == "__main__":
    main()
