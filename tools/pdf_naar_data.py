#!/usr/bin/env python3
"""
Zet de Bridge-It pdf's van één zitting om naar een datafile voor de website.

Gebruik (vanuit de hoofdmap van de repository):
    py tools\\pdf_naar_data.py <verzamelstaat.pdf> <frequentiestaat.pdf>
    py tools\\pdf_naar_data.py <verzamelstaat.pdf> <frequentiestaat.pdf> --reeks kroegendrive --titel "11de Kroegendrive"

Normaal gebeurt dit automatisch via tools/verwerk_drive.py (GitHub Action).
Bij fouten wordt NIETS weggeschreven.

Vereist: pip install pdfplumber
"""
import json
import re
import sys
from pathlib import Path

import pdfplumber

MAANDEN = {m: i + 1 for i, m in enumerate(
    "januari februari maart april mei juni juli augustus september oktober november december".split())}
SUITS = "♠♥♦♣"


def num(s):
    return float(s.replace(",", "."))


def kort(volle_naam):
    """'Cosyn, Eddy & Rottier, Arlette' -> 'Cosyn & Rottier'"""
    return " & ".join(p.split(",")[0].strip() for p in volle_naam.split("&"))


# ---------------------------------------------------------------- verzamelstaat
def lees_stand(pad):
    with pdfplumber.open(pad) as pdf:
        tekst = "\n".join(p.extract_text(layout=True) or "" for p in pdf.pages)
    meta = {}
    m = re.search(r"Zitting:\s*(.+)", tekst)
    meta["zitting"] = m.group(1).strip() if m else ""
    m = re.search(r"Datum:\s*\w+\s+(\d+)\s+(\w+)\s+(\d{4})", tekst)
    if m:
        meta["datum"] = f"{m.group(3)}-{MAANDEN[m.group(2).lower()]:02d}-{int(m.group(1)):02d}"
    m = re.search(r"(Top-integraal|Butler|IMP\w*|Neuberg\w*)", tekst)
    meta["telling"] = m.group(1) if m else ""
    paren = []
    getal = re.compile(r"^\d+(,\d+)?$")
    with pdfplumber.open(pad) as pdf:
        for page in pdf.pages:
            lijnen = {}
            for w in page.extract_words(x_tolerance=1.5, y_tolerance=2):
                lijnen.setdefault(round(w["top"] / 3), []).append(w)
            for _, ws in sorted(lijnen.items()):
                t = [w["text"] for w in sorted(ws, key=lambda w: w["x0"])]
                # Rang  Lijn  Paar  Naam, Voornaam & Naam, Voornaam  MP  %  Spellen ...
                # rang kan gedeeld zijn: "(18)"
                if len(t) < 7 or not (re.fullmatch(r"\(?\d+\)?", t[0]) and re.fullmatch(r"[A-Z]", t[1]) and t[2].isdigit()):
                    continue
                i = 3
                while i < len(t) and not getal.match(t[i]):
                    i += 1
                if i + 2 >= len(t) or "&" not in t[3:i]:
                    continue
                naam = " ".join(t[3:i])
                paren.append({
                    "id": f"{t[1]}{t[2]}",
                    "rang": int(t[0].strip("()")),
                    "gedeeld": t[0].startswith("("),
                    "naam": naam,
                    "kort": kort(naam),
                    "mp": num(t[i]),
                    "pct": num(t[i + 1]),
                    "spellen": int(t[i + 2]),
                })
    return meta, paren


# ------------------------------------------------------------ frequentiestaat
def lees_spellen(pad):
    spellen = []
    with pdfplumber.open(pad) as pdf:
        for page in pdf.pages:
            ws = page.extract_words(x_tolerance=1.5, y_tolerance=2)
            koppen = [w for w in ws if w["text"] == "Spel:"]
            for i, kop in enumerate(koppen):
                y0 = kop["top"] - 2
                y1 = koppen[i + 1]["top"] - 2 if i + 1 < len(koppen) else page.height - 40
                blok = [w for w in ws if y0 <= w["top"] < y1]
                spellen.append(lees_spel(blok, kop))
    return spellen


