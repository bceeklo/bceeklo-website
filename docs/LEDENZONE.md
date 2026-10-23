# Ledenzone (testversie) — bceeklo.be/ledenzone_test

Afgeschermd deel van de site: leden loggen in met hun **Google-account**; enkel adressen op de lijst krijgen toegang.
Wie ingelogd is, blijft dat 180 dagen op dat toestel. De lijst wordt bij elk bezoek gecontroleerd:
wie geschrapt wordt, verliest meteen de toegang.

## Hoe het werkt
- `site/ledenzone-login.html` — openbare loginpagina met de knop "Inloggen met Google".
- `netlify/functions/ledenzone.mjs` — controleert het Google-antwoord en de adressenlijst en zet een ondertekende cookie.
- `netlify/edge-functions/ledenzone.js` — houdt alles onder `/ledenzone_test/` tegen op de server zonder geldige login
  (ook pdf's en afbeeldingen in die map).
- `site/ledenzone_test/` — de afgeschermde inhoud (nu enkel een testpagina).

## Eenmalig instellen

### 1. Google OAuth-client aanmaken (± 10 minuten)
Bij voorkeur met een clubaccount, niet je persoonlijk account.
1. Ga naar <https://console.cloud.google.com> en maak een nieuw project, bv. **Bridgeclub Eeklo**.
2. **APIs & Services › OAuth consent screen** (heet nu ook "Google Auth Platform"):
   - User type: **External**
   - App-naam: *Bridgeclub Eeklo*, support-e-mail en contact-e-mail invullen
   - Scopes: niets toevoegen (enkel e-mailadres en naam, die zijn standaard)
   - Daarna **Publish app** (status "In production"). Zolang de status "Testing" is, kunnen enkel
     uitdrukkelijk toegevoegde testgebruikers inloggen.
3. **Credentials › Create credentials › OAuth client ID**
   - Application type: **Web application**
   - Authorized JavaScript origins: `https://bceeklo.be` (en `https://www.bceeklo.be` als die ook gebruikt wordt)
   - Redirect URIs: leeg laten
4. Kopieer de **Client ID** (eindigt op `.apps.googleusercontent.com`). Het client secret is niet nodig.

### 2. Netlify › Site configuration › Environment variables
| Variabele | Waarde |
|---|---|
| `LEDENZONE_GOOGLE_CLIENT_ID` | de Client ID uit stap 1 |
| `LEDENZONE_GEHEIM` | lange willekeurige tekst (bv. 40 tekens), niemand hoeft die te kennen |
| `LEDENZONE_ADRESSEN` | e-mailadressen met toegang, gescheiden door komma's |

Na het toevoegen of wijzigen: **Deploys › Trigger deploy** zodat de functies de nieuwe waarden zien.

## Testen
1. Ga naar <https://bceeklo.be/ledenzone_test> → je komt op de loginpagina.
2. Log in met een adres op de lijst → je ziet de testpagina met "Ingelogd als …".
3. Log in met een adres dat niet op de lijst staat → melding "staat niet op de lijst".
4. "Afmelden" werkt; daarna wordt `/ledenzone_test` opnieuw tegengehouden.

## Later (definitieve versie)
- Adressenlijst uit een Google Sheet in de clubmap halen, zodat het bestuur ze zelf bijhoudt.
- Map hernoemen naar `/leden/` en een link in het menu zetten.
- Eventueel een tweede inlogmanier (inloglink per mail) voor leden zonder Google-account.
