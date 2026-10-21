# bceeklo.be – website Bridgeclub Eeklo

Statische website, gepubliceerd door Netlify vanuit deze repository. Uitslagen worden automatisch
opgehaald uit Google Drive en omgezet.

## Mappen

| Map / bestand | Wat |
|---|---|
| `site/` | De website zelf (dit is wat online staat) |
| `site/data/` | Uitslagen, ranking, Kroegendrive, recreantentornooi (wordt door de robot bijgewerkt) |
| `tools/pdf_naar_data.py` | Zet verzamelstaat + frequentiestaat van Bridge-It om |
| `tools/ranking_naar_data.py` | Zet de individuele competitiestand om |
| `tools/verwerk_drive.py` | Haalt nieuwe pdf's uit Google Drive en verwerkt ze automatisch |
| `.github/workflows/uitslagen.yml` | Laat `verwerk_drive.py` elk halfuur lopen (07–23 u) |
| `netlify.toml` | Netlify publiceert de map `site` |
| `docs/INSTALLATIE.md` | Eenmalige installatie (GitHub, Netlify, Google Drive) |
| `docs/OPLADEN.md` | Handleiding voor de tafelleiders |

## Normaal gebruik

Pdf's in Google Drive › **Uitslagen website › Nieuw** zetten. De rest gaat vanzelf
(zie `docs/OPLADEN.md`). Meteen laten verwerken: GitHub › Actions › *Uitslagen verwerken* › *Run workflow*.

## Met de hand (bv. om iets te testen)

Vanuit de hoofdmap van de repository, na `pip install -r tools/requirements.txt`:

```
py tools\pdf_naar_data.py "Di 08 2026 10 20.pdf" "FS Di 08 2026 10 20.pdf"
py tools\pdf_naar_data.py "Kroegentocht 13 Dec.pdf" "FS Kroegentocht 13 Dec.pdf" --reeks kroegendrive --titel "11de Kroegendrive"
py tools\ranking_naar_data.py "Di C08.pdf" "Wo C07.pdf"
py tools\verwerk_drive.py --lokaal "C:\pad\naar\testmap"      (map met Nieuw/Verwerkt/Fout)
```

Bekijk de site lokaal: `py -m http.server -d site` en open http://localhost:8000.
Daarna **Commit** en **Push** in GitHub Desktop; Netlify zet het online.

## Hoe de robot pdf's herkent

Op basis van de inhoud, niet de bestandsnaam:

- "Verzamelstaat"/"Zittingsuitslag" + "Frequentiestaat" met dezelfde *Zitting* en *Datum* vormen een paar.
- Zitting begint met *Di*/*Wo* → clubdrive; bevat *kroeg* → Kroegendrive (editie = jaar − 2014);
  bevat *recr* → recreantentornooi.
- "Individuele competitiestand" → ranking (dinsdag of woensdag volgens de competitienaam).
- Elke omzetting wordt gecontroleerd (matchpunten per paar = stand). Klopt het niet → map **Fout**,
  en er wordt niets op de site gezet.
