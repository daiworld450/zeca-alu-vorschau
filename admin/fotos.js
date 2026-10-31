// fotos.js – reine Hilfen für Fotos (ohne Browser-Zugriff, daher auch in Node testbar).
//
// Namensschema (muss zu bauen.py passen, Klasse Bilder.varianten):
//   <Ordner>/<name>-<Breite>.webp        eine Datei pro Größe, die Breite steht im Dateinamen (Standard, Feld "format" fehlt oder "webp")
//   <Ordner>/<name>-<Breite>.jpg         dasselbe als JPEG (Feld "format": "jpg"), wenn der Browser kein WebP erzeugen kann (Safari/iPhone)
//   <Ordner>/<name>.jpg                  optional, nur für Vorschaubilder in Netzwerken ("original")
// bauen.py nimmt genau die Größen ins srcset, die als Datei vorhanden sind. Die Verwaltung erzeugt 800, 1600 und 2048 px
// Breite, aber nie größer als das Original (ein kleines Foto bekommt nur eine Datei in seiner eigenen Breite).

import { eintragName } from "./pruefung.js";

export const ZIELBREITEN = [800, 1600, 2048];
export const WEBP_QUALITAET = 0.82;
export const JPEG_QUALITAET = 0.82;

/** Formate der Foto-Größen: Endung im Dateinamen, MIME-Typ, Anzeigename. Das Feld "format" in inhalt/bilder.json heißt "webp" oder "jpg". */
export const FOTO_FORMATE = {
  webp: { endung: "webp", mime: "image/webp", name: "WebP" },
  jpg: { endung: "jpg", mime: "image/jpeg", name: "JPEG" },
};
/** Format eines Fotos laut Bildliste; ohne Angabe (alle älteren Fotos) ist es WebP. */
export const formatVon = (eintrag) => (eintrag && FOTO_FORMATE[eintrag.format] ? eintrag.format : "webp");
export const MAX_DATEI = 25 * 1024 * 1024;
export const MAX_PIXEL = 150e6;          // Schutz vor Riesenbildern (Speicher im Browser)
export const MAX_FLAECHE = 16e6;         // größte Zeichenfläche, die auch iPhones zuverlässig anlegen
const ERLAUBTE_TYPEN = ["image/jpeg", "image/png", "image/webp"];
const HEIC = /\.(heic|heif)$/i;

/** Welche Breiten werden erzeugt? Nie hochskalieren; mindestens eine Datei. */
export function waehleBreiten(breite) {
  const b = ZIELBREITEN.filter((x) => x <= breite);
  return b.length ? b : [Math.max(1, Math.floor(breite))];
}

/** Dateiname aus Beschriftung: Kleinbuchstaben, Ziffern, Bindestriche (zum Schema in inhalt/schema/bilder.json). */
export function slug(text) {
  let s = String(text || "").toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (s.length > 44) s = s.slice(0, 44).replace(/-+$/g, "");
  return s;
}

