// fotozustand.js – Fotos im Zustand der Verwaltung: Liste, Vorschau, Hinzufügen, Entfernen, Verwendung, Anteil am Commit.
// Keine Oberfläche. Die Bildliste (inhalt/bilder.json) ist der Maßstab; hochgeladene Dateien liegen bis zum Veröffentlichen in S.fotos.

import { S, BILDER, aktuelleBilder, arbeitskopie, aenderung, melde } from "./zustand.js";
import { bereichFuer } from "./bereiche.js";
import { variantenImStand, namenAusDateien, dateienEinesFotos, findeVerwendungen, kommtVor, formatVon, FOTO_FORMATE } from "./fotos.js";
import { speichereFoto, ladeFotos, loescheFoto as loescheGespeichertesFoto } from "./fotospeicher.js";
import { alsBase64 } from "./bild.js";

export const ordner = () => (aktuelleBilder() && aktuelleBilder().ordner) || "images/bestand";
export const bilderListe = () => ((aktuelleBilder() && aktuelleBilder().bilder) || []);
const ursprung = () => (S.original.get(BILDER) && S.original.get(BILDER).bilder) || [];
/** Dateiformat eines Fotos ("webp" oder "jpg") laut Bildliste. */
const formatDes = (name) => formatVon(bilderListe().find((b) => b.name === name) || ursprung().find((b) => b.name === name));

/** Größen, die für dieses Foto vorhanden sind (veröffentlicht oder neu hochgeladen), aufsteigend. */
export function groessen(name) {
  const neu = S.fotos.get(name);
  if (neu) return neu.varianten.map((v) => ({ breite: v.breite, blob: v.blob }));
  return variantenImStand(S.stand ? S.stand.dateien.keys() : [], ordner(), name, formatDes(name));
}

/** Adresse für die Vorschau: lokale Kopie (neu hochgeladen), sonst die Datei auf der Seite. Leer, wenn es keine Datei gibt. */
export function vorschauUrl(name) {
  if (S.fotoUrls.has(name)) return S.fotoUrls.get(name);
  const v = groessen(name);
  if (!v.length) return "";
  const w = v.find((x) => x.breite >= 800) || v[v.length - 1];
  return w.pfad ? new URL(`../${w.pfad}`, location.href).href : "";
}

/** "neu" (nur hier, noch nicht veröffentlicht) | "fehlt" (Dateien nicht da) | "ok" */
export function fotoStatus(name) {
  const veroeffentlicht = ursprung().some((b) => b.name === name);
  if (!veroeffentlicht) return S.fotos.has(name) ? "neu" : "fehlt";
  return groessen(name).length ? "ok" : "fehlt";
}

/** Alle schon benutzten Namen (Bildliste und Dateien im Ordner), damit neue Namen eindeutig sind. */
export function belegteNamen() {
  const namen = new Set(bilderListe().map((b) => b.name));
  for (const n of ursprung().map((b) => b.name)) namen.add(n);
  if (S.stand) for (const n of namenAusDateien(S.stand.dateien.keys(), ordner())) namen.add(n);
  return namen;
}

/** Wo wird das Foto benutzt? Liste von { bereich: "Startseite", weg: "Großes Foto › Foto" }. */
export function verwendungen(name) {
  const aus = [];
  for (const [datei, schema] of S.schemas) {
    if (datei === BILDER) continue;
    const daten = S.arbeit.get(datei) || S.original.get(datei);
    if (!daten) continue;
    const b = bereichFuer(datei);
    const titel = b ? b.titel : (daten.name || datei);
    const wege = findeVerwendungen(schema.felder, daten, name);
    for (const weg of wege) aus.push({ bereich: titel, weg });
    // Absicherung: steht der Name irgendwo, wo das Schema kein Foto-Feld kennt, zählt das auch als „verwendet“
    if (!wege.length && kommtVor(daten, name)) aus.push({ bereich: titel, weg: "(Feld nicht näher bekannt)" });
  }
  return aus;
}

