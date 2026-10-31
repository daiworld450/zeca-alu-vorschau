// Einheitentests für die reinen Module (daten.js, pruefung.js). Aufruf: node admin/test/unit.mjs
// Prüft u. a.: Alle vorhandenen Inhaltsdateien sind gegen ihre Schemas fehlerfrei, und das Ausgabeformat
// der Verwaltung (formatJson) erzeugt für unveränderte Dateien exakt dieselben Bytes wie vorhanden.
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { klon, gleich, zaehleAenderungen, formatJson, leerWert, telefonLink } from "../daten.js";
import { baueKontext, pruefeDatei, pruefeBlatt, pruefeMarkup, ersetzePlatzhalter, pruefeRechtstext, pruefeRechtHtml } from "../pruefung.js";

const wurzel = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const lies = (rel) => readFileSync(join(wurzel, rel), "utf8");
const json = (rel) => JSON.parse(lies(rel));

let ok = 0, schlecht = 0;
function pruefe(bedingung, text) {
  if (bedingung) ok++; else { schlecht++; console.log("   FEHLER: " + text); }
}

// 1. Format: alle JSON-Dateien in inhalt/ werden byte-gleich ausgegeben
function jsonDateien(ordner) {
  const out = [];
  for (const e of readdirSync(join(wurzel, ordner), { withFileTypes: true })) {
    const rel = ordner + "/" + e.name;
    if (e.isDirectory()) out.push(...jsonDateien(rel));
    else if (e.name.endsWith(".json")) out.push(rel);
  }
  return out;
}
const dateien = jsonDateien("inhalt");
// struktur.json schreibt die Verwaltung nie (Entwickler-Datei, enthält "1.0", das JavaScript als "1" ausgibt)
for (const rel of dateien.filter((r) => r !== "inhalt/struktur.json")) pruefe(formatJson(JSON.parse(lies(rel))) === lies(rel), `${rel}: formatJson ist nicht byte-gleich`);
console.log(`Format: ${dateien.length} Dateien byte-gleich geprüft`);

// 2. Alle Inhaltsdateien sind gegen ihr Schema fehlerfrei
const schemas = {};
for (const rel of dateien.filter((r) => r.startsWith("inhalt/schema/"))) {
  const s = json(rel);
  for (const ziel of s.gilt_fuer) schemas[ziel] = s;
}
const kontext = baueKontext({ seite: json("inhalt/seite.json"), bilder: json("inhalt/bilder.json"), struktur: json("inhalt/struktur.json") });
let dateienGeprueft = 0;
for (const [rel, s] of Object.entries(schemas)) {
  const fehler = pruefeDatei(s.felder, json(rel), kontext, rel);
  dateienGeprueft++;
  pruefe(fehler.length === 0, `${rel}: ${fehler.length} Fehler, z. B. ${fehler[0] && fehler[0].label + ": " + fehler[0].meldung}`);
}
console.log(`Schema: ${dateienGeprueft} Inhaltsdateien gegen ihr Schema geprüft`);

