// Tests für fotos.js (reine Foto-Logik) und die Regel für Vorschaubilder in pruefung.js. Aufruf: node admin/test/fotos.test.mjs
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  waehleBreiten, slug, eindeutigerName, datumKompakt, variantenImStand, namenAusDateien, dateienEinesFotos,
  pruefeFotoDatei, pruefeAlt, webpGroesse, bildMasse, findeVerwendungen, kommtVor, zaehleFotoAenderungen, MAX_DATEI, MAX_PIXEL,
  formatVon, FOTO_FORMATE, MELDUNG_HEIC,
} from "../fotos.js";
import { baueKontext, pruefeBlatt, pruefeDatei } from "../pruefung.js";

const wurzel = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const json = (rel) => JSON.parse(readFileSync(join(wurzel, rel), "utf8"));
let ok = 0, schlecht = 0;
const pruefe = (b, t) => { if (b) ok++; else { schlecht++; console.log("   FEHLER: " + t); } };
const gleich = (a, b) => JSON.stringify(a) === JSON.stringify(b);

console.log("Größen wählen: nie hochskalieren, mindestens eine");
pruefe(gleich(waehleBreiten(4032), [800, 1600, 2048]), "4032 px: alle drei Größen");
pruefe(gleich(waehleBreiten(2048), [800, 1600, 2048]), "genau 2048 px: alle drei");
pruefe(gleich(waehleBreiten(2047), [800, 1600]), "2047 px: nur 800 und 1600");
pruefe(gleich(waehleBreiten(1600), [800, 1600]), "1600 px: 800 und 1600");
pruefe(gleich(waehleBreiten(1200), [800]), "1200 px: nur 800 (keine Größe über dem Original)");
pruefe(gleich(waehleBreiten(800), [800]), "800 px: 800");
pruefe(gleich(waehleBreiten(640), [640]), "640 px: eine Datei in Originalbreite");
pruefe(gleich(waehleBreiten(1), [1]), "1 px: eine Datei");
pruefe(waehleBreiten(5000).every((b) => b <= 5000), "nie größer als das Original");

console.log("Dateiname");
pruefe(slug("Carport Essen") === "carport-essen", "Leerzeichen -> Bindestrich");
pruefe(slug("Überdachung für Müller & Söhne – Größe!") === "ueberdachung-fuer-mueller-soehne-groesse", `Umlaute und Sonderzeichen: ${slug("Überdachung für Müller & Söhne – Größe!")}`);
pruefe(slug("  --Café  Crème-- ") === "cafe-creme", "Akzente weg, Ränder sauber");
pruefe(slug("???") === "" && slug("") === "" && slug(null) === "", "nichts Brauchbares -> leer");
pruefe(slug("a".repeat(80)).length <= 44, "gekürzt");
pruefe(/^[a-z0-9][a-z0-9\-/]*$/.test(slug("Wintergarten 2026/Süd")), "passt zum Schema-Muster von bilder.json");
const d = new Date(2026, 9, 27);
pruefe(datumKompakt(d) === "20261027", "Datum kompakt");
pruefe(eindeutigerName("", new Set(), d) === "foto-20261027", "ohne Beschriftung: foto-<Datum>");
pruefe(eindeutigerName("Carport Essen", new Set(["carport-essen"])) === "carport-essen-2", "Doppelung -> -2");
pruefe(eindeutigerName("Carport Essen", new Set(["carport-essen", "carport-essen-2"])) === "carport-essen-3", "Doppelung -> -3");
pruefe(eindeutigerName("", new Set(["foto-20261027"]), d) === "foto-20261027-2", "Datumsname doppelt -> -2");
const schemaName = json("inhalt/schema/bilder.json").felder[1].eintrag.felder[0];
pruefe(new RegExp(schemaName.muster).test(eindeutigerName("Haus am See", new Set())) && eindeutigerName("x".repeat(100), new Set()).length <= schemaName.max, "Name passt zu Muster und Länge im Schema");

