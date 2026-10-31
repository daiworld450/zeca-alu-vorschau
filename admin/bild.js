// bild.js – Foto im Browser verkleinern und als WebP-Größen erzeugen (Zeichenfläche/Canvas, nichts geht an einen Server).
// Kann der Browser kein WebP erzeugen (Safari/iOS liefert bei toBlob("image/webp") still ein PNG), werden die Größen als JPEG erzeugt
// (Qualität wie bei WebP, Dateien <name>-800.jpg usw., Feld "format": "jpg" in inhalt/bilder.json).
//
// - Die Drehung aus den Aufnahmedaten (EXIF) wird angewendet: createImageBitmap mit imageOrientation "from-image", sonst <img>
//   (aktuelle Browser drehen <img> von selbst). Durch das Neuzeichnen gehen ALLE Aufnahmedaten verloren, auch der Standort (GPS).
// - Nie hochskalieren: nur Größen bis zur Breite des Fotos (siehe fotos.js, waehleBreiten).
// - Jede Stufe wird aus der vorherigen größeren gezeichnet (schärfer als ein Sprung von 4000 auf 800 Pixel).
// - Der Hintergrund ist weiß (PNG mit Transparenz), damit die Dateien keinen Alphakanal haben (bauen.py liest dann den einfachen Kopf).

import { waehleBreiten, WEBP_QUALITAET, JPEG_QUALITAET, FOTO_FORMATE, MAX_PIXEL, MAX_FLAECHE, istHeic, MELDUNG_HEIC, webpGroesse, bildMasse } from "./fotos.js";

export class BildFehler extends Error {
  constructor(text) { super(text); this.name = "BildFehler"; }
}

const moeglich = {};

/** Erzeugt dieser Browser Bilder im MIME-Typ? (Nicht unterstützte Typen fallen bei toBlob still auf PNG zurück: der Blob hat dann einen anderen Typ.) */
async function kannTyp(mime) {
  if (mime in moeglich) return moeglich[mime];
  try {
    const c = document.createElement("canvas");
    c.width = c.height = 2;
    const blob = await new Promise((ok) => c.toBlob(ok, mime, 0.8));
    moeglich[mime] = !!blob && blob.type === mime;
  } catch (e) { moeglich[mime] = false; }
  return moeglich[mime];
}

/** Kann dieser Browser WebP erzeugen? */
export const kannWebp = () => kannTyp("image/webp");

/**
 * Welches Format bekommen die Fotos? "webp" (Standard, kleinere Dateien), sonst "jpg" (Safari/iPhone und ältere Browser).
 * Gibt null zurück, wenn der Browser weder das eine noch das andere erzeugen kann (praktisch ausgeschlossen).
 */
export async function waehleFormat() {
  if (await kannWebp()) return "webp";
  if (await kannTyp("image/jpeg")) return "jpg";
  return null;
}

export const MELDUNG_KEIN_FORMAT = "Dieser Browser kann aus Fotos keine Bilddateien für die Webseite erzeugen. Bitte die Verwaltung in einem aktuellen Browser öffnen (Chrome, Edge, Firefox oder Safari) und das Foto dort hochladen.";
export const HINWEIS_JPEG = "Dieser Browser speichert Fotos als JPEG statt als WebP. Das sieht gleich aus, die Dateien sind nur etwas größer.";

function ueberImg(datei) {
  return new Promise((ok, nein) => {
    const url = URL.createObjectURL(datei);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); ok(img); };
    img.onerror = () => { URL.revokeObjectURL(url); nein(new Error("nicht lesbar")); };
    img.src = url;
  });
}

const KOPF_START = 64 * 1024, KOPF_MAX = 4 * 1024 * 1024;

/** Maße aus dem Dateikopf prüfen, BEVOR der Browser das Bild dekodiert (Riesenbilder, die winzig gepackt sind). HEIC/HEIF: kein Kopf-Leser, der Browser entscheidet. */
async function pruefeKopf(datei) {
  if (istHeic(datei)) return;
  let m = bildMasse(new Uint8Array(await datei.slice(0, KOPF_START).arrayBuffer()));
  if (m && m.mehr && datei.size > KOPF_START) m = bildMasse(new Uint8Array(await datei.slice(0, KOPF_MAX).arrayBuffer()));
  if (!m || m.mehr) throw new BildFehler(`„${datei.name || "Die Datei"}“ konnte nicht als Foto geöffnet werden. Vielleicht ist die Datei beschädigt. Bitte ein anderes Foto wählen.`);
  if (m.breite * m.hoehe > MAX_PIXEL) throw new BildFehler(`Das Foto ist mit ${m.breite} × ${m.hoehe} Bildpunkten zu groß für den Browser. Bitte vorher verkleinern.`);
}

