# ZeCa-Alu – Webseite (Generator-Stand)

Die Seite wird aus Inhalten (JSON + Bilder) und Vorlagen **generiert**. Das Ergebnis liegt in `_site/`
(statische Dateien, keine laufenden Kosten) und ist DOM-gleich zur abgenommenen handgeschriebenen Seite.

## Bauen

```
python3 bauen.py            # Prüfung + Seite nach _site/ (nur Python 3 Standardbibliothek, getestet mit 3.9)
python3 bauen.py --pruefen  # nur prüfen (Pflichtfelder, Bilder, Links), nichts schreiben
python3 bauen.py --felder   # Zahl der Formularfelder je Schema-Datei
python3 pruefen_gleich.py   # _site gegen referenz-original/ vergleichen (soll: 0 Abweichungen)
python3 pruefen_aenderung.py   # Änderungs-Tests an temporären Kopien (Telefon, E-Mail/Adresse, Vorschau-Modus, Fehlerfälle, Wirkung aller Felder)
```

Bei einem Fehler (fehlendes Pflichtfeld, unbekanntes Foto, kaputter Link, zu langer Text, ungültiges JSON) bricht
`bauen.py` mit einer deutschen Meldung (Datei + Feld) ab; eine vorhandene `_site/` bleibt dann unverändert.

## Struktur

```
inhalt/                 Inhalte (hier wird geändert) – Details: inhalt/README.md
  seite.json              Firma, Telefon, E-Mail, Adresse, Städte, Menü-/Formulartexte, domain, basis_pfad, noindex
  seiten/*.json           je Seite ein Inhalt (13)
  recht/*.html            Impressum, Datenschutz (HTML-Block)
  bilder.json             Bildliste + Alt-Texte
  schema/*.json           Feldbeschreibung für Admin-Formulare
  struktur.json           Seitenregister, Menüaufbau (nur Entwickler)
admin/                  Verwaltungsseite (/admin/), siehe Abschnitt „Verwaltung“
.github/workflows/      veroeffentlichen.yml: Seite bauen und über GitHub Pages veröffentlichen
.github/skripte/        pruefe_inhalt_branch.py: Schutz des Zweigs „inhalt“ (nur Inhalte und Bilddateien)
vorlagen/               HTML-Vorlagen (basis.html, seiten/, teile/) und SVG-Zeichnungen (zeichnungen/)
assets/                 style.css, main.js, Schrift (unverändert kopiert*)
images/bestand/         Fotos (<name>-<Breite>.webp oder .jpg je nach Feld "format", meist 800/1600/2048, optional <name>.jpg) und Logo
favicon.svg
bauen.py  pruefen_gleich.py  pruefen_aenderung.py
einrichten.sh           Vorlage (gh-Befehle) für die einmalige Einrichtung: Zweige, Rulesets, Pages, Umgebung. NICHT automatisch ausführen
referenz-original/      die 13 abgenommenen Handseiten (Vergleichsbasis, nicht bearbeiten)
PRODUCT.md  DESIGN.md   Produktwahrheit und Gestaltungssystem
ADMIN-ANLEITUNG.md      Anleitung für den Inhaber (Schlüssel, Texte, Fotos, Veröffentlichen) und Anhang für Entwickler (Go-live)
_site/                  Ausgabe (nicht im Git)
```

\* `style.css` und `main.js` bleiben im Quellordner unverändert. Beim Bauen werden nur zwei Stellen angepasst:
die Schrift-URL in `style.css` bekommt den `basis_pfad`, und die Fehlermeldung des Formulars in `main.js`
bekommt Telefon/E-Mail aus `seite.json` (sonst stünde dort bei einer neuen Nummer weiter die alte).
Mit `basis_pfad: "/"` ist beides byte-identisch zur Quelle.

## Verwaltung (admin/)

`admin/` ist ein Verwaltungsbereich der fertigen Seite (`/admin/`): Telefonnummer, Texte, Leistungen, FAQ, Einsatzgebiet und
Referenzen lassen sich dort ohne Technik ändern, Fotos hochladen und löschen eingeschlossen. Nur Vanilla-JS (ES-Module), keine Fremdressourcen, keine Server. Die Seite
liest und schreibt die Dateien in `inhalt/` und `images/` direkt im GitHub-Projekt (`admin.repo`, `admin.branch` in `inhalt/seite.json`; Zweig **`inhalt`**, der Code liegt auf **`main`**) über
die GitHub-API mit einem fein begrenzten Zugangsschlüssel des Inhabers. Veröffentlichen = ein Commit; jede Änderung steht im Verlauf
und lässt sich zurücknehmen. `bauen.py` kopiert `admin/` nach `_site/admin/` (nur bei `admin.aktiv: true`, ohne `test/`) und erzeugt
`_site/admin/konfig.json`; `robots.txt` sperrt `/admin/` immer.

