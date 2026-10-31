// fotoansicht.js – Oberfläche für Fotos: Ansicht „Fotos“, Dialog „Neues Foto hochladen“, Dialog „Foto wählen“.
// Alle Werte gelangen nur über textContent/value ins DOM, nie über innerHTML.

import { h, icon, leere, dialog, hinweis, seitenKopf, fokussiere } from "./ui.js";
import { erzeugeVarianten, waehleFormat, BildFehler, MELDUNG_KEIN_FORMAT, HINWEIS_JPEG } from "./bild.js";
import { pruefeFotoDatei, pruefeAlt, eindeutigerName } from "./fotos.js";
import { bilderListe, vorschauUrl, fotoStatus, belegteNamen, verwendungen, fuegeFotoHinzu, entferneFoto } from "./fotozustand.js";

// ---------------------------------------------------------------- Bausteine
/** Vorschaubild; ohne Datei (noch nicht online) bleibt eine graue Fläche. */
export function vorschauBild(name, klasse = "bild-vorschau") {
  const url = vorschauUrl(name);
  const platzhalter = () => h("span", { class: `${klasse} bild-fehlt`, "aria-hidden": "true" }, "Vorschau noch nicht online");
  if (!url) return platzhalter();
  const img = h("img", { class: klasse, alt: "", width: 96, height: 72, loading: "lazy", decoding: "async" });
  img.addEventListener("error", () => img.replaceWith(platzhalter()));   // zum Beispiel: Foto ist veröffentlicht, die Seite baut noch
  img.src = url;
  return img;
}

/** Knopf mit verstecktem Datei-Feld (am Handy öffnet das Kamera/Galerie). */
function dateiKnopf(text, beiDatei, { haupt = true, gross = true } = {}) {
  const eingabe = h("input", { type: "file", accept: "image/*", class: "datei-eingabe" });
  eingabe.addEventListener("change", () => {
    const f = eingabe.files && eingabe.files[0];
    eingabe.value = "";
    if (f) beiDatei(f);
  });
  const label = h("label", { class: `knopf ${gross ? "knopf-gross" : "knopf-klein"} ${haupt ? "knopf-haupt" : ""} datei-knopf` }, icon("hochladen"), text, eingabe);
  return { label, eingabe };
}

/** Datei per Ziehen und Loslassen (Computer). Gibt eine Funktion zum Abmelden zurück. */
function ziehZiel(el, beiDatei) {
  const hat = (ev) => ev.dataTransfer && Array.from(ev.dataTransfer.types || []).includes("Files");
  const ueber = (ev) => { if (!hat(ev)) return; ev.preventDefault(); ev.dataTransfer.dropEffect = "copy"; el.classList.add("ziehen"); };
  const weg = () => el.classList.remove("ziehen");
  const los = (ev) => {
    if (!hat(ev)) return;
    ev.preventDefault();
    weg();
    const f = ev.dataTransfer.files && ev.dataTransfer.files[0];
    if (f) beiDatei(f);
  };
  el.addEventListener("dragover", ueber);
  el.addEventListener("dragenter", ueber);
  el.addEventListener("dragleave", (ev) => { if (!el.contains(ev.relatedTarget)) weg(); });
  el.addEventListener("drop", los);
  return () => { el.removeEventListener("dragover", ueber); el.removeEventListener("dragenter", ueber); el.removeEventListener("drop", los); };
}

