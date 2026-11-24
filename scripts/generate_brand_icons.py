"""Render the code-defined K-ROAD mark to installable PWA PNGs (Pillow)."""
from pathlib import Path
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parents[1] / "apps/web/public"
for size in (192, 512):
    scale = size * 4 / 64
    image = Image.new("RGBA", (size * 4, size * 4))
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((0, 0, size * 4, size * 4), radius=17 * scale, fill="#101638")
    def point(x, y): return ((x + 8) * scale, (y + 6) * scale)
    curves = [((24, 2), (12.4, 2), (3, 11.4), (3, 23)), ((3, 23), (3, 38), (24, 50), (24, 50)), ((24, 50), (24, 50), (45, 38), (45, 23)), ((45, 23), (45, 11.4), (35.6, 2), (24, 2))]
    polygon = []
    for a, b, c, d in curves:
        for index in range(31):
            t = index / 30; u = 1 - t
            polygon.append(point(*[u ** 3 * a[k] + 3 * u * u * t * b[k] + 3 * u * t * t * c[k] + t ** 3 * d[k] for k in (0, 1)]))
    draw.polygon(polygon, fill="#3869f8")
    for line in ([(17, 14), (17, 35)], [(31, 14), (17, 25), (32, 35)]):
        draw.line([point(*p) for p in line], fill="white", width=round(4.6 * scale), joint="curve")
        for p in line:
            x, y = point(*p); r = 2.3 * scale
            draw.ellipse((x-r, y-r, x+r, y+r), fill="white")
    x, y = point(35.6, 10.5); r = 5.8 * scale
    draw.ellipse((x-r, y-r, x+r, y+r), fill="white")
    r = 4.8 * scale; draw.ellipse((x-r, y-r, x+r, y+r), fill="#ff7651")
    image.resize((size, size), Image.Resampling.LANCZOS).save(root / f"icon-{size}.png")
print("K-ROAD PWA icons rendered: 192 and 512 pixels")