**Vorschau-Herkunft:** Der Schlüssel liegt im `localStorage` der Herkunft, unter der die Verwaltung geöffnet wird. Den echten Schlüssel nur auf der eigenen Domain (`https://zeca-alu.de/admin/`) benutzen. Eine Vorschau unter `https://<konto>.github.io/<projekt>/admin/` teilt sich die Herkunft `<konto>.github.io` (und damit den `localStorage`) mit allen anderen Pages-Projekten des Kontos: dort nur Test-Schlüssel oder kurzlebige Schlüssel verwenden und danach bei GitHub löschen.

Schutz vor Einbettung in fremde Seiten (Clickjacking): `admin.css` blendet die Seite aus (`html{visibility:hidden}`), `admin.js` macht sie nur sichtbar, wenn sie das oberste Fenster ist (`window.top === window.self`); ohne JavaScript lädt `<noscript>` `ohne-js.css`, damit der Hinweis „braucht JavaScript“ sichtbar ist. Die `<meta>`-Richtlinie kann `frame-ancestors` nicht.

Zugangsschlüssel (GitHub, „Fine-grained personal access token“): nur dieses Projekt, Contents Read and write, Actions Read-only,
Metadata Read-only, **kein** „Workflows“ und kein „Administration“, Ablauf 30 bis 90 Tage. Im Browser gespeichert (localStorage, nur dort):
`zeca-admin.schluessel` (Schlüssel), `zeca-admin.entwurf` (ungespeicherte Änderungen), `zeca-admin.laufend` (Bauauftrag unter Beobachtung).
Einen Anmelde-Link mit Schlüssel gibt es nicht (entfernt: ein Schlüssel in der Adresse landet in Verlauf und Lesezeichen); ein alter Link `#schluessel=…` wird nicht ausgewertet und der Schlüssel sofort aus der Adresszeile gelöscht. „Abmelden“ löscht alle drei Einträge im Browser, **widerruft den Schlüssel bei GitHub aber nicht** (Widerruf: ADMIN-ANLEITUNG.md, Abschnitt 7).

Tests (ohne echten Schlüssel, alles lokal):

```
node admin/test/unit.mjs        # Prüfregeln, Ausgabeformat (byte-gleich), Markup
node admin/test/api.test.mjs    # GitHub-Client gegen den Mock (Commit mit Fotos, Kollision, Rückgängig, Wiederherstellen, Lauf-Zuordnung)
node admin/test/fotos.test.mjs  # Foto-Logik: Größen, Dateinamen, Prüfungen, Verwendung, Zählung, JPEG-Format
python3 bauen.py && python3 admin/test/mock_github.py   # Mock auf http://127.0.0.1:8791/admin/ (Schlüssel: test-token)
```

Browser-Tests (im Browser-Fenster, gegen den Mock, siehe Kopf der Dateien): `admin/test/browser_foto_test.js` (Foto-Upload, Phasen 1 bis 4) und `admin/test/browser_teilb_test.js` (Teil B der Bedienbarkeitsprüfung: `befund12` Fokus und Leistenhöhe, `befund3` Rückgängig, `befund4` Abmelden, `befund5` Fokus der Leiste, `jpegRueckfall` Browser ohne WebP, `befund7`/`befund8`/`befund9` Semantik, Verständlichkeit, Kleinigkeiten, `messwerte` Zielgrößen und Kontraste). Fenstergrößen: 375×812, 1440×900 und 320×256 (400 % Zoom).

Der Mock (`admin/test/mock_github.py`) bildet die benutzten GitHub-Endpunkte nach und läuft auf derselben Herkunft wie die Seite,
damit die echte Content-Security-Policy gilt. `admin/test/konfig.test.json` wird nur auf localhost gelesen und gehört nicht in `_site/`.

### Fotos

Ansicht „Fotos“ (`#/fotos`) und jedes Bildfeld in den Formularen („Foto wählen …“ mit Vorschau und Bildbeschreibung, „Neues Foto hochladen“).

