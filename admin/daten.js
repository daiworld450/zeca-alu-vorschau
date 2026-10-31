// daten.js – reine Hilfsfunktionen für Inhalte (ohne Browser-Zugriff, daher auch in Node testbar).
// Pfade sind Listen aus Schlüsseln und Positionen, z. B. ["faq", "eintraege", 2, "frage"].

export const klon = (x) => JSON.parse(JSON.stringify(x));

export function gleich(a, b) {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) return a.length === b.length && a.every((v, i) => gleich(v, b[i]));
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && gleich(a[k], b[k]));
}

/** Zählt geänderte Werte: ein Text, eine Zahl, ein Schalter, ein hinzugefügter oder entfernter Eintrag = 1. */
export function zaehleAenderungen(a, b) {
  if (gleich(a, b)) return 0;
  const objekt = (v) => v !== null && typeof v === "object";
  if (Array.isArray(a) && Array.isArray(b)) {
    // Einträge nach Inhalt zuordnen, nicht nach Platz: Ein entfernter Eintrag ist 1 Änderung (nicht eine je verschobenem Feld),
    // nur umsortierte Einträge sind 1 Änderung, ein bearbeiteter Eintrag zählt nach seinen Feldern.
    const schluessel = (x) => JSON.stringify(x);
    const frei = new Map();
    for (const x of a) frei.set(schluessel(x), (frei.get(schluessel(x)) || 0) + 1);
    const nurNeu = [];
    for (const x of b) {
      const k = schluessel(x);
      if (frei.get(k) > 0) frei.set(k, frei.get(k) - 1); else nurNeu.push(x);
    }
    const nurAlt = [];
    const rest = new Map(frei);
    for (const x of a) { const k = schluessel(x); if (rest.get(k) > 0) { rest.set(k, rest.get(k) - 1); nurAlt.push(x); } }
    if (!nurAlt.length && !nurNeu.length) return 1;   // dieselben Einträge in anderer Reihenfolge
    let n = 0;
    for (let i = 0; i < Math.max(nurAlt.length, nurNeu.length); i++) n += i >= nurAlt.length || i >= nurNeu.length ? 1 : zaehleAenderungen(nurAlt[i], nurNeu[i]);
    return n;
  }
  if (objekt(a) && objekt(b) && !Array.isArray(a) && !Array.isArray(b)) {
    let n = 0;
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) n += !(k in a) || !(k in b) ? 1 : zaehleAenderungen(a[k], b[k]);
    return n;
  }
  return 1;
}

/** Ausgabeformat der Inhaltsdateien: 2 Leerzeichen, UTF-8, Zeilenende am Schluss (wie bei den vorhandenen Dateien). */
export const formatJson = (obj) => JSON.stringify(obj, null, 2) + "\n";

export function leseWert(wurzel, pfad) {
  let w = wurzel;
  for (const k of pfad) {
    if (w === null || w === undefined) return undefined;
    w = w[k];
  }
  return w;
}

/** Hat das Feld im Schema eine Pflicht? (Standard: ja, wie in bauen.py) */
export const istPflicht = (spec) => spec.pflicht !== false;

/** Leerer Wert passend zum Feldtyp, z. B. für neue Listeneinträge. */
export function leerWert(spec) {
  switch (spec.typ) {
    case "janein":
      return false;
    case "zahl":
      return "";
    case "liste": {
      const n = istPflicht(spec) ? spec.min || 0 : 0;
      return Array.from({ length: n }, () => leerWert(spec.eintrag));
    }
    case "gruppe": {
      const o = {};
      for (const f of spec.felder) {
        if (f.typ === "gruppe" && !istPflicht(f)) continue; // optionale Abschnitte beginnen leer
        if (!istPflicht(f) && f.typ !== "liste") continue; // optionale Felder fehlen im JSON, bis sie ausgefüllt werden
        o[f.schluessel] = leerWert(f);
      }
      return o;
    }
    default:
      return "";
  }
}

/** Schlüssel in der Reihenfolge des Schemas anordnen (Objekt bleibt dasselbe), unbekannte Schlüssel am Ende. */
export function ordneSchluessel(obj, felder) {
  const reihe = felder.map((f) => f.schluessel);
  const eintraege = Object.entries(obj);
  const rang = (k) => {
    const i = reihe.indexOf(k);
    return i < 0 ? reihe.length : i;
  };
  eintraege.sort((x, y) => rang(x[0]) - rang(y[0]));
  for (const k of Object.keys(obj)) delete obj[k];
  for (const [k, v] of eintraege) obj[k] = v;
}

/** Zeichen zählen wie Python (Unicode-Zeichen, nicht UTF-16-Einheiten). */
export const zeichenAnzahl = (s) => Array.from(s).length;

/** Telefonnummer wie in bauen.py: "0123 456789" wird zu "+49123456789" (Anruf-Link). */
export function telefonLink(anzeige) {
  const ziffern = String(anzeige).replace(/\D/g, "");
  if (String(anzeige).trim().startsWith("+")) return "+" + ziffern;
  if (!ziffern.startsWith("0") || ziffern.length < 6) return ziffern;
  return "+49" + ziffern.slice(1);
}
