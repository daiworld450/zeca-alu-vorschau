# Anleitung: Webseite selbst pflegen (Verwaltung ZeCa-Alu)

Mit der Verwaltung ändern Sie Telefonnummer, Texte, Fotos, Referenzen und Fragen auf Ihrer Webseite, ohne Technik.
Alles, was Sie veröffentlichen, steht im Verlauf und lässt sich zurücknehmen. Rechtstexte (Impressum, Datenschutz) nur nach Rücksprache ändern.

Die Verwaltung erreichen Sie unter `https://zeca-alu.de/admin/`. (In der Vorschau-Phase: Adresse der Vorschau-Seite, gefolgt von `/admin/`.)

**Wichtig zur Adresse:** Den echten Schlüssel nur unter der eigenen Adresse `https://zeca-alu.de/admin/` eingeben. In der Vorschau-Phase (Adresse der Form `https://<konto>.github.io/<projekt>/admin/`) teilt sich der Browser-Speicher die Herkunft `<konto>.github.io` mit allen anderen GitHub-Pages-Projekten desselben Kontos; dort nur mit einem Test- oder kurzlebigen Schlüssel arbeiten und ihn danach bei GitHub löschen.

## 1. Schlüssel einmalig erzeugen

Die Verwaltung braucht einen persönlichen Schlüssel von GitHub. Er erlaubt ihr, genau dieses eine Projekt zu ändern.

1. Bei GitHub anmelden (github.com).
2. Oben rechts auf das **Profilbild** tippen, dann **Settings**.
3. Ganz unten links **Developer settings**, dann **Personal access tokens**, dann **Fine-grained tokens**.
4. **Generate new token** wählen.
5. **Token name:** `ZeCa-Alu Verwaltung`.
6. **Expiration:** **30 bis 90 Tage** (empfohlen: 90 Tage), nicht länger. Den Ablauftag im Kalender notieren; vor dem Ablauf einen neuen Schlüssel erzeugen (ein kurzer Schlüssel richtet weniger Schaden an, wenn er verloren geht).
7. **Repository access:** **Only select repositories** wählen und nur das ZeCa-Projekt auswählen.
8. **Permissions** aufklappen, **Repository permissions**, und einstellen:
   - **Contents:** Read and write
   - **Actions:** Read-only
   - (**Metadata:** Read-only setzt GitHub selbst.)
   - Sonst **nichts** (insbesondere nicht „Workflows“ und nicht „Administration“).
9. Unten **Generate token**. Den Schlüssel sofort **kopieren**: GitHub zeigt ihn nur einmal.

## 2. Verwaltung öffnen und anmelden

1. Die Adresse der Verwaltung öffnen (siehe oben).
2. Den Schlüssel in das Feld **Schlüssel** einfügen, **Anmelden** drücken.

Der Schlüssel wird nur in diesem Browser gespeichert. Einen Anmelde-Link mit Schlüssel gibt es nicht (ein Schlüssel in einer Adresse landet in Verlauf, Lesezeichen und Notizen). Am Handy den Schlüssel einmal einfügen, danach bleibt die Anmeldung bestehen, bis Sie **Abmelden** drücken oder der Schlüssel abläuft.

## 3. Das Wichtigste, Schritt für Schritt

### Telefonnummer ändern
1. Übersicht: **Firmendaten**.
2. Bei **Telefonnummern** die Nummer so ändern, wie sie angezeigt werden soll (zum Beispiel `0176 12345678`).
3. Unten **Veröffentlichen**. Die neue Nummer erscheint überall: Kopfzeile, Fußzeile, Anruf-Knöpfe, Impressum.

### Text ändern
1. Übersicht: die Seite wählen (zum Beispiel **Startseite** oder **Carport**).
2. Den Abschnitt antippen, der aufklappt, und den Text im Feld ändern. Unter dem Feld steht, wie viele Zeichen erlaubt sind.
3. Für **Fett**, **Kursiv** oder einen **Link** den Text markieren und den Knopf darüber drücken.
4. **Veröffentlichen**.