- **Hochladen:** `<input type=file accept="image/*">` (Handy: Kamera oder Galerie) und Ziehen und Loslassen am Computer. Im Browser (Zeichenfläche, `bild.js`)
  entstehen WebP-Dateien (Qualität 0,82) in 800, 1600 und 2048 Pixel Breite, **nie größer als das Original** (ein Foto mit 1200 px bekommt nur 800;
  unter 800 px eine Datei in Originalbreite). Die Drehung aus den Aufnahmedaten (EXIF) wird angewendet. Durch das Neuzeichnen verschwinden alle Aufnahmedaten,
  auch der Standort (GPS); der Dialog sagt das. Hintergrund weiß, damit die Dateien keinen Alphakanal haben (so liest `bauen.py` die Maße aus dem einfachen WebP-Kopf).
- **Prüfungen:** Datei höchstens 25 MB, JPEG/PNG/WebP (HEIC nur, wenn der Browser es öffnen kann, sonst Hinweis: vorher als JPEG speichern). **Die Maße werden vor dem Dekodieren aus dem Dateikopf gelesen** (`bildMasse` in `fotos.js`, JPEG/PNG/WebP) und Bilder über 150 Millionen Bildpunkten abgelehnt, ebenso Dateien, deren Kopf nicht zum angegebenen Typ passt (Schutz vor winzig gepackten Riesenbildern),
  Bildbeschreibung ist Pflicht (8 bis 200 Zeichen, nicht „Bild von …“), Vorschau vor dem Übernehmen, Datenschutzhinweis (Personen, Kennzeichen).
- **Dateiname:** Kleinbuchstaben-Slug aus der optionalen Beschriftung („Carport Essen“ wird `carport-essen`), sonst `foto-<JJJJMMTT>`; bei Doppelungen `-2`, `-3` …
- **Commit:** Die Dateien gehen als Base64-Blobs im SELBEN Commit wie `inhalt/bilder.json` und die geänderten Seiten (`schreibe` in `api.js`). Bis dahin ist ein Foto ein Entwurf:
  Bildliste im Browserspeicher (localStorage), die Bilddateien in IndexedDB (`fotospeicher.js`), damit ein Neuladen nichts verliert.
- **Löschen:** nur Fotos, die in keiner Inhaltsdatei stehen (Prüfung nach Schema und zusätzlich nach Textwert). Verwendete Fotos lehnt die Verwaltung mit der Liste der Stellen ab
  („Referenzen › Projekte: Projekt 1 › Fotos: Foto 1“). Der Commit entfernt Größen, Maßdateien (`*.webp.json`) und die Original-JPG; über den Verlauf lässt es sich zurückholen.
- **Foto austauschen:** neues Foto hochladen, im Feld „Anderes Foto wählen“, dann das alte unter „Fotos“ löschen. Beim Wechsel wird die eigene Bildbeschreibung an der Einbaustelle geleert (sie gehörte zum alten Foto), es gilt die des neuen.
- **Grenze:** Neu hochgeladene Fotos haben keine JPG-Datei („original“). Als Vorschaubild für soziale Netzwerke (`og_bild`) bietet die Verwaltung nur Fotos mit JPG an (`bauen.py` verlangt sie dort).
- **Browser / JPEG-Rückfall:** `bild.js` fragt per `canvas.toBlob("image/webp")`, ob der Browser WebP wirklich erzeugt (Safari liefert still ein PNG). Wenn nicht, entstehen JPEG-Größen (Qualität 0,82, `<name>-800.jpg`, `-1600`, `-2048`) und der Eintrag in `inhalt/bilder.json` bekommt `"format": "jpg"` (neue WebP-Fotos `"webp"`; ältere Einträge ohne Feld gelten als WebP und bleiben unverändert). `bauen.py` sucht je Format die passenden Dateien, liest Breite/Höhe aus dem WebP- bzw. JPEG-Kopf (`webp_groesse`, `jpeg_groesse`, Standardbibliothek) und setzt beim Vorab-Laden des Hauptbilds `type="image/jpeg"`. Im Browser-Test nachgestellt (`admin/test/browser_teilb_test.js`, `jpegRueckfall`), auf einem echten iPhone ist es noch nicht geprüft (siehe unten).

### Veröffentlichen (GitHub Actions)

`.github/workflows/veroeffentlichen.yml`, Name „Bauen und veröffentlichen“. **Zwei Zweige:** `main` ist der Code (nur der Entwickler schreibt, durch ein Ruleset geschützt), `inhalt` sind Texte und Fotos (hier schreibt die Verwaltung mit dem Schlüssel des Inhabers). Ein GitHub-Schlüssel gilt immer für das ganze Projekt; der Schutz entsteht durch diese Aufteilung (Einrichtung: `ADMIN-ANLEITUNG.md`, Anhang „Einrichten“, Vorlage `einrichten.sh`).

