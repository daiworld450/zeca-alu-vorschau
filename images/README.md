# Bildbedarf ZeCa-Alu

## Vorhanden (echt, von der alten Seite übernommen)
- `bestand/terrasse-doppelhaus-1.jpg`, `bestand/terrasse-doppelhaus-2.jpg` – Terrassenüberdachung Doppelhaus, Mülheim an der Ruhr
- `bestand/logo-original.jpg` – Firmenlogo (907×144)

## Noch gebraucht (echte Fotos vom Inhaber, keine KI-Bilder)
Pro fehlendem Foto: Format möglichst quer, gute Auflösung (mind. 1600 px breite Seite), am besten bei Tageslicht.

| Wo im Code | Was |
|---|---|
| `/carport/` – `.split-media` | Fertiges Carport-Projekt, Gesamtansicht |
| `/wintergarten/` – `.split-media` | Fertiger Wintergarten, Innen- oder Außenansicht |
| `/alu-zaun/` – `.ph`-Platzhalter | Fertiger Zaun/Sichtschutz |
| `/fliegengitter/` – `.ph`-Platzhalter | Montiertes Fliegengitter (Fenster oder Tür) |
| `/referenzen/` – drei `.gallery-item.ph`-Kacheln | Je ein weiteres abgeschlossenes Projekt (Carport, Wintergarten, Zaun) |
| Startseite Referenzen-Kachel | Ein drittes Projektfoto, sobald vorhanden |

Sobald neue Fotos da sind: in `images/bestand/` (oder einen neuen Unterordner je Projekt) legen,
in der jeweiligen HTML-Datei den `.ph`-Platzhalterblock durch ein `<img>`-Tag ersetzen
(Vorlage siehe `/terrassenueberdachung/`, Abschnitt „Referenz").
