"""Haalt de openbare Google Agenda van de club op en schrijft site/data/kalender.js.

Gebruik:  py tools/kalender_naar_data.py            (standaard-agenda bc.eeklo@gmail.com)
          py tools/kalender_naar_data.py --ics bestand.ics

Schrijft enkel als er iets veranderd is. Geeft "gewijzigd=ja|nee" door aan GitHub Actions.
"""
import argparse
import datetime as dt
import json
import os
import sys
import urllib.request
from zoneinfo import ZoneInfo

import icalendar
import recurring_ical_events

STANDAARD_ICS = "https://calendar.google.com/calendar/ical/bc.eeklo%40gmail.com/public/basic.ics"
TZ = ZoneInfo("Europe/Brussels")


def soort_van(titel):
    t = titel.lower()
    if "geen" in t and "bridge" in t:
        return "geen"
    if "avond" in t or "dinsdag" in t:
        return "di"
    if "namiddag" in t or "woensdag" in t:
        return "wo"
    return "event"


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
        item = {"datum": datum.isoformat(), "tijd": tijd, "titel": titel, "soort": soort_van(titel)}
        if laatste > datum:
            item["tot"] = laatste.isoformat()
        plaats = str(ev.get("LOCATION", "")).strip()
        if plaats:
            item["plaats"] = plaats
        items.append(item)
    items.sort(key=lambda i: (i["datum"], i["tijd"] or "99", i["titel"]))
    return items


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