### Foto hochladen
1. Übersicht: **Fotos**, dann **Neues Foto hochladen**. Am Handy öffnet sich Kamera oder Galerie, am Computer können Sie das Foto auch auf das Feld ziehen.
2. Kurz warten, bis die Vorschau erscheint. Die Verwaltung verkleinert das Foto selbst (maximal 25 MB, am besten Querformat, mindestens 1600 Pixel breit).
3. **Bildbeschreibung** schreiben (Pflicht): Was sieht man? Zum Beispiel „Terrassenüberdachung aus Aluminium mit LED-Licht am Abend“. Nicht mit „Bild von“ anfangen.
4. Optional einen **Namen für die Ablage** eingeben, dann **Foto übernehmen**.
5. Das Foto auf einer Seite einsetzen: bei der Seite (zum Beispiel **Referenzen**) beim Foto **Foto wählen** drücken und das neue Foto auswählen.
6. **Veröffentlichen**.

Gut zu wissen: Der Standort (GPS) und andere Aufnahmedaten werden entfernt. Personen und Autokennzeichen nur zeigen, wenn diese zugestimmt haben.
Kann der Browser kein WebP erzeugen (zum Beispiel Safari am iPhone), speichert die Verwaltung die Fotos von selbst als JPEG und sagt das im Dialog; das sieht gleich aus, die Dateien sind nur etwas größer. Ein iPhone-Foto im Format HEIC wandelt Safari beim Auswählen meist selbst in ein JPEG um; wenn nicht, das Foto in der Fotos-App als JPEG teilen oder speichern.

### Foto austauschen oder löschen
1. Neues Foto hochladen (siehe oben) und bei der Seite statt des alten auswählen. Die eigene Bildbeschreibung an dieser Stelle wird dabei geleert, es gilt die des neuen Fotos.
2. Übersicht: **Fotos**. Unter **Nicht verwendet** das alte Foto mit **Löschen** entfernen, dann **Veröffentlichen**.
3. Fotos, die noch auf einer Seite stehen, lassen sich nicht löschen. Die Verwaltung zeigt, wo sie benutzt werden.

### Referenz hinzufügen
1. Übersicht: **Referenzen**, bei **Projekte** auf **Projekt hinzufügen**.
2. **Titel**, **Ort** und **Beschreibung** ausfüllen und genau **zwei Fotos** wählen (neue vorher unter **Fotos** hochladen).
3. **Veröffentlichen**. Mit den Pfeilen am Projekt lässt sich die Reihenfolge ändern.

### Frage ergänzen (FAQ)
1. Übersicht: **Startseite**, Abschnitt **Fragen und Antworten**, **Frage hinzufügen**.
2. **Frage** und **Antwort** schreiben, **Veröffentlichen**.

## 4. Veröffentlichen: was „Live“ heißt

- Änderungen sind zuerst nur ein **Entwurf**. Unten erscheint die Leiste mit **Veröffentlichen** und **Verwerfen**. Der Entwurf bleibt auch nach dem Schließen der Seite erhalten.
- Nach **Veröffentlichen** baut GitHub die Seite neu. Das dauert **1 bis 3 Minuten**. Die Leiste zeigt „Wird veröffentlicht …“.
- **Live** bedeutet: Ihre Änderung ist auf der Seite. Die Zeile verschwindet nach etwa zehn Sekunden von selbst (solange Maus oder Tastatur darauf sind, bleibt sie). Mit **Seite ansehen** prüfen. Zeigt der Browser noch den alten Stand, die Seite neu laden (Strg+Umschalt+R, am Handy die Adresse neu aufrufen).
- Während des Veröffentlichens können Sie weiterarbeiten.

## 5. Rückgängig machen

- **Noch nicht veröffentlicht:** unten **Verwerfen**.
- **Schon veröffentlicht:** Übersicht: **Verlauf**, dann **Letzte Änderung rückgängig**, oder bei einem früheren Eintrag **Diesen Stand wiederherstellen**. Das ist ein neuer Eintrag, nichts geht verloren.

## 6. Wenn etwas nicht klappt

