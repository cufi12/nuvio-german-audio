# Nuvio – deutsche Audiospuren

Diese Ablage enthält eine AIOStreams-CEL-Variante, die Streams mit einer erkannten deutschen Audiospur bevorzugt und Streams ohne bestätigte deutsche Audiospur ausschließt.

## Dateien

- `aiostreams-german-audio.cel` – CEL-Variante für AIOStreams.

## Wichtig

Diese Datei ist **kein eigenständiges Stremio-/Nuvio-Addon und keine fertige Manifest-URL**. Sie muss in einer AIOStreams-Konfiguration als Variante hinterlegt und dort gespeichert werden.

Der Filter verlangt eine von AIOStreams erkannte deutsche Audiospur. Dafür müssen Audio-Track-Metadaten verfügbar sein. Streams ohne auslesbare Track-Informationen werden absichtlich ausgeschlossen; dadurch kann die Ergebnisliste kleiner werden.

Der Filter verlangt mindestens eine deutsche Audiospur. Er garantiert nicht, dass eine Datei keine zusätzlichen anderssprachigen Audiospuren enthält.

## Verwendung

1. AIOStreams-Konfiguration öffnen: https://aiostreams.elfhosted.com/stremio/configure
2. In der Konfiguration den Bereich für CEL-Varianten öffnen.
3. Den Inhalt aus `aiostreams-german-audio.cel` als neue Variante einfügen.
4. Speichern und anschließend die persönliche Manifest-URL in Nuvio unter **Einstellungen → Addons → Add Addon** hinzufügen.