def lees_spel(blok, kop):
    lijn_kop = sorted([w for w in blok if abs(w["top"] - kop["top"]) < 3], key=lambda w: w["x0"])
    nr = int(lijn_kop[1]["text"])
    gever, kw = lijn_kop[2]["text"].split("/")
    top = num([w for w in lijn_kop if re.fullmatch(r"[\d,]+", w["text"])][-1]["text"])

    # kolomposities uit de koprij (Score # MP Namen Namen MP # Score)
    contract_kop = next(w for w in blok if w["text"] == "Contract")
    hdr_y = next(w for w in blok if w["text"] == "Namen")["top"]
    hdr = sorted([w for w in blok if abs(w["top"] - hdr_y) < 3], key=lambda w: w["x0"])
    xs = {}
    for w in hdr:
        key = w["text"]
        xs.setdefault(key, []).append(w["x0"])
    x_score1 = xs["Score"][0]
    x_namen1, x_namen2 = xs["Namen"][:2]
    x_mp2 = xs["MP"][1]
    x_tabel = contract_kop["x0"] - 30

    # ---- hand
    hand_ws = [w for w in blok if w["x0"] < x_tabel and w["top"] > kop["top"] + 5]
    lijnen = {}
    for w in hand_ws:
        if w["text"] in SUITS:
            lijnen.setdefault(round(w["top"]), []).append(w)
    suit_ws = [w for w in hand_ws if w["text"] in SUITS]
    hand = {"N": {}, "O": {}, "Z": {}, "W": {}}
    if suit_ws:
        xs_s = sorted(set(round(w["x0"]) for w in suit_ws))
        x_min, x_max = xs_s[0], xs_s[-1]
        midden = [w for w in suit_ws if x_min + 10 < w["x0"] < x_max - 10]
        y_mid = (min(w["top"] for w in midden) + max(w["top"] for w in midden)) / 2
        for s in suit_ws:
            kaarten = [w for w in hand_ws if abs(w["top"] - s["top"]) < 2.5
                       and 3 < w["x0"] - s["x0"] < 30 and w["text"] not in SUITS and w["text"] not in "NOZW"]
            k = kaarten[0]["text"] if kaarten else "-"
            if s["x0"] <= x_min + 5:
                pos = "W"
            elif s["x0"] >= x_max - 5:
                pos = "O"
            else:
                pos = "N" if s["top"] < y_mid else "Z"
            hand[pos][s["text"]] = k

    # ---- uitslagen
    # "Bijzonderheden:" onder de tabel = opmerkingen (bv. contrazit), geen gewone tafels
    bijz = [w for w in blok if w["text"].startswith("Bijzonderheden")]
    y_bijz = bijz[0]["top"] if bijz else 10 ** 6
    opm = {}
    for w in blok:
        if w["top"] > y_bijz + 3 and w["x0"] >= x_tabel:
            opm.setdefault(round(w["top"] / 3), []).append(w)
    opmerkingen = [" ".join(x["text"] for x in sorted(v, key=lambda w: w["x0"])) for _, v in sorted(opm.items())]
    rijen = {}
    for w in blok:
        if w["x0"] >= x_tabel and hdr_y + 5 < w["top"] < y_bijz - 2:
            rijen.setdefault(round(w["top"] / 3), []).append(w)
    regels = []
    vorig = None
    for _, rw in sorted(rijen.items()):
        rw.sort(key=lambda w: w["x0"])
        links = [w["text"] for w in rw if w["x0"] < x_score1 - 8]
        mid = [w["text"] for w in rw if x_score1 - 8 <= w["x0"] < x_namen1 - 2]
        ns = " ".join(w["text"] for w in rw if x_namen1 - 2 <= w["x0"] < x_namen2 - 2)
        ow = " ".join(w["text"] for w in rw if x_namen2 - 2 <= w["x0"] < x_mp2 - 15)
        rechts = [w["text"] for w in rw if w["x0"] >= x_mp2 - 15]
        if not ns:
            continue
        r = {"ns": ns, "ow": ow, "raw": " ".join(links)}
        # contract  [x|xx]  resultaat  leider  uitkomst
        t = list(links)
        if t and re.fullmatch(r"\d(SA|[♠♥♦♣])", t[0]):
            r["contract"] = t.pop(0)
            if t and t[0] in ("x", "xx"):
                r["contract"] += " " + t.pop(0)
            r["res"] = t.pop(0) if t else ""
            r["leider"] = t.pop(0) if t else ""
            r["uitkomst"] = t.pop(0) if t else ""
        elif t and t[0].lower() == "pas":
            r.update(contract="Pas", res="", leider="", uitkomst="")
        if len(mid) >= 3:
            r["score"] = int(mid[0].replace("+", ""))
            r["mpNS"] = num(mid[2])
            r["mpOW"] = num(rechts[0]) if rechts else round(top - r["mpNS"], 2)
            vorig = r
        elif vorig is not None:
            r["score"], r["mpNS"], r["mpOW"] = vorig["score"], vorig["mpNS"], vorig["mpOW"]
        regels.append(r)
    uit = {"nr": nr, "gever": gever, "kw": kw, "top": top, "hand": hand, "tafels": regels}
    if opmerkingen:
        uit["opmerkingen"] = opmerkingen
    return uit


