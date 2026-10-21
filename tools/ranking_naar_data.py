#!/usr/bin/env python3
"""
Zet een Bridge-It "Individuele competitiestand" (ranking-pdf) om naar data voor de website.

Gebruik (vanuit de hoofdmap van de repository):
    py tools\\ranking_naar_data.py "Di C07.pdf" "Wo C06.pdf"   [--site=site]

Per competitie schrijft het site/data/ranking-di.js of site/data/ranking-wo.js
(een nieuwe ranking vervangt de vorige van dezelfde dag).

Vereist: pip install pdfplumber
"""
import json
import re
import sys
from pathlib import Path

import pdfplumber

MAANDEN = {m: i + 1 for i, m in enumerate(
    "januari februari maart april mei juni juli augustus september oktober november december".split())}
SCORE = re.compile(r"^(\d+,\d+)([a-z*]*)$")
VLAG = re.compile(r"^[acihlmnrb*]+$")


def num(s):
    return float(s.replace(",", "."))


def naam_omdraaien(n):
    """'Arnou, Hugo' -> 'Hugo Arnou'"""
    if "," in n:
        achter, voor = [x.strip() for x in n.split(",", 1)]
        return f"{voor} {achter}".strip()
    return n


def lees(pad):
    with pdfplumber.open(pad) as pdf:
        tekst = pdf.pages[0].extract_text() or ""
        meta = {}
        m = re.search(r"Competitie:\s*(.+)", tekst)
        meta["competitie"] = m.group(1).strip() if m else ""
        m = re.search(r"Datum:\s*\w+\s+(\d+)\s+(\w+)\s+(\d{4})", tekst)
        if m:
            meta["stand_op"] = f"{m.group(3)}-{MAANDEN[m.group(2).lower()]:02d}-{int(m.group(1)):02d}"
        m = re.search(r"Lijn\s+([A-Z])", tekst)
        meta["lijn"] = m.group(1) if m else ""
        dag = meta["competitie"].lower()
        meta["dag"] = "di" if dag.startswith("di") else "wo" if dag.startswith("wo") else "x"

        kolommen = None   # x-midden per zitting 1..10
        datums = {}
        spelers = []
        for page in pdf.pages:
            ws = page.extract_words(x_tolerance=1.5, y_tolerance=2)
            lijnen = {}
            for w in ws:
                lijnen.setdefault(round(w["top"] / 3), []).append(w)
            rijen = [sorted(v, key=lambda w: w["x0"]) for _, v in sorted(lijnen.items())]

            if kolommen is None:
                # eerste rij met 10x "Zitting" = kolomkoppen 1..10 (onder de datumrij)
                for r in rijen:
                    z = [w for w in r if w["text"] == "Zitting"]
                    if len(z) >= 10:
                        kolommen = [(w["x0"] + w["x1"]) / 2 for w in z[:10]]
                        break
                # datumrij: tokens als 1-sep, 13-okt
                for r in rijen:
                    if any(w["text"] == "Gemidd." for w in r):
                        for w in r:
                            if re.fullmatch(r"\d{1,2}-[a-z]{3}", w["text"]):
                                mid = (w["x0"] + w["x1"]) / 2
                                k = min(range(10), key=lambda i: abs(kolommen[i] - mid)) if kolommen else None
                                if k is not None:
                                    datums[k + 1] = w["text"]
                        break

            for r in rijen:
                t = [w["text"] for w in r]
                if not t or not re.fullmatch(r"\(?\d+\)?", t[0]):
                    continue
                # naam = woorden tot het eerste getal (gemiddelde)
                i = 1
                while i < len(r) and not SCORE.match(r[i]["text"]):
                    i += 1
                if i >= len(r) or i == 1:
                    continue
                naam = " ".join(t[1:i])
                gem = num(SCORE.match(t[i]).group(1))
                scores = []
                for w in r[i + 1:]:
                    sm = SCORE.match(w["text"])
                    if sm:
                        mid = w["x0"] + 12
                        k = min(range(10), key=lambda j: abs(kolommen[j] - mid))
                        scores.append({"z": k + 1, "s": num(sm.group(1)), "v": sm.group(2)})
                    elif VLAG.match(w["text"]) and scores:
                        scores[-1]["v"] += w["text"]
                spelers.append({
                    "rang": int(t[0].strip("()")),
                    "gedeeld": t[0].startswith("("),
                    "naam": naam_omdraaien(naam),
                    "gem": gem,
                    "aantal": len(scores),
                    "scores": scores,
                })
    meta["zittingen"] = [{"nr": k, "datum": datums.get(k, "")} for k in sorted(datums)]
    meta["spelers"] = spelers
    return meta


def zet_om_ranking(pad, site="site"):
    """Zet één ranking-pdf om. Geeft (melding, fouten) terug."""
    r = lees(pad)
    fouten = []
    if not r["spelers"]:
        fouten.append("Geen spelers gevonden in de ranking.")
    if r["dag"] == "x":
        fouten.append(f"Onbekende competitie: '{r['competitie']}' (verwacht Dinsdag of Woensdag).")
    leeg = [s["naam"] for s in r["spelers"] if s["aantal"] == 0]
    if leeg:
        fouten.append("Geen scores gevonden voor: " + ", ".join(leeg))
    if fouten:
        return f"Ranking niet omgezet: {pad}", fouten
    data = Path(site) / "data"
    data.mkdir(parents=True, exist_ok=True)
    uit = data / f"ranking-{r['dag']}.js"
    uit.write_text("registreerRanking(" + json.dumps(r, ensure_ascii=False, separators=(",", ":")) + ");\n",
                   encoding="utf-8")
    return (f"{r['competitie']} (stand op {r.get('stand_op', '?')}): {len(r['spelers'])} spelers, "
            f"{len(r['zittingen'])} zittingen → {uit}"), []


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--site")]
    site = "site"
    for a in sys.argv[1:]:
        if a.startswith("--site="):
            site = a.split("=", 1)[1]
    if not args:
        print(__doc__)
        sys.exit(1)
    fout = False
    for pad in args:
        melding, fouten = zet_om_ranking(pad, site)
        print(melding)
        for f in fouten:
            print("  LET OP:", f)
        fout = fout or bool(fouten)
    sys.exit(2 if fout else 0)


if __name__ == "__main__":
    main()