- Start: Push auf `main` **oder `inhalt`** mit Änderungen in `inhalt/`, `images/`, `vorlagen/`, `assets/`, `admin/`, `bauen.py`, `favicon.svg`, der Workflow-Datei oder `.github/skripte/`, außerdem von Hand („Run workflow“).
- Auftrag `build` (Rechte: nur `contents: read`):
  1. `actions/checkout@v4` mit `ref: main`, `fetch-depth: 0`, `persist-credentials: false`: der Code kommt **immer aus `main`**.
  2. `actions/setup-python@v5` (3.12).
  3. `python3 -I .github/skripte/pruefe_inhalt_branch.py --basis origin/main --inhalt origin/inhalt`: bricht ab, wenn `inhalt` gegenüber `main` etwas anderes als `inhalt/` und `images/` geändert hat, an `inhalt/schema/` oder `inhalt/struktur.json` etwas geändert hat, in `images/` etwas anderes als `.webp`/`.jpg`/`.jpeg`/`.png` ablegt oder Symlinks, ausführbare Dateien oder Submodule enthält.
  4. `git worktree` + `rsync`: `inhalt/` (ohne `schema/` und `struktur.json`, die bleiben aus `main`) und Bilddateien aus `images/` werden aus `inhalt` übernommen; Verknüpfungen werden übersprungen.
  5. `python3 bauen.py`, dann `actions/upload-pages-artifact@v3` (`_site`).
- Auftrag `deploy` (`needs: build`, Rechte: `pages: write`, `id-token: write`): `actions/deploy-pages@v4`, Umgebung `github-pages` (dort müssen `main` und `inhalt` als Veröffentlichungs-Zweige erlaubt sein). Nur offizielle GitHub-Actions. `actions/configure-pages` wird nicht mehr gebraucht (so reicht dem Bauauftrag `contents: read`).
- Die Aktionen stehen noch mit Versions-Tags im Workflow. **Einmalig auf Commit-SHAs festlegen:** SHAs per `gh api` auflösen und eintragen (`einrichten.sh`, Schritt 6).
- **Scheitert die Prüfung oder `bauen.py`** (Pflichtfeld, Foto oder Datei fehlt, kaputter Link, unerlaubtes HTML), läuft `deploy` nicht, die veröffentlichte Seite bleibt unverändert. Der Lauf steht auf „failure“.
- Einmalig im Projekt: Einstellungen → Pages → Source = **GitHub Actions**. Eine `CNAME`-Datei im Artefakt wird dabei nicht beachtet; die eigene Domain trägt man unter Pages ein.
- Die Verwaltung ordnet den Lauf über `head_sha` (der Commit auf `inhalt`) und den Pfad `veroeffentlichen.yml` zu (andere Läufe zum selben Commit, etwa „pages-build-deployment“, zählen nicht).
  „Live“ erst bei `status: completed` und `conclusion: success` (Bauen UND Veröffentlichen fertig). `failure` meldet die Leiste als „NICHT veröffentlicht“ mit „Rückgängig“ und Protokoll-Link.
  `cancelled`: GitHub ersetzt einen wartenden Lauf, wenn danach noch eine Veröffentlichung kommt (Gruppe `pages`, `cancel-in-progress: false`); die Verwaltung folgt dann dem neueren Commit.
- Nur in GitHub selbst prüfbar (nicht lokal): dass `deploy-pages` ohne `configure-pages` läuft, dass die Umgebungsregel den Zweig `inhalt` zulässt und dass das Ruleset auf `main` den Schlüssel des Inhabers abweist.

### Sicherheit der öffentlichen Seite (Generator)