// 3. Absichtlich kaputte Werte werden gemeldet
const seite = json("inhalt/seite.json");
const sSeite = schemas["inhalt/seite.json"];
let k = klon(seite); k.kontakt.telefone[0].anzeige = "abc";
pruefe(pruefeDatei(sSeite.felder, k, kontext, "inhalt/seite.json").some((f) => f.label.includes("Nummer")), "Telefon-Muster wird nicht geprüft");
k = klon(seite); k.firma.name = "";
pruefe(pruefeDatei(sSeite.felder, k, kontext, "inhalt/seite.json").some((f) => f.meldung.startsWith("Pflichtfeld")), "Pflichtfeld wird nicht geprüft");
k = klon(seite); k.firma.slogan = "x".repeat(61);
pruefe(pruefeDatei(sSeite.felder, k, kontext, "inhalt/seite.json").some((f) => f.meldung.startsWith("Zu lang")), "Maximale Länge wird nicht geprüft");
k = klon(seite); k.kontakt.telefone = [];
pruefe(pruefeDatei(sSeite.felder, k, kontext, "inhalt/seite.json").some((f) => f.meldung.includes("Mindestens")), "Mindestanzahl Liste wird nicht geprüft");
k = klon(seite); k.kontakt.telefone.push({ anzeige: "0176 111111" }, { anzeige: "0176 222222" });
pruefe(pruefeDatei(sSeite.felder, k, kontext, "inhalt/seite.json").some((f) => f.meldung.startsWith("Zu viele")), "Höchstanzahl Liste wird nicht geprüft");
// Sicherheit: manipulierte E-Mail und Domain werden gemeldet, auch wenn das Schema sie nicht prüfen würde
for (const boese of ['"><img src=x onerror=1>', "a@b.de\n", "a b@c.de", "x@y", "<a@b.de", "a@b.de'", "a@b.c", "ä@b.de"]) {
  k = klon(seite); k.kontakt.email = boese;
  pruefe(pruefeDatei(sSeite.felder, k, kontext, "inhalt/seite.json").some((f) => f.pfad.join(".") === "kontakt.email"), `E-Mail ${JSON.stringify(boese)} wird nicht abgelehnt`);
}
const ohneMuster = klon(sSeite.felder);   // Schema ohne Muster (gelockert): die festen Muster greifen trotzdem
(function entferne(l) { for (const f of l) { delete f.muster; if (f.felder) entferne(f.felder); if (f.eintrag && f.eintrag.felder) entferne(f.eintrag.felder); } })(ohneMuster);
k = klon(seite); k.kontakt.email = '"><img src=x onerror=1>';
const geprueft = pruefeDatei(ohneMuster, k, kontext, "inhalt/seite.json").filter((f) => f.pfad.join(".") === "kontakt.email");
pruefe(geprueft.length === 1, "feste E-Mail-Prüfung greift bei gelockertem Schema nicht (oder doppelt)");
k = klon(seite); k.kontakt.email = "info@zeca-alu.de";
pruefe(!pruefeDatei(sSeite.felder, k, kontext, "inhalt/seite.json").some((f) => f.pfad.join(".") === "kontakt.email"), "Gültige E-Mail wird abgelehnt");
for (const boese of ['https://a.de/"x', "https://a.de/", "javascript:alert(1)", "https://a.de?x=1", "https://a b.de"]) {
  k = klon(seite); k.veroeffentlichung.domain = boese;
  pruefe(pruefeDatei(sSeite.felder, k, kontext, "inhalt/seite.json").some((f) => f.pfad.join(".") === "veroeffentlichung.domain"), `Domain ${JSON.stringify(boese)} wird nicht abgelehnt`);
}
for (const boese of ["https://evil.example/ajax/x", "http://formsubmit.co/ajax/x", "https://formsubmit.co.evil.example/ajax/x", "https://formsubmit.co/ajax/", "https://formsubmit.co/ajax/a/b", "https://formsubmit.co/ajax/a b", 'https://formsubmit.co/ajax/x"onload=1', "https://formsubmit.co@evil.example/ajax/x", "https://formsubmit.co/f/abc"]) {
  k = klon(seite); k.formular.aktion = boese;
  pruefe(pruefeDatei(sSeite.felder, k, kontext, "inhalt/seite.json").some((f) => f.pfad.join(".") === "formular.aktion"), `Formular-Adresse ${JSON.stringify(boese)} wird nicht abgelehnt`);
}
for (const gut of ["https://formsubmit.co/ajax/info@zeca-alu.de", "https://formsubmit.co/ajax/3f2a9c1b7d4e5f60a1b2c3d4e5f60718"]) {
  k = klon(seite); k.formular.aktion = gut;
  pruefe(!pruefeDatei(sSeite.felder, k, kontext, "inhalt/seite.json").some((f) => f.pfad.join(".") === "formular.aktion"), `Formular-Adresse ${gut} wird abgelehnt`);
}
const start = json("inhalt/seiten/startseite.json");
k = klon(start); k.leistungen.eintraege[1].seite = k.leistungen.eintraege[0].seite;
pruefe(pruefeDatei(schemas["inhalt/seiten/startseite.json"].felder, k, kontext, "inhalt/seiten/startseite.json").some((f) => f.meldung.includes("doppelt")), "Querprüfung Leistungen fehlt");
k = klon(start); k.hero.foto.bild = "gibt-es-nicht";
pruefe(pruefeDatei(schemas["inhalt/seiten/startseite.json"].felder, k, kontext, "x").some((f) => f.meldung.includes("Bildliste")), "Unbekanntes Foto wird nicht gemeldet");

