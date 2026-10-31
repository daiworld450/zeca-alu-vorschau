---
name: ZeCa-Alu Systemblatt
description: Ein Konstruktions-Datenblatt aus Zeichenblatt, Tinte und Ortstafel-Gelb, auf dem das echte Foto die Hauptansicht ist und Linie, Maßkette und RAL-Feld die Beschriftung sind.
colors:
  blatt: "#EDF1F4"
  glas: "#F9FBFC"
  tinte: "#101733"
  tinte-2: "#46506E"
  alu: "#7A8494"
  daemm: "#2B3F9E"
  daemm-hell: "#DDE3FA"
  licht: "#FFB43C"
  licht-hover: "#FFC56A"
  fehler: "#B3261E"
  ral: "#383E42"
typography:
  display:
    fontFamily: "Archivo, Helvetica Neue, Arial, sans-serif"
    fontSize: "clamp(30px, 5.4vw, 80px)"
    fontWeight: 800
    lineHeight: 0.96
    letterSpacing: "-0.032em"
    fontVariation: "font-stretch 114%"
  headline:
    fontFamily: "Archivo, Helvetica Neue, Arial, sans-serif"
    fontSize: "clamp(28px, 4.3vw, 60px)"
    fontWeight: 800
    lineHeight: 0.96
    letterSpacing: "-0.032em"
    fontVariation: "font-stretch 114%"
  title:
    fontFamily: "Archivo, Helvetica Neue, Arial, sans-serif"
    fontSize: "clamp(19px, 1.5vw, 24px)"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.015em"
    fontVariation: "font-stretch 104%"
  body:
    fontFamily: "Archivo, Helvetica Neue, Arial, sans-serif"
    fontSize: "clamp(16px, 0.35vw + 15px, 18px)"
    fontWeight: 400
    lineHeight: 1.62
  label:
    fontFamily: "Archivo, Helvetica Neue, Arial, sans-serif"
    fontSize: "12.5px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "0.11em"
    fontVariation: "font-stretch 72%"
rounded:
  r: "3px"
  tafel: "2px"
spacing:
  gutter: "clamp(16px, 3.2vw, 44px)"
  sheet: "1360px"
  header: "72px"
  section: "120px"
  section-tablet: "88px"
  section-phone: "64px"
  touch: "44px"
components:
  button-schild:
    backgroundColor: "{colors.licht}"
    textColor: "{colors.tinte}"
    typography: "{typography.title}"
    rounded: "{rounded.r}"
    padding: "0 26px"
    height: "52px"
  button-schild-hover:
    backgroundColor: "{colors.licht-hover}"
  button-tinte:
    backgroundColor: "{colors.tinte}"
    textColor: "#FFFFFF"
    rounded: "{rounded.r}"
    padding: "0 26px"
    height: "52px"
  button-tinte-hover:
    backgroundColor: "{colors.daemm}"
  button-linie:
    backgroundColor: "transparent"
    textColor: "{colors.tinte}"
    rounded: "{rounded.r}"
    padding: "0 26px"
    height: "52px"
  schriftfeld:
    backgroundColor: "{colors.glas}"
    textColor: "{colors.tinte}"
    padding: "16px 20px 18px"
  schriftfeld-marke:
    backgroundColor: "{colors.daemm}"
    textColor: "#FFFFFF"
  zeichnungsfeld:
    backgroundColor: "{colors.glas}"
    padding: "36px"
  ortstafel:
    backgroundColor: "{colors.licht}"
    textColor: "{colors.tinte}"
    rounded: "{rounded.tafel}"
    padding: "8px 18px"
    height: "44px"
  ral-muster:
    backgroundColor: "{colors.glas}"
    textColor: "{colors.tinte}"
    rounded: "{rounded.r}"
    height: "96px"
  formblatt:
    backgroundColor: "{colors.glas}"
    textColor: "{colors.tinte}"
  kopfleiste:
    backgroundColor: "{colors.blatt}"
    textColor: "{colors.tinte}"
    height: "72px"
  logo-plakette:
    backgroundColor: "{colors.tinte}"
    height: "72px"
  cta-flaeche:
    backgroundColor: "{colors.tinte}"
    textColor: "#FFFFFF"
    padding: "56px"