- **Feste Formate** (`FESTE_MUSTER` in `bauen.py`, gespiegelt in `admin/pruefung.js`): E-Mail (`^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$`), Formular-Adresse (nur `https://formsubmit.co/ajax/<Adresse oder Kennung>`), Domain (nur Host und optional Port). Sie gelten unabhängig vom Schema. Werte aus `seite.json`, die in `assets/main.js` eingesetzt werden, werden erst für HTML und dann für den JS-String maskiert (`js_zeichenkette`); JSON-LD maskiert `<` und `>`.
- **Rechtstexte** (`inhalt/recht/*.html`): erlaubt sind nur `p`, `h2`, `h3`, `ul`, `ol`, `li`, `br`, `strong`, `em`, `a` (`href` mit `/seite/`, `#anker`, `https://`, `http://`, `mailto:`, `tel:`; `target="_blank"`; `rel` nur `noopener`/`noreferrer`). Alles andere (Skripte, Ereignis-Attribute, Kommentare, iframe ...) bricht den Bau mit deutscher Meldung ab. Gleiche Regeln in `admin/pruefung.js` (`pruefeRechtHtml`); die gemeinsamen Testfälle stehen in `admin/test/rechtstext_faelle.json`.
- **Content-Security-Policy** als `<meta>` im Kopf jeder Seite (GitHub Pages kann keine Header setzen; `frame-ancestors`, `report-uri` und `sandbox` gehen per `<meta>` nicht): `default-src 'self'`; Skripte nur aus der eigenen Herkunft plus **Hashes der zwei Inline-Skripte**; `style-src 'self'` plus `style-src-attr` mit **Hash je `style="…"`-Wert** (`'unsafe-hashes'`, kein `'unsafe-inline'`); `img-src 'self'`; FormSubmit nur auf Seiten mit Formular (`connect-src`, `form-action`); Google nur auf Seiten mit Karte (`frame-src`); `object-src 'none'`, `base-uri 'none'`. Die Hashes entstehen beim Bau aus dem fertigen HTML (neue Inline-Skripte oder Styles werden automatisch aufgenommen). Ereignis-Attribute (`onclick` …) und fremde Skripte brechen den Bau ab. `pruefen_gleich.py` meldet die CSP-Zeile als einzigen, dokumentierten Unterschied zum Original.
- **Dateitypen**: `bauen.py` liefert aus `images/` nur `.webp`, `.jpg`, `.jpeg`, `.png` und aus `assets/` nur `.woff2`, `.css`, `.js`, `.txt` aus; `favicon.svg` nur am festen Ort. Verknüpfungen (Symlinks) und alle anderen Dateitypen werden mit Warnung ausgelassen (Notizen `.md`, `.webp.json` und `.DS_Store` still). Das Prüfskript für den Zweig `inhalt` verlangt dasselbe für Bilder.

### Verbindung zu GitHub (CORS) – geprüft am 26.10.2026

Die Verwaltungsseite spricht direkt aus dem Browser mit `https://api.github.com`. Geprüft gegen die echte API ohne Schlüssel
(`bash admin/test/cors_pruefen.sh`) und aus einem echten Browser von der Herkunft `https://daiworld450.github.io` aus mit genau den Optionen
von `api.js` (`cache: "no-store"`, `credentials: "omit"`, `referrerPolicy: "no-referrer"`):

| Prüfung | Ergebnis |
|---|---|
| Preflight (`OPTIONS`) für `contents/inhalt/seite.json`, `git/blobs`, `git/trees`, `git/commits`, `git/refs/heads/main`, `actions/runs`, `commits` mit den Methoden GET, POST, PATCH, PUT, DELETE und den Headern `authorization, content-type, x-github-api-version, accept` | 70 von 70 erlaubt (Herkunft `https://daiworld450.github.io` und `https://zeca-alu.de`): Antwort 204, `access-control-allow-origin: *`, Methoden `GET, POST, PATCH, PUT, DELETE`, Header `Authorization, Content-Type, X-GitHub-Api-Version` ausdrücklich erlaubt (`Accept` ist ohnehin immer erlaubt) |
| Echte Anfrage im Browser (GET Projekt, `actions/runs`, Ref, Branch, Commits; POST Blob, Tree, Commit; PATCH Ref, mit Testschlüssel) | alle 9 erreichbar, die Antwort 401 „Bad credentials“ ist für die Seite lesbar (also auch Fehlermeldungen kommen an) |
| Lesbare Antwort-Header | `X-RateLimit-Remaining`, `X-RateLimit-Reset`, `Retry-After` sind freigegeben (die Fehlerbehandlung in `api.js` liest sie) |

Ergebnis: `api.js` braucht keine Änderung, es werden nur einfache Header gesendet. Nicht prüfbar ohne echten Schlüssel: die Antworten mit Daten (Schreib-Commit, Lauf-Status).


## Wo ändere ich was?