// 4. Markup und Platzhalter
pruefe(pruefeMarkup('Text <strong>fett</strong> und <a href="/carport/">Link</a>', kontext) === null, "gültiges Markup abgelehnt");
pruefe(pruefeMarkup("<strong>offen", kontext) !== null, "ungeschlossenes Markup nicht erkannt");
pruefe(pruefeMarkup("</em>", kontext) !== null, "Schlusstag ohne Anfang nicht erkannt");
pruefe(pruefeMarkup('<a href="javascript:alert(1)">x</a>', kontext) !== null, "javascript:-Link nicht abgelehnt");
pruefe(pruefeMarkup('<a href="//evil.example">x</a>', kontext) !== null, "//-Link nicht abgelehnt");
pruefe(pruefeMarkup('<a href="/gibt-es-nicht/">x</a>', kontext) !== null, "unbekannter interner Link nicht gemeldet");
pruefe(pruefeMarkup('<a href="#anker">x</a><a href="tel:+49123">y</a>', kontext) === null, "Anker/tel abgelehnt");
pruefe(ersetzePlatzhalter("{{telefon}} {{email}}", kontext)[1] === null, "bekannte Platzhalter abgelehnt");
pruefe(ersetzePlatzhalter("{{gibtsnicht}}", kontext)[1] !== null, "unbekannter Platzhalter nicht gemeldet");
pruefe(pruefeBlatt({ typ: "text", max: 5 }, "{{telefon}}", kontext) !== null, "Länge wird nicht NACH dem Ersetzen der Platzhalter geprüft");
pruefe(pruefeBlatt({ typ: "text" }, "a\nb", kontext) !== null, "Zeilenumbruch in einzeiligem Feld nicht gemeldet");
pruefe(pruefeBlatt({ typ: "text", max: 3 }, "😀😀😀", kontext) === null, "Emoji werden als zwei Zeichen gezählt");
pruefe(pruefeBlatt({ typ: "zahl", min: 0, max: 10 }, 11, kontext) !== null, "Zahlbereich nicht geprüft");

// 5. Hilfsfunktionen
pruefe(telefonLink("0176 24860016") === "+4917624860016", "telefonLink");
pruefe(gleich({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] }) && !gleich({ a: 1 }, { a: 2 }), "gleich");
pruefe(zaehleAenderungen({ a: "x", l: [1, 2] }, { a: "y", l: [1, 2, 3] }) === 2, "zaehleAenderungen");
// Umsortieren ist EINE Änderung (früher: eine je Feld der vertauschten Einträge)
const frage = (f, a) => ({ frage: f, antwort: a });
pruefe(zaehleAenderungen([frage("A", "a"), frage("B", "b")], [frage("B", "b"), frage("A", "a")]) === 1, "Umsortieren zweier Einträge mit je zwei Feldern zählt 1 (nicht 4)");
pruefe(zaehleAenderungen([1, 2, 3, 4], [4, 3, 2, 1]) === 1, "Umsortieren von vier Einträgen zählt 1");
pruefe(zaehleAenderungen([frage("A", "a"), frage("B", "b")], [frage("B", "b"), frage("A", "neu")]) === 1, "Eintrag bearbeitet (und verschoben): zählt nach seinen Feldern (1)");
pruefe(zaehleAenderungen([frage("A", "a"), frage("B", "b"), frage("C", "c")], [frage("A", "a"), frage("C", "c")]) === 1, "Eintrag aus der Mitte entfernt: 1 Änderung (nicht eine je nachgerücktem Feld)");
pruefe(zaehleAenderungen([frage("A", "a"), frage("B", "b")], [frage("A", "a")]) === 1 && zaehleAenderungen([frage("A", "a")], [frage("A", "a"), frage("B", "b")]) === 1, "Eintrag am Ende entfernt oder angehängt: 1");
pruefe(zaehleAenderungen([frage("A", "a"), frage("B", "b")], [frage("A", "x"), frage("B", "y")]) === 2, "Zwei Texte in zwei Einträgen geändert: 2");
pruefe(zaehleAenderungen([frage("A", "a"), frage("B", "b")], [frage("A", "x"), frage("B", "b"), frage("C", "c")]) === 2, "Ein Text geändert und ein Eintrag angehängt: 2");
pruefe(zaehleAenderungen([1, 2], [1, 2, 3]) === 1 && zaehleAenderungen([1, 2, 3], [1, 2]) === 1, "Hinzufügen und Entfernen zählen weiter je 1");
pruefe(zaehleAenderungen({ l: [frage("A", "a"), frage("B", "b")] }, { l: [frage("B", "b"), frage("A", "a")] }) === 1, "Umsortieren innerhalb einer Gruppe zählt 1");
pruefe(JSON.stringify(leerWert({ typ: "gruppe", felder: [{ schluessel: "a", typ: "text" }, { schluessel: "b", typ: "text", pflicht: false }] })) === '{"a":""}', "leerWert Gruppe");
pruefe(leerWert({ typ: "liste", min: 2, eintrag: { typ: "text" } }).length === 2, "leerWert Liste");