- **„Der Schlüssel ist abgelaufen oder wurde zurückgezogen“:** Neuen Schlüssel erzeugen (Abschnitt 1) und eingeben. Ihre Änderungen bleiben als Entwurf erhalten.
- **„Die Seite wurde inzwischen geändert“ (Kollision):** Jemand anderes hat gleichzeitig etwas geändert. Es wurde nichts überschrieben. Die Verwaltung lädt den neuesten Stand, Ihr Entwurf bleibt. Noch einmal **Veröffentlichen** drücken.
- **„Fehler: Die Änderung wurde NICHT veröffentlicht“ (Build-Fehler):** Die Seite im Internet ist unverändert. **Rückgängig** drücken, Ihre Eingaben bleiben als Entwurf. Die Meldung unter **Details anzeigen** (öffnet sich bei GitHub) zeigt, was fehlt (zum Beispiel ein Pflichtfeld). Hilft das nicht, den Entwickler fragen.
- **„Keine Verbindung zu GitHub“ oder „GitHub bremst gerade“:** Internet prüfen oder einige Minuten warten, dann noch einmal.
- **Ein Feld ist rot:** Die Meldung darunter sagt, was zu tun ist. Veröffentlichen geht erst, wenn alle Felder in Ordnung sind.

## 7. Sicherheit

- Der **Schlüssel ist wie ein Passwort.** Wer ihn hat, kann Ihre Webseite ändern. Nur Vertrauten geben, nie per E-Mail oder Messenger an Fremde, nie in eine Datei oder einen Screenshot.
- Auf einem fremden oder gemeinsam genutzten Gerät nach der Arbeit **Abmelden** drücken. Die Verwaltung fragt immer nach („Angemeldet bleiben“ ist vorausgewählt), danach wird der Schlüssel aus dem Browser gelöscht und ein neuer von GitHub nötig. **Abmelden widerruft den Schlüssel bei GitHub nicht.** Wer ihn kopiert hat, kann ihn weiter benutzen, bis er abläuft oder bei GitHub gelöscht wird (nächster Punkt).
- **Widerruf (so macht man den Schlüssel wirklich wertlos):** GitHub öffnen → oben rechts **Profilbild** → **Settings** → ganz unten links **Developer settings** → **Personal access tokens** → **Fine-grained tokens** → den Schlüssel „ZeCa-Alu Verwaltung“ anklicken → **Delete** (oder **Revoke**) → bestätigen. Danach ist er sofort wertlos, auch wenn jemand ihn kopiert hat.
- **Bei Verlust oder Verdacht** (Handy weg, Schlüssel verschickt): **sofort widerrufen** und einen neuen erzeugen.

---

# Anhang für den Entwickler

## Go-live: Schritt für Schritt