console.log("Größen und Dateien im Stand");
const dateien = readdirSync(join(wurzel, "images/bestand")).map((f) => "images/bestand/" + f).concat(["inhalt/seite.json"]);
const v1 = variantenImStand(dateien, "images/bestand", "terrasse-doppelhaus-1");
pruefe(gleich(v1.map((v) => v.breite), [800, 1600, 2048]), "drei Größen gefunden, sortiert");
pruefe(variantenImStand(dateien, "images/bestand", "terrasse-doppelhaus").length === 0, "Teilname trifft nicht (wie bauen.py)");
pruefe(variantenImStand(["images/bestand/a-b-800.webp", "images/bestand/a-800.webp"], "images/bestand", "a").length === 1, "a-b-800 gehört nicht zu a");
pruefe(variantenImStand(["images/bestand/foto.x-800.webp", "images/bestand/fotoxx-800.webp"], "images/bestand", "foto.x").length === 1, "Sonderzeichen im Namen werden maskiert");
const namen = namenAusDateien(dateien, "images/bestand");
pruefe(namen.has("terrasse-doppelhaus-1") && namen.has("terrasse-doppelhaus-2"), "Namen aus Dateien");
const bilder = json("inhalt/bilder.json").bilder;
const weg = dateienEinesFotos(dateien, "images/bestand", bilder[0], bilder);
pruefe(weg.length === 7 && weg.includes("images/bestand/terrasse-doppelhaus-1.jpg") && weg.includes("images/bestand/terrasse-doppelhaus-1-800.webp.json"), `Löschliste: Größen, Maßdateien, JPG (${weg.length})`);
pruefe(!weg.some((p) => p.includes("doppelhaus-2")), "Löschliste enthält nichts von anderen Fotos");
const geteilt = dateienEinesFotos(dateien, "images/bestand", { name: "x", original: "terrasse-doppelhaus-1.jpg" }, [{ name: "x", original: "terrasse-doppelhaus-1.jpg" }, bilder[0]]);
pruefe(!geteilt.includes("images/bestand/terrasse-doppelhaus-1.jpg"), "JPG, das ein anderes Foto auch nutzt, bleibt");

console.log("Datei prüfen");
pruefe(pruefeFotoDatei({ name: "a.jpg", type: "image/jpeg", size: 3e6 }) === null, "JPEG ok");
pruefe(pruefeFotoDatei({ name: "a.png", type: "image/png", size: 3e6 }) === null, "PNG ok");
pruefe(pruefeFotoDatei({ name: "a.webp", type: "image/webp", size: 3e6 }) === null, "WebP ok");
pruefe(pruefeFotoDatei({ name: "IMG_1.HEIC", type: "", size: 3e6 }) === null, "HEIC wird erst beim Öffnen geprüft");
pruefe(/zu groß/.test(pruefeFotoDatei({ name: "gross.jpg", type: "image/jpeg", size: MAX_DATEI + 1 })) && /25 MB/.test(pruefeFotoDatei({ name: "gross.jpg", type: "image/jpeg", size: MAX_DATEI + 1 })), "über 25 MB: verständliche Meldung");
pruefe(pruefeFotoDatei({ name: "genau.jpg", type: "image/jpeg", size: MAX_DATEI }) === null, "genau 25 MB ist erlaubt");
pruefe(/kein Foto/.test(pruefeFotoDatei({ name: "text.pdf", type: "application/pdf", size: 1000 })), "falscher Typ (PDF)");
pruefe(/kein Foto/.test(pruefeFotoDatei({ name: "film.mp4", type: "video/mp4", size: 1000 })), "falscher Typ (Video)");
pruefe(/leer/.test(pruefeFotoDatei({ name: "leer.jpg", type: "image/jpeg", size: 0 })), "leere Datei");

console.log("Bildbeschreibung");
pruefe(/Pflichtfeld/.test(pruefeAlt("")) && /Pflichtfeld/.test(pruefeAlt("   ")), "leer -> Pflichtfeld");
pruefe(/ausführlicher/.test(pruefeAlt("Haus")), "zu kurz");
pruefe(/Zu lang/.test(pruefeAlt("x".repeat(201))) && pruefeAlt("x".repeat(200)) === null, "Grenze 200");
pruefe(/Bild von/.test(pruefeAlt("Bild von einer Terrasse")) && /Bild von/.test(pruefeAlt("Foto von oben auf das Dach")), "„Bild von“ am Anfang wird abgelehnt");
pruefe(pruefeAlt("Terrassenüberdachung aus Aluminium mit LED-Licht am Abend") === null, "gute Beschreibung ok");
pruefe(pruefeAlt("Aufnahme des Carports von der Straße") === null, "„Aufnahme des“ ist erlaubt (nur „von/vom“ wird abgelehnt)");

