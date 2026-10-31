// bereiche.js – die Bereiche der Übersicht (Firmendaten, Startseite, Leistungen …) und welche Dateien/Gruppen dazugehören.
// Die Formulare selbst entstehen aus den Schema-Dateien; hier steht nur die Zuordnung und die Beschriftung für Laien.

import { S, istText } from "./zustand.js";
import { zaehleAenderungen } from "./daten.js";
import { zaehleFotoAenderungen } from "./fotos.js";

const SEITE = "inhalt/seite.json";
const seitenDatei = (id) => `inhalt/seiten/${id}.json`;
const seitenName = (id) => {
  const reg = ((S.struktur && S.struktur.seiten) || []).find((r) => r.id === id);
  const o = S.original.get(seitenDatei(reg ? reg.inhalt : id));
  return (o && o.name) || id;
};

/** Alle Bereiche in der Reihenfolge der Übersicht. gruppe: firma | seiten | weiteres. */
export function alleBereiche() {
  const leistungen = (S.struktur && S.struktur.leistungen) || [];
  const liste = [
    { id: "firma", gruppe: "firma", art: "formular", titel: "Firmendaten", text: "Telefon, E-Mail, Adresse, Firmenname",
      teile: [{ datei: SEITE, gruppen: ["firma", "kontakt"] }] },
    { id: "texte", gruppe: "firma", art: "formular", titel: "Menü, Formular und Fußzeile", text: "Knöpfe, Kontaktformular, Karten-Hinweis, Fußzeile",
      teile: [{ datei: SEITE, gruppen: ["navigation", "texte", "formular", "karte", "footer"] }] },
    { id: "start", gruppe: "seiten", art: "formular", titel: seitenName("start") === "Start" ? "Startseite" : seitenName("start"),
      text: "Eingangsbereich, Leistungen, Farben, Projekt, Fragen", teile: [{ datei: seitenDatei("startseite") }] },
    ...leistungen.map((id) => ({
      id, gruppe: "seiten", art: "formular", titel: seitenName(id), text: "Leistung",
      teile: [{ datei: seitenDatei(id) }],
    })),
    { id: "einsatzgebiet", gruppe: "seiten", art: "formular", titel: "Einsatzgebiet", text: "Städte, Karte, Texte",
      teile: [{ datei: SEITE, gruppen: ["einsatzgebiet"] }, { datei: seitenDatei("einsatzgebiet") }] },
    { id: "referenzen", gruppe: "seiten", art: "formular", titel: seitenName("referenzen"), text: "Projekte mit Fotos und Beschreibung",
      teile: [{ datei: seitenDatei("referenzen") }] },
    { id: "ueber-uns", gruppe: "seiten", art: "formular", titel: seitenName("ueber-uns"), text: "Text, Foto, Werte",
      teile: [{ datei: seitenDatei("ueber-uns") }] },
    { id: "kontakt", gruppe: "seiten", art: "formular", titel: seitenName("kontakt"), text: "Überschrift und Einleitung der Kontaktseite",
      teile: [{ datei: seitenDatei("kontakt") }] },
    { id: "fotos", gruppe: "weiteres", art: "fotos", titel: "Fotos", text: "Neue Fotos hochladen, nicht mehr benutzte löschen", teile: [{ datei: "inhalt/bilder.json" }] },
    { id: "recht", gruppe: "weiteres", art: "recht", titel: "Rechtstexte", text: "Impressum und Datenschutz, nur mit Rücksprache ändern", warnung: true,
      teile: [], unter: ["impressum", "datenschutz"] },
    { id: "verlauf", gruppe: "weiteres", art: "verlauf", titel: "Verlauf", text: "Frühere Stände ansehen, wiederherstellen, Änderungen rückgängig machen", teile: [] },
  ];
  return liste;
}

/** Bereiche, die man nur über die Rechtstexte erreicht. */
export function rechtBereiche() {
  return ["impressum", "datenschutz"].map((id) => ({
    id, gruppe: "recht", art: "formular", titel: seitenName(id), warnung: true,
    text: id === "impressum" ? "Angaben nach § 5 TMG" : "Datenschutzerklärung",
    teile: [{ datei: seitenDatei(id) }], rechtDatei: `inhalt/recht/${id}.html`,
  }));
}

export function findeBereich(id) {
  return alleBereiche().concat(rechtBereiche()).find((b) => b.id === id) || null;
}

/** Anzahl der Änderungen in einem Bereich (für die Markierung "Geändert"). */
export function bereichAenderungen(b) {
  let n = 0;
  for (const t of b.teile || []) {
    const arb = S.arbeit.get(t.datei);
    if (!arb) continue;
    const orig = S.original.get(t.datei);
    if (t.datei === "inhalt/bilder.json") n += zaehleFotoAenderungen(orig, arb);
    else if (t.gruppen) for (const g of t.gruppen) n += zaehleAenderungen(orig[g], arb[g]);
    else n += zaehleAenderungen(orig, arb);
  }
  if (b.rechtDatei && S.arbeit.has(b.rechtDatei) && S.arbeit.get(b.rechtDatei) !== S.original.get(b.rechtDatei)) n += 1;
  for (const u of b.unter || []) {
    const sub = findeBereich(u);
    if (sub) n += bereichAenderungen(sub);
  }
  return n;
}

/** Welcher Bereich gehört zu einer Datei (und optional oberstem Schlüssel)? Für Fehlerlisten und die Commit-Nachricht. */
export function bereichFuer(datei, oberster) {
  for (const b of alleBereiche().concat(rechtBereiche())) {
    if (b.rechtDatei === datei) return b;
    for (const t of b.teile || []) {
      if (t.datei !== datei) continue;
      if (!t.gruppen || oberster === undefined || t.gruppen.includes(oberster)) return b;
    }
  }
  return null;
}

/** Namen aller Bereiche mit Änderungen, z. B. ["Firmendaten", "Startseite"]. */
export function geaenderteBereiche() {
  return alleBereiche().concat(rechtBereiche()).filter((b) => (b.art === "formular" || b.art === "fotos") && bereichAenderungen(b) > 0).map((b) => b.titel);
}

/** Adresse (Hash) der Ansicht eines Bereichs. */
export function bereichAdresse(b) {
  return b.art === "fotos" ? "#/fotos" : b.art === "recht" ? "#/recht" : b.art === "verlauf" ? "#/verlauf" : `#/b/${b.id}`;
}

export { istText };