1. **Repository und Zweige:** Der Code gehört in das Repository, aus dem die Seite ausgeliefert wird (`daiworld450/zeca-alu-de`). Es gibt zwei Zweige: **`main`** (Code, nur der Entwickler schreibt) und **`inhalt`** (Texte und Fotos, hier schreibt die Verwaltung). Beim Wechsel in `inhalt/seite.json` `admin.repo` auf dieses Repository setzen und `admin.branch` auf `inhalt` lassen, dann `python3 bauen.py`. Der Schlüssel (Token) des Inhabers muss genau dieses Repository auswählen. **Vor dem ersten Schlüssel den Abschnitt „Einrichten (einmalig, durch den Entwickler)“ unten erledigen.**
2. **Veröffentlichung in `inhalt/seite.json`:** `veroeffentlichung.domain` `https://zeca-alu.de`, `basis_pfad` `"/"`, `noindex` `false`. In der Vorschau stattdessen zum Beispiel `basis_pfad` `/zeca-alu-vorschau/`, `noindex` `true` (dann sperrt `robots.txt` alles).
3. **GitHub Pages:** Repository → Settings → Pages → **Source: GitHub Actions** (nicht „Deploy from a branch“). Sonst scheitert `deploy` oder es läuft zusätzlich „pages-build-deployment“.
4. **CNAME:** `bauen.py` schreibt im Live-Betrieb (`basis_pfad` `/`, `noindex` `false`) eine `CNAME`-Datei. Bei Veröffentlichung über Actions beachtet GitHub sie nicht: **Settings → Pages → Custom domain `zeca-alu.de`** eintragen und **Enforce HTTPS** einschalten.
5. **DNS (bei der Domain-Verwaltung):** für `zeca-alu.de` die GitHub-Pages-Adressen (A: 185.199.108.153, 185.199.109.153, 185.199.110.153, 185.199.111.153; AAAA: 2606:50c0:8000::153 bis 2606:50c0:8003::153) und `www` als CNAME auf `daiworld450.github.io`. Die Werte vor dem Eintragen in der GitHub-Dokumentation („Managing a custom domain for your GitHub Pages site“) gegenprüfen. DNS-Änderungen brauchen Zeit, das Zertifikat entsteht danach von selbst.
6. **Erster Lauf:** Actions → „Bauen und veröffentlichen“ → **Run workflow**. Erst wenn der Lauf grün ist, steht die Seite online. Danach `https://zeca-alu.de/admin/` öffnen und mit einem Testschlüssel einen harmlosen Commit prüfen (Entwurf, Veröffentlichen, „Live“).
7. **Kontrolle:** `robots.txt` enthält `Disallow: /admin/`, `/admin/` trägt `noindex`, `sitemap.xml` enthält `/admin/` nicht (`python3 pruefen_aenderung.py`, Test 6).

## Einrichten (einmalig, durch den Entwickler)

Vorlage mit allen Befehlen: `einrichten.sh` (gh-Befehle, **nicht automatisch ausführen**, vorher lesen und prüfen; jeder Schritt einzeln: `EINRICHTEN_BESTAETIGT=ja bash einrichten.sh <Schritt>`). Ohne diese Schritte schützt das Zwei-Zweige-Modell nichts.

1. **Projekt gehört dem Entwickler** (oder einer Organisation). Der Inhaber wird als Mitarbeiter mit der Rolle **Write** eingeladen (nicht Admin, nicht Maintain). Sein Schlüssel handelt mit den Rechten seines Kontos; eine Rolle Write kommt an einem geschützten `main` nicht vorbei.
2. **Zweig `inhalt` aus `main` anlegen** (`einrichten.sh 1`):
   `gh api -X POST repos/BESITZER/PROJEKT/git/refs -f ref=refs/heads/inhalt -f sha=$(gh api repos/BESITZER/PROJEKT/git/ref/heads/main --jq .object.sha)`
   Danach `admin.branch` in `inhalt/seite.json` auf `"inhalt"`, auf `main` bauen, pushen und `main` in `inhalt` zusammenführen.
3. **Ruleset auf `main`** (`einrichten.sh 2`; Settings → Rules → Rulesets → New branch ruleset): Ziel `main`; Regeln „Restrict updates“, „Restrict deletions“, „Block force pushes“; Ausnahme (Bypass) **nur** die Rolle „Admin“ (der Entwickler). Fein begrenzte Schlüssel („fine-grained tokens“) beachten Rulesets und Branch-Schutz, weil sie als das Konto handeln, das sie erzeugt hat, und der Inhaber nicht in der Ausnahmeliste steht. Rulesets in privaten Projekten brauchen einen bezahlten GitHub-Tarif; sonst die klassische Branch-Schutzregel (Settings → Branches) mit „Require a pull request“ und ohne Ausnahme für Administratoren.
4. **Ruleset auf `inhalt`** (`einrichten.sh 3`): „Restrict deletions“ und „Block force pushes“. Die Verwaltung schreibt nur vorwärts (ohne force).
5. **GitHub Pages:** Settings → Pages → Source **GitHub Actions** (`einrichten.sh 4`).
6. **Umgebung `github-pages`:** Settings → Environments → github-pages → Deployment branches: **`main` und `inhalt`** erlauben (`einrichten.sh 5`). Sonst lehnt GitHub das Veröffentlichen aus dem Zweig `inhalt` ab.
7. **Actions auf Commit-SHAs festlegen:** SHAs per `gh api` auflösen (`einrichten.sh 6`, nur Ausgabe) und im Workflow bei jedem `uses:` eintragen (`uses: actions/checkout@<SHA>  # v4.x.y`). Ein Tag lässt sich verschieben, eine SHA nicht.
8. **Schlüssel des Inhabers** (Abschnitt 1): nur dieses Projekt, **Contents: Read and write**, **Actions: Read-only**, **kein** „Workflows“, **kein** „Administration“, Laufzeit 30 bis 90 Tage.
9. **Prüfen:** (a) Mit einem Test-Schlüssel versuchen, auf `main` zu schreiben: muss abgelehnt werden. (b) Auf `inhalt` einen Test-Commit mit einer Datei außerhalb von `inhalt/` und `images/` anlegen: der Lauf „Bauen und veröffentlichen“ muss bei „Zweig inhalt prüfen“ abbrechen und die Seite unverändert lassen. (c) Normales Veröffentlichen in der Verwaltung: Lauf grün, „Live“. (d) `einrichten.sh 7` zeigt den Zustand.

