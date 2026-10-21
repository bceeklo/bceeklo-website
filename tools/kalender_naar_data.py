"""Haalt de openbare Google Agenda van de club op en schrijft site/data/kalender.js.

Gebruik:  py tools/kalender_naar_data.py            (standaard-agenda bc.eeklo@gmail.com)
          py tools/kalender_naar_data.py --ics bestand.ics

Schrijft enkel als er iets veranderd is. Geeft "gewijzigd=ja|nee" door aan GitHub Actions.
"""
import argparse
import datetime as dt
import json
import os
import re
import sys
import urllib.request
from zoneinfo import ZoneInfo

import icalendar
import recurring_ical_events

STANDAARD_ICS = "https://calendar.google.com/calendar/ical/bc.eeklo%40gmail.com/public/basic.ics"
TZ = ZoneInfo("Europe/Brussels")


STANDAARD_UUR = {"di": "19.30", "wo": "14.00"}
NAAM = {"di": "Avondcompetitie", "wo": "Namiddagcompetitie"}


def soort_van(titel):
    t = titel.lower()
    if "geen" in t and "bridge" in t:
        return "geen"
    if "avond" in t or "dinsdag" in t or re.match(r"din?\b", t):
        return "di"
    if "namiddag" in t or "woensdag" in t or re.match(r"woe?\b", t):
        return "wo"
    return "event"


def mooie_titel(titel, soort):
    """"Di Comp 08" -> "Avondcompetitie · zitting 08"; "12° Kroegendrive" -> "12de Kroegendrive"."""
    m = re.match(r"(?i)(din?|woe?)\s+comp\w*\.?\s*(?:zitting\s*)?(\d+)\s*$", titel)
    if m and soort in NAAM:
        return f"{NAAM[soort]} · zitting {int(m.group(2)):02d}"
    def rangtelwoord(m):
        n = int(m.group(1))
        return f"{n}{'ste' if n in (1, 8) or n >= 20 else 'de'} "
    return re.sub(r"(\d+)\s*°\s*", rangtelwoord, titel).strip()


def lees(ics_bytes, vandaag=None):
    vandaag = vandaag or dt.datetime.now(TZ).date()
    cal = icalendar.Calendar.from_ical(ics_bytes)
    van, tot = vandaag - dt.timedelta(days=1), vandaag + dt.timedelta(days=400)
    items = []
    for ev in recurring_ical_events.of(cal).between(van, tot):
        titel = str(ev.get("SUMMARY", "")).strip()
        if not titel:
            continue
        start, eind = ev.decoded("DTSTART"), ev.decoded("DTEND") if ev.get("DTEND") else None
        if isinstance(start, dt.datetime):
            start = start.astimezone(TZ) if start.tzinfo else start.replace(tzinfo=TZ)
            datum, tijd = start.date(), start.strftime("%H.%M")
            laatste = eind.astimezone(TZ).date() if isinstance(eind, dt.datetime) else datum
        else:  # hele dag; DTEND is exclusief
            datum, tijd = start, ""
            laatste = (eind - dt.timedelta(days=1)) if isinstance(eind, dt.date) else start
        soort = soort_van(titel)
        if not tijd and soort in STANDAARD_UUR:
            tijd = STANDAARD_UUR[soort]
        item = {"datum": datum.isoformat(), "tijd": tijd, "titel": mooie_titel(titel, soort), "soort": soort}
        if laatste > datum:
            item["tot"] = laatste.isoformat()
        plaats = str(ev.get("LOCATION", "")).strip()
        if plaats:
            item["plaats"] = plaats
        items.append(item)
    items.sort(key=lambda i: (i["datum"], i["tijd"] or "99", i["titel"]))
    # dezelfde activiteit op opeenvolgende dagen (bv. festival za + zo) -> één regel "29–30 jan"
    samen = []
    for i in items:
        v = samen[-1] if samen else None
        if (v and v["soort"] == "event" and i["soort"] == "event" and not v["tijd"] and not i["tijd"]
                and v["titel"] == i["titel"]
                and dt.date.fromisoformat(v.get("tot", v["datum"])) + dt.timedelta(days=1) == dt.date.fromisoformat(i["datum"])):
            v["tot"] = i.get("tot", i["datum"])
            continue
        samen.append(i)
    return samen


def schrijf(items, site="site"):
    pad = os.path.join(site, "data", "kalender.js")
    tekst = ("/* Automatisch gemaakt uit de Google Agenda van de club (tools/kalender_naar_data.py). */\n"
             "window.KALENDER = [\n" + ",\n".join(json.dumps(i, ensure_ascii=False) for i in items) + "\n];\n")
    oud = open(pad, encoding="utf-8").read() if os.path.exists(pad) else ""
    if oud == tekst:
        return False
    with open(pad, "w", encoding="utf-8") as fh:
        fh.write(tekst)
    return True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ics", help="lokaal .ics-bestand of url (standaard: agenda van de club)")
    ap.add_argument("--site", default="site")
    a = ap.parse_args()
    bron = a.ics or os.environ.get("KALENDER_ICS") or STANDAARD_ICS
    if bron.startswith("http"):
        with urllib.request.urlopen(bron, timeout=30) as r:
            data = r.read()
    else:
        data = open(bron, "rb").read()
    items = lees(data)
    if not items:
        print("Kalender: geen komende activiteiten gevonden; kalender.js niet aangepast.")
        gewijzigd = False
    else:
        gewijzigd = schrijf(items, a.site)
        print(f"Kalender: {len(items)} activiteiten, {'bijgewerkt' if gewijzigd else 'ongewijzigd'}.")
    for k in ("GITHUB_OUTPUT",):
        if os.environ.get(k):
            with open(os.environ[k], "a") as fh:
                fh.write(f"gewijzigd={'ja' if gewijzigd else 'nee'}\n")
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a") as fh:
            fh.write(f"\n## Kalender\n\n{len(items)} komende activiteiten"
                     f"{' – bijgewerkt' if gewijzigd else ''}.\n")


if __name__ == "__main__":
    sys.exit(main())
