# Kaartenkluis

Collectietracker voor je kaarten met een booster pack opener: kaarten die je toevoegt
komen eerst in een pakje, dat je openscheurt en kaart voor kaart onthult. Zeldzame kaarten
krijgen een holografisch tilt-effect.

## Wat zit erin
- **Collectie**: al je kaarten met aantal, zeldzaamheid en geschatte waarde (Cardmarket-trend, EUR).
- **Toevoegen**: zoek op naam, tik kaarten in je pakje, scheur het open.
- **Sets**: voortgang per set, filter op "heb ik" / "mis ik nog".
- **Beheer**: prijzen verversen, kaarttaal, back-up (JSON), CSV-import (experimenteel).

Kaartdata, afbeeldingen en prijzen komen van [TCGdex](https://tcgdex.dev) (gratis, geen sleutel).
Je collectie wordt lokaal in de browser bewaard (localStorage), per apparaat.

## Lokaal draaien (Mac)
Dubbelklik op `index.html`, of voor de volledige app-ervaring:

    cd kaartenkluis
    python3 -m http.server 8000

en open http://localhost:8000

## Op iPhone en iPad zetten
De app moet daarvoor via https bereikbaar zijn. Gratis kan dat met GitHub Pages:
1. Maak een repository op GitHub en upload alle bestanden uit deze map.
2. Settings → Pages → Source: "Deploy from a branch", branch `main`, map `/ (root)`.
3. Open de link in Safari → Deel → "Zet op beginscherm".

Zet je collectie over met Beheer → Back-up downloaden / terugzetten.

## Bestanden
- `index.html`, `styles.css`, `app.js`: de app (geen build-stap, geen dependencies)
- `sw.js`, `manifest.webmanifest`, `icon*`: installeerbaar maken en offline starten

Dit is een persoonlijk hobbyproject en is niet verbonden aan of goedgekeurd door
Nintendo, The Pokémon Company, Collectr of Cardmarket.