**Verhalten bei Verdacht** (Schlüssel verloren, verschickt, seltsame Änderungen; `einrichten.sh 8` druckt die Schritte):
- Schlüssel **sofort bei GitHub widerrufen** (Abschnitt 7). „Abmelden“ in der Verwaltung widerruft ihn **nicht**.
- Änderungen auf `inhalt` prüfen: `git log --stat origin/main..origin/inhalt` und `python3 -I .github/skripte/pruefe_inhalt_branch.py --basis origin/main --inhalt origin/inhalt`.
- Code in der Geschichte von `main` prüfen: `git log --since="3 months ago" --stat origin/main -- admin assets bauen.py vorlagen .github`. Dort darf nur der Entwickler geschrieben haben.
- Verdächtiges auf `inhalt` per neuem Commit zurücknehmen, neuen Lauf auslösen, neuen Schlüssel erzeugen.

## Wartung

- **Schlüssel** des Inhabers laufen nach 30 bis 90 Tagen ab: Erinnerung etwa 1 Woche vorher, neuen Schlüssel mit ihm gemeinsam erzeugen (Abschnitt 1).
- **Vor jeder Änderung an Vorlagen, Schema oder Generator:** `python3 bauen.py`, `python3 pruefen_gleich.py` (0 Abweichungen), `python3 pruefen_aenderung.py`, `node admin/test/unit.mjs`, `node admin/test/api.test.mjs`, `node admin/test/fotos.test.mjs`. Neue Felder im Schema erscheinen automatisch im Formular, brauchen aber eine Stelle in der Vorlage (Test 5 prüft das).
- **Browser-Test der Verwaltung:** Mock starten (`python3 admin/test/mock_github.py`), `admin/test/browser_foto_test.js` in der Seite ausführen (Kopfzeile der Datei), danach `python3 admin/test/foto_ergebnis.py`. CORS gegen die echte API: `bash admin/test/cors_pruefen.sh`.
- **Actions-Versionen** (`checkout`, `setup-python`, `upload-pages-artifact`, `deploy-pages`): im Workflow stehen sie noch mit Versions-Tags (v4, v5, v3). Einmalig auf Commit-SHAs festlegen (`einrichten.sh`, Schritt 6; die SHAs per `gh api` auflösen und eintragen) und danach gelegentlich auf neue Versionen prüfen. `configure-pages` ist nicht mehr nötig und entfernt, damit der Bauauftrag nur `contents: read` braucht.
- **Änderungen am Code** (Schema, Vorlagen, Generator, Verwaltungsseite) gehen immer über `main`. Betrifft die Änderung `inhalt/schema/` oder `inhalt/struktur.json`, danach `main` in `inhalt` zusammenführen (`git checkout inhalt && git merge main && git push`), damit die Verwaltung die neue Feldbeschreibung sieht. Der Workflow nimmt beides ohnehin aus `main`. Inhalte (`inhalt/seiten/*.json`, `seite.json`, `bilder.json`, `recht/`, `images/`) gelten auf der Webseite so, wie sie auf `inhalt` stehen; Änderungen daran auf `main` greifen erst nach dem Zusammenführen.
- **Fehlersuche:** Der Verwaltung zeigt bei einem Build-Fehler den Link zum Protokoll; dort steht die deutsche Meldung von `bauen.py` mit Datei und Feld.

