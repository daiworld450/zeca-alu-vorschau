// browser_foto_test.js – Ende-zu-Ende-Test des Foto-Uploads im Browser, bedient die echte Oberfläche (gehört nicht zur ausgelieferten Seite).
//
// Voraussetzung: Mock läuft (python3 admin/test/mock_github.py), Seite http://127.0.0.1:8791/admin/ ist mit Schlüssel „test-token“ angemeldet.
// Aufruf in der Seite:   const T = await import("/admin/test/browser_foto_test.js");  await T.phase1();  (Seite neu laden)  await T.phase2();  await T.phase3();
// Jede Phase gibt { ok, schlecht, fehler: [...], daten } zurück.

const MOCK = location.origin;
const ergebnis = () => ({ ok: 0, schlecht: 0, fehler: [], daten: {} });
let E = ergebnis();

const t = (bedingung, text) => { if (bedingung) E.ok++; else { E.schlecht++; E.fehler.push(text); } };
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
export async function warteBis(fn, text, ms = 15000) {
  const ende = Date.now() + ms;
  for (;;) {
    let w; try { w = fn(); } catch (e) { w = null; }
    if (w) return w;
    if (Date.now() > ende) { E.schlecht++; E.fehler.push("Zeitüberschreitung: " + text); throw new Error("Zeitüberschreitung: " + text); }
    await pause(40);
  }
}
const dlg = () => document.getElementById("dialog");
// „offen“ gilt, bis auch der Verlaufseintrag des Dialogs (Zurück-Geste schließt den Dialog) abgebaut ist
const dialogOffen = () => dlg().open || !!(history.state && history.state.zecaDialog);
const dialogText = () => dlg().textContent.replace(/\s+/g, " ");
const knopfText = (wurzel, text) => [...wurzel.querySelectorAll("button, a")].find((b) => b.textContent.trim().includes(text));
const klick = (el) => { el.scrollIntoView({ block: "center" }); el.click(); };
const leiste = () => document.getElementById("leiste");
const mock = (pfad, body) => fetch(MOCK + "/__test/" + pfad, body ? { method: "POST", body: JSON.stringify(body) } : {}).then((r) => r.json());

// ---------------------------------------------------------------- Testbilder
const u16 = (n) => [(n >> 8) & 255, n & 255];
/** JPEG aus der Zeichenfläche; orientierung (1-8) wird als EXIF-Eintrag eingefügt (die Pixel bleiben unverändert). */
export async function testbild({ breite, hoehe, orientierung = 0, name = "test.jpg", gps = false }) {
  const c = document.createElement("canvas");
  c.width = breite; c.height = hoehe;
  const z = c.getContext("2d");
  const g = z.createLinearGradient(0, 0, breite, hoehe);
  g.addColorStop(0, "#d9822b"); g.addColorStop(0.5, "#3b6ea5"); g.addColorStop(1, "#1b3a2a");
  z.fillStyle = g; z.fillRect(0, 0, breite, hoehe);
  z.fillStyle = "#fff"; z.fillRect(breite * 0.05, hoehe * 0.05, breite * 0.2, hoehe * 0.12);   // heller Block oben links (zeigt die Drehung)
  z.fillStyle = "#101733"; z.font = `bold ${Math.round(hoehe / 8)}px sans-serif`; z.fillText("ZeCa-Alu Test", breite * 0.1, hoehe * 0.6);
  const blob = await new Promise((ok) => c.toBlob(ok, "image/jpeg", 0.9));
  let bytes = new Uint8Array(await blob.arrayBuffer());
  if (orientierung || gps) {
    const eintraege = [];
    if (orientierung) eintraege.push([0x0112, 3, 1, [...u16(orientierung), 0, 0]]);
    const tiff = [0x49, 0x49, 0x2a, 0, 8, 0, 0, 0, eintraege.length & 255, 0];
    for (const [tag, typ, anz, wert] of eintraege) tiff.push(tag & 255, tag >> 8, typ, 0, anz, 0, 0, 0, ...[wert[1], wert[0], 0, 0].slice(0, 4));
    tiff.push(0, 0, 0, 0);
    const exif = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
    if (gps) exif.push(...Array.from("GPS 51.4N 6.9E ").map((x) => x.charCodeAt(0)));
    const app1 = [0xff, 0xe1, ...u16(exif.length + 2), ...exif];
    const neu = new Uint8Array(bytes.length + app1.length);
    neu.set(bytes.subarray(0, 2), 0); neu.set(app1, 2); neu.set(bytes.subarray(2), 2 + app1.length);
    bytes = neu;
  }
  return new File([bytes], name, { type: "image/jpeg" });
}

