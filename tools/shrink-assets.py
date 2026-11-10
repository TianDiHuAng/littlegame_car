"""再压缩：完全不透明的转 JPEG；需要透明的做 PNG8 量化。"""
import os
from PIL import Image

DIR = r"D:\AI\project\littlegame\prototype\assets"

def alpha_info(im):
    if "A" not in im.getbands():
        return (255, 255)
    return im.getchannel("A").getextrema()

rows = []
for f in sorted(os.listdir(DIR)):
    if not f.lower().endswith(".png"):
        continue
    p = os.path.join(DIR, f)
    key = f[:-4]
    im = Image.open(p).convert("RGBA")
    lo, hi = alpha_info(im)
    before = os.path.getsize(p)

    if lo >= 250:
        out = os.path.join(DIR, key + ".jpg")
        im.convert("RGB").save(out, "JPEG", quality=88, optimize=True, subsampling=0)
        os.remove(p)
        rows.append((f, key + ".jpg", "JPG(纯不透明)", before, os.path.getsize(out), lo, hi))
    else:
        q = im.quantize(colors=256, method=Image.FASTOCTREE, dither=Image.FLOYDSTEINBERG)
        q.save(p, "PNG", optimize=True)
        rows.append((f, f, "PNG8", before, os.path.getsize(p), lo, hi))

for f, o, fmt, b, a, lo, hi in rows:
    print(f"{f:22s} {fmt:14s} alpha[{lo},{hi}]  {b//1024:5d}KB -> {a//1024:5d}KB")

tot = sum(r[4] for r in rows)
print(f"\n合计 {sum(r[3] for r in rows)//1024} KB -> {tot//1024} KB")
