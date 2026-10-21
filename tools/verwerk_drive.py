#!/usr/bin/env python3
"""
Automatische verwerking van uitslagen voor bceeklo.be.

Leest alle pdf's uit de map  "Uitslagen website/Nieuw"  (Google Drive), herkent zelf wat elk bestand is
en zet het om naar data voor de website:

  * Verzamelstaat + Frequentiestaat van dezelfde zitting  -> clubdrive, Kroegendrive, Drive Gilbert of recreantentornooi
  * Individuele competitiestand                           -> ranking dinsdag / woensdag

Gelukt  -> bestanden gaan naar "Verwerkt".
Mislukt -> bestanden gaan naar "Fout"; hun naam begint dan met "FOUT - " en de uitleg staat in de
           beschrijving van het bestand (Drive: rechtsklik > Bestandsinformatie > Details).
Een verzamelstaat zonder frequentiestaat (of omgekeerd) blijft 12 uur wachten in "Nieuw"
en gaat daarna naar "Fout".

Gebruik
  In GitHub Actions (zie .github/workflows/uitslagen.yml):
      python tools/verwerk_drive.py
      met omgevingsvariabelen GOOGLE_SA_KEY (JSON van het service-account) en DRIVE_MAP_ID
  Lokaal testen zonder Drive (map met submappen Nieuw/Verwerkt/Fout):
      python tools/verwerk_drive.py --lokaal "C:\\pad\\naar\\testmap"
"""
import datetime as dt
import io
import json
import os
import re
import shutil
import sys
import tempfile
from pathlib import Path

import pdfplumber

sys.path.insert(0, str(Path(__file__).resolve().parent))
from pdf_naar_data import zet_om, MAANDEN  # noqa: E402
from ranking_naar_data import zet_om_ranking  # noqa: E402

SITE = Path(__file__).resolve().parent.parent / "site"
WACHTTIJD_UUR = 12
KROEGENDRIVE_EERSTE_JAAR = 2015  # 1ste editie; 2025 = 11de
GILBERT_EERSTE_JAAR = 2023      # 4de Drive Gilbert = juni 2026


# ------------------------------------------------------------------ bronnen
class LokaleBron:
    """Voor testen: een gewone map met submappen Nieuw / Verwerkt / Fout."""

    def __init__(self, map_):
        self.root = Path(map_)
        for n in ("Nieuw", "Verwerkt", "Fout"):
            (self.root / n).mkdir(parents=True, exist_ok=True)

    def nieuwe_bestanden(self):
        uit = []
        for p in sorted((self.root / "Nieuw").iterdir()):
            if p.is_file():
                t = dt.datetime.fromtimestamp(p.stat().st_mtime, dt.timezone.utc)
                uit.append({"id": str(p), "naam": p.name, "tijd": t})
        return uit

    def download(self, f, doel):
        shutil.copy(f["id"], doel)

    def verplaats(self, f, naar):
        shutil.move(f["id"], self.root / naar / f["naam"])

    def markeer_fout(self, f, tekst):
        pad = self.root / "Fout" / f["naam"]
        nieuw = pad.with_name("FOUT - " + pad.name)
        pad.rename(nieuw)
        nieuw.with_suffix(nieuw.suffix + ".txt").write_text(tekst, encoding="utf-8")


