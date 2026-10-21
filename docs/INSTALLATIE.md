# Automatisch uitslagen publiceren – eenmalige installatie

Na deze installatie werkt het zo:

> Tafelleider sleept de pdf's uit Bridge-It in Google Drive › **Uitslagen website › Nieuw**
> → binnen het halfuur staan ze op **bceeklo.be** → de pdf's verhuizen vanzelf naar **Verwerkt**
> (of naar **Fout**, met uitleg).

Reken op ongeveer een uur. Gebruik voor alle accounts het functie-adres **webmaster@bceeklo.be**
(een mailforwarder bij Level27 naar de huidige webmaster). Zo blijft het beheer bij de club: bij een
bestuurswissel zet je de forwarder naar de nieuwe webmaster en geef je de wachtwoorden door.

**Bewaar bij de clubgegevens:** wachtwoorden van GitHub en Google, en de **herstelcodes** van de
tweestapsverificatie. Zonder die codes raakt een opvolger er niet meer in.

---

## Stap 1 – GitHub-account en repository

1. Ga naar **github.com › Sign up** en maak een gratis account met **webmaster@bceeklo.be**
   (niet "Continue with Google"; gebruikersnaam bv. `bceeklo`). Kies het gratis plan en zet
   tweestapsverificatie aan.
2. Klik rechtsboven op **+ › New repository**.
   - Repository name: `bceeklo-website`
   - Kies **Private**
   - Vink niets anders aan › **Create repository**.
3. Installeer **GitHub Desktop** (desktop.github.com) en meld je aan met dit account.
4. In GitHub Desktop: **File › Clone repository** › kies `bceeklo-website` › als map bv.
   `C:\Users\Markv\Documents\GitHub\bceeklo-website` › **Clone**.
5. Pak het zip-bestand **bceeklo-website.zip** uit en kopieer de **inhoud** (de mappen `site`, `tools`,
   `docs`, `.github` en de bestanden ernaast) in die gekloonde map.
   Let op: de map `.github` is in Verkenner soms verborgen — zet *Beeld › Verborgen items* aan.
6. In GitHub Desktop zie je nu alle bestanden. Typ onderaan als samenvatting `Eerste versie`
   › **Commit to main** › **Push origin**.

## Stap 2 – Netlify koppelen aan GitHub

1. Netlify › project **bc-eeklo** › **Project configuration › Build & deploy › Continuous deployment**.
2. **Link repository** › **GitHub** › geef Netlify toegang › kies `bceeklo-website`.
3. Branch: `main`. De rest vult Netlify zelf in uit `netlify.toml` (publiceren: map `site`,
   geen build-commando) › **Deploy**.
4. Controleer na een minuut bceeklo.be. Je domein en https blijven gewoon werken.

Vanaf nu publiceert Netlify **elke wijziging op GitHub automatisch**. Slepen naar Netlify is voorbij.

## Stap 3 – Een "robot-account" voor Google Drive

De automatische taak moet de Drive-map kunnen lezen. Daarvoor maak je een service-account.

0. Maak eerst een Google-account voor de club: accounts.google.com › *Account maken* › *Voor mezelf*
   › **"Mijn huidige e-mailadres gebruiken"** › webmaster@bceeklo.be.
1. Ga naar **console.cloud.google.com** (aangemeld als webmaster@bceeklo.be).
2. Bovenaan: **Project kiezen › Nieuw project** › naam `bceeklo-website` › **Maken**.
3. Menu **API's en services › Bibliotheek** › zoek **Google Drive API** › **Inschakelen**.
4. Menu **IAM en beheer › Serviceaccounts › Serviceaccount maken**
   - Naam: `uitslagen-robot` › **Maken en doorgaan** › rollen overslaan › **Klaar**.
5. Klik op het nieuwe account › tabblad **Sleutels › Sleutel toevoegen › Nieuwe sleutel › JSON**
   › **Maken**. Er wordt een `.json`-bestand gedownload. **Dit is een wachtwoord: niet delen,
   niet in de websitemap zetten.**
6. Noteer het e-mailadres van het service-account, iets als
   `uitslagen-robot@bceeklo-website.iam.gserviceaccount.com`.

## Stap 4 – De gedeelde map in Google Drive

1. In de Drive van webmaster@bceeklo.be: maak een map **Uitslagen website**.
2. Maak daarin drie mappen: **Nieuw**, **Verwerkt** en **Fout** (exact zo geschreven).
3. Klik rechts op **Uitslagen website › Delen**:
   - voeg het e-mailadres van het service-account toe als **Bewerker**
     (vink *Personen een melding sturen* uit);
   - voeg de tafelleiders toe als **Bewerker**.
4. Open de map **Uitslagen website**. Het adres in je browser eindigt op
   `…/folders/1AbCdEf…` — dat laatste stuk is de **map-ID**. Kopieer het.

## Stap 5 – Sleutel en map-ID in GitHub zetten

In github.com › repository `bceeklo-website` › **Settings › Secrets and variables › Actions**:

1. Tabblad **Secrets › New repository secret**
   - Name: `GOOGLE_SA_KEY`
   - Secret: open het `.json`-bestand met Kladblok, kopieer **alles** en plak het hier › **Add secret**.
2. Tabblad **Variables › New repository variable**
   - Name: `DRIVE_MAP_ID`
   - Value: de map-ID uit stap 4 › **Add variable**.
3. Verwijder daarna het `.json`-bestand van je computer (het staat nu veilig in GitHub).

## Stap 6 – Testen

1. Sleep een verzamelstaat + frequentiestaat in **Uitslagen website › Nieuw**.
2. GitHub › tabblad **Actions** › **Uitslagen verwerken** › **Run workflow** (meteen laten lopen
   in plaats van op het volgende halfuur te wachten).
3. Na ± 1 minuut: groen vinkje. Klik erop om de samenvatting te zien.
4. In Drive staan de pdf's nu in **Verwerkt**; na nog ± 1 minuut staat de uitslag op bceeklo.be.

---

## Daarna: wijzigingen aan de website

- De **GitHub-repository is nu de enige echte versie** van de site. De oude map
  `OneDrive\…\Projects\Bridgeclub website` mag je hernoemen naar `… (archief)`.
- Werk je zelf iets bij: open GitHub Desktop, klik eerst **Fetch origin / Pull** (de robot zet
  er intussen nieuwe uitslagen bij), pas aan, **Commit** en **Push**.
- Claude kan ook rechtstreeks in de repository werken als je die koppelt; dan hoef je zelf
  niets te kopiëren.

## Kosten en limieten

Alles gratis: GitHub (privé-repository, ± 1.000 van de 2.000 gratis minuten per maand),
Netlify (gratis plan), Google Cloud (Drive API binnen de gratis limieten).

## Problemen

| Wat zie je | Oplossing |
|---|---|
| Actions: rood kruis, "GOOGLE_SA_KEY en DRIVE_MAP_ID moeten ingesteld zijn" | Stap 5 nakijken (namen exact zo). |
| "De submap 'Nieuw' ontbreekt" | Stap 4.2: mappen Nieuw, Verwerkt, Fout aanmaken. |
| "403" / "insufficient permissions" | Het service-account is geen Bewerker van de map (stap 4.3). |
| Pdf staat in **Fout** | Naam begint met "FOUT – ". Rechtsklik › *Bestandsinformatie* › *Details*: daar staat de reden. |
| Bestand blijft in **Nieuw** staan | Het tweede bestand van die zitting ontbreekt nog; na 12 uur gaat het naar Fout. |