console.log("WebP-Kopf (gleiche Logik wie bauen.py)");
const kopf = (f) => new Uint8Array(readFileSync(join(wurzel, "images/bestand", f)).subarray(0, 32));
pruefe(gleich(webpGroesse(kopf("terrasse-doppelhaus-1-800.webp")), { breite: 800, hoehe: 600 }), "VP8 800 x 600");
pruefe(gleich(webpGroesse(kopf("terrasse-doppelhaus-1-2048.webp")), { breite: 2048, hoehe: 1536 }), "VP8 2048 x 1536");
pruefe(gleich(webpGroesse(kopf("logo.webp")), { breite: 907, hoehe: 144 }), "VP8L Logo 907 x 144");
pruefe(webpGroesse(new Uint8Array(40)) === null && webpGroesse(new Uint8Array(10)) === null, "keine WebP-Datei -> null");

console.log("Maße aus dem Dateikopf (vor dem Dekodieren)");
const u16 = (n) => [(n >> 8) & 255, n & 255];
const u32 = (n) => [(n >>> 24) & 255, (n >> 16) & 255, (n >> 8) & 255, n & 255];
const segment = (marke, nutzlast) => [0xff, marke, ...u16(nutzlast.length + 2), ...nutzlast];
const sof = (marke, b, h) => segment(marke, [8, ...u16(h), ...u16(b), 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]);
const jpeg = (...teile) => new Uint8Array([0xff, 0xd8, ...teile.flat()]);
pruefe(gleich(bildMasse(jpeg(segment(0xe0, new Array(14).fill(0)), sof(0xc0, 4032, 3024))), { format: "jpeg", breite: 4032, hoehe: 3024 }), "JPEG 4032 x 3024 (baseline)");
pruefe(gleich(bildMasse(jpeg(sof(0xc2, 800, 600))), { format: "jpeg", breite: 800, hoehe: 600 }), "JPEG progressiv (SOF2)");
pruefe(gleich(bildMasse(jpeg(segment(0xe1, new Array(30000).fill(1)), segment(0xdb, new Array(65).fill(2)), sof(0xc0, 1200, 900))), { format: "jpeg", breite: 1200, hoehe: 900 }), "JPEG mit großem EXIF-Abschnitt davor");
pruefe(gleich(bildMasse(jpeg([0xff, 0xff, 0xff], sof(0xc0, 10, 20))), { format: "jpeg", breite: 10, hoehe: 20 }), "JPEG mit Füllbytes");
pruefe(gleich(bildMasse(jpeg(segment(0xc4, new Array(20).fill(0)), sof(0xc1, 50, 40))), { format: "jpeg", breite: 50, hoehe: 40 }), "DHT (0xC4) wird nicht für einen Rahmenkopf gehalten");
pruefe(gleich(bildMasse(jpeg(sof(0xc0, 60000, 60000))), { format: "jpeg", breite: 60000, hoehe: 60000 }) && 60000 * 60000 > MAX_PIXEL, "Riesen-JPEG (3,6 Gigapixel in wenigen Bytes) wird erkannt und liegt über MAX_PIXEL");
pruefe(bildMasse(jpeg(segment(0xe1, new Array(65000).fill(1)))).mehr === true, "JPEG ohne Rahmenkopf im gelesenen Stück -> mehr Bytes nötig");
pruefe(bildMasse(jpeg(segment(0xe0, new Array(14).fill(0)), [0xff, 0xda, 0, 2])) === null, "Bilddaten vor dem Rahmenkopf -> kaputt");
pruefe(bildMasse(jpeg(sof(0xc0, 0, 20))) === null, "Breite 0 -> kaputt");
pruefe(bildMasse(jpeg([0x12, 0x34, 0x56, 0x78])) === null, "kein Abschnitt -> null");
pruefe(bildMasse(new Uint8Array([0xff, 0xd8])) === null, "zu kurz -> null");
const pngKopf = (b, h) => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...u32(13), 0x49, 0x48, 0x44, 0x52, ...u32(b), ...u32(h), 8, 2, 0, 0, 0]);
pruefe(gleich(bildMasse(pngKopf(1920, 1080)), { format: "png", breite: 1920, hoehe: 1080 }), "PNG 1920 x 1080");
pruefe(bildMasse(pngKopf(100000, 100000)).breite * 100000 > MAX_PIXEL, "Riesen-PNG wird erkannt");
pruefe(bildMasse(pngKopf(0, 5)) === null, "PNG mit Breite 0 -> kaputt");
pruefe(bildMasse(pngKopf(10, 10).slice(0, 20)) === null, "abgeschnittenes PNG -> null");
pruefe(gleich(bildMasse(kopf("terrasse-doppelhaus-1-800.webp")), { format: "webp", breite: 800, hoehe: 600 }), "WebP (VP8) über bildMasse");
pruefe(gleich(bildMasse(kopf("logo.webp")), { format: "webp", breite: 907, hoehe: 144 }), "WebP (VP8L) über bildMasse");
const vp8x = (b, h) => { const k = new Uint8Array(32); k.set([0x52, 0x49, 0x46, 0x46, 0x16, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x58, 10, 0, 0, 0, 0, 0, 0, 0], 0); k.set([(b - 1) & 255, ((b - 1) >> 8) & 255, ((b - 1) >> 16) & 255, (h - 1) & 255, ((h - 1) >> 8) & 255, ((h - 1) >> 16) & 255], 24); return k; };
pruefe(gleich(bildMasse(vp8x(16000, 16000)), { format: "webp", breite: 16000, hoehe: 16000 }), "WebP (VP8X) 16000 x 16000");
pruefe(bildMasse(new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 0, 1, 0])) === null, "GIF -> unbekannt (null)");
pruefe(bildMasse(new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'></svg>")) === null, "SVG -> unbekannt (null)");
pruefe(bildMasse(new Uint8Array(0)) === null && bildMasse(null) === null, "leer -> null");
// Alle vorhandenen Fotos des Projekts haben lesbare Maße, die zu bauen.py passen
for (const f of readdirSync(join(wurzel, "images/bestand")).filter((x) => x.endsWith(".webp"))) {
  const m = bildMasse(kopf(f));
  pruefe(m && m.breite > 0 && m.hoehe > 0 && m.breite * m.hoehe < MAX_PIXEL, `${f}: Maße aus dem Kopf lesbar`);
}


console.log("Wo wird ein Foto benutzt?");
const schemaVon = (rel) => { for (const f of readdirSync(join(wurzel, "inhalt/schema"))) { const s = json("inhalt/schema/" + f); if (s.gilt_fuer.includes(rel)) return s; } return null; };
const start = findeVerwendungen(schemaVon("inhalt/seiten/startseite.json").felder, json("inhalt/seiten/startseite.json"), "terrasse-doppelhaus-1");
pruefe(start.length >= 2 && start.some((w) => /Eingangsbereich/.test(w)), `Startseite: ${start.length} Stellen (${start[0]})`);
const ref = findeVerwendungen(schemaVon("inhalt/seiten/referenzen.json").felder, json("inhalt/seiten/referenzen.json"), "terrasse-doppelhaus-2");
pruefe(ref.length >= 1 && ref.every((w) => w.includes(" › ")), `Referenzen: ${ref[0]}`);
pruefe(findeVerwendungen(schemaVon("inhalt/seiten/startseite.json").felder, json("inhalt/seiten/startseite.json"), "gibt-es-nicht").length === 0, "nicht benutztes Foto -> keine Treffer");
pruefe(kommtVor(json("inhalt/seiten/startseite.json"), "terrasse-doppelhaus-1") && !kommtVor(json("inhalt/seiten/startseite.json"), "gibt-es-nicht"), "kommtVor");
let alleBenutzt = new Set();
for (const f of readdirSync(join(wurzel, "inhalt/seiten"))) {
  const rel = "inhalt/seiten/" + f;
  const s = schemaVon(rel);
  for (const b of bilder) if (s && findeVerwendungen(s.felder, json(rel), b.name).length) alleBenutzt.add(b.name);
}
pruefe(alleBenutzt.size === bilder.length, "beide vorhandenen Fotos werden laut Schema benutzt (also nicht löschbar)");

console.log("Änderungen an der Bildliste zählen");
const liste4 = { ordner: "images/bestand", bilder: [{ name: "a", alt: "A" }, { name: "b", alt: "B" }, { name: "c", alt: "C" }, { name: "d", alt: "D" }], logo: { datei: "logo.webp", alt: "x" } };
const ohneC = { ...liste4, bilder: liste4.bilder.filter((b) => b.name !== "c") };
pruefe(zaehleFotoAenderungen(liste4, liste4) === 0, "unverändert: 0");
pruefe(zaehleFotoAenderungen(liste4, ohneC) === 1, "ein Foto aus der Mitte entfernt: 1 (nicht 3 wie bei einem Zeilenvergleich)");
pruefe(zaehleFotoAenderungen(liste4, { ...liste4, bilder: [...liste4.bilder, { name: "e", alt: "E" }] }) === 1, "ein Foto neu: 1");
pruefe(zaehleFotoAenderungen(liste4, { ...ohneC, bilder: [...ohneC.bilder, { name: "e", alt: "E" }] }) === 2, "eines entfernt, eines neu: 2");
pruefe(zaehleFotoAenderungen(liste4, { ...liste4, bilder: [...liste4.bilder].reverse() }) === 0, "andere Reihenfolge zählt nicht");
pruefe(zaehleFotoAenderungen(liste4, { ...liste4, bilder: liste4.bilder.map((b) => (b.name === "b" ? { ...b, alt: "Neu" } : b)) }) === 1, "geänderte Beschreibung: 1");

console.log("Vorschaubild braucht JPG (og_bild)");
const kontext = baueKontext({ seite: json("inhalt/seite.json"), bilder: { bilder: [...bilder, { name: "neu-ohne-jpg", alt: "Neues Foto ohne JPG" }] }, struktur: json("inhalt/struktur.json") });
const ogSpec = { schluessel: "og_bild", typ: "bild", pflicht: false };
pruefe(pruefeBlatt(ogSpec, "terrasse-doppelhaus-1", kontext) === null, "altes Foto mit JPG als Vorschaubild ok");
pruefe(/JPG/.test(pruefeBlatt(ogSpec, "neu-ohne-jpg", kontext)), "neues Foto ohne JPG als Vorschaubild wird abgelehnt");
pruefe(pruefeBlatt({ schluessel: "bild", typ: "bild" }, "neu-ohne-jpg", kontext) === null, "als normales Foto ist es erlaubt");
pruefe(/gibt es nicht/.test(pruefeBlatt({ schluessel: "bild", typ: "bild" }, "unbekannt", kontext)), "unbekanntes Foto");
const startFehler = pruefeDatei(schemaVon("inhalt/seiten/startseite.json").felder, json("inhalt/seiten/startseite.json"), kontext, "inhalt/seiten/startseite.json");
pruefe(startFehler.length === 0, "vorhandene Startseite bleibt fehlerfrei");

console.log("JPEG-Rückfall (Feld format in der Bildliste)");
pruefe(formatVon({ name: "x" }) === "webp" && formatVon({ format: "webp" }) === "webp" && formatVon({ format: "jpg" }) === "jpg", "formatVon: ohne Angabe WebP, sonst wie angegeben");
pruefe(formatVon({ format: "gif" }) === "webp" && formatVon(undefined) === "webp" && formatVon(null) === "webp", "formatVon: Unbekanntes und Fehlendes -> WebP");
pruefe(FOTO_FORMATE.jpg.mime === "image/jpeg" && FOTO_FORMATE.jpg.endung === "jpg" && FOTO_FORMATE.webp.mime === "image/webp", "Formattabelle");
const gemischt = ["images/bestand/neu-800.jpg", "images/bestand/neu-1600.jpg", "images/bestand/neu-800.webp", "images/bestand/neu.jpg", "images/bestand/alt-800.webp"];
pruefe(gleich(variantenImStand(gemischt, "images/bestand", "neu", "jpg").map((v) => v.breite), [800, 1600]), "variantenImStand mit Format jpg findet nur die JPEG-Größen");
pruefe(gleich(variantenImStand(gemischt, "images/bestand", "neu").map((v) => v.pfad), ["images/bestand/neu-800.webp"]), "ohne Format (webp) nur die WebP-Datei");
pruefe(variantenImStand(gemischt, "images/bestand", "neu", "jpg").every((v) => v.pfad.endsWith(".jpg") && !/neu\.jpg$/.test(v.pfad)), "das Original <name>.jpg ist keine Größe");
const jpgNamen = namenAusDateien(["images/bestand/foto-800.jpg", "images/bestand/foto-1600.jpg", "images/bestand/foto.jpg", "images/bestand/bild-800.webp", "images/bestand/bild-800.webp.json"], "images/bestand");
pruefe(gleich([...jpgNamen].sort(), ["bild", "foto"]), "namenAusDateien erkennt JPEG-Größen als Foto „foto“, nicht „foto-800“: " + [...jpgNamen].join(","));
const wegJpg = dateienEinesFotos(["images/bestand/foto-800.jpg", "images/bestand/foto-1600.jpg", "images/bestand/foto-2048.jpg", "images/bestand/anderes-800.jpg", "images/bestand/foto-800.webp"], "images/bestand", { name: "foto", format: "jpg" });
pruefe(gleich(wegJpg, ["images/bestand/foto-1600.jpg", "images/bestand/foto-2048.jpg", "images/bestand/foto-800.jpg", "images/bestand/foto-800.webp"].sort()), "Löschen: alle Größen des Fotos (jpg und webp), nichts von anderen: " + wegJpg.join(","));
pruefe(/HEIC/.test(MELDUNG_HEIC) && /Fotos-App/.test(MELDUNG_HEIC) && /JPEG/.test(MELDUNG_HEIC) && !/Kompatibilität|Kamera auf/.test(MELDUNG_HEIC), "HEIC-Meldung: Safari wandelt meist selbst um, sonst in der Fotos-App als JPEG sichern");
const feldFormat = json("inhalt/schema/bilder.json").felder[1].eintrag.felder.find((f) => f.schluessel === "format");
pruefe(feldFormat && feldFormat.typ === "auswahl" && feldFormat.pflicht === false && gleich(feldFormat.optionen.map((o) => o.wert), ["webp", "jpg"]), "Schema bilder.json kennt das Feld format (webp/jpg, nicht Pflicht)");
const kFormat = baueKontext({ seite: json("inhalt/seite.json"), bilder: { ordner: "images/bestand", bilder: [...bilder, { name: "iphone-foto", alt: "Foto vom iPhone", format: "jpg" }] }, struktur: json("inhalt/struktur.json") });
const bildFehler = pruefeDatei(schemaVon("inhalt/bilder.json").felder, { ordner: "images/bestand", bilder: [{ name: "iphone-foto", alt: "Foto vom iPhone", format: "jpg" }, { name: "web-foto", alt: "Foto in WebP", format: "webp" }, { name: "altes-foto", alt: "Ohne Formatangabe" }], logo: { datei: "logo.webp", alt: "ZeCa-Alu" } }, kFormat, "inhalt/bilder.json");
pruefe(bildFehler.length === 0, "Bildliste mit format jpg/webp/ohne Angabe ist fehlerfrei: " + JSON.stringify(bildFehler));
const bildFehler2 = pruefeDatei(schemaVon("inhalt/bilder.json").felder, { ordner: "images/bestand", bilder: [{ name: "x-foto", alt: "Foto mit falschem Format", format: "gif" }], logo: { datei: "logo.webp", alt: "ZeCa-Alu" } }, kFormat, "inhalt/bilder.json");
pruefe(bildFehler2.some((f) => /Möglichkeit/.test(f.meldung)), "unbekanntes format wird abgelehnt");

console.log(`\nEinzelprüfungen ok: ${ok}, Fehler: ${schlecht}`);
process.exit(schlecht ? 1 : 0);
