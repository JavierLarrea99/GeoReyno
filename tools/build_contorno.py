#!/usr/bin/env python3
"""Sustituye el contorno de Navarra de data/municipios.json por uno preciso.

Fuente: geoBoundaries (gbOpen, ESP ADM2), que publica los límites provinciales del INE.
    https://media.githubusercontent.com/media/wmgeolab/geoBoundaries/main/releaseData/gbOpen/ESP/ADM2/geoBoundaries-ESP-ADM2.geojson

Uso:
    python3 tools/build_contorno.py ruta/geoBoundaries-ESP-ADM2.geojson [tolerancia_en_grados]

Simplifica con Douglas-Peucker (por defecto 0.00012°, unos 10-13 m), de modo que coincide
con las fronteras que dibuja el mapa base.
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def rdp(points, eps):
    """Douglas-Peucker iterativo."""
    if len(points) < 3:
        return points
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        a, b = stack.pop()
        ax, ay = points[a]
        bx, by = points[b]
        dx, dy = bx - ax, by - ay
        norm = (dx * dx + dy * dy) ** 0.5 or 1e-12
        best, idx = 0.0, -1
        for i in range(a + 1, b):
            px, py = points[i]
            dist = abs(dy * px - dx * py + bx * ay - by * ax) / norm
            if dist > best:
                best, idx = dist, i
        if best > eps and idx > 0:
            keep[idx] = True
            stack.append((a, idx))
            stack.append((idx, b))
    return [p for p, k in zip(points, keep) if k]


def main():
    src = sys.argv[1]
    eps = float(sys.argv[2]) if len(sys.argv) > 2 else 0.00012
    data = json.loads(Path(src).read_text("utf-8"))
    nav = next(f for f in data["features"] if f["properties"].get("shapeName") == "Navarra")
    g = nav["geometry"]
    polys = [g["coordinates"]] if g["type"] == "Polygon" else g["coordinates"]
    out = []
    for poly in polys:
        pts = poly[0]
        # Anillo cerrado: se parte por el punto más lejano al inicio y se simplifica cada mitad.
        x0, y0 = pts[0]
        k = max(range(len(pts)), key=lambda i: (pts[i][0] - x0) ** 2 + (pts[i][1] - y0) ** 2)
        ring = rdp(pts[: k + 1], eps)[:-1] + rdp(pts[k:], eps)
        if len(ring) >= 4:
            out.append([[[round(x, 5), round(y, 5)] for x, y in ring]])
    contorno = {"type": "MultiPolygon", "coordinates": out}
    xs = [p[0] for poly in out for p in poly[0]]
    ys = [p[1] for poly in out for p in poly[0]]
    path = ROOT / "data/municipios.json"
    muni = json.loads(path.read_text("utf-8"))
    muni["contorno"] = contorno
    muni["bbox"] = [round(min(xs), 4), round(min(ys), 4), round(max(xs), 4), round(max(ys), 4)]
    muni["fuente_contorno"] = "Límite provincial del INE, vía geoBoundaries (gbOpen ESP ADM2), simplificado."
    path.write_text(json.dumps(muni, ensure_ascii=False, separators=(",", ":")), "utf-8")
    print(f"{len(out)} polígonos, {sum(len(p[0]) for p in out)} puntos, bbox {muni['bbox']}")


if __name__ == "__main__":
    main()
