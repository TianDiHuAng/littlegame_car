"""把 prototype/assets 里的 webp 转成 PNG（带 alpha）/ JPG（不带），并删掉原文件。"""
import os, sys
from PIL import Image

DIR = r"D:\AI\project\littlegame\prototype\assets"

def has_alpha(im):
    if im.mode in ("RGBA", "LA"):
        a = im.getchannel("A")
        return a.getextrema()[0] < 250
    return False

rows = []
for f in sorted(os.listdir(DIR)):
    if not f.lower().endswith(".webp"):
        continue
    src = os.path.join(DIR, f)
    key = f[:-5]
    im = Image.open(src)
    im.load()

    if has_alpha(im):
        out_name = key + ".png"
        out = os.path.join(DIR, out_name)
        # 有 alpha 必须 PNG
        im.convert("RGBA").save(out, "PNG", optimize=True, compress_level=9)
        fmt = "PNG"
    else:
        out_name = key + ".jpg"
        out = os.path.join(DIR, out_name)
        im.convert("RGB").save(out, "JPEG", quality=90, optimize=True, subsampling=0)
        fmt = "JPG"

    rows.append((f, out_name, fmt, os.path.getsize(src), os.path.getsize(out)))
    os.remove(src)

total_before = sum(r[3] for r in rows)
total_after = sum(r[4] for r in rows)
for f, o, fmt, b, a in rows:
    print(f"{f:24s} -> {o:24s} {fmt}  {b//1024:5d}KB -> {a//1024:5d}KB")
print(f"\n合计 {total_before//1024} KB -> {total_after//1024} KB")