/** Liefert { quelle, breite, hoehe } (ImageBitmap oder Image, schon gedreht). */
export async function ladeBild(datei) {
  await pruefeKopf(datei);
  let quelle = null;
  if (typeof createImageBitmap === "function") {
    try { quelle = await createImageBitmap(datei, { imageOrientation: "from-image" }); } catch (e) { quelle = null; }
  }
  if (!quelle) {
    try { quelle = await ueberImg(datei); } catch (e) { quelle = null; }
  }
  if (!quelle) throw new BildFehler(istHeic(datei) ? MELDUNG_HEIC : `„${datei.name || "Die Datei"}“ konnte nicht als Foto geöffnet werden. Vielleicht ist die Datei beschädigt. Bitte ein anderes Foto wählen.`);
  const breite = quelle.width || quelle.naturalWidth, hoehe = quelle.height || quelle.naturalHeight;
  if (!breite || !hoehe) throw new BildFehler("Das Foto hat keine erkennbare Größe. Bitte ein anderes Foto wählen.");
  return { quelle, breite, hoehe };
}

function alsBlob(flaeche, format) {
  return new Promise((ok, nein) => {
    flaeche.toBlob((blob) => {
      if (!blob) nein(new BildFehler("Das Foto konnte nicht umgewandelt werden. Bitte ein anderes Foto versuchen."));
      else ok(blob);
    }, FOTO_FORMATE[format].mime, format === "webp" ? WEBP_QUALITAET : JPEG_QUALITAET);
  });
}

/** Breite und Höhe einer erzeugten Datei aus ihrem Kopf (so liest sie später auch bauen.py). */
async function dateiMasse(blob, format) {
  if (format === "webp") return webpGroesse(new Uint8Array(await blob.slice(0, 32).arrayBuffer()));
  let m = bildMasse(new Uint8Array(await blob.slice(0, KOPF_START).arrayBuffer()));
  if (m && m.mehr) m = bildMasse(new Uint8Array(await blob.slice(0, KOPF_MAX).arrayBuffer()));   // große Profil-Abschnitte vor dem Rahmenkopf
  return m && m.format === "jpeg" ? m : null;
}

/**
 * Erzeugt alle Größen. Ergebnis: { format, breite, hoehe, varianten: [{ breite, hoehe, blob }] } aufsteigend nach Breite.
 * format ist "webp" oder (Browser ohne WebP-Erzeugung) "jpg". Wirft BildFehler mit einer verständlichen Meldung.
 */
export async function erzeugeVarianten(datei) {
  const format = await waehleFormat();
  if (!format) throw new BildFehler(MELDUNG_KEIN_FORMAT);
  const { quelle, breite, hoehe } = await ladeBild(datei);
  try {
    if (breite * hoehe > MAX_PIXEL) throw new BildFehler(`Das Foto ist mit ${breite} × ${hoehe} Bildpunkten zu groß für den Browser. Bitte vorher verkleinern.`);
    const breiten = waehleBreiten(breite);
    const aus = [];
    let vorlage = quelle, vb = breite, vh = hoehe;
    for (const b of [...breiten].reverse()) {
      const h = Math.max(1, Math.round((hoehe * b) / breite));
      if (b * h > MAX_FLAECHE) throw new BildFehler("Das Foto hat ein ungewöhnliches Seitenverhältnis und ist zu groß. Bitte ein normales Foto wählen.");
      const flaeche = document.createElement("canvas");
      flaeche.width = b;
      flaeche.height = h;
      const z = flaeche.getContext("2d", { alpha: false });
      if (!z) throw new BildFehler("Der Browser stellt keine Zeichenfläche bereit. Bitte einen anderen Browser versuchen.");
      z.fillStyle = "#ffffff";
      z.fillRect(0, 0, b, h);
      z.imageSmoothingEnabled = true;
      z.imageSmoothingQuality = "high";
      z.drawImage(vorlage, 0, 0, vb, vh, 0, 0, b, h);
      const blob = await alsBlob(flaeche, format);
      if (blob.type !== FOTO_FORMATE[format].mime) throw new BildFehler(MELDUNG_KEIN_FORMAT);
      const mass = await dateiMasse(blob, format);
      if (!mass || mass.breite !== b || mass.hoehe !== h) throw new BildFehler("Das Foto wurde nicht richtig umgewandelt. Bitte noch einmal versuchen oder ein anderes Foto wählen.");
      aus.unshift({ breite: b, hoehe: h, blob });
      vorlage = flaeche; vb = b; vh = h;
    }
    return { format, breite, hoehe, varianten: aus };
  } finally {
    if (quelle && typeof quelle.close === "function") quelle.close();
  }
}

/** Blob als Base64-Text (für den Git-Blob-Upload). */
export function alsBase64(blob) {
  return new Promise((ok, nein) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result).slice(String(r.result).indexOf(",") + 1));
    r.onerror = () => nein(new Error("Datei nicht lesbar"));
    r.readAsDataURL(blob);
  });
}
