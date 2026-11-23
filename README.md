# Deutsche Provider für DebridUI

Dieses Repository stellt einzelne JavaScript-Provider bereit, die DebridUI über seine Provider-Repository-Funktion laden kann.

## Installation in DebridUI

Repository-Manifest:

`https://raw.githubusercontent.com/cufi12/nuvio-german-audio/main/manifest.json`

In DebridUI unter **Addons / Provider-Repositories** als Repository-URL hinzufügen. Anschließend die gewünschten Provider einzeln aktivieren.

## Enthaltene Provider

- **Serienstream** – Serien und Episoden; Zuordnung über TMDB-Metadaten und Hoster-Auflösung.
- **Netzkino** – Filme aus dem Netzkino-Katalog mit direkten MP4-Streams.
- **ZDF** – Filme und Serien aus der ZDF-Mediathek; es werden nur Audiospuren mit einem deutschen Sprachcode zurückgegeben.
- **Pluto TV** – On-Demand-Filme und -Serien mit HLS-/DASH-Streams. Die Sprache wird nicht für jeden Katalogeintrag garantiert.

## Hinweise

- Provider werden beim Hinzufügen eines Repositorys nicht automatisch aktiviert; sie müssen in DebridUI einzeln eingeschaltet werden.
- DebridUI führt Provider in einer eingeschränkten QuickJS-Umgebung aus. Die Implementierungen verwenden nur die dokumentierten Laufzeitfunktionen.
- Die Quellen können sich ändern, Inhalte können regional gesperrt oder nicht verfügbar sein. CAPTCHA- und Anti-Bot-Sperren werden nicht umgangen.
- Die Provider liefern Such-/Stream-Kandidaten; tatsächliche Wiedergabe, verfügbare Qualität und Audiosprache hängen vom jeweiligen Anbieter und Player ab.
- Der frühere AIOStreams-CEL-Audiofilter ist nicht Bestandteil dieses Repositorys.
- Dieses Projekt ist eine unabhängige Anpassung für DebridUI und wird nicht von Bnyro oder den Streaming-Anbietern betrieben.
- Referenzimplementierungen: [Bnyro/GermanProviders](https://github.com/Bnyro/GermanProviders). DebridUI-Laufzeitgrundlage: [cufi12/debridui](https://github.com/cufi12/debridui).
