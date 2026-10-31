// zustand.js – gemeinsamer Zustand der Verwaltungsseite: geladene Inhalte, Arbeitskopien, Entwurf, Veröffentlichungsstatus.
// Hier steht keine Oberfläche, nur Daten und Auswahlfunktionen.

import { klon, gleich, zaehleAenderungen } from "./daten.js";
import { baueKontext } from "./pruefung.js";
import * as Speicher from "./entwurf.js";
import { loescheFoto as loescheGespeichertesFoto } from "./fotospeicher.js";
import { zaehleFotoAenderungen } from "./fotos.js";

export const S = {
  konfig: null,
  client: null,
  zugang: { actionsLesbar: true },
  stand: null,                 // { commit, baum, dateien: Map(pfad -> {sha, mode}) }
  original: new Map(),         // Pfad -> Inhalt laut Stand (JSON-Objekt oder Text), wird nie verändert
  arbeit: new Map(),           // Pfad -> Arbeitskopie (nur für Dateien, die geöffnet oder als Entwurf da sind)
  entwurfBlob: new Map(),      // Pfad -> Version der Datei, auf der die Bearbeitung beruht
  konflikte: new Set(),        // Pfade, die inzwischen auch anderswo geändert wurden
  schemas: new Map(),          // Pfad der Inhaltsdatei -> Schema
  bilder: null,
  fotos: new Map(),            // Name -> { name, varianten: [{breite, hoehe, blob}] }: neu hochgeladene, noch nicht veröffentlichte Fotos
  fotoUrls: new Map(),         // Name -> Blob-Adresse für die Vorschau (nur diese Sitzung; auch nach dem Veröffentlichen, bis das Foto live ist)
  struktur: null,
  offen: new WeakSet(),        // geöffnete Listeneinträge (bleibt beim Neuaufbau erhalten)
  zeigeAlleFehler: false,
  beschaeftigt: false,
  ver: { phase: "ruhig" },     // ruhig | speichern | beobachten | live | fehler | zeitlimit | unbekannt
  zuletzt: null,               // zuletzt veröffentlichte Arbeitskopien und Fotos (für "Rückgängig" nach Build-Fehler)
  version: 0,
};

// ---------------------------------------------------------------- Ereignisse
const hoerer = new Map();
export function auf(name, fn) {
  if (!hoerer.has(name)) hoerer.set(name, new Set());
  hoerer.get(name).add(fn);
  return () => hoerer.get(name).delete(fn);
}
export function melde(name, daten) {
  for (const fn of hoerer.get(name) || []) fn(daten);
}

// ---------------------------------------------------------------- Auswahl
export const istText = (pfad) => !pfad.endsWith(".json");
export const istRecht = (pfad) => pfad.startsWith("inhalt/recht/") || pfad === "inhalt/seiten/impressum.json" || pfad === "inhalt/seiten/datenschutz.json";

/** Arbeitskopie holen oder aus dem Original anlegen. */
export function arbeitskopie(datei) {
  if (!S.arbeit.has(datei)) {
    const o = S.original.get(datei);
    S.arbeit.set(datei, istText(datei) ? o : klon(o));
  }
  return S.arbeit.get(datei);
}

export const dateiGeaendert = (datei) => S.arbeit.has(datei) && !gleich(S.arbeit.get(datei), S.original.get(datei));
export const geaenderteDateien = () => [...S.arbeit.keys()].filter(dateiGeaendert).sort();

export function zaehleDatei(datei) {
  if (!S.arbeit.has(datei)) return 0;
  if (datei === BILDER) return zaehleFotoAenderungen(S.original.get(datei), S.arbeit.get(datei));   // je Foto eine Änderung
  return istText(datei)
    ? (S.arbeit.get(datei) === S.original.get(datei) ? 0 : 1)
    : zaehleAenderungen(S.original.get(datei), S.arbeit.get(datei));
}
export const zaehleAlle = () => [...S.arbeit.keys()].reduce((n, d) => n + zaehleDatei(d), 0);

export const BILDER = "inhalt/bilder.json";

/** Bildliste mit allen Änderungen (neu hochgeladene und entfernte Fotos), nicht nur der veröffentlichte Stand. */
export const aktuelleBilder = () => S.arbeit.get(BILDER) || S.original.get(BILDER) || S.bilder;

let kontextCache = { version: -1, wert: null };
export function kontext() {
  if (kontextCache.version !== S.version) {
    kontextCache = {
      version: S.version,
      wert: baueKontext({ seite: S.arbeit.get("inhalt/seite.json") || S.original.get("inhalt/seite.json"), bilder: aktuelleBilder(), struktur: S.struktur }),
    };
  }
  return kontextCache.wert;
}

// ---------------------------------------------------------------- Entwurf sichern
let timer = null;
export function aenderung() {
  S.version++;
  melde("aenderung");
  clearTimeout(timer);
  timer = setTimeout(sichereEntwurf, 350);
}

/** Hochgeladene Fotos, die in der Bildliste nicht (mehr) stehen, wegwerfen (z. B. nach „Verwerfen“ oder Entfernen). */
function raeumeFotosAuf() {
  const liste = aktuelleBilder();
  if (!S.stand || !liste) return;
  const namen = new Set((liste.bilder || []).map((b) => b.name));
  for (const name of [...S.fotos.keys()]) {
    if (namen.has(name)) continue;
    S.fotos.delete(name);
    loescheGespeichertesFoto(name);
  }
  for (const [name, url] of [...S.fotoUrls]) {
    if (namen.has(name)) continue;
    try { URL.revokeObjectURL(url); } catch (e) { /* egal */ }
    S.fotoUrls.delete(name);
  }
}

export function sichereEntwurf() {
  clearTimeout(timer);
  raeumeFotosAuf();
  const dateien = {};
  for (const d of geaenderteDateien()) {
    if (!S.entwurfBlob.has(d)) S.entwurfBlob.set(d, (S.stand.dateien.get(d) || {}).sha || "");
    dateien[d] = { wert: S.arbeit.get(d), blob: S.entwurfBlob.get(d) };
  }
  for (const d of [...S.entwurfBlob.keys()]) if (!dateien[d]) S.entwurfBlob.delete(d);
  Speicher.speichereEntwurf(S.konfig.repo, S.konfig.branch, dateien);
}

/** Entwurf aus dem Browser-Speicher einlesen (nach dem Laden der Inhalte). */
export function stelleEntwurfHer() {
  const e = Speicher.ladeEntwurf(S.konfig.repo, S.konfig.branch);
  for (const [datei, eintrag] of Object.entries(e)) {
    if (!S.original.has(datei) || eintrag.wert === undefined) continue;
    if (istText(datei) !== (typeof eintrag.wert === "string")) continue;
    S.arbeit.set(datei, eintrag.wert);
    S.entwurfBlob.set(datei, eintrag.blob);
    if (!dateiGeaendert(datei)) { S.arbeit.delete(datei); S.entwurfBlob.delete(datei); }
    else if ((S.stand.dateien.get(datei) || {}).sha !== eintrag.blob) S.konflikte.add(datei);
  }
  S.version++;
}

/** Entwurf verwerfen (einzelne Dateien oder alle). */
export function verwerfe(dateien) {
  for (const d of dateien || [...S.arbeit.keys()]) {
    S.arbeit.delete(d);
    S.entwurfBlob.delete(d);
    S.konflikte.delete(d);
  }
  S.zeigeAlleFehler = false;
  S.version++;
  sichereEntwurf();
  melde("aenderung");
  melde("neuzeichnen");
}
