#!/usr/bin/env python3
"""Generate Meza brand assets: logo.svg, logo.png (512), favicon.ico, og-image.png.

Design: deep-navy rounded square, bold white "M", gold signal dot (top-right).
Deterministic PIL rendering + hand-written SVG mirroring the same geometry.
"""
from PIL import Image, ImageDraw, ImageFont
import os

OUT = "/tmp/my-project/public"
NAVY_TOP = (22, 35, 61)     # #16233d
NAVY_BOT = (11, 18, 32)     # #0b1220
GOLD = (233, 185, 73)       # #e9b949
WHITE = (245, 247, 250)

def gradient_bg(size, top, bot):
    img = Image.new("RGB", size, top)
    d = ImageDraw.Draw(img)
    h = size[1]
    for y in range(h):
        t = y / max(h - 1, 1)
        c = tuple(int(top[i] + (bot[i] - top[i]) * t) for i in range(3))
        d.line([(0, y), (size[0], y)], fill=c)
    return img

def draw_mark(img, S):
    """Paint the Meza mark onto img scaled to S px (square)."""
    d = ImageDraw.Draw(img)
    r = int(S * 0.19)
    d.rounded_rectangle([0, 0, S - 1, S - 1], radius=r, fill=None, outline=None)
    # white M: five anchor points
    pts = [
        (int(S * 0.27), int(S * 0.69)),
        (int(S * 0.27), int(S * 0.33)),
        (int(S * 0.50), int(S * 0.60)),
        (int(S * 0.73), int(S * 0.33)),
        (int(S * 0.73), int(S * 0.69)),
    ]
    w = max(int(S * 0.085), 3)
    d.line(pts, fill=WHITE, width=w, joint="curve")
    # round caps
    rr = w // 2
    for p in (pts[0], pts[-1]):
        d.ellipse([p[0] - rr, p[1] - rr, p[0] + rr, p[1] + rr], fill=WHITE)
    # gold signal dot top-right
    gr = int(S * 0.052)
    gx, gy = int(S * 0.78), int(S * 0.22)
    d.ellipse([gx - gr, gy - gr, gx + gr, gy + gr], fill=GOLD)
    return img

# ---- PNG 512 (also maskable: art within 80% safe zone) ----
S = 512
png = gradient_bg((S, S), NAVY_TOP, NAVY_BOT)
draw_mark(png, S)
png.save(os.path.join(OUT, "logo.png"), "PNG")

# ---- favicon.ico (16/32/48) ----
frames = []
for s in (16, 32, 48):
    f = gradient_bg((s, s), NAVY_TOP, NAVY_BOT)
    draw_mark(f, s)
    frames.append(f)
frames[0].save(os.path.join(OUT, "favicon.ico"), format="ICO",
               sizes=[(16, 16), (32, 32), (48, 48)])

# ---- og-image 1200x630 ----
W, H = 1200, 630
og = gradient_bg((W, H), NAVY_TOP, NAVY_BOT)
# overlay: draw mark directly on og so no tile seam is visible
ov = Image.new("RGBA", (W, H), (0, 0, 0, 0))
od = ImageDraw.Draw(ov)
msize = 290
mx, my = 120, (H - msize) // 2
_mark = Image.new("RGBA", (msize, msize), (0, 0, 0, 0))
md = ImageDraw.Draw(_mark)
md.rounded_rectangle([0, 0, msize - 1, msize - 1], radius=int(msize * 0.19), fill=(18, 28, 50, 255))
pts = [(int(msize * 0.27), int(msize * 0.69)), (int(msize * 0.27), int(msize * 0.33)),
       (int(msize * 0.50), int(msize * 0.60)), (int(msize * 0.73), int(msize * 0.33)),
       (int(msize * 0.73), int(msize * 0.69))]
w = max(int(msize * 0.085), 3)
md.line(pts, fill=WHITE + (255,), width=w, joint="curve")
rr = w // 2
for p in (pts[0], pts[-1]):
    md.ellipse([p[0] - rr, p[1] - rr, p[0] + rr, p[1] + rr], fill=WHITE + (255,))
gr = int(msize * 0.052); gx, gy = int(msize * 0.78), int(msize * 0.22)
md.ellipse([gx - gr, gy - gr, gx + gr, gy + gr], fill=GOLD + (255,))
ov.paste(_mark, (mx, my), _mark)
og = Image.alpha_composite(og.convert("RGBA"), ov).convert("RGB")
d = ImageDraw.Draw(og)
# wordmark
fb = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
fr = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
f_big = ImageFont.truetype(fb, 190)
tx = mx + msize + 80
d.text((tx, 180), "Meza", font=f_big, fill=WHITE)
bb = d.textbbox((tx, 180), "Meza", font=f_big)
d.line([(tx, bb[3] + 38), (tx + (bb[2] - bb[0]), bb[3] + 38)], fill=GOLD, width=6)
tagline = "Financial intelligence for the Egyptian Exchange"
size = 40
while size > 18:
    f_tag = ImageFont.truetype(fr, size)
    tb = d.textbbox((tx, 0), tagline, font=f_tag)
    if tb[2] <= W - 40:
        break
    size -= 2
d.text((tx, bb[3] + 74), tagline, font=f_tag, fill=(168, 178, 194))
print("tagline size:", size)
og.save(os.path.join(OUT, "og-image.png"), "PNG")
print("PIL assets written")

# ---- SVG mark (same geometry as PNG) ----
svg = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#16233d"/>
      <stop offset="1" stop-color="#0b1220"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="97" fill="url(#bg)"/>
  <polyline points="138,353 138,173 256,307 374,173 374,353"
            fill="none" stroke="#f5f7fa" stroke-width="44"
            stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="399" cy="113" r="27" fill="#e9b949"/>
</svg>
'''
open(os.path.join(OUT, "logo.svg"), "w", encoding="utf-8").write(svg)
print("SVG written")
for f in ("logo.svg", "logo.png", "favicon.ico", "og-image.png"):
    p = os.path.join(OUT, f)
    print(f, os.path.getsize(p), "bytes")