function dateiSetzen(eingabe, datei) {
  const dt = new DataTransfer();
  dt.items.add(datei);
  eingabe.files = dt.files;
  eingabe.dispatchEvent(new Event("change", { bubbles: true }));
}

const fotoZeile = (name) => [...document.querySelectorAll(".foto")].find((li) => li.querySelector(".foto-name")?.firstChild?.textContent === name);
const dialogKnopf = (text) => knopfText(dlg(), text);

/** Die Vorschaubilder sind „lazy“; sie laden erst, wenn sie in die Nähe des Bildschirms kommen. */
async function alleBilderGeladen(text) {
  for (const i of document.querySelectorAll(".foto img")) i.loading = "eager";
  let ok = false;
  try { await warteBis(() => [...document.querySelectorAll(".foto img")].every((i) => i.complete && i.naturalWidth > 0), text, 4000); ok = true; } catch (e) { E.schlecht--; E.fehler.pop(); }
  t(ok, text);
}

async function oeffneFotos() {
  location.hash = "#/fotos";
  await warteBis(() => document.querySelector(".upload-zone") && document.querySelector("#fotos-benutzt"), "Fotos-Ansicht");
}

/** Lädt ein Foto über die Fotos-Ansicht hoch und wartet, bis die Verarbeitung fertig ist (Dialog bleibt offen). */
async function waehleDatei(datei) {
  dateiSetzen(document.querySelector(".upload-zone input[type=file]"), datei);
  await warteBis(dialogOffen, "Upload-Dialog");
  await warteBis(() => !dlg().querySelector(".upload-lauf"), "Verarbeitung fertig");
}
function schliesseDialog(text) { klick(dialogKnopf(text)); return warteBis(() => !dialogOffen(), "Dialog zu"); }
function setzeText(eingabe, wert) { eingabe.value = wert; eingabe.dispatchEvent(new Event("input", { bubbles: true })); }

