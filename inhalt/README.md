# inhalt/ – Inhaltsebene

Alles, was ein Redakteur ändern darf, steht hier als JSON (UTF-8) oder als Bild.
Die Gestaltung (HTML, CSS) steht in `vorlagen/` und `assets/` und wird hier nicht angefasst.
Nach jeder Änderung: `python3 bauen.py` (prüft zuerst, baut nur bei 0 Fehlern).

## Dateien

| Datei | Inhalt |
|---|---|
| `seite.json` | Globale Angaben: Firma, Telefon, E-Mail, Adresse, Instagram/Facebook, Städte, Menü-Beschriftungen, Formular, Fußzeile, Veröffentlichung (`domain`, `basis_pfad`, `noindex`) |
| `seiten/<seite>.json` | Inhalt je Seite (13 Dateien) |
| `recht/impressum.html`, `recht/datenschutz.html` | Rechtstexte als HTML-Block; werden nur ins Seitengerüst gesetzt (kein Formular) |
| `bilder.json` | Bildliste mit Standard-Alt-Texten und Logo |
| `schema/*.json` | Maschinenlesbare Feldbeschreibung für ein Admin-Formular (siehe unten) |
| `struktur.json` | Seitenregister, Menüaufbau, Cache-Versionen. Nur für Entwickler, kein Formular |

Eine Öffnungszeiten-Angabe gibt es auf der Seite nicht, deshalb auch kein Feld dafür.

## Regeln

- Leere Felder zählen als nicht vorhanden. Optionale Abschnitte (z. B. `galerie`, `fakten`) einfach weglassen.
- Reihenfolge in Listen = Reihenfolge auf der Seite.
- Unbekannte Felder und fehlende Pflichtfelder bricht `bauen.py` mit einer deutschen Meldung (Datei + Feld) ab.
- Es wird nichts doppelt gepflegt: Telefon, E-Mail, Adresse, Städte und Menünamen stehen nur in `seite.json` bzw. im `name` der jeweiligen Seite.
- Die Formular-Adresse (`formular.aktion`) ist absichtlich ein eigenes Feld und ändert sich NICHT mit der E-Mail (FormSubmit muss pro Adresse bestätigt werden).

## Textformat

Alle Textfelder sind reiner Text. Zeichen wie `&` und `<` werden automatisch maskiert.
Felder mit `"markup": true` im Schema (Fließtexte, Antworten, Absätze) erlauben zusätzlich genau drei Auszeichnungen:

```
<strong>fett</strong>   <em>kursiv</em>   <a href="/carport/">Link</a>
```

- Alles andere (`<script>`, `<div>`, Attribute, `style=...`) wird nicht ausgeführt, sondern als Text angezeigt.
- Absätze sind Listeneinträge (`absaetze`), kein Markup.
- Link-Ziele: `/seite/` (intern, bekommt automatisch den Basis-Pfad), `#anker`, `https://`, `http://`, `mailto:`, `tel:`. Andere (`javascript:` u. ä.) lehnt der Generator ab. Interne Ziele müssen es auch wirklich geben.
- `<strong>`/`<em>`/`<a>` müssen sauber geschlossen sein.

### Platzhalter

In allen Textfeldern der Seiten (und in den Rechtstexten) werden ersetzt:
`{{telefon}}` `{{telefon_tel}}` (Anruf-Link `+49…`) `{{telefon_2}}` `{{telefon_2_tel}}` `{{email}}` `{{strasse}}` `{{plz}}` `{{ort}}` `{{adresse}}` `{{inhaber}}` `{{firma}}`.
Unbekannte Platzhalter sind ein Fehler. So bleibt z. B. die Nummer im Impressum automatisch aktuell.

## Telefonnummern

Es genügt die Anzeige-Schreibweise (`0176 24860016`). Daraus entstehen automatisch der Anruf-Link (`+4917624860016`) und die Schreibweise für Google (`+49-176-24860016`).
Die erste Nummer steht in Kopfzeile, Knöpfen, Fußzeile; weitere nur im Kontaktblock.