| Ich will … | Datei / Feld |
|---|---|
| Telefonnummer, E-Mail, Adresse, Instagram/Facebook | `inhalt/seite.json` → `kontakt` (wirkt auf allen Seiten, in Schema-Daten, Rechtstexten, Karte) |
| Firmenname, Inhaber, Slogan | `seite.json` → `firma` |
| Städte im Einsatzgebiet | `seite.json` → `einsatzgebiet` (Startseite, Einsatzgebiet-Seite, Google-Daten); nur auf der Einsatzgebiet-Seite zusätzlich: `seiten/einsatzgebiet.json` → `staedte.zusaetzlich` (aktuell Krefeld) |
| Text einer Seite | `inhalt/seiten/<seite>.json` |
| Neue Referenz | `seiten/referenzen.json` → `projekte` (Foto-Namen aus `bilder.json`) |
| Neues Foto | Verwaltung → Fotos → „Neues Foto hochladen“ (erzeugt Größen und Eintrag in `bilder.json`). Von Hand: Dateien `<name>-<Breite>.webp` nach `images/bestand/`, Eintrag in `bilder.json` |
| Impressum / Datenschutz | `inhalt/recht/*.html` (Platzhalter `{{telefon}}`, `{{email}}`, `{{strasse}}` … bleiben aktuell) |
| Formular-Empfänger | `seite.json` → `formular.aktion` (getrennt von der E-Mail; FormSubmit-Aktivierung nötig) |
| Aussehen, Aufbau, Zeichnungen | `vorlagen/`, `assets/` (Gestaltung, nicht Inhalt) |
| Vorschau auf einem Testserver | `seite.json` → `veroeffentlichung`: `domain`, `basis_pfad` (z. B. `/zeca-alu-vorschau/`), `noindex: true` |

## Vorschau-Modus

`basis_pfad` wird in alle internen Links, Bilder, Skripte, Stylesheet-/Schrift-URLs, Canonical, Open Graph, JSON-LD und
Sitemap eingesetzt. `noindex: true` setzt `<meta name="robots" content="noindex, nofollow">` auf allen Seiten und schreibt
in `robots.txt` `Disallow: /`; mit `false` steht dort `Allow: /` plus Sitemap-Zeile. `robots.txt` und `sitemap.xml` werden
immer aus `seite.json` + `struktur.json` erzeugt (nicht von Hand pflegen). Eine `CNAME`-Datei (GitHub Pages, Wert = Domain) entsteht nur im Live-Betrieb: `basis_pfad: "/"` und `noindex: false`.

## Vorlagen-Sprache (vorlagen/*.html)

```
{{pfad.zum.wert}}                         Wert einsetzen (Text wird maskiert)
{{#wenn pfad}} … {{#sonst}} … {{/wenn}}   bedingt (auch {{#wenn nicht pfad}})
{{#jede liste}} … {{/jede}}               Schleife; darin {{.}} {{@nr}} {{@index}} {{@erste}} {{@letzte}}
{{> teil}}                                vorlagen/teile/teil.html einbinden
```

Abgeleitete Werte (Fotos mit `srcset`, Menü-Markierung `aria-current`, Telefon-Links, JSON-LD) berechnet `bauen.py`.

## Deployment (GitHub Pages, kostenfrei)

Ausgeliefert wird der Inhalt von `_site/`, gebaut vom Workflow `.github/workflows/veroeffentlichen.yml` (siehe „Veröffentlichen“). Pages-Quelle: „GitHub Actions“.
Go-live-Schritte (Repo, `admin.repo`, `basis_pfad`, `noindex`, Domain, DNS, Schlüssel): `ADMIN-ANLEITUNG.md`, Anhang für Entwickler.

## Vor dem Livegang noch zu erledigen (unverändert)

1. Kontaktformular aktivieren: Beim ersten Absenden schickt FormSubmit eine Aktivierungs-Mail an `info@zeca-alu.de`; den Link „Activate Form“ anklicken.
2. Fehlende Fotos: siehe `images/README.md`.
3. Google Business Profile anlegen/prüfen und verlinken.
4. Nach dem Live-Schalten: Search Console + `/sitemap.xml` einreichen.

## Bekannte Eigenheiten des Originals (bewusst übernommen)

- Nur die Terrassen-Seite sendet BreadcrumbList-Daten für Google; für die anderen fünf Leistungsseiten steht der Schalter `seo.breadcrumb_schema` auf `false`.
- `areaServed` in den Google-Daten der Startseite hatte eine andere Städte-Reihenfolge als die Leistungsseiten; jetzt eine Liste für alle (Inhalt gleich).
- Fotos werden als `<img srcset>` ausgegeben (wie im Original), nicht als `<picture>`.