export const datumKompakt = (d = new Date()) =>
  `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;

/** Eindeutiger Basisname: aus der Beschriftung, sonst "foto-<Datum>"; bei Doppelungen -2, -3 … */
export function eindeutigerName(beschriftung, belegt, datum = new Date()) {
  const basis = slug(beschriftung) || `foto-${datumKompakt(datum)}`;
  let name = basis;
  for (let n = 2; belegt.has(name); n++) name = `${basis}-${n}`;
  return name;
}

const maskiere = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Alle Größen eines Fotos unter den Dateipfaden eines Stands: [{breite, pfad}] aufsteigend. */
export function variantenImStand(pfade, ordner, name, format = "webp") {
  const re = new RegExp("^" + maskiere(`${ordner}/${name}`) + "-(\\d+)\\." + FOTO_FORMATE[formatVon({ format })].endung + "$");
  const aus = [];
  for (const p of pfade) {
    const m = re.exec(p);
    if (m) aus.push({ breite: Number(m[1]), pfad: p });
  }
  return aus.sort((a, b) => a.breite - b.breite);
}

/** Namen aller Fotos, zu denen im Ordner Dateien liegen (auch ohne Eintrag in der Bildliste). */
export function namenAusDateien(pfade, ordner) {
  const namen = new Set();
  const re = new RegExp("^" + maskiere(ordner + "/") + "(.+?)(?:-\\d+\\.(?:webp(?:\\.json)?|jpg)|\\.jpg)$");
  for (const p of pfade) {
    const m = re.exec(p);
    if (m) namen.add(m[1]);
  }
  return namen;
}

/** Dateien, die beim Löschen eines Fotos mit entfernt werden (Größen, Maßdateien, Original-JPG). */
export function dateienEinesFotos(pfade, ordner, eintrag, andereEintraege = []) {
  const re = new RegExp("^" + maskiere(`${ordner}/${eintrag.name}`) + "-\\d+\\.(?:webp(?:\\.json)?|jpg)$");
  const weg = [];
  const vorhanden = new Set(pfade);
  for (const p of vorhanden) if (re.test(p)) weg.push(p);
  const orig = eintrag.original && `${ordner}/${eintrag.original}`;
  if (orig && vorhanden.has(orig) && !andereEintraege.some((e) => e.name !== eintrag.name && e.original === eintrag.original)) weg.push(orig);
  return weg.sort();
}

/** Prüft die gewählte Datei vor dem Verarbeiten. Gibt eine verständliche Meldung zurück oder null. */
export function pruefeFotoDatei({ name = "Die Datei", type = "", size = 0 }) {
  if (!size) return `„${name}“ ist leer. Bitte ein anderes Foto wählen.`;
  if (size > MAX_DATEI) {
    const mb = (size / 1048576).toFixed(1).replace(".", ",");
    return `„${name}“ ist mit ${mb} MB zu groß. Erlaubt sind höchstens ${MAX_DATEI / 1048576} MB. Bitte ein kleineres Foto wählen oder das Foto vorher verkleinern.`;
  }
  const typ = String(type).toLowerCase();
  if (HEIC.test(name) || typ === "image/heic" || typ === "image/heif") return null; // wird beim Öffnen geprüft (nicht jeder Browser kann HEIC)
  if (!ERLAUBTE_TYPEN.includes(typ)) {
    return `„${name}“ ist kein Foto in einem erlaubten Format. Erlaubt sind JPEG, PNG und WebP (Fotos vom Handy sind meist JPEG).`;
  }
  return null;
}

/** Prüft die Bildbeschreibung (Alt-Text). Gibt eine Meldung oder null zurück. Gleiche Grenze wie inhalt/schema/bilder.json (200). */
export function pruefeAlt(text) {
  const t = String(text || "").trim();
  const n = Array.from(t).length;
  if (!t) return "Bitte beschreiben, was auf dem Foto zu sehen ist. Das ist ein Pflichtfeld.";
  if (n < 8) return "Bitte etwas ausführlicher beschreiben, mindestens ein kurzer Satz.";
  if (n > 200) return `Zu lang: ${n} Zeichen, erlaubt sind höchstens 200 (${n - 200} zu viel).`;
  if (/^(bild|foto|aufnahme)\s+(von|vom)\b/i.test(t)) return "Bitte nicht mit „Bild von“ oder „Foto von“ beginnen. Einfach beschreiben, was zu sehen ist.";
  return null;
}

export const istHeic = ({ name = "", type = "" }) => HEIC.test(name) || /^image\/hei[cf]$/i.test(type);

export const MELDUNG_HEIC = "Dieses Foto ist im Format HEIC (so speichert das iPhone manchmal). Dieser Browser kann es nicht öffnen. Am iPhone macht Safari beim Auswählen aus einem solchen Foto meist von selbst ein JPEG. Wenn nicht: das Foto in der Fotos-App als JPEG teilen oder speichern und dann noch einmal versuchen.";

/** Breite und Höhe aus dem Kopf einer WebP-Datei (genau wie bauen.py, Funktion webp_groesse). */
export function webpGroesse(k) {
  if (!k || k.length < 30) return null;
  const text = (a, n) => String.fromCharCode(...Array.from(k.slice(a, a + n)));
  if (text(0, 4) !== "RIFF" || text(8, 4) !== "WEBP") return null;
  const le = (a, n) => { let v = 0; for (let i = n - 1; i >= 0; i--) v = v * 256 + k[a + i]; return v; };
  const art = text(12, 4);
  if (art === "VP8 ") return { breite: le(26, 2) & 0x3fff, hoehe: le(28, 2) & 0x3fff };
  if (art === "VP8L") { const b = le(21, 4); return { breite: (b & 0x3fff) + 1, hoehe: ((b >>> 14) & 0x3fff) + 1 }; }
  if (art === "VP8X") return { breite: le(24, 3) + 1, hoehe: le(27, 3) + 1 };
  return null;
}

/**
 * Breite und Höhe aus dem Dateikopf lesen, OHNE das Bild zu dekodieren (Schutz vor Riesenbildern, die winzig gepackt sind).
 * Versteht JPEG, PNG und WebP. Ergebnis: { format, breite, hoehe } | { mehr: true } (JPEG: die Maße stehen weiter hinten, mehr Bytes lesen) | null (unbekannt oder kaputt).
 */
export function bildMasse(k) {
  if (!k || k.length < 4) return null;
  const be = (a, n) => { let v = 0; for (let i = 0; i < n; i++) v = v * 256 + k[a + i]; return v; };
  if (k[0] === 0xff && k[1] === 0xd8) {                                  // JPEG: Abschnitte bis zum Rahmenkopf (SOF) überspringen
    let i = 2;
    for (;;) {
      while (i < k.length && k[i] === 0xff && k[i + 1] === 0xff) i++;     // Füllbytes
      if (i + 4 > k.length) return { mehr: true };
      if (k[i] !== 0xff) return null;
      const m = k[i + 1];
      if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }   // Marken ohne Länge
      if (m === 0xd9 || m === 0xda) return null;                         // Ende oder Bilddaten vor dem Rahmenkopf: kaputt
      const laenge = be(i + 2, 2);
      if (laenge < 2) return null;
      if ((m >= 0xc0 && m <= 0xcf) && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {   // SOF0-SOF15 (ohne DHT, JPG, DAC)
        if (i + 9 > k.length) return { mehr: true };
        const hoehe = be(i + 5, 2), breite = be(i + 7, 2);
        return breite && hoehe ? { format: "jpeg", breite, hoehe } : null;
      }
      i += 2 + laenge;
    }
  }
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (k.length >= 24 && png.every((b, i) => k[i] === b)) {                // PNG: IHDR direkt nach der Signatur
    if (String.fromCharCode(k[12], k[13], k[14], k[15]) !== "IHDR") return null;
    const breite = be(16, 4), hoehe = be(20, 4);
    return breite && hoehe ? { format: "png", breite, hoehe } : null;
  }
  const w = webpGroesse(k);
  return w && w.breite && w.hoehe ? { format: "webp", ...w } : null;
}

/** Zählt Änderungen an der Bildliste nach Fotos: neu, entfernt oder geänderte Beschreibung = je 1 (die Reihenfolge zählt nicht). */
export function zaehleFotoAenderungen(vorher, jetzt) {
  const gleichWert = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const alt = new Map(((vorher && vorher.bilder) || []).map((b) => [b.name, b]));
  const neu = new Map(((jetzt && jetzt.bilder) || []).map((b) => [b.name, b]));
  let n = 0;
  for (const [name, b] of neu) if (!alt.has(name) || !gleichWert(alt.get(name), b)) n++;
  for (const name of alt.keys()) if (!neu.has(name)) n++;
  const ohne = (x) => ({ ...x, bilder: undefined });
  if (!gleichWert(ohne(vorher || {}), ohne(jetzt || {}))) n++;
  return n;
}

// ---------------------------------------------------------------- Wo wird ein Foto benutzt?
/** Wege (lesbar, mit Pfeil getrennt) aller Feldplätze einer Inhaltsdatei, die dieses Foto auswählen. */
export function findeVerwendungen(felder, daten, name) {
  const treffer = [];
  const gruppe = (specs, obj, label) => {
    for (const f of specs) {
      const v = obj && typeof obj === "object" ? obj[f.schluessel] : undefined;
      if (v !== undefined && v !== null) wert(f, v, [...label, f.label || f.schluessel]);
    }
  };
  const wert = (spec, v, label) => {
    if (spec.typ === "bild") { if (v === name) treffer.push(label.join(" › ")); return; }
    if (spec.typ === "gruppe" && v && typeof v === "object") { gruppe(spec.felder, v, label); return; }
    if (spec.typ === "liste" && Array.isArray(v)) {
      v.forEach((e, i) => wert(spec.eintrag, e, [...label.slice(0, -1), `${label[label.length - 1]}: ${eintragName(spec)} ${i + 1}`]));
    }
  };
  gruppe(felder, daten, []);
  return treffer;
}

/** Steht der Name irgendwo als Textwert in der Datei? (Absicherung für Felder, die das Schema nicht als Foto kennt.) */
export function kommtVor(wert, name) {
  if (wert === name) return true;
  if (Array.isArray(wert)) return wert.some((x) => kommtVor(x, name));
  if (wert && typeof wert === "object") return Object.values(wert).some((x) => kommtVor(x, name));
  return false;
}