## Bilder

- Eine Datei pro Foto gibt es nicht, sondern einen Satz: `images/bestand/<name>-<Breite>.webp`, normalerweise `-800`, `-1600` und `-2048` (4:3, Standard-Ausgabe ist 1600), und optional `<name>.jpg` als Original für Vorschaubilder in Netzwerken.
  Es müssen nicht alle drei Größen vorhanden sein: Der Generator nimmt genau die Größen ins `srcset`, die als Datei da sind (mindestens eine). Die Verwaltung erzeugt nie eine Größe über der Breite des Fotos.
- Neues Foto: normalerweise in der Verwaltung hochladen (Ansicht „Fotos“). Von Hand: Dateien dieses Namensschemas ablegen und in `bilder.json` unter `bilder` eintragen (`name`, `alt`, optional `original`). Danach in der Seite per `bild: "<name>"` verwenden.
- Der Generator schreibt `src`, `srcset`, `sizes`, `width`, `height` selbst. Maße liest er aus dem Kopf der WebP-Datei (die `.webp.json`-Dateien enthalten keine Maße und werden nicht ausgeliefert).
- `alt` an der Einbaustelle (je Seite) hat Vorrang; ist es leer, gilt der Standardtext aus `bilder.json`. Ganz ohne Alt-Text bricht der Bau ab.
- Fehlen Dateien oder fehlt der Eintrag in der Bildliste, meldet `bauen.py` das mit dem Fotonamen.
- Für ein Vorschaubild (`og_bild`) braucht das Foto das Feld `original` und die JPG-Datei; neu hochgeladene Fotos haben beides nicht.
- Die Bildgrößen für `sizes` stehen im Generator (`SIZES`), weil sie zum Layout gehören, nicht zum Inhalt.

## Schema-Format (`schema/*.json`)

Jede Schema-Datei hat `gilt_fuer` (welche Inhaltsdateien sie beschreibt), `titel` und `felder`. Ein Feld:

| Eigenschaft | Bedeutung |
|---|---|
| `schluessel` | Name im JSON (bei Listen-Einträgen entfällt er) |
| `label` | deutsche Beschriftung im Formular |
| `typ` | `text` (eine Zeile), `textarea` (mehrzeilig), `liste`, `bild`, `auswahl`, `janein`, `zahl`, `gruppe` (verschachtelte Felder) |
| `hilfe` | Hilfetext unter dem Feld |
| `pflicht` | `true`/`false` |
| `max` | maximale Zeichenzahl (text/textarea) |
| `muster` | optional, reguläres Ausdrucksmuster für das Format |
| `markup` | `true` = Mini-Markup erlaubt (siehe oben) |
| `felder` | bei `gruppe`: die Unterfelder |
| `eintrag`, `min`, `max`, `eintrag_label` | bei `liste`: Beschreibung eines Eintrags (Feld ohne `schluessel`), erlaubte Anzahl, Bezeichnung des Eintrags |
| `optionen` | bei `auswahl`: Liste aus `wert` und `label` |
| `groesse` | bei `bild`: erwartete Größe (1600 × 1200, 4:3) und Hinweis zu den drei WebP-Dateien |
| `min`/`max` | bei `zahl`: Wertebereich |
| `nur_lesen` | `true` = im Formular nicht änderbar |

`bauen.py` prüft Inhalt und Schema gegeneinander; dieselbe Prüfung kann das Admin-Panel vor dem Speichern nutzen: `python3 bauen.py --pruefen`.
Anzahl der Felder je Schema: `python3 bauen.py --felder`.

Grenzen aus dem Layout (nicht aus dem Inhalt): Galerien (Leistungen, Referenzen) brauchen genau zwei Fotos; die Kurzangaben unter dem Startseiten-Foto genau drei; Ablauf 2 bis 4 Schritte.
