"""Render the app icon + splash image from the same spark geometry as
src/welcome/spark.ts (kept in sync by hand: lengths, jitter, widths)."""
import math, sys
from pathlib import Path
from PIL import Image, ImageDraw

LEN = [1.0, 0.84, 0.95, 0.8, 0.98, 0.87, 1.0, 0.82, 0.94, 0.89, 0.97, 0.85]
JIT = [0, 3, -2, 4, -3, 2, 0, -4, 3, -2, 2, -3]
INNER, W_OUT, W_IN = 0.17, 0.15, 0.07
CLAY, IVORY = (217, 119, 87, 255), (245, 244, 239, 255)

def polys(cx, cy, R):
    out = []
    for i in range(12):
        a = math.radians(i * 30 + JIT[i] - 90)
        outer, inner = LEN[i] * R, INNER * R
        r1, r0 = W_OUT * R / 2, W_IN * R / 2
        dx, dy = math.cos(a), math.sin(a)
        x0, y0 = cx + dx * (inner + r0), cy + dy * (inner + r0)
        x1, y1 = cx + dx * (outer - r1), cy + dy * (outer - r1)
        pts = []
        for s in range(13):
            t = a - math.pi / 2 + math.pi * s / 12
            pts.append((x1 + math.cos(t) * r1, y1 + math.sin(t) * r1))
        for s in range(13):
            t = a + math.pi / 2 + math.pi * s / 12
            pts.append((x0 + math.cos(t) * r0, y0 + math.sin(t) * r0))
        out.append(pts)
    return out

def render(size, R, bg):
    S = 4
    im = Image.new('RGBA', (size * S, size * S), bg)
    d = ImageDraw.Draw(im)
    for p in polys(size * S / 2, size * S / 2, R * S):
        d.polygon(p, fill=CLAY)
    return im.resize((size, size), Image.LANCZOS)

out = Path(sys.argv[1])
render(1024, 1024 * 0.34, IVORY).convert('RGB').save(out / 'icon.png')
# splash: spark radius = 44 pt; image is 88 pt wide → render at 6x for crispness
render(528, 264, (0, 0, 0, 0)).save(out / 'splash-icon.png')
render(48, 22, (0, 0, 0, 0)).save(out / 'favicon.png')
print('ok')