/** Neues Foto aufnehmen: Eintrag in die Bildliste, Dateien in den Speicher. Gibt den Namen zurück. */
export function fuegeFotoHinzu({ name, alt, varianten, format = "webp" }) {
  const liste = arbeitskopie(BILDER);
  liste.bilder.push({ name, alt, format });
  S.fotos.set(name, { name, varianten, format });
  const gross = varianten.find((v) => v.breite >= 800) || varianten[varianten.length - 1];
  S.fotoUrls.set(name, URL.createObjectURL(gross.blob));
  speichereFoto({ name, varianten, format });
  aenderung();
  return name;
}

/** Foto aus der Bildliste nehmen (erst beim Veröffentlichen werden die Dateien gelöscht). Gibt eine Funktion zum Zurückholen. */
export function entferneFoto(name) {
  const liste = arbeitskopie(BILDER);
  const i = liste.bilder.findIndex((b) => b.name === name);
  if (i < 0) return () => {};
  const [eintrag] = liste.bilder.splice(i, 1);
  aenderung();
  return () => {
    const l = arbeitskopie(BILDER);
    if (l.bilder.some((b) => b.name === name)) return;
    l.bilder.splice(Math.min(i, l.bilder.length), 0, eintrag);
    aenderung();
    melde("neuzeichnen");
  };
}

/** Beim Start: noch nicht veröffentlichte Fotos des Entwurfs aus dem Zwischenspeicher holen. */
export async function ladeFotosAusSpeicher() {
  const alle = await ladeFotos();
  const veroeffentlicht = new Set(ursprung().map((b) => b.name));
  const imEntwurf = new Set(bilderListe().map((b) => b.name));
  for (const f of alle) {
    if (!f || !f.name || !Array.isArray(f.varianten) || !f.varianten.length) continue;
    if (veroeffentlicht.has(f.name) || !imEntwurf.has(f.name)) { loescheGespeichertesFoto(f.name); continue; }
    S.fotos.set(f.name, { name: f.name, varianten: f.varianten, format: formatVon(f) });
    const gross = f.varianten.find((v) => v.breite >= 800) || f.varianten[f.varianten.length - 1];
    S.fotoUrls.set(f.name, URL.createObjectURL(gross.blob));
  }
}

/**
 * Der Anteil der Fotos am Commit: neue Dateien (Base64) und zu löschende Dateien.
 * Ergebnis: { zusatz, neueNamen, entfernteNamen, neuePfade, wegPfade, fehlend }
 */
export async function baueFotoAenderungen() {
  const vorher = ursprung(), jetzt = bilderListe();
  const namenVorher = new Set(vorher.map((b) => b.name)), namenJetzt = new Set(jetzt.map((b) => b.name));
  const neueNamen = jetzt.filter((b) => !namenVorher.has(b.name)).map((b) => b.name);
  const entfernte = vorher.filter((b) => !namenJetzt.has(b.name));
  const dir = ordner();
  const zusatz = [], neuePfade = [], wegPfade = [], fehlend = [];
  for (const name of neueNamen) {
    const f = S.fotos.get(name);
    if (!f || !f.varianten.length) { fehlend.push(name); continue; }
    const endung = FOTO_FORMATE[formatVon(jetzt.find((b) => b.name === name) || f)].endung;   // Bildliste zuerst, sonst der Zwischenspeicher
    for (const v of f.varianten) {
      const pfad = `${dir}/${name}-${v.breite}.${endung}`;
      zusatz.push({ pfad, base64: await alsBase64(v.blob) });
      neuePfade.push(pfad);
    }
  }
  for (const e of entfernte) {
    for (const pfad of dateienEinesFotos(S.stand.dateien.keys(), dir, e, vorher)) {
      zusatz.push({ pfad, loeschen: true });
      wegPfade.push(pfad);
    }
  }
  return { zusatz, neueNamen, entfernteNamen: entfernte.map((b) => b.name), neuePfade, wegPfade, fehlend };
}