## Grenzen

- **Reichweite des Schlüssels:** Bei GitHub gilt „Contents: Read and write“ für das **ganze Projekt**: alle Dateien und alle Zweige, nicht nur `inhalt/` und `images/`. Ein feiner begrenzter Schlüssel kann das nicht auf Ordner einschränken. Der Schutz entsteht anders: (1) Die Verwaltung schreibt nur auf den Zweig **`inhalt`**; (2) **`main`** (Code: `admin/`, `assets/`, `bauen.py`, `vorlagen/`, Workflow) ist durch ein Ruleset geschützt, der Schlüssel kommt dort nicht vorbei; (3) der Workflow baut den Code **immer aus `main`** und übernimmt aus `inhalt` nur Inhalte und Bilddateien (`.github/skripte/pruefe_inhalt_branch.py` bricht sonst ab). Der Schlüssel hat bewusst weder „Workflows“ noch „Administration“. Ohne das Ruleset auf `main` (Abschnitt „Einrichten“) ist der Schutz nicht wirksam.
- **Kein Mehrbenutzer-Login:** Wer den Schlüssel hat, darf alles in `inhalt/` und `images/` auf dem Zweig `inhalt` ändern. Es gibt keine Rechte je Bereich und keinen Namen am Eintrag (im Verlauf steht nur „Admin: …“). Ein GitHub-Konto ist nötig.
- **Was bei gestohlenem Schlüssel möglich bleibt:** Texte, Fotos und Rechtstexte der Webseite verändern oder löschen (alles im Verlauf zurücknehmbar). Die Webseite selbst lässt Skripte nur aus den eigenen Dateien zu (Content-Security-Policy), Rechtstexte lassen nur einen kleinen HTML-Ausschnitt zu.
- **Vorschau-Adresse und Schlüssel:** Der Schlüssel wird im `localStorage` der Herkunft gespeichert, unter der die Verwaltung geöffnet wurde. Den echten Schlüssel nur unter der eigenen Domain (`https://zeca-alu.de/admin/`) benutzen. Die Vorschau unter `https://<konto>.github.io/<projekt>/admin/` teilt sich die Herkunft (`<konto>.github.io`) mit allen anderen Pages-Projekten desselben Kontos; dort nur mit einem Test-Schlüssel oder einem kurzlebigen Schlüssel arbeiten und danach löschen.
- **Schlüssel im Browser:** Er liegt im `localStorage` dieses Browsers (wie bei jeder Seite ohne Server). Dagegen schützt die strenge Content-Security-Policy der Verwaltung (nur eigene Skripte, `connect-src` nur GitHub). Auf fremden Geräten „Abmelden“.
- **Fotos:** WebP entsteht im Browser; Safari (iPhone) kann das nach bisherigem Wissen nicht und fällt auf PNG zurück, deshalb erkennt die Verwaltung das und erzeugt JPEG-Größen (`<name>-800.jpg` usw., Feld `format` in `bilder.json`). Im Browser-Test nachgestellt (Browser ohne WebP-Encoder), auf einem echten iPhone noch zu prüfen. Neue Fotos haben keine JPG-Datei und sind kein Vorschaubild für soziale Netzwerke. Die Standard-Bildbeschreibung eines vorhandenen Fotos lässt sich nicht ändern; an jeder Einbaustelle gibt es ein eigenes Feld „Bildbeschreibung“.
- **Gleichzeitiges Bearbeiten:** Wird zwischen Laden und Veröffentlichen etwas anderes veröffentlicht, meldet die Verwaltung eine Kollision und überschreibt nichts.
- **Veröffentlichung dauert 1 bis 3 Minuten** (GitHub-Auftrag), nicht sofort.
