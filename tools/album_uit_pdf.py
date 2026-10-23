"""Zet een fotopresentatie (PowerPoint bewaard als pdf) om naar een album in de ledenzone.

Elke dia wordt een foto (de eerste dia = titel wordt overgeslagen); korte tekst op een dia wordt het bijschrift.
Gebruik:
    py tools/album_uit_pdf.py <presentatie.pdf> --datum 2026-06-23 --titel "Clubmaaltijd 2026" [--omschrijving "..."]
Nodig: poppler (pdftoppm/pdftotext) en Pillow.
"""
import argparse, glob, json, os, re, shutil, subprocess, tempfile
from pathlib import Path
from PIL import Image

ZONE = Path(__file__).resolve().parent.parent / "site" / "ledenzone_test"
INDEX = ZONE / "data" / "albums.js"

def slug(t):
    t = re.sub(r"[^a-z0-9]+", "-", t.lower().replace("’", "").replace("'", ""))
    return t.strip("-")[:40]

def bijschrift(pdf, p):
    t = subprocess.run(["pdftotext", "-f", str(p), "-l", str(p), "-layout", pdf, "-"], capture_output=True, text=True).stdout
    regels = [re.sub(r"\s+", " ", r).strip() for r in t.splitlines() if r.strip()]
    tekst = " ".join(regels).replace("”", "").replace("“", "“").strip()
    # kaarten, uitslagbladen… hebben veel losse tekst: dan geen bijschrift
    if len(regels) > 3 or len(tekst) > 90:
        return ""
    return tekst

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf"); ap.add_argument("--datum", required=True); ap.add_argument("--titel", required=True)
    ap.add_argument("--omschrijving", default="")
    a = ap.parse_args()
    aid = a.datum + "-" + slug(a.titel)
    doel = ZONE / "fotos" / aid
    if doel.exists(): shutil.rmtree(doel)
    doel.mkdir(parents=True)
    with tempfile.TemporaryDirectory() as tmp:
        subprocess.run(["pdftoppm", "-r", "120", "-png", a.pdf, os.path.join(tmp, "s")], check=True)
        dias = sorted(glob.glob(os.path.join(tmp, "s-*.png")))
        fotos = []
        for i, f in enumerate(dias, 1):
            if i == 1: continue
            im = Image.open(f).convert("RGB"); im.thumbnail((1600, 900))
            nm = "%03d" % i
            im.save(doel / (nm + ".jpg"), quality=78, optimize=True, progressive=True)
            t = im.copy(); t.thumbnail((400, 225)); t.save(doel / ("t" + nm + ".jpg"), quality=72, optimize=True)
            fotos.append({"src": nm + ".jpg", "thumb": "t" + nm + ".jpg", "bijschrift": bijschrift(a.pdf, i)})
    s = INDEX.read_text(encoding="utf-8") if INDEX.exists() else "window.ALBUMS = [];"
    albums = [x for x in json.loads(s[s.index("["):s.rindex("]") + 1]) if x["id"] != aid]
    cover = next((f["thumb"] for f in fotos[1:] if f["bijschrift"]), fotos[min(2, len(fotos) - 1)]["thumb"])
    albums.append({"id": aid, "titel": a.titel, "datum": a.datum, "omschrijving": a.omschrijving,
                   "map": "fotos/" + aid + "/", "cover": cover, "fotos": fotos})
    albums.sort(key=lambda x: x["datum"], reverse=True)
    INDEX.write_text("window.ALBUMS = " + json.dumps(albums, ensure_ascii=False, indent=1) + ";\n", encoding="utf-8")
    print(f"{aid}: {len(fotos)} foto's")

if __name__ == "__main__":
    main()