---

# Design System: ZeCa-Alu Systemblatt

## Overview

**Creative North Star: "Das Systemblatt"**

Die Seite ist ein Konstruktions-Datenblatt. Das echte Foto der Terrassenüberdachung ist die Hauptansicht, alles andere ist Beschriftung im Zeichensprachgebrauch: Profillinie, Maßlinie mit Pfeilen, Hilfslinien, Positionsnummern, Schriftfeld, RAL-Farbfeld. Das Blatt ist ein kühles Aluminiumgrau-Weiß, die Tinte ein Dämmerungs-Navy, und genau eine warme Farbe, das Ortstafel-Gelb, ist für Aktion und Ortsnamen reserviert. Die Palette stammt aus den zwei echten Fotos: anthrazitfarbene Pfosten, Dämmerungshimmel, LED-Licht.

Die Seite überzeugt durch Genauigkeit, nicht durch Superlative. Wo ein Datenblatt eine Zahl hätte, steht der Text "nach Aufmaß": die Maßlinie am Hero-Foto und die Maßpfeile in den Zeichnungen tragen Wörter statt erfundener Maße. Geometrie ist eckig (3px), Flächen sind flach, Tiefe entsteht durch 2px-Tintenrahmen und Farbfelder, nicht durch Schatten. Die Dichte ist großzügig (120px Abschnittsabstand) mit harten Linien als Struktur.

Anti-Referenz ist das alte Handwerker-Hero: dunkles Foto mit Scrim, Kupfer-Akzent, drei gleiche Icon-Karten, Pillen-Buttons.

**Key Characteristics:**
- Eine Linienfarbe (Tinte) in zwei bis drei Stärken, Geisterlinien in Alu-Grau gestrichelt für nicht Gebautes.
- Archivo variabel auf zwei Achsen: Display expandiert und schwer, Beschriftung schmal in Versalien.
- Ortstafel-Gelb mit Tintenrand als einziges Aktionssignal.
- Keine Karten, keine Verläufe als Dekor, keine Schatten.
- Das Raster liegt nur in Mess- und Konstruktionsflächen (Zeichnungsfeld, Kartenfläche).

## Colors

Kühles Blatt, dunkle Navy-Tinte, ein Dämmerungsblau als großes Farbfeld und ein einzelnes warmes Gelb. Keine Verläufe, keine Transparenz-Spielerei außer der Tintenlinie bei 20 Prozent.