class DriveBron:
    """Google Drive via een service-account dat 'Bewerker' is op de map."""

    def __init__(self, map_id, sleutel_json):
        from google.oauth2 import service_account
        from googleapiclient.discovery import build
        creds = service_account.Credentials.from_service_account_info(
            json.loads(sleutel_json), scopes=["https://www.googleapis.com/auth/drive"])
        self.svc = build("drive", "v3", credentials=creds, cache_discovery=False)
        self.mappen = {n: self._submap(map_id, n) for n in ("Nieuw", "Verwerkt", "Fout")}

    def _submap(self, ouder, naam):
        q = (f"'{ouder}' in parents and name = '{naam}' and "
             "mimeType = 'application/vnd.google-apps.folder' and trashed = false")
        r = self.svc.files().list(q=q, fields="files(id)", supportsAllDrives=True,
                                  includeItemsFromAllDrives=True).execute()
        if r["files"]:
            return r["files"][0]["id"]
        raise SystemExit(f"De submap '{naam}' ontbreekt in de Drive-map. Maak de mappen Nieuw, Verwerkt en Fout aan.")

    def nieuwe_bestanden(self):
        q = f"'{self.mappen['Nieuw']}' in parents and trashed = false and mimeType != 'application/vnd.google-apps.folder'"
        uit, token = [], None
        while True:
            r = self.svc.files().list(q=q, fields="nextPageToken, files(id,name,createdTime,mimeType)",
                                      pageToken=token, supportsAllDrives=True,
                                      includeItemsFromAllDrives=True).execute()
            for f in r["files"]:
                t = dt.datetime.fromisoformat(f["createdTime"].replace("Z", "+00:00"))
                uit.append({"id": f["id"], "naam": f["name"], "tijd": t, "mime": f["mimeType"]})
            token = r.get("nextPageToken")
            if not token:
                return uit

    def download(self, f, doel):
        from googleapiclient.http import MediaIoBaseDownload
        req = self.svc.files().get_media(fileId=f["id"], supportsAllDrives=True)
        with io.FileIO(doel, "wb") as fh:
            d = MediaIoBaseDownload(fh, req)
            klaar = False
            while not klaar:
                _, klaar = d.next_chunk()

    def verplaats(self, f, naar):
        self.svc.files().update(fileId=f["id"], addParents=self.mappen[naar],
                                removeParents=self.mappen["Nieuw"], fields="id",
                                supportsAllDrives=True).execute()

    def markeer_fout(self, f, tekst):
        # Een service-account heeft geen opslagruimte en kan dus geen bestanden aanmaken in een
        # gewone Drive. Daarom: naam van de pdf aanpassen en de uitleg in de beschrijving zetten.
        self.svc.files().update(fileId=f["id"], body={"name": "FOUT - " + f["naam"], "description": tekst[:4000]},
                                fields="id", supportsAllDrives=True).execute()


# ------------------------------------------------------------------ herkennen
def herken(pad):
    """Bepaalt wat een pdf is: ('ranking'|'stand'|'fs'|None, zitting, datum-iso)."""
    try:
        with pdfplumber.open(pad) as pdf:
            tekst = pdf.pages[0].extract_text() or ""
    except Exception as e:  # geen geldige pdf
        return None, f"Kan het bestand niet lezen als pdf ({e.__class__.__name__}).", ""
    kop = tekst[:400]
    if "competitiestand" in kop:
        soort = "ranking"
    elif "Frequentiestaat" in kop:
        soort = "fs"
    elif "Verzamelstaat" in kop or "Zittingsuitslag" in kop:
        soort = "stand"
    else:
        return None, "Geen uitslag van Bridge-It herkend (verwacht: verzamelstaat, frequentiestaat of competitiestand).", ""
    m = re.search(r"Zitting:\s*(.+)", tekst)
    zitting = m.group(1).strip() if m else ""
    m = re.search(r"Datum:\s*\w+\s+(\d+)\s+(\w+)\s+(\d{4})", tekst)
    datum = f"{m.group(3)}-{MAANDEN[m.group(2).lower()]:02d}-{int(m.group(1)):02d}" if m else ""
    return soort, zitting, datum


def rangtelwoord(n):
    return f"{n}{'ste' if n in (1, 8) or n >= 20 else 'de'}"


def reeks_en_titel(zitting, datum):
    z = zitting.lower()
    if "kroeg" in z:
        editie = int(datum[:4]) - KROEGENDRIVE_EERSTE_JAAR + 1
        return "kroegendrive", f"{rangtelwoord(editie)} Kroegendrive"
    if "gilbert" in z:
        editie = int(datum[:4]) - GILBERT_EERSTE_JAAR + 1
        return "gilbert", f"{rangtelwoord(editie)} Drive Gilbert"
    if "recr" in z:
        return "recreanten", "Recreantentornooi"
    if re.match(r"(di|wo)", z):
        return "", ""
    return None, None