// ---------------------------------------------------------------- Phase 1: Fotos-Ansicht, Hochladen, Meldungen
async function phase1Lauf() {
  E = ergebnis();
  const Z = await import("/admin/zustand.js");
  // Der Mock muss VOR dem Laden der Seite zurückgesetzt sein (siehe unten, setzeZurueck), sonst passt der geladene Stand nicht
  await mock("zustand", { queued_s: 0.3, laufend_s: 0.6, fremder_lauf: false, naechster_lauf: null });
  await oeffneFotos();

  // Ausgangslage
  t(document.querySelector("#fotos-benutzt").textContent.includes("(2)"), "Ausgangslage: 2 Fotos verwendet");
  t(document.querySelector("#fotos-frei").textContent.includes("(0)"), "Ausgangslage: 0 Fotos unbenutzt");
  t(leiste().hidden, "Ausgangslage: keine Änderungen");
  await alleBilderGeladen("Vorschaubilder der vorhandenen Fotos laden");

  // Verwendetes Foto löschen -> verweigert, mit Angabe der Stellen
  klick(knopfText(fotoZeile("terrasse-doppelhaus-1"), "Löschen"));
  await warteBis(dialogOffen, "Meldung: Foto wird benutzt");
  t(dialogText().includes("wird noch benutzt") && dialogText().includes("Startseite") && dialogText().includes("Referenzen"), "Verwendetes Foto: Meldung nennt Seiten: " + dialogText().slice(0, 200));
  t(!dialogKnopf("Löschen") && !!dialogKnopf("Verstanden"), "Verwendetes Foto: nur „Verstanden“, keine Löschen-Möglichkeit");
  await schliesseDialog("Verstanden");
  t(leiste().hidden, "Verwendetes Foto: nach der Ablehnung gibt es keine Änderung");

  // Falsche Dateien -> verständliche Meldungen
  const fehlerFaelle = [
    [new File(["%PDF-1.4 test"], "rechnung.pdf", { type: "application/pdf" }), "kein Foto in einem erlaubten Format", "PDF"],
    [new File([new Uint8Array(26 * 1024 * 1024)], "riesig.jpg", { type: "image/jpeg" }), "zu groß", "26 MB"],
    [new File(["das ist kein Bild"], "kaputt.jpg", { type: "image/jpeg" }), "nicht als Foto geöffnet", "kaputtes JPEG"],
    [new File(["ftypheic"], "IMG_0042.HEIC", { type: "image/heic" }), "HEIC", "HEIC"],
    [new File([], "leer.jpg", { type: "image/jpeg" }), "leer", "leere Datei"],
  ];
  for (const [datei, erwartet, was] of fehlerFaelle) {
    await waehleDatei(datei);
    const m = dlg().querySelector(".upload-status .meldung-fehler");
    t(m && m.textContent.includes(erwartet), `${was}: Meldung enthält „${erwartet}“ (war: ${m && m.textContent.slice(0, 120)})`);
    if (was === "26 MB") t(m && m.textContent.includes("25 MB"), "26 MB: Meldung nennt die Grenze 25 MB");
    t(dialogKnopf("Foto übernehmen").disabled, `${was}: „Foto übernehmen“ bleibt gesperrt`);
    await schliesseDialog("Abbrechen");
  }
  t(leiste().hidden, "Fehlerfälle: nichts hat sich geändert");
  E.daten.fehlerFaelle = fehlerFaelle.length;

  // Foto 1: Hochformat per EXIF-Drehung (6), mit „GPS“-Bytes in den Aufnahmedaten
  const f1 = await testbild({ breite: 3000, hoehe: 2000, orientierung: 6, gps: true, name: "IMG_0001.jpg" });
  await waehleDatei(f1);
  const info = dlg().querySelector(".upload-info").textContent;
  t(info.includes("2 Größen (800, 1600 Pixel breit)"), "Foto 1 (3000 px): Größen 800 und 1600, nichts hochskaliert: " + info);
  t(info.includes("2000 × 3000"), "Foto 1: EXIF-Drehung angewendet (Original 2000 × 3000): " + info);
  t([...dlg().querySelectorAll(".meldung-warn")].some((m) => m.textContent.includes("Hochformat")), "Foto 1: Hinweis auf Hochformat");
  t(dlg().textContent.includes("Datenschutz") && dlg().textContent.includes("Autokennzeichen") && dlg().textContent.includes("Einverständnis") && dlg().textContent.includes("Standort (GPS)"), "Datenschutzhinweis im Dialog (Personen, Kennzeichen, Einverständnis, GPS entfernt)");
  t(!dlg().querySelector(".upload-bild").hidden && dlg().querySelector(".upload-bild").naturalWidth > 0, "Foto 1: Vorschau sichtbar");
  const ok1 = dialogKnopf("Foto übernehmen");
  t(!ok1.disabled, "Foto 1: „Foto übernehmen“ ist nach der Verarbeitung frei");
  // Alt-Text ist Pflicht
  klick(ok1);
  await pause(80);
  t(dialogOffen() && dlg().querySelector("#foto-alt-f").textContent.includes("Pflichtfeld"), "Alt-Text leer: Dialog bleibt offen mit Pflichtfeld-Meldung");
  setzeText(dlg().querySelector("#foto-alt"), "Bild von einer Terrasse");
  klick(ok1); await pause(80);
  t(dialogOffen() && dlg().querySelector("#foto-alt-f").textContent.includes("Bild von"), "Alt-Text „Bild von …“: abgelehnt");
  setzeText(dlg().querySelector("#foto-alt"), "Testfoto Süd: Aluminium-Terrasse im Hochformat");
  setzeText(dlg().querySelector("#foto-name"), "Test Foto Süd");
  klick(ok1);
  await warteBis(() => !dialogOffen(), "Dialog nach „Foto übernehmen“ zu");
  await warteBis(() => fotoZeile("test-foto-sued"), "Foto 1 in der Liste");
  const z1 = fotoZeile("test-foto-sued");
  t(z1.textContent.includes("Neu, noch nicht veröffentlicht") && document.querySelector("#fotos-frei").textContent.includes("(1)"), "Foto 1: steht als „Neu“ unter „Nicht verwendet“");
  t(z1.textContent.includes("Testfoto Süd"), "Foto 1: Alt-Text in der Liste");
  const v1 = Z.S.fotos.get("test-foto-sued").varianten;
  t(JSON.stringify(v1.map((v) => [v.breite, v.hoehe])) === "[[800,1200],[1600,2400]]", "Foto 1: gespeicherte Größen 800×1200 und 1600×2400 (gedreht): " + JSON.stringify(v1.map((v) => [v.breite, v.hoehe])));
  const kopf1 = new Uint8Array(await v1[0].blob.arrayBuffer());
  const text1 = new TextDecoder("latin1").decode(kopf1);
  t(v1.every((v) => v.blob.type === "image/webp") && text1.startsWith("RIFF") && text1.slice(8, 12) === "WEBP", "Foto 1: echte WebP-Dateien");
  t(!/EXIF|XMP |GPS 51/.test(text1), "Foto 1: keine Aufnahmedaten (EXIF/GPS) in der WebP-Datei");
  t(v1[0].blob.size < 400 * 1024, `Foto 1: 800er unter 400 KB (${Math.round(v1[0].blob.size / 1024)} KB)`);

  // Foto 2: Querformat 4032 x 3024 -> drei Größen, Name automatisch mit Datum
  const f2 = await testbild({ breite: 4032, hoehe: 3024, name: "IMG_0002.jpg" });
  await waehleDatei(f2);
  t(dlg().querySelector(".upload-info").textContent.includes("3 Größen (800, 1600, 2048 Pixel breit)"), "Foto 2 (4032 px): drei Größen");
  t(![...dlg().querySelectorAll(".meldung-warn")].length, "Foto 2: keine Warnungen (Querformat, groß genug)");
  setzeText(dlg().querySelector("#foto-alt"), "Terrassenüberdachung aus Aluminium mit warmem LED-Licht am Abend");
  klick(dialogKnopf("Foto übernehmen"));
  await warteBis(() => !dialogOffen(), "Dialog Foto 2 zu");
  const d = new Date();
  const erwartet2 = `foto-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  await warteBis(() => fotoZeile(erwartet2), "Foto 2 in der Liste: " + erwartet2);
  const v2 = Z.S.fotos.get(erwartet2).varianten;
  t(JSON.stringify(v2.map((v) => [v.breite, v.hoehe])) === "[[800,600],[1600,1200],[2048,1536]]", "Foto 2: Größen 800×600, 1600×1200, 2048×1536: " + JSON.stringify(v2.map((v) => [v.breite, v.hoehe])));
  E.daten.foto2 = erwartet2;
  E.daten.groessenKB = v2.map((v) => Math.round(v.blob.size / 1024));

  // Kleines Foto: nur eine Datei in Originalbreite (nie hochskalieren)
  const f3 = await testbild({ breite: 640, hoehe: 480, name: "klein.jpg" });
  await waehleDatei(f3);
  t(dlg().querySelector(".upload-info").textContent.includes("1 Größe (640 Pixel breit)"), "Foto 640 px: eine Datei in Originalbreite: " + dlg().querySelector(".upload-info").textContent);
  t([...dlg().querySelectorAll(".meldung-warn")].some((m) => m.textContent.includes("nur 640 Pixel")), "Foto 640 px: Hinweis „zu klein für große Bildschirme“");
  await schliesseDialog("Abbrechen");

  // Änderungsanzeige und Entwurf
  t(!leiste().hidden && leiste().textContent.includes("2 ungespeicherte Änderungen"), "Leiste: 2 ungespeicherte Änderungen (zwei neue Fotos): " + leiste().textContent.replace(/\s+/g, " ").slice(0, 120));
  E.daten.entwurf = !!localStorage.getItem("zeca-admin.entwurf");
  await pause(500);   // Entwurf wird verzögert gesichert
  return E;
}

// ---------------------------------------------------------------- Phase 2 (nach dem Neuladen): Entwurf da, Foto einsetzen, veröffentlichen
async function phase2Lauf() {
  E = ergebnis();
  const Z = await import("/admin/zustand.js");
  const name2 = E.daten.foto2 = (() => { const d = new Date(); return `foto-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`; })();
  await warteBis(() => !leiste().hidden, "Leiste nach Neuladen");
  t(leiste().textContent.includes("2 ungespeicherte Änderungen"), "Nach dem Neuladen: Entwurf mit beiden Fotos ist noch da");
  await oeffneFotos();
  await warteBis(() => fotoZeile("test-foto-sued") && fotoZeile(name2), "beide Fotos nach Neuladen in der Liste");
  t(Z.S.fotos.has("test-foto-sued") && Z.S.fotos.has(name2), "Fotodateien aus dem Zwischenspeicher (IndexedDB) wiederhergestellt");
  await alleBilderGeladen("Vorschaubilder der neuen Fotos laden nach dem Neuladen");

  // Foto im Formular auswählen (Referenzen, Projekt 1, Foto 1)
  location.hash = "#/b/referenzen";
  const feld = await warteBis(() => document.querySelector('[data-pfad="projekte.0.fotos.0.bild"]'), "Bildfeld Referenzen");
  feld.closest("details.abschnitt") && (feld.closest("details.abschnitt").open = true);
  t(!!feld.querySelector("img.bild-vorschau") && feld.textContent.includes("terrasse-doppelhaus-1"), "Bildfeld zeigt Vorschau und Name des aktuellen Fotos");
  t(feld.textContent.includes("Standard-Bildbeschreibung"), "Bildfeld zeigt den Alt-Text");
  klick(knopfText(feld, "Anderes Foto wählen"));
  await warteBis(dialogOffen, "Auswahldialog");
  const wahlen = [...dlg().querySelectorAll(".fotowahl-eintrag")];
  t(wahlen.length === 4, "Auswahldialog zeigt alle 4 Fotos (2 alte, 2 neue): " + wahlen.length);
  t(wahlen.every((w) => w.querySelector("img") && w.querySelector(".fotowahl-alt")), "Auswahldialog: jedes Foto mit Vorschau und Alt-Text");
  t(dialogText().includes("(neu)"), "Auswahldialog: neue Fotos sind gekennzeichnet");
  const radio = dlg().querySelector(`input[value="${name2}"]`);
  radio.click();
  klick(dialogKnopf("Dieses Foto verwenden"));
  await warteBis(() => !dialogOffen(), "Auswahldialog zu");
  await warteBis(() => feld.textContent.includes(name2), "Bildfeld wird aktualisiert", 3000).catch(() => { E.schlecht--; E.fehler.pop(); });
  t(feld.textContent.includes(name2) && feld.querySelector("img").complete, "Bildfeld zeigt jetzt das neue Foto");
  t(Z.S.arbeit.get("inhalt/seiten/referenzen.json").projekte[0].fotos[0].bild === name2, "Referenzen-Entwurf verweist auf das neue Foto");
  const altFeld = [...feld.parentElement.children].find((c) => c.getAttribute("data-pfad") === "projekte.0.fotos.0.alt");
  t(altFeld && altFeld.querySelector("input, textarea").value === "" && Z.S.arbeit.get("inhalt/seiten/referenzen.json").projekte[0].fotos[0].alt === undefined,
    "Foto gewechselt: die eigene Bildbeschreibung des alten Fotos wurde geleert (es gilt die des neuen)");
  t([...document.querySelectorAll(".hinweis")].some((h) => h.textContent.includes("gehörte zum alten Foto")), "Hinweis mit Rückgängig zur geleerten Bildbeschreibung");
  // „Neues Foto hochladen“ direkt am Feld
  t(!!knopfText(feld, "Neues Foto hochladen"), "Bildfeld hat „Neues Foto hochladen“");

  // Vorschaubild (og_bild): nur Fotos mit JPG
  location.hash = "#/b/start";
  await warteBis(() => /^Start/.test(document.getElementById("titel")?.textContent || ""), "Ansicht Startseite");
  const og = await warteBis(() => document.querySelector('[data-pfad="seo.og_bild"]'), "Feld Vorschaubild Startseite");
  t(!knopfText(og, "Neues Foto hochladen"), "Vorschaubild-Feld bietet kein „Neues Foto hochladen“ an (neue Fotos haben keine JPG-Datei)");
  klick(knopfText(og, "Anderes Foto wählen"));
  await warteBis(dialogOffen, "Auswahl Vorschaubild");
  t(dlg().querySelectorAll(".fotowahl-eintrag").length === 3, "Vorschaubild-Auswahl: 2 Fotos mit JPG + „Kein Foto“ (neue fehlen): " + dlg().querySelectorAll(".fotowahl-eintrag").length);
  await schliesseDialog("Abbrechen");

  // Veröffentlichen
  const vorher = (await mock("stand")).verlauf.length;
  klick(leiste().querySelector('[data-id="veroeffentlichen"]'));
  await warteBis(() => /Live/.test(leiste().textContent), "Leiste: Live", 40000);
  const nach = await mock("stand");
  t(nach.verlauf.length === vorher + 1, "Genau ein neuer Commit");
  t(nach.verlauf[0].message.startsWith("Admin: ") && nach.verlauf[0].message.includes("Fotos") && nach.verlauf[0].message.includes("Referenzen"), "Commit-Nachricht nennt Fotos und Referenzen: " + nach.verlauf[0].message);
  const neu = nach.dateien.filter((p) => /images\/bestand\/(test-foto-sued|foto-\d+)-/.test(p));
  t(neu.length === 5, "Commit enthält 2 + 3 Größen (5 Dateien): " + neu.join(", "));
  t([800, 1600, 2048].every((b) => nach.dateien.includes(`images/bestand/${name2}-${b}.webp`)), "Foto 2: -800, -1600 und -2048 im Commit");
  t(nach.laeufe.at(-1).conclusion === "success", "Bauauftrag (bauen.py auf dem Commit-Stand) erfolgreich");
  const bl = JSON.parse(await (await fetch(`${MOCK}/__test/datei?pfad=inhalt/bilder.json`)).text());
  t(bl.bilder.some((b) => b.name === name2 && b.alt.includes("LED-Licht")) && bl.bilder.some((b) => b.name === "test-foto-sued"), "bilder.json im Commit enthält beide Einträge mit Alt-Text");
  const ref = JSON.parse(await (await fetch(`${MOCK}/__test/datei?pfad=inhalt/seiten/referenzen.json`)).text());
  t(ref.projekte[0].fotos[0].bild === name2, "referenzen.json im Commit verweist auf das neue Foto");
  t(Z.S.fotos.size === 0, "Nach dem Veröffentlichen: keine ausstehenden Fotos mehr");
  t(!/ungespeicherte/.test(leiste().textContent), "Nach dem Veröffentlichen: keine ungespeicherten Änderungen");
  // Vorschau bleibt, auch wenn die Seite das Foto noch nicht ausliefert
  await oeffneFotos();
  await alleBilderGeladen("Vorschaubilder nach dem Veröffentlichen (lokale Kopie) laden");
  t(fotoZeile(name2).textContent.includes("Referenzen") && !fotoZeile(name2).textContent.includes("Neu, noch nicht"), "Foto 2 ist jetzt als „Verwendet in: Referenzen“ gelistet, nicht mehr „Neu“");
  E.daten.commit = nach.kopf;
  return E;
}

// ---------------------------------------------------------------- Phase 3: Löschen
async function phase3Lauf() {
  E = ergebnis();
  const Z = await import("/admin/zustand.js");
  const name2 = (() => { const d = new Date(); return `foto-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`; })();
  await oeffneFotos();
  // verwendetes Foto (gerade eingebaut) -> verweigert
  klick(knopfText(fotoZeile(name2), "Löschen"));
  await warteBis(dialogOffen, "Meldung verwendetes neues Foto");
  t(dialogText().includes("wird noch benutzt") && dialogText().includes("Referenzen") && dialogText().includes("Projekt 1"), "Neu eingebautes Foto: Löschen verweigert, Meldung nennt Referenzen › Projekt 1: " + dialogText().slice(0, 260));
  await schliesseDialog("Verstanden");
  t(leiste().hidden || !/ungespeicherte/.test(leiste().textContent), "Verweigertes Löschen ändert nichts");
  // nicht verwendetes Foto löschen
  const zeile = fotoZeile("test-foto-sued");
  t(!!zeile && document.querySelector("#fotos-frei").closest("section").contains(zeile), "test-foto-sued steht unter „Nicht verwendet“");
  klick(knopfText(zeile, "Löschen"));
  await warteBis(() => !fotoZeile("test-foto-sued"), "Foto aus der Liste");
  t([...document.querySelectorAll(".hinweis")].some((h) => h.textContent.includes("beim Veröffentlichen gelöscht")), "Hinweis: wird beim Veröffentlichen gelöscht (mit Rückgängig)");
  t(/1 ungespeicherte Änderung/.test(leiste().textContent), "Leiste: 1 ungespeicherte Änderung");
  // Rückgängig-Knopf im Hinweis bringt es zurück
  klick(knopfText([...document.querySelectorAll(".hinweis")].find((h) => h.textContent.includes("beim Veröffentlichen gelöscht")), "Rückgängig"));
  await warteBis(() => fotoZeile("test-foto-sued"), "Foto wieder da");
  t(leiste().hidden || !/ungespeicherte/.test(leiste().textContent), "Rückgängig: keine Änderung mehr");
  klick(knopfText(fotoZeile("test-foto-sued"), "Löschen"));
  await warteBis(() => !fotoZeile("test-foto-sued"), "Foto wieder weg");
  const vorher = (await mock("stand")).verlauf.length;
  klick(leiste().querySelector('[data-id="veroeffentlichen"]'));
  await warteBis(() => /Live/.test(leiste().textContent), "Live nach dem Löschen", 40000);
  const nach = await mock("stand");
  t(nach.verlauf.length === vorher + 1, "Löschen = genau ein Commit");
  t(!nach.dateien.some((p) => p.includes("test-foto-sued")), "Commit löscht beide Größen von test-foto-sued");
  t([800, 1600, 2048].every((b) => nach.dateien.includes(`images/bestand/${name2}-${b}.webp`)) && nach.dateien.includes("images/bestand/terrasse-doppelhaus-1-800.webp"), "andere Fotos bleiben");
  t(nach.laeufe.at(-1).conclusion === "success", "Bauauftrag nach dem Löschen erfolgreich");
  const bl = JSON.parse(await (await fetch(`${MOCK}/__test/datei?pfad=inhalt/bilder.json`)).text());
  t(!bl.bilder.some((b) => b.name === "test-foto-sued") && bl.bilder.length === 3, "bilder.json ohne das gelöschte Foto (3 Einträge)");
  t(Z.S.fotoUrls.has("test-foto-sued") === false, "Vorschau-Adresse des gelöschten Fotos wurde freigegeben");
  // Verlauf: Rückgängig bringt das gelöschte Foto samt Dateien zurück
  const rueck = await import("/admin/aktionen.js");
  const verlauf = await rueck.verlaufLaden();
  t(verlauf[0].nachricht.includes("Fotos"), "Verlauf nennt „Fotos“: " + verlauf[0].nachricht);
  const r = await rueck.macheRueckgaengig(verlauf[0]);
  t(r && r.ok, "Rückgängig des Löschens klappt");
  await warteBis(() => /Live|zurückgenommen/.test(leiste().textContent), "Live nach Rückgängig", 40000);
  const wieder = await mock("stand");
  t([800, 1600].every((b) => wieder.dateien.includes(`images/bestand/test-foto-sued-${b}.webp`)), "Rückgängig stellt die Fotodateien wieder her");
  return E;
}

// Jede Phase meldet auch einen Abbruch als Ergebnis (mit allem, was bis dahin geprüft wurde)
const sicher = (f) => async () => {
  try { return await f(); } catch (e) { E.schlecht++; E.fehler.push("ABBRUCH: " + (e && e.message)); return E; }
};
export const phase1 = sicher(phase1Lauf);
export const phase2 = sicher(phase2Lauf);
export const phase3 = sicher(phase3Lauf);

/** Messungen wie in Phase 2a: Textkontrast, Touch-Ziele (44 px), waagerechter Überlauf, dazu Fehler in der Konsole fängt der Aufrufer ab. */
export async function messe() {
  const m = await import("/admin/test/pruefe_seite.js?v=" + Date.now());
  const r = m.pruefe(document.body);
  return { texte: r.geprueftTexte, ziele: r.geprueftZiele, kontrast: r.kontrast, kleinsterKontrast: r.kleinsterKontrast, zielFehler: r.ziele, ueberlauf: r.ueberlauf, breite: innerWidth };
}

/** Öffnet den Auswahldialog am ersten Bildfeld der Referenzen (für Bildschirmfotos); Dialog bleibt offen. */
export async function zeigeAuswahl() {
  location.hash = "#/b/referenzen";
  const feld = await warteBis(() => document.querySelector('[data-pfad="projekte.0.fotos.0.bild"]'), "Bildfeld Referenzen");
  feld.closest("details.abschnitt") && (feld.closest("details.abschnitt").open = true);
  klick(knopfText(feld, "Foto wählen"));
  await warteBis(dialogOffen, "Auswahldialog");
  return true;
}

/** Meldung „Foto wird noch benutzt“ (für Bildschirmfotos); Dialog bleibt offen. */
export async function zeigeVerwendetMeldung() {
  await oeffneFotos();
  klick(knopfText([...document.querySelectorAll(".foto")][0], "Löschen"));
  await warteBis(dialogOffen, "Meldung");
  return true;
}
export const schliesse = (text) => schliesseDialog(text);

/** Vor dem Test auf einer Seite OHNE Verwaltung (z. B. /robots.txt) ausführen: Mock, Browser-Speicher und Fotos zurücksetzen. */
export async function setzeZurueck() {
  await mock("zuruecksetzen", {});
  localStorage.clear();
  localStorage.setItem("zeca-admin.schluessel", "test-token");
  await new Promise((ok) => { const r = indexedDB.deleteDatabase("zeca-admin"); r.onsuccess = r.onerror = r.onblocked = ok; });
  return true;
}

// ---------------------------------------------------------------- Phase 4: Verwerfen und Abmelden räumen die Fotos weg
async function phase4Lauf() {
  E = ergebnis();
  const Z = await import("/admin/zustand.js");
  const Sp = await import("/admin/fotospeicher.js");
  await oeffneFotos();
  const vorher = Z.aktuelleBilder().bilder.length;
  const hochladen = async (name) => {
    await waehleDatei(await testbild({ breite: 1800, hoehe: 1200, name: name + ".jpg" }));
    setzeText(dlg().querySelector("#foto-alt"), "Testfoto zum Verwerfen und Abmelden, Terrasse");
    setzeText(dlg().querySelector("#foto-name"), name);
    klick(dialogKnopf("Foto übernehmen"));
    await warteBis(() => !dialogOffen(), "Dialog zu");
    await warteBis(() => fotoZeile(name), "Foto in der Liste");
  };
  // Verwerfen
  await hochladen("verwerfen-test");
  t(Z.S.fotos.has("verwerfen-test") && /1 ungespeicherte Änderung/.test(leiste().textContent), "Neues Foto: 1 ungespeicherte Änderung");
  await pause(500);
  t((await Sp.ladeFotos()).some((f) => f.name === "verwerfen-test"), "Foto liegt im Zwischenspeicher (IndexedDB)");
  const url = Z.S.fotoUrls.get("verwerfen-test");
  klick(leiste().querySelector('[data-id="verwerfen"]'));
  await warteBis(dialogOffen, "Verwerfen-Rückfrage");
  klick(dialogKnopf("Verwerfen"));
  await warteBis(() => !dialogOffen(), "Rückfrage zu");
  await pause(700);
  t(Z.S.fotos.size === 0 && !Z.S.fotoUrls.has("verwerfen-test"), "Verwerfen: Foto und Vorschau-Adresse sind weg");
  t((await Sp.ladeFotos()).length === 0, "Verwerfen: Zwischenspeicher (IndexedDB) ist leer");
  t(Z.aktuelleBilder().bilder.length === vorher && !fotoZeile("verwerfen-test"), "Verwerfen: Bildliste wie vorher");
  t(!!url, "(Vorschau-Adresse hatte existiert)");
  // Abmelden
  await hochladen("abmelden-test");
  await pause(500);
  t((await Sp.ladeFotos()).length === 1, "zweites Foto im Zwischenspeicher");
  klick(document.getElementById("abmelden"));
  await warteBis(dialogOffen, "Abmelden-Rückfrage");
  klick(dialogKnopf("Abmelden"));
  await warteBis(() => !dialogOffen(), "Rückfrage zu");
  await pause(700);
  t((await Sp.ladeFotos()).length === 0 && Z.S.fotos.size === 0 && Z.S.fotoUrls.size === 0, "Abmelden: Fotos aus Speicher und Arbeitsspeicher entfernt");
  t(localStorage.getItem("zeca-admin.schluessel") === null && localStorage.getItem("zeca-admin.entwurf") === null, "Abmelden: Schlüssel und Entwurf gelöscht");
  return E;
}
export const phase4 = sicher(phase4Lauf);

/** Zustand für Bildschirmfotos: öffnet den Upload-Dialog mit einem fertig verarbeiteten Foto (nicht übernommen). */
export async function zeigeUploadDialog({ breite = 3000, hoehe = 2000, orientierung = 0 } = {}) {
  await oeffneFotos();
  const f = await testbild({ breite, hoehe, orientierung, name: "IMG_0100.jpg" });
  await waehleDatei(f);
  setzeText(dlg().querySelector("#foto-alt"), "Terrassenüberdachung aus Aluminium mit LED-Licht am Abend");
  return true;
}