// 5b. Verständliche Meldungen: Format mit Beispiel, gleicher Name in Fehlerliste und Formular
const telSpec = sSeite.felder.find((f) => f.schluessel === "kontakt").felder.find((f) => f.schluessel === "telefone").eintrag.felder[0];
const m1 = pruefeBlatt(telSpec, "abc", kontext);
pruefe(/Das Format passt nicht\. So sieht es richtig aus: 0176 24860016/.test(m1), "Telefon: Meldung mit Beispiel aus dem Hilfetext: " + m1);
const mailSpec = sSeite.felder.find((f) => f.schluessel === "kontakt").felder.find((f) => f.schluessel === "email");
pruefe(/So sieht es richtig aus: name@firma\.de/.test(pruefeBlatt(mailSpec, "kein-at-zeichen", kontext)), "E-Mail: Beispiel aus dem Schema-Feld „beispiel“");
pruefe(/Das Format passt nicht\.$|Bitte den Hinweis/.test(pruefeBlatt({ typ: "text", muster: "^x$", hilfe: "ohne Beispiel" }, "y", kontext)), "ohne Beispiel bleibt es beim Hinweis auf den Text unter dem Feld");
pruefe(!/Alt-Text|Hex-Code|Markup/.test(JSON.stringify(Object.entries(schemas).filter(([ziel]) => ziel !== "inhalt/bilder.json").map(([, sc]) => sc).flatMap((sc) => JSON.stringify(sc.felder).match(/"label":"[^"]*"/g) || []).filter((l) => !/Basisname/.test(l)))), "Keine Fachwörter (Alt-Text, Hex-Code) in den Feldnamen der Formulare");
k = klon(seite); k.kontakt.telefone[0].anzeige = "abc";
const telFehler = pruefeDatei(sSeite.felder, k, kontext, "inhalt/seite.json").find((f) => f.pfad.includes("anzeige"));
pruefe(telFehler && /Telefonnummern: Nummer 1$/.test(telFehler.label) && !/so wie sie angezeigt/.test(telFehler.label), "Fehlerliste nennt „Nummer 1“ wie das Formular, nicht „Nummer (so wie sie angezeigt wird)“: " + (telFehler && telFehler.label));

// 6. Rechtstexte: Allowlist (gleiche Testfälle prüft bauen.py in pruefen_aenderung.py, Test 8)
const faelle = JSON.parse(lies("admin/test/rechtstext_faelle.json"));
for (const f of faelle) {
  const m = pruefeRechtHtml(f.text, kontext);
  pruefe((m === null) === f.ok, `Rechtstext-Fall „${f.name}“: erwartet ${f.ok ? "erlaubt" : "abgelehnt"}, Ergebnis: ${m}`);
}
console.log(`Rechtstexte: ${faelle.length} Testfälle (${faelle.filter((f) => f.ok).length} erlaubt, ${faelle.filter((f) => !f.ok).length} abgelehnt)`);
for (const rel of ["inhalt/recht/impressum.html", "inhalt/recht/datenschutz.html"]) {
  const m = pruefeRechtstext(lies(rel).replace(/\n$/, ""), kontext);
  pruefe(m === null, `${rel}: vorhandener Rechtstext besteht die Prüfung nicht: ${m}`);
}
pruefe(pruefeRechtstext("<p><script>x</script></p>", kontext) !== null, "pruefeRechtstext lässt <script> durch");
pruefe(pruefeRechtstext("<p>{{fax}}</p>", kontext) !== null, "pruefeRechtstext meldet unbekannten Platzhalter nicht");
pruefe(pruefeRechtstext('<p><a href="mailto:{{email}}">{{email}}</a> {{telefon}}</p>', kontext) === null, "Platzhalter in Rechtstext werden abgelehnt");
pruefe(pruefeRechtstext('<p><a href="/gibt-es-nicht/">x</a></p>', kontext) !== null, "interner Link ins Leere im Rechtstext nicht gemeldet");
{
  const k2 = klon(seite); k2.kontakt.strasse = "Müller <b> & \"Söhne\" Str.";
  const kx = baueKontext({ seite: k2, bilder: json("inhalt/bilder.json"), struktur: json("inhalt/struktur.json") });
  pruefe(pruefeRechtstext("<p>{{strasse}}</p>", kx) === null, "Platzhalterwert mit <, & und Anführungszeichen wird nicht maskiert (falscher Fehler)");
}

console.log(`\nEinzelprüfungen ok: ${ok}, Fehler: ${schlecht}`);
process.exit(schlecht ? 1 : 0);
