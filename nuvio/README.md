# German Providers für Nuvio

Eigenständige Nuvio-JavaScript-Scraper für deutschsprachige Film- und Serienquellen. Dieses Verzeichnis ist getrennt von der bisherigen DebridUI-Integration.

## Installation in Nuvio

Unter **Settings → Plugins** dieses Repository hinzufügen:

`https://raw.githubusercontent.com/cufi12/nuvio-german-audio/nuvio-plugin-repository/nuvio/manifest.json`

Danach Repository aktualisieren und die gewünschten Scraper aktivieren.

## Enthaltene Scraper

- **CVN-Serienstream** – Serien und Episoden; Hoster-Auflösung.
- **CVN-Netzkino** – Filme mit MP4-Streams.
- **CVN-ZDF** – Filme und Serien; filtert Audio-Tracks nach deutschen Sprachkennungen.
- **CVN-Pluto TV** – On-Demand-Filme und -Serien; Sprache ist nicht für jeden Katalogeintrag garantiert.

## Technische Hinweise

- Manifestformat: Nuvio `scrapers`-Liste.
- Laufzeit: Nuvios QuickJS-Plugin-Runtime; CommonJS `module.exports.getStreams`.
- Verwendet die von Nuvio bereitgestellten `fetch`, `cheerio`, `crypto-js` und `TMDB_API_KEY`-Schnittstellen.
- Die Providerdateien sind eigenständige Kopien. Änderungen an der DebridUI-Version werden nicht automatisch übernommen.
- Syntax-/Manifestprüfung ist keine Bestätigung für erreichbare Anbieter-APIs oder funktionierende Wiedergabe.
- Serienstream, Netzkino, ZDF und Pluto TV wurden in dieser Nuvio-Integration noch nicht live in der App abgespielt. Geo-Sperren, Anbieteränderungen und fehlende Titel können die Ergebnisse beeinflussen.
- Pluto-TV-Live-TV ist nicht enthalten; nur VOD.

## Repository

Die DebridUI-Version bleibt im Repository-Root unter `manifest.json` und `providers/` erhalten.