# ------------------------------------------------------------------ verwerken
def verwerk(bron, site=SITE, nu=None):
    nu = nu or dt.datetime.now(dt.timezone.utc)
    verslag = []
    bestanden = bron.nieuwe_bestanden()
    if not bestanden:
        return ["Geen nieuwe bestanden."], False
    gewijzigd = False

    def fout(fs, reden, details=()):
        namen = ", ".join(f["naam"] for f in fs)
        tekst = (f"Deze bestanden konden niet automatisch op de website gezet worden:\n  {namen}\n\n"
                 f"Reden: {reden}\n")
        if details:
            tekst += "\nDetails:\n" + "\n".join(f"  - {d}" for d in list(details)[:40]) + "\n"
        tekst += ("\nWat nu? Kijk of je de juiste pdf's uit Bridge-It hebt opgeslagen en zet ze opnieuw in 'Nieuw'.\n"
                  "Lukt het niet, laat het weten aan de webmaster.\n")
        for f in fs:
            bron.verplaats(f, "Fout")
            bron.markeer_fout(f, tekst)
        verslag.append(f"FOUT: {namen} — {reden}")

    with tempfile.TemporaryDirectory() as tmp:
        stand, fs_ = {}, {}
        for f in bestanden:
            if not f["naam"].lower().endswith(".pdf"):
                fout([f], "Dit is geen pdf-bestand.")
                continue
            pad = Path(tmp) / f"{len(os.listdir(tmp))}.pdf"
            bron.download(f, pad)
            f["pad"] = pad
            soort, zitting, datum = herken(pad)
            if soort is None:
                fout([f], zitting)
            elif soort == "ranking":
                melding, fouten = zet_om_ranking(pad, site)
                if fouten:
                    fout([f], "De ranking kon niet gelezen worden.", fouten)
                else:
                    bron.verplaats(f, "Verwerkt")
                    verslag.append("OK: " + melding)
                    gewijzigd = True
            else:
                doel = stand if soort == "stand" else fs_
                oud = doel.get((zitting, datum))
                if oud:  # zelfde bestand twee keer opgeladen: recentste houden
                    weg, f = (oud, f) if f["tijd"] >= oud["tijd"] else (f, oud)
                    bron.verplaats(weg, "Verwerkt")
                    verslag.append(f"Dubbel bestand overgeslagen: {weg['naam']}")
                doel[(zitting, datum)] = f

        for sleutel in sorted(set(stand) | set(fs_)):
            zitting, datum = sleutel
            s, q = stand.get(sleutel), fs_.get(sleutel)
            if not (s and q):
                f = s or q
                if nu - f["tijd"] > dt.timedelta(hours=WACHTTIJD_UUR):
                    ontbreekt = "frequentiestaat (FS …)" if s else "verzamelstaat"
                    fout([f], f"De {ontbreekt} van deze zitting ({zitting}, {datum}) ontbreekt.")
                else:
                    verslag.append(f"Wacht nog op het tweede bestand van {zitting} ({datum}).")
                continue
            reeks, titel = reeks_en_titel(zitting, datum)
            if reeks is None:
                fout([s, q], f"Onbekende soort zitting: '{zitting}'. Verwacht een dinsdag-/woensdagzitting, "
                             "Kroegendrive, Drive Gilbert of recreantentornooi.")
                continue
            try:
                melding, fouten = zet_om(s["pad"], q["pad"], site, reeks, titel)
            except Exception as e:
                melding, fouten = "", [f"Onverwachte fout bij het lezen: {e.__class__.__name__}: {e}"]
            if fouten:
                fout([s, q], "De controle van de matchpunten klopt niet of de pdf kon niet gelezen worden.", fouten)
            else:
                bron.verplaats(s, "Verwerkt")
                bron.verplaats(q, "Verwerkt")
                verslag.append("OK: " + melding)
                gewijzigd = True
    return verslag, gewijzigd


def main():
    if "--lokaal" in sys.argv:
        map_ = sys.argv[sys.argv.index("--lokaal") + 1]
        site = sys.argv[sys.argv.index("--site") + 1] if "--site" in sys.argv else SITE
        bron = LokaleBron(map_)
    else:
        sleutel, map_id = os.environ.get("GOOGLE_SA_KEY"), os.environ.get("DRIVE_MAP_ID")
        if not sleutel or not map_id:
            print("GOOGLE_SA_KEY en DRIVE_MAP_ID moeten ingesteld zijn.")
            sys.exit(1)
        bron, site = DriveBron(map_id, sleutel), SITE
    verslag, gewijzigd = verwerk(bron, site)
    for r in verslag:
        print(r)
    samenvatting = os.environ.get("GITHUB_STEP_SUMMARY")
    if samenvatting:
        with open(samenvatting, "a", encoding="utf-8") as fh:
            fh.write("### Uitslagen\n\n" + "\n".join(f"- {r}" for r in verslag) + "\n")
    out = os.environ.get("GITHUB_OUTPUT")
    if out:
        with open(out, "a") as fh:
            fh.write(f"gewijzigd={'ja' if gewijzigd else 'nee'}\n")


if __name__ == "__main__":
    main()