### Primary
- **Pfosten-Navy-Tinte** (`tinte`, #101733): Text, alle Linien und Rahmen, dunkle Flächen (Logo-Plakette, Footer, CTA-Fläche, mobile Leiste).
- **Dämmerungsblau** (`daemm`, #2B3F9E): großes Farbfeld (Schriftfeld-Marke, Einsatzgebiet-Band, Erfolgsmeldung), Links, Fokusring, Pflichtstern. 8:1 auf dem Blatt, 9:1 mit Weiß.

### Secondary
- **Ortstafel-Gelb** (`licht`, #FFB43C): Aktion und Ortsnamen. Schild-Button, Ortstafeln, aktive Positionsnummer, Textmarkierung. Hover `licht-hover` (#FFC56A). Es erscheint nur dort, wo etwas zu tun oder zu verorten ist.

### Neutral
- **Zeichenblatt** (`blatt`, #EDF1F4): Seitengrund und Kopfleiste.
- **Glasfläche** (`glas`, #F9FBFC): Flächen auf dem Blatt: Schriftfeld, Zeichnungsfeld, Formular, Dropdown.
- **Zweittinte** (`tinte-2`, #46506E): Zweittext, 7:1 auf dem Blatt.
- **Aluminium-Geisterlinie** (`alu`, #7A8494): Geisterlinien, Eingabe-Unterstriche, Trenner; nur Dekor, nie Textfarbe für Inhalt.
- **Dämmerungs-Hell** (`daemm-hell`, #DDE3FA): Text auf Dämmerungsblau und auf Navy (Footer, CTA-Fläche).
- **Linie** (Tinte bei 20 Prozent Deckkraft): Zeilentrenner in Listen.
- **Fehlerrot** (`fehler`, #B3261E): ungültige Formularfelder (Label) und Fehlerrand; Fläche #FDF1F0.
- **RAL-Vorauswahl** (`ral`, #383E42): Füllung der Profile in den Zeichnungen, Anthrazitgrau RAL 7016. Wird per Farbwahl zur Laufzeit überschrieben. Die acht Muster sind echte RAL-Annäherungen (7016, 9005, 6005, 8014, 5014, 9007, 9006, 9016) und beschriften sich mit Namen.

### Named Rules
**The Eine-Tafel Rule.** Gelb markiert Aktion oder Ortsnamen, nie Dekoration. Eine Fläche ohne Aufgabe bekommt kein Gelb.
**The Eine-Tinte Rule.** Jede Linie, jeder Rahmen, jede Zeichnung ist Tinte. Zweite Linienfarbe nur als Alu-Geisterlinie (gestrichelt) oder Weiß auf dunklem Grund.

## Typography

**Display Font:** Archivo variabel (mit Helvetica Neue, Arial), selbst gehostet, SIL OFL, Achsen wght 100-900, wdth 62-125.
**Body Font:** dieselbe Familie, normale Breite.
**Label Font:** dieselbe Familie, schmal (72 Prozent), Versalien.

**Character:** Eine Familie, drei Breiten. Breite, schwere Überschriften lesen sich wie Schildschrift; die schmale Versalienschrift ist die Beschriftung der Zeichnung.

### Hierarchy
- **Display** (800, clamp(30px, 5.4vw, 80px), 0.96, wdth 114%, -0.032em): H1. Unter 1000px wdth 100%, unter 640px wdth 84% und 27-38px, damit die Zeile nicht umbricht.
- **Headline** (800, clamp(28px, 4.3vw, 60px), 0.96, wdth 114%): H2. Mobil wdth 90%.
- **Title** (700, clamp(19px, 1.5vw, 24px), 1.15, wdth 104%): H3. Zeilentitel im Blattverzeichnis und Fakten-Begriffe laufen größer (800, bis 38px, wdth 108-112%).
- **Body** (400, 16-18px fließend, 1.62, max 62ch): Text. Lead 17-22px, max 48ch. Zweittext in `tinte-2`.
- **Label** (600, 12.5px, wdth 72%, 0.11em, Versalien, `tinte-2`): Feldnamen im Schriftfeld, Maßtext, Formular-Labels, Footer-Titel, Zeichnungsbeschriftung. In Gruppenüberschriften der Ortstafeln und der Farbwahl gemischte Schreibung, 14px, wdth 90%.
- **Zahlen:** `tabular-nums` bei Telefon und Kontaktdaten.

### Named Rules
**The Zwei-Breiten Rule.** Breit und schwer für Aussage, schmal und Versalien für Beschriftung. Nichts dazwischen für Überschriften.
**The Selbst-gehostet Rule.** Nur lokale Schrift, keine Anfrage an Dritte.

## Layout

Ein Blatt von maximal 1360px plus Rand (`--gutter`, 16-44px fließend). Inhalte sitzen in 5/7- und 7/5-Spalten (`split`, `kopf-top`, `kopf-bot`, `gal`, `band-grid`) mit fließenden Lücken (28-88px). Abschnittsabstand 120px, unter 1100px 88px, unter 640px 64px; der dunkle Band-Abschnitt bekommt gleichen Raum unten und oben. Kopfleiste 72px (64px unter 1100px), sticky. Umbrüche bei 1100 (Menü wird zur Schublade mit unterer Aktionsleiste), 900, 820, 760, 700, 640, 560 und 520px. Jedes Berührungsziel misst mindestens 44px. Zeilen aus Daten (Blattverzeichnis, Fakten, Werte, FAQ, Kontakt) sind Listen mit 2px-Tintenlinie oben und unten und 1px-Linie dazwischen, keine Karten.

Das Hero-Foto steht in einem 3,2:1-Rahmen (mobil 4:3); die Maßhilfslinien werden in Foto-Koordinaten (1600 x 1200) berechnet und treffen so die Pfosten bei jeder Breite.

## Elevation & Depth

Flach. Das System kennt keine Schatten. Tiefe entsteht aus 2px-Tintenrahmen, dem Wechsel von Blatt zu Glasfläche zu Dämmerungsblau und zu Navy, und aus dem Zeichnungsraster im Zeichnungsfeld. Die Kopfleiste ist halbtransparent mit Unschärfe und bekommt erst beim Scrollen eine 1px-Linie; bei `prefers-reduced-transparency` wird sie deckend. Die Ortstafel trägt einen inneren Doppelrand (Gelb 3px, Tinte 2px bis 5px), das ist Schildgeometrie, kein Schatten. Das aktive Legendenzeichen trägt einen 2px-Ring, die gewählte Farbprobe einen Fokus-Ring.

### Named Rules
**The Flach Rule.** Zustände ändern Farbe, Linie oder Lage um wenige Pixel, nie einen Schatten.

## Shapes

Eckig. Radius 3px (`--r`) für Buttons, Burger, Farbproben, Pfeil-Quadrate und Social-Kacheln; 2px für Ortstafeln und Dropdown-Einträge. Rahmen sind 2px Tinte, innere Trenner 1px. Die einzige runde Form ist die Positionsnummer (Kreis, 28px) am Foto und in der Legende: sie ist Zeichnungsnorm. Zeichnungen verwenden Miter-Ecken, Pfeilspitzen als Dreiecke, 45-Grad-Schraffur für Schnittflächen, Geisterlinien gestrichelt (7 6). Linienstärken der Zeichnung sind Variablen: Kante `--k` 1,5 und Maß `--m` 0,8 als Grundwert, im Blattverzeichnis 3,3 und 1,7 (kleine Darstellung), im Farbfeld 1,35 und 0,75.

## Components

### Schild-Button
Ortstafel-Gelb mit 2px Tintenrand, 3px Radius, Mindesthöhe 52px, 16px / 700 / wdth 106%.
- **Primär:** Gelb (`licht`), Tintentext. Variante Tinte (`btn-ink`): Navy mit Weiß. Variante Linie (`btn-line`): transparent, auf dunklem Grund weißer Rand und Text. Klein: 44px.
- **Hover** (nur `hover:hover` und `pointer:fine`): Gelb hellt auf `licht-hover`, Tinte wird Dämmerungsblau, Linie füllt sich mit Tinte (auf Dunkel: weiß). Pfeil rückt 3px. **Aktiv:** scale .97. **Fokus:** 3px Ring Dämmerungsblau, auf Dunkel Gelb.

### Kopfleiste mit Logo-Plakette
Sticky Streifen in Blatt-Grau. Links das Logo auf einer navyfarbenen Plakette, die bis zum linken Rand reicht, daneben Navigation 15px / 600, aktive Seite mit 3px-Balken, der von links einläuft; Dropdown als Glasfläche mit 2px Rand. Rechts Telefon (ab 1180px) und Schild-Button. Unter 1100px: Burger (2px Rand, drei Striche), Schublade fährt per clip-path von oben, Einträge staffeln sich um 30ms; dazu fest unten eine Tinten-Leiste mit zwei Buttons.

### Blattverzeichnis mit Zeichnungen
Die sechs Leistungen als Zeilenliste: Zeichnung (140-220px), Titel in Schildschrift, Text, 52px-Pfeilquadrat. Hover verschiebt den Titel um 8px, füllt das Pfeilquadrat gelb und zeichnet die Zeichnung neu. Mobil: Zeichnung links 104px, Titel und Text rechts, kein Pfeil.

### Schriftfeld / Datenblatt
Feld mit 2px Rahmen, Zellen mit 1px Trennlinie: Feldname als Label, Wert 16-19px / 600. Auf der Startseite drei Fakten und eine Dämmerungsblau-Zelle mit dem Slogan in Weiß; auf Leistungsseiten als Datenblatt rechts neben dem Zeichnungsfeld (Anfertigung, Konstruktion, Dach, Farbe). Nur echte Fakten.

### Bildbühne mit Maßlinie
Foto im 2px-Rahmen. Unterhalb setzen zwei Hilfslinien an den Pfosten an, dazwischen eine Maßlinie mit Dreiecks-Pfeilen und dem Text "Breite nach Aufmaß" im Label-Stil auf Blatt-Grund. Beim Laden: Foto setzt sich, Hilfslinien blenden ein, die Maßlinie zieht sich von links, der Text kommt zuletzt.

### Zeichnungsfeld mit Raster
Glasfläche mit 24px-Raster (Tinte bei 7 Prozent) und 2px Rahmen; trägt die Alu-Zeichnung (Profile in `ral`-Füllung, Glas Dämmerungsblau bei 13 Prozent, Schraffur, Geisterlinien, Maßketten, Beschriftungsfähnchen). Das Raster gibt es nur hier und in der Kartenfläche.

### RAL-Farbwahl
Die Konstruktion nimmt die gewählte Pulverbeschichtung an: acht Muster (Chip 60px über Namenszeile) als Radiogruppe mit Pfeiltasten, Home und End. Gewähltes Muster hebt sich 4px und trägt einen 3px Dämmerungs-Ring; der Name steht im Kopf des Feldes in Schildschrift. Hinweis, dass Farbtöne am Bildschirm abweichen können, steht darunter.

### Positionsnummern am Foto mit Legende
Nummerierte Kreise (28px, Navy, weißer Rand) liegen in Foto-Koordinaten auf dem Bild; die Legende daneben ist eine Liste von Buttons (`aria-pressed`). Aktiv (Klick oder Hover) wird die Nummer gelb mit Tintenrand und wächst auf 1,35. Beim Einblenden setzen die Nummern gestaffelt um 70ms ein.

### Ortstafeln
Auf Dämmerungsblau: Sitz als große gelbe Tafel (bis 54px), Nachbarstädte als gelbe Tafeln, weitere Städte als weiß umrandete Tafeln. Auf hellem Grund (Unterseite) Tintenrand. Einblenden gestaffelt um 45ms.

### Maßketten-Ablauf
Vier Schritte als Linie mit Teilstrichen an beiden Enden jedes Abschnitts (2px Linie, 2x16px Strich), darunter Titel und Text. Keine Karten, keine Kreise.

### FAQ
Liste aus `details`: 64px hohe Zeile, Frage 17-21px / 700, Pluszeichen aus zwei 2px-Linien, das beim Öffnen um 45 Grad dreht. 2px Linie oben und unten.

### Formular als Schriftfeld
Rahmenblatt mit Titelzeile; Felder sind Zellen eines Gitters (zwei Spalten, mobil eine), Label oben als Versalien, Eingabe nur mit 1,5px Alu-Unterstrich. Fokus: weiße Zelle mit 3px Dämmerungs-Ring nach innen; ungültig: Zellengrund #FDF1F0 und Label in Fehlerrot (`:user-invalid`). Status als 2px-Kasten: Erfolg Dämmerungsblau, Fehler hell mit rotem Rand und Telefon-Alternative.

### CTA-Fläche und Footer
Navy-Fläche mit Frage zur Leistung in Schildschrift, Beratungs-Button und Telefon-Linie. Footer als Schriftfeld in vier Spalten mit 1px-Linien in Weiß bei 28 Prozent.

### Motion
Eintritt einmal je Aufruf: Hero-Zeilen steigen mit `--ease-out` (.7s, gestaffelt 70-260ms), Foto setzt sich (scale 1.03 auf 1), Maßlinie zeichnet sich. Zeichnungen mit `data-draw` zeichnen ihre Linien beim Einblenden (stroke-dashoffset, 1,1s, `--ease-out`), danach Füllungen und Beschriftung. Easings: `--ease-out` cubic-bezier(.23,1,.32,1) für Eintritt und Hover, `--ease-io` cubic-bezier(.77,0,.175,1) bereitgestellt, `--ease-drawer` cubic-bezier(.32,.72,0,1) für die Menüschublade. Hover-Effekte nur unter `@media(hover:hover) and (pointer:fine)`. Dauern 120-300ms für Zustände. `prefers-reduced-motion`: Eintritt wird ein 250ms-Fade, Maßlinie steht sofort, Zeichnungen stehen vollständig, Staffeln und Hebungen entfallen, die Information bleibt gleich.

## Do's and Don'ts

### Do:
- **Do** Linien in Tinte (#101733) mit 2px-Rahmen für Felder, 1px für Zeilentrenner; Zeichnungskanten über `--k`, Maße über `--m`.
- **Do** "nach Aufmaß" als Maßtext schreiben, wo ein Datenblatt eine Zahl hätte.
- **Do** Gelb nur für Aktion und Ortsnamen, immer mit Tintenrand.
- **Do** Radius 3px für Bedienelemente, 2px für Ortstafeln, sonst eckig.
- **Do** Hover in `@media(hover:hover) and (pointer:fine)` kapseln und jede Bewegung mit einer reduced-motion-Alternative versehen.
- **Do** Berührungsziele auf mindestens 44px halten, Fokus als 3px-Ring (auf Dunkel Gelb).
- **Do** Zeichnungen aus Tinte, Geisterlinien (`alu`, gestrichelt) und der RAL-Füllung bauen; Raster nur im Zeichnungsfeld.
- **Do** Fakten aus Belegen nehmen: echte Fotos, Kontaktdaten, benannte RAL-Töne.

### Don't:
- **Don't** Karten bauen: keine umrahmten Kacheln mit Icon, Titel, Text. Daten stehen als Zeilenlisten, Schriftfeld-Zellen oder Maßkette.
- **Don't** Verläufe als Dekor, Scrim über Fotos oder dunkles Foto-Hero.
- **Don't** Schatten für Tiefe, auch nicht bei Hover.
- **Don't** Pillen oder Kreise für Bedienelemente; der Kreis ist allein der Positionsnummer vorbehalten.
- **Don't** Zahlen, Preise, Jahre, Garantien, Bewertungen oder Stimmen erfinden; die Maßlinie trägt "nach Aufmaß".
- **Don't** Stockfoto, KI-Bild oder fremde Gesichter; die Fläche trägt die zwei echten Fotos oder eine Zeichnung.
- **Don't** Schriften von Drittanbietern laden.
- **Don't** das Raster als allgemeinen Hintergrund verwenden.
- **Don't** Beschriftungen als Kicker oder Eyebrow über Überschriften setzen; die Seite hält das nicht als Regel (siehe Hinweis unten).

## Not canonized

Der Stand des Builds trägt Abweichungen, die hier nicht als Regel stehen: In der Maßkette stehen "Schritt 1" bis "Schritt 4" als Label über dem H3 (Eyebrow-Muster), ebenso Gruppenlabels über Ortstafeln und das Label "Beispiel: Pulverbeschichtung nach RAL" über der Farbwahl. Feldnamen im Schriftfeld (Beratung, Leistung, Anfertigung ...) sind dagegen Datenfeldnamen, kein Eyebrow. Das Surface-Brief nennt Dämmerungsblau #2536A6 und Linienstärken 6/2/1; gebaut ist #2B3F9E (Kontrast geprüft) und `--k` 1,5 / `--m` 0,8, gebaut gewinnt. Datenschutz §4 nennt laut Brief noch Inter und Sora.