const zeigerFein = () => matchMedia("(pointer: fine)").matches;
const kb = (bytes) => (bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1).replace(".", ",")} MB` : `${Math.round(bytes / 1024)} KB`);

// ---------------------------------------------------------------- Dialog: Neues Foto hochladen
/**
 * Fragt Foto und Bildbeschreibung ab, verkleinert im Browser, nimmt das Foto in die Bildliste auf (Entwurf).
 * Gibt den Namen des neuen Fotos zurück, bei Abbruch null.
 */
export async function oeffneUpload({ datei = null } = {}) {
  let ergebnis = null;      // { breite, hoehe, varianten }
  let lauf = 0;
  let vorschauAdresse = "";
  let okKnopf = null;

  const status = h("div", { class: "upload-status", role: "status", "aria-live": "polite" });
  const bild = h("img", { class: "upload-bild", alt: "Vorschau des gewählten Fotos", hidden: true });
  const info = h("p", { class: "hilfe upload-info", hidden: true });
  const warnungen = h("div", { class: "upload-warnungen" });
  const wahl = dateiKnopf("Foto aufnehmen oder auswählen", (f) => verarbeite(f));
  const wahlBereich = h("div", { class: "upload-wahl" }, wahl.label,
    h("p", { class: "hilfe nur-zeiger" }, "Am Computer können Sie ein Foto auch hierher ziehen."));
  const altEin = h("input", { id: "foto-alt", class: "eingabe", type: "text", autocomplete: "off", "aria-describedby": "foto-alt-h foto-alt-z foto-alt-f", required: true });
  const altZaehler = h("p", { class: "zaehler", id: "foto-alt-z" }, "0 von 200 Zeichen");
  const altFehler = h("p", { class: "fehler", id: "foto-alt-f", "aria-live": "polite" });
  const nameEin = h("input", { id: "foto-name", class: "eingabe", type: "text", autocomplete: "off", "aria-describedby": "foto-name-h" });

  const felder = h("div", { class: "upload-felder" },
    h("div", { class: "feld" },
      h("label", { class: "feld-label", for: "foto-alt" }, "Bildbeschreibung"),
      altEin, altFehler,
      h("div", { class: "feld-fuss" },
        h("p", { class: "hilfe", id: "foto-alt-h" }, "Beschreiben Sie, was man auf dem Foto sieht, so dass es auch jemand versteht, der das Bild nicht sehen kann. Zum Beispiel: „Terrassenüberdachung aus Aluminium mit LED-Licht am Abend“. Nicht mit „Bild von“ beginnen."),
        altZaehler)),
    h("div", { class: "feld" },
      h("label", { class: "feld-label", for: "foto-name" }, "Name für die Ablage", h("span", { class: "optional" }, " (optional)")),
      nameEin,
      h("p", { class: "hilfe", id: "foto-name-h" }, "Daraus wird der Dateiname, zum Beispiel „Carport Essen“ wird zu carport-essen. Leer lassen = automatisch mit Datum.")));

  const wurzel = h("div", { class: "foto-upload" },
    h("p", { class: "meldung meldung-info upload-datenschutz", role: "note" },
      h("strong", null, "Datenschutz: "), "Personen und Autokennzeichen nur mit Einverständnis zeigen. Der Standort (GPS) und andere Aufnahmedaten werden beim Hochladen entfernt."),
    wahlBereich, status, bild, info, warnungen, felder);

  const setzeStatus = (art, text) => {
    leere(status);
    status.className = `upload-status${art ? " upload-" + art : ""}`;
    if (!text) return;
    if (art === "fehler") status.append(h("p", { class: "meldung meldung-fehler", role: "alert" }, text));
    else status.append(h("p", { class: "upload-lauf" }, art === "laeuft" ? h("span", { class: "dreher", "aria-hidden": "true" }) : null, text));
  };
  const zeigeAlt = (laut) => {
    const m = pruefeAlt(altEin.value);
    const n = Array.from(altEin.value.trim()).length;
    altZaehler.textContent = `${n} von 200 Zeichen`;
    altZaehler.classList.toggle("zu-lang", n > 200);
    altFehler.textContent = laut && m ? m : "";
    altEin.setAttribute("aria-invalid", laut && m ? "true" : "false");
    return m;
  };
  const sperre = () => { if (okKnopf) okKnopf.disabled = !ergebnis; };

  async function verarbeite(f) {
    const mein = ++lauf;
    ergebnis = null;
    sperre();
    bild.hidden = true; info.hidden = true; leere(warnungen);
    if (vorschauAdresse) { URL.revokeObjectURL(vorschauAdresse); vorschauAdresse = ""; }
    const m = pruefeFotoDatei(f);
    if (m) { setzeStatus("fehler", m); return; }
    setzeStatus("laeuft", "Foto wird vorbereitet …");
    try {
      const r = await erzeugeVarianten(f);
      if (mein !== lauf) return;
      ergebnis = r;
      const klein = r.varianten[0];
      vorschauAdresse = URL.createObjectURL(klein.blob);
      bild.src = vorschauAdresse;
      bild.hidden = false;
      const summe = r.varianten.reduce((n, v) => n + v.blob.size, 0);
      info.textContent = `Fertig: ${r.varianten.length === 1 ? "1 Größe" : r.varianten.length + " Größen"} (${r.varianten.map((v) => v.breite).join(", ")} Pixel breit), zusammen ${kb(summe)}. Original: ${r.breite} × ${r.hoehe} Pixel.${r.format === "jpg" ? " Gespeichert als JPEG." : ""}`;
      info.hidden = false;
      setzeStatus("");
      if (r.breite < 1600) warnungen.append(h("p", { class: "meldung meldung-warn" }, `Das Foto ist nur ${r.breite} Pixel breit. Auf großen Bildschirmen kann es unscharf wirken. Besser sind mindestens 1600 Pixel.`));
      if (r.hoehe > r.breite) warnungen.append(h("p", { class: "meldung meldung-warn" }, "Das Foto steht im Hochformat. Auf der Seite werden Fotos meist im Querformat (4:3) gezeigt und dann oben und unten zugeschnitten."));
      sperre();
      if (zeigerFein()) altEin.focus();   // am Handy nicht: Die Tastatur würde die Vorschau verdecken
    } catch (e) {
      if (mein !== lauf) return;
      setzeStatus("fehler", e instanceof BildFehler ? e.message : "Das Foto konnte nicht verarbeitet werden. Bitte ein anderes Foto versuchen.");
    }
  }

  altEin.addEventListener("input", () => zeigeAlt(altEin.getAttribute("aria-invalid") === "true"));
  altEin.addEventListener("blur", () => { if (altEin.value) zeigeAlt(true); });
  altEin.addEventListener("keydown", (ev) => { if (ev.key === "Enter") ev.preventDefault(); });
  nameEin.addEventListener("keydown", (ev) => { if (ev.key === "Enter") ev.preventDefault(); });
  const ziehAus = ziehZiel(wurzel, (f) => verarbeite(f));

  const format = await waehleFormat();
  if (!format) setzeStatus("fehler", MELDUNG_KEIN_FORMAT);
  else if (format === "jpg") wahlBereich.append(h("p", { class: "hilfe", "data-jpeg-hinweis": "1" }, HINWEIS_JPEG));

  const ok = await dialog({
    titel: "Neues Foto hochladen", inhalt: wurzel, ok: "Foto übernehmen", abbrechen: "Abbrechen",
    klasse: "dialog-foto", nurKnoepfe: true, okAus: true,
    fokus: zeigerFein() ? (datei ? altEin : wahl.eingabe) : null,
    beiBereit: ({ okKnopf: k }) => { okKnopf = k; sperre(); if (datei) verarbeite(datei); },
    pruefeOk: () => {
      if (!ergebnis) return false;
      const m = zeigeAlt(true);
      if (m) { altEin.focus(); return false; }
      return true;
    },
  });
  lauf = -1;
  ziehAus();
  if (vorschauAdresse) URL.revokeObjectURL(vorschauAdresse);
  if (!ok || !ergebnis) return null;
  const name = eindeutigerName(nameEin.value, belegteNamen());
  fuegeFotoHinzu({ name, alt: altEin.value.trim(), varianten: ergebnis.varianten, format: ergebnis.format });
  hinweis(`Foto „${name}“ ist übernommen, aber noch nicht veröffentlicht.`, { dauer: 5000 });
  return name;
}

// ---------------------------------------------------------------- Dialog: Foto wählen
/**
 * Zeigt alle Fotos mit Vorschau und Bildbeschreibung. Gibt den Namen zurück, "" für „kein Foto“, null bei Abbruch.
 * optional: „kein Foto“ ist erlaubt. nurMitOriginal: nur Fotos mit JPG-Datei (Vorschaubild für soziale Netzwerke).
 */
export async function waehleFoto({ aktuell = "", optional = false, nurMitOriginal = false, titel = "Foto wählen" } = {}) {
  const liste = bilderListe().filter((b) => !nurMitOriginal || b.original);
  let gewaehlt = aktuell;
  const gruppe = h("fieldset", { class: "fotowahl" }, h("legend", { class: "nur-sprecher" }, titel));
  const ul = h("ul", { class: "fotowahl-liste" });
  const radios = [];
  const eintrag = (wert, kopf, text, bildEl) => {
    const radio = h("input", { type: "radio", name: "foto-wahl", value: wert, class: "fotowahl-radio" });
    radio.checked = wert === aktuell;
    radio.addEventListener("change", () => { if (radio.checked) gewaehlt = wert; });
    radios.push(radio);
    return h("li", null, h("label", { class: "fotowahl-eintrag" }, radio, bildEl,
      h("span", { class: "fotowahl-text" }, h("span", { class: "fotowahl-name" }, kopf), text ? h("span", { class: "fotowahl-alt" }, text) : null)));
  };
  if (optional) ul.append(eintrag("", "Kein Foto", "Das Foto weglassen.", h("span", { class: "bild-vorschau bild-leer", "aria-hidden": "true" })));
  for (const b of liste) {
    const neu = fotoStatus(b.name) === "neu";
    ul.append(eintrag(b.name, neu ? `${b.name} (neu)` : b.name, b.alt, vorschauBild(b.name)));
  }
  gruppe.append(liste.length || optional ? ul : h("p", { class: "leer" }, nurMitOriginal
    ? "Kein Foto hat eine JPG-Datei für Vorschaubilder. Das Feld bleibt leer."
    : "Es gibt noch keine Fotos. Laden Sie zuerst ein neues Foto hoch."));
  const erster = radios.find((r) => r.checked) || radios[0];
  const ok = await dialog({
    titel, inhalt: gruppe, ok: "Dieses Foto verwenden", abbrechen: "Abbrechen", klasse: "dialog-foto-wahl",
    fokus: erster || null,
  });
  return ok ? gewaehlt : null;
}

// ---------------------------------------------------------------- Ansicht „Fotos“
export function zeigeFotos(main) {
  leere(main);
  const behaelter = h("div", { class: "foto-listen" });
  const warnPlatz = h("div");
  const hochladen = dateiKnopf("Neues Foto hochladen", (f) => oeffneUpload({ datei: f }).then(zeichne));
  const zone = h("section", { class: "upload-zone", "aria-label": "Neues Foto hochladen" },
    hochladen.label,
    h("p", { class: "hilfe nur-zeiger" }, "Am Computer können Sie ein Foto auch auf dieses Feld ziehen."),
    h("p", { class: "hilfe" }, "Das Foto wird im Browser verkleinert (800, 1600 und 2048 Pixel Breite). Danach wählen Sie es bei den Seiten aus, zum Beispiel bei den Referenzen. Zum Schluss „Veröffentlichen“ drücken."));

  main.append(
    seitenKopf("Fotos", { zurueck: ["#/", "Übersicht"], beschreibung: "Neue Fotos hochladen und nicht mehr benutzte löschen. Ein Foto austauschen: neues Foto hochladen und dann bei der Seite statt des alten auswählen." }),
    warnPlatz, zone, behaelter);
  waehleFormat().then((format) => {
    if (!format) warnPlatz.append(h("p", { class: "meldung meldung-warn", role: "note" }, MELDUNG_KEIN_FORMAT));
    else if (format === "jpg") warnPlatz.append(h("p", { class: "meldung meldung-info", role: "note", "data-jpeg-hinweis": "1" }, HINWEIS_JPEG));
  });

  const vorOeffnung = (ev) => { if (ev.dataTransfer && Array.from(ev.dataTransfer.types || []).includes("Files")) ev.preventDefault(); };
  window.addEventListener("dragover", vorOeffnung);
  window.addEventListener("drop", vorOeffnung);
  const ziehAus = ziehZiel(zone, (f) => oeffneUpload({ datei: f }).then(zeichne));

  function zusammenfassung(verw) {
    const zaehler = new Map();
    for (const v of verw) zaehler.set(v.bereich, (zaehler.get(v.bereich) || 0) + 1);
    return [...zaehler].map(([b, n]) => (n > 1 ? `${b} (${n}×)` : b)).join(", ");
  }

  async function loeschen(b) {
    const verw = verwendungen(b.name);
    if (verw.length) {
      await dialog({
        titel: "Dieses Foto wird noch benutzt",
        text: [`„${b.name}“ kann nicht gelöscht werden, solange es auf der Webseite steht. Es wird hier verwendet:`],
        inhalt: h("ul", { class: "fehlerliste" }, ...verw.map((v) => h("li", null, h("strong", null, v.bereich), ` › ${v.weg}`))),
        ok: "Verstanden", abbrechen: false,
      });
      return;
    }
    if (fotoStatus(b.name) === "neu") {
      const ja = await dialog({
        titel: "Foto verwerfen?", text: [`„${b.name}“ wurde noch nicht veröffentlicht und geht beim Verwerfen verloren.`],
        ok: "Verwerfen", abbrechen: "Behalten", gefahr: true,
      });
      if (!ja) return;
      entferneFoto(b.name);
      hinweis("Foto verworfen.");
      zeichne();
      fokussiere(document.getElementById("fotos-frei"));   // der Löschen-Knopf ist weg: Fokus an die nächste sinnvolle Stelle
      return;
    }
    const zurueck = entferneFoto(b.name);
    zeichne();
    // „Rückgängig“ bleibt stehen, bis es benutzt oder geschlossen wird, und bekommt gleich den Fokus (der Löschen-Knopf ist ja weg)
    hinweis(`Foto „${b.name}“ wird beim Veröffentlichen gelöscht.`, { fokus: true, aktion: { text: "Rückgängig", fn: () => {
      zurueck();
      zeichne();
      const knopf = [...behaelter.querySelectorAll("button")].find((x) => x.getAttribute("aria-label") === `Foto ${b.name} löschen`);
      if (knopf) knopf.focus();
    } } });
  }

  function fotoZeile(b, verw) {
    const st = fotoStatus(b.name);
    return h("li", { class: "foto" },
      vorschauBild(b.name),
      h("div", { class: "foto-text" },
        h("p", { class: "foto-name" }, b.name,
          st === "neu" ? h("span", { class: "marker foto-marker" }, "Neu, noch nicht veröffentlicht") : null,
          st === "fehlt" ? h("span", { class: "marker marker-warn foto-marker" }, "Dateien fehlen") : null),
        h("p", { class: "hilfe foto-alt" }, b.alt),
        verw.length ? h("p", { class: "hilfe" }, `Verwendet in: ${zusammenfassung(verw)}`) : null,
        h("div", { class: "foto-knoepfe" },
          h("button", { type: "button", class: "knopf knopf-klein knopf-leise", "aria-label": `Foto ${b.name} löschen`, onclick: () => loeschen(b) }, icon("papierkorb"), "Löschen"))));
  }

  function zeichne() {
    leere(behaelter);
    const alle = bilderListe();
    const mit = alle.map((b) => ({ b, verw: verwendungen(b.name) }));
    const benutzt = mit.filter((x) => x.verw.length);
    const frei = mit.filter((x) => !x.verw.length);
    behaelter.append(
      h("section", { "aria-labelledby": "fotos-benutzt" },
        h("h2", { class: "gruppen-titel", id: "fotos-benutzt" }, `Auf der Seite verwendet (${benutzt.length})`),
        benutzt.length ? h("ul", { class: "fotoliste" }, ...benutzt.map((x) => fotoZeile(x.b, x.verw)))
          : h("p", { class: "leer" }, "Noch kein Foto ist auf der Seite eingebaut.")),
      h("section", { "aria-labelledby": "fotos-frei" },
        h("h2", { class: "gruppen-titel", id: "fotos-frei" }, `Nicht verwendet (${frei.length})`),
        h("p", { class: "hilfe" }, "Diese Fotos stehen auf keiner Seite und können gelöscht werden."),
        frei.length ? h("ul", { class: "fotoliste" }, ...frei.map((x) => fotoZeile(x.b, x.verw)))
          : h("p", { class: "leer" }, "Alle Fotos werden benutzt.")));
  }
  zeichne();
  return {
    titel: "Fotos",
    aufraeumen() {
      ziehAus();
      window.removeEventListener("dragover", vorOeffnung);
      window.removeEventListener("drop", vorOeffnung);
    },
  };
}