# ------------------------------------------------------------------- main
def zet_om(stand_pdf, fs_pdf, site=".", reeks="", titel=""):
    """Zet één zitting om. Geeft (melding, fouten) terug; fouten = lijst met problemen (leeg = OK)."""
    site = Path(site)
    meta, paren = lees_stand(stand_pdf)
    spellen = lees_spellen(fs_pdf)

    # korte naam -> paar-id
    per_kort = {p["kort"]: p["id"] for p in paren}
    fouten = []
    som = {p["id"]: 0.0 for p in paren}
    for s in spellen:
        for t in s["tafels"]:
            for kant in ("ns", "ow"):
                pid = per_kort.get(t[kant])
                if not pid:
                    fouten.append(f"Spel {s['nr']}: onbekend paar '{t[kant]}'")
                    continue
                t[kant + "Id"] = pid
                som[pid] += t["mpNS" if kant == "ns" else "mpOW"] if "mpNS" in t else 0
            t.pop("ns"); t.pop("ow")
            if "contract" in t:
                t.pop("raw")
    for p in paren:
        if abs(som[p["id"]] - p["mp"]) > 0.6:
            fouten.append(f"{p['kort']}: som spellen {som[p['id']]:.1f} ≠ stand {p['mp']}")
    if not paren:
        fouten.append("Geen paren gevonden in de verzamelstaat.")
    if fouten:
        return f"Niet omgezet: {meta.get('zitting', '?')} ({meta.get('datum', '?')})", fouten

    if reeks:
        zid = meta["datum"]
        data = site / "data" / reeks
        idx_pad = data / "lijst.js"
        if titel:
            meta["titel"] = titel
    else:
        dag = "di" if meta["zitting"].lower().startswith("di") else "wo"
        zid = f"{meta['datum']}-{dag}"
        data = site / "data"
        idx_pad = data / "zittingen.js"
    zitting = {"id": zid, **meta, "paren": paren, "spellen": spellen}

    data.mkdir(parents=True, exist_ok=True)
    (data / f"{zid}.js").write_text(
        "registreerZitting(" + json.dumps(zitting, ensure_ascii=False, separators=(",", ":")) + ");\n",
        encoding="utf-8")

    lijst = []
    if idx_pad.exists():
        m = re.search(r"=\s*(\[.*\])", idx_pad.read_text(encoding="utf-8"), re.S)
        if m:
            lijst = json.loads(m.group(1))
    lijst = [z for z in lijst if z["id"] != zid]
    item = {"id": zid, "datum": meta["datum"], "zitting": meta["zitting"],
            "paren": len(paren), "spellen": len(spellen),
            "winnaar": paren[0]["kort"] if paren else ""}
    if meta.get("titel"):
        item["titel"] = meta["titel"]
    lijst.append(item)
    lijst.sort(key=lambda z: z["id"], reverse=True)
    idx_pad.write_text("window.ZITTINGEN = " + json.dumps(lijst, ensure_ascii=False, indent=1) + ";\n",
                       encoding="utf-8")
    naam = meta.get("titel") or "Zitting " + meta["zitting"]
    return f"{naam} van {meta['datum']}: {len(paren)} paren, {len(spellen)} spellen → {data / (zid + '.js')}", []


def main():
    import argparse
    ap = argparse.ArgumentParser(description="Bridge-It pdf's omzetten naar data voor de website.")
    ap.add_argument("verzamelstaat")
    ap.add_argument("frequentiestaat")
    ap.add_argument("--site", default="site", help="map van de website (standaard: site)")
    ap.add_argument("--reeks", default="", help="kroegendrive, gilbert of recreanten (leeg = gewone clubdrive)")
    ap.add_argument("--titel", default="", help='naam van het tornooi, bv. "11de Kroegendrive"')
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)
    a = ap.parse_args()
    melding, fouten = zet_om(a.verzamelstaat, a.frequentiestaat, a.site, a.reeks, a.titel)
    print(melding)
    if fouten:
        print("\nLET OP:")
        for f in fouten[:30]:
            print("  -", f)
        if len(fouten) > 30:
            print(f"  ... en nog {len(fouten) - 30} meldingen")
        sys.exit(2)
    print("Controle OK: matchpunten per paar kloppen met de stand.")


if __name__ == "__main__":
    main()
