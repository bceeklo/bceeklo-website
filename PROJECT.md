# Project: nieuwe website Bridgeclub Eeklo

## Doel
De oude Google Sites-site (https://sites.google.com/site/bceeklo, beheerd door iemand anders) vervangen door een moderne, mobielvriendelijke statische website met doorklikbare uitslagen.

## Gekozen aanpak (19 okt 2026)
- **Optie 3: statische site** (HTML/CSS/JS), gratis te hosten op Netlify, Cloudflare Pages of GitHub Pages.
- Eigen domeinnaam aanbevolen (bv. bceeklo.be, nog te checken).
- Uitslagen: Bridge-It pdf's (verzamelstaat + frequentiestaat) → `tools/pdf_naar_data.py` → `data/<datum>-<dag>.js`.
- Uitslagenpagina: stand → persoonlijke uitslag per paar (per ronde) → alle resultaten per spel met verdeling.

## Status
- [x] Ontwerp homepage (Design-canvas "Bridgeclub Eeklo – nieuwe website")
- [x] Werkende testsite gepubliceerd als artifact "Bridgeclub Eeklo"
- [x] Nieuw clublogo verwerkt (19 okt): huisstijl marineblauw #0B2347, goud #BD964A, rood #A41C1F; koppen Source Serif 4, woordmerk Cinzel; logo in kop, hero, voet, favicon en deelbeeld (assets/img/)
- [x] Omzetscript, getest op Di Z 7 van 13 okt 2026 (25 paren, 28 spellen, MP-controle OK)
- [ ] Script testen op een woensdagzitting en een speciale drive (bv. Drive Gilbert, Kroegendrive)
- [ ] Voorleggen aan bestuur en huidige beheerder
- [x] Live op https://bceeklo.be (Netlify-project bc-eeklo, DNS bij Level27: A @ → 75.2.60.5, CNAME www → bc-eeklo.netlify.app.)
- [ ] www.bceeklo.be: CNAME-waarde controleren (moet eindigen op een punt)
- [x] Lessensite op https://lessen.bceeklo.be (Netlify-project prismatic-sable-21bc03, CNAME lessen), gelinkt vanaf homepage
- [ ] Kalender automatisch uit Google-agenda bc.eeklo@gmail.com
- [x] Pagina club.html: geschiedenis, bestuur, clubkampioenen, ranking-uitleg, Kroegendrive, recreantentornooi, pers, partner gezocht, ledenzone, suggesties, links (documenten gelinkt uit Drive bc.eeklo@gmail.com)
- [x] Rankingpagina ranking.html (dinsdag/woensdag, plaats/naam/zittingen/gem., detail per zitting) + tools/ranking_naar_data.py
- [x] Uitslagen-tabs: Clubdrives · Ranking · Kroegendrive · Recreantentornooi · Clubkampioenen (kampioenen/ranking/evenementen weg uit club.html)
- [ ] Kroegendrive- en recreantentornooi-uitslagen (alle jaren) omzetten met --reeks
- [ ] Nog aan te vullen op club.html: clubreglement 25-26, uitnodiging Kroegendrive 2026, persartikels vanaf 2018
- [ ] Info aanvullen: data/prijs volgende cursus, toegankelijkheid clublokaal
- [ ] Algemeen clubmailadres i.p.v. privéadressen op de site
- [ ] Automatisch publiceren: Google Drive › Uitslagen website › Nieuw → GitHub Action → Netlify (code klaar, installatie: docs/INSTALLATIE.md)

## Ideeën voor later
- Ranking over meerdere zittingen berekenen uit de data

## Structuur
Zie README.md. Website in `site/`, scripts in `tools/`, handleidingen in `docs/`.
