// pruefung.js – prüft Inhalte gegen das Schema (inhalt/schema/*.json), gleiche Regeln wie bauen.py.
// Reine Funktionen ohne Browser-Zugriff (in Node testbar). Meldungen sind für Nicht-Techniker geschrieben.
import { istPflicht, telefonLink, zeichenAnzahl } from "./daten.js";

export const PLATZHALTER_NAMEN = [
  "telefon", "telefon_tel", "telefon_2", "telefon_2_tel", "email", "strasse", "plz", "ort", "adresse", "inhaber", "firma",
];

// Feste Formate wie in bauen.py (FESTE_MUSTER): gelten unabhängig vom Schema. Bei Änderung beide Dateien anpassen.
export const EMAIL_MUSTER = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
export const FORMULAR_AKTION_MUSTER = /^https:\/\/formsubmit\.co\/ajax\/[A-Za-z0-9@._%+-]+$/;
export const DOMAIN_MUSTER = /^https?:\/\/[A-Za-z0-9.-]+(:[0-9]{1,5})?$/;
const FESTE_MUSTER = {
  "inhalt/seite.json": {
    "kontakt.email": [EMAIL_MUSTER, "Kontaktdaten › E-Mail-Adresse", "Bitte eine gültige E-Mail-Adresse eingeben, zum Beispiel name@beispiel.de. Erlaubt sind Buchstaben, Ziffern und . _ % + - vor dem @."],
    "formular.aktion": [FORMULAR_AKTION_MUSTER, "Kontaktformular › Formular-Adresse (FormSubmit)", "Erlaubt ist nur eine Adresse der Form https://formsubmit.co/ajax/… (danach Buchstaben, Ziffern, @ . _ % + -)."],
    "veroeffentlichung.domain": [DOMAIN_MUSTER, "Veröffentlichung › Domain", "Bitte eine gültige Domain eingeben, zum Beispiel https://beispiel.de (ohne Schrägstrich am Ende)."],
  },
};

const TAG = /<(\/?)(strong|em|a)(?:\s+href=(?:"([^"]*)"|'([^']*)'))?\s*>/gi;
const URL_OK = ["/", "#", "https://", "http://", "mailto:", "tel:"];
const PH = /\{\{\s*([a-z0-9_]+)\s*\}\}/g;

/** Werte, die {{telefon}} usw. ersetzen, aus der (ggf. gerade bearbeiteten) seite.json. */
export function baueKontext({ seite, bilder, struktur }) {
  const ph = {};
  try {
    const k = seite.kontakt;
    const t = k.telefone || [];
    if (t[0]) { ph.telefon = t[0].anzeige; ph.telefon_tel = telefonLink(t[0].anzeige); }
    if (t[1]) { ph.telefon_2 = t[1].anzeige; ph.telefon_2_tel = telefonLink(t[1].anzeige); }
    ph.email = k.email; ph.strasse = k.strasse; ph.plz = k.plz; ph.ort = k.ort;
    ph.adresse = `${k.strasse}, ${k.plz} ${k.ort}`;
    ph.inhaber = seite.firma.inhaber; ph.firma = seite.firma.name;
  } catch (e) { /* unvollständige seite.json: Platzhalter bleiben leer, die Felder selbst melden den Fehler */ }
  for (const k of Object.keys(ph)) if (typeof ph[k] !== "string") delete ph[k];
  return {
    platzhalter: ph,
    bilder: new Set(((bilder && bilder.bilder) || []).map((b) => b.name)),
    bilderMitOriginal: new Set(((bilder && bilder.bilder) || []).filter((b) => b.original).map((b) => b.name)),
    seitenPfade: new Set(((struktur && struktur.seiten) || []).map((r) => "/" + r.pfad)),
    leistungen: (struktur && struktur.leistungen) || [],
  };
}

/** Ersetzt Platzhalter; meldet unbekannte. Gibt [Text, Fehlermeldung|null] zurück. */
export function ersetzePlatzhalter(text, kontext) {
  let fehler = null;
  const aus = text.replace(PH, (m, name) => {
    if (!PLATZHALTER_NAMEN.includes(name)) {
      fehler = fehler || `Unbekannter Platzhalter {{${name}}}. Erlaubt sind: ${PLATZHALTER_NAMEN.map((n) => `{{${n}}}`).join(" ")}`;
      return m;
    }
    if (!(name in kontext.platzhalter)) {
      fehler = fehler || `Der Platzhalter {{${name}}} hat gerade keinen Wert (zugehöriges Feld bei den Firmendaten fehlt).`;
      return m;
    }
    return kontext.platzhalter[name];
  });
  return [aus, fehler];
}

/** Prüft das kleine Markup (<strong>, <em>, <a href>). Gibt die erste Meldung oder null zurück. */
export function pruefeMarkup(text, kontext) {
  const offen = [];
  let meldung = null;
  const m = (t) => { if (!meldung) meldung = t; };
  TAG.lastIndex = 0;
  let treffer;
  while ((treffer = TAG.exec(text)) !== null) {
    const schliessend = treffer[1] === "/";
    const tag = treffer[2].toLowerCase();
    if (schliessend) {
      if (offen.length && offen[offen.length - 1].replace("!", "") === tag) offen.pop();
      else m(`Die Formatierung ist nicht sauber: </${tag}> hat kein passendes <${tag}> davor.`);
      continue;
    }
    if (tag === "a") {
      const url = treffer[3] !== undefined ? treffer[3] : treffer[4];
      if (url === undefined) continue; // <a> ohne href zeigt der Generator als Text an
      if (!URL_OK.some((p) => url.startsWith(p)) || url.startsWith("//")) {
        m(`Das Link-Ziel „${url}“ ist nicht erlaubt. Erlaubt: /seite/, #anker, https://, http://, mailto:, tel:`);
        offen.push("a!");
        continue;
      }
      if (url.startsWith("/")) {
        const ziel = url.split(/[#?]/)[0];
        const bekannt = kontext.seitenPfade.has(ziel) || ziel.startsWith("/images/") || ziel.startsWith("/assets/");
        if (!bekannt) m(`Der interne Link „${url}“ zeigt auf keine bekannte Seite.`);
      }
      offen.push("a");
    } else {
      offen.push(tag);
    }
  }
  for (const t of offen.reverse()) m(`Die Formatierung ist nicht geschlossen: <${t.replace("!", "")}> hat kein </${t.replace("!", "")}>.`);
  return meldung;
}

export const istLeer = (v, spec) => {
  if (v === null || v === undefined) return true;
  switch (spec.typ) {
    case "text": case "textarea": case "bild": case "auswahl": return typeof v === "string" && v.trim() === "";
    case "zahl": return v === "";
    case "liste": return Array.isArray(v) && v.length === 0;
    case "gruppe": return typeof v === "object" && !Array.isArray(v) && Object.keys(v).length === 0;
    default: return false;
  }
};

/** Beispiel für ein Feld mit festem Format: Feld "beispiel" im Schema, sonst das erste Wort in Anführungszeichen hinter „Format“, „z. B.“ oder „Beispiel“ im Hilfetext. */
export function beispielFuer(spec) {
  if (typeof spec.beispiel === "string" && spec.beispiel) return spec.beispiel;
  const m = /(?:Format|z\. ?B\.|Beispiel)[^"„“]*(?:"([^"]{2,60})"|„([^“]{2,60})“)/.exec(String(spec.hilfe || ""));
  return m ? (m[1] || m[2]) : "";
}

/** Prüft einen einzelnen Blattwert (Text, Zahl, Schalter, Auswahl, Bild). Gibt Meldung oder null zurück. */
export function pruefeBlatt(spec, wert, kontext) {
  switch (spec.typ) {
    case "text":
    case "textarea": {
      if (typeof wert !== "string") return "Hier muss Text stehen.";
      const [s, phFehler] = ersetzePlatzhalter(wert, kontext);
      if (phFehler) return phFehler;
      if (spec.typ === "text" && /[\r\n]/.test(wert)) return "Hier ist nur eine Zeile erlaubt, bitte ohne Zeilenumbruch.";
      const n = zeichenAnzahl(s);
      if (spec.max !== undefined && n > spec.max) return `Zu lang: ${n} Zeichen, erlaubt sind höchstens ${spec.max} (${n - spec.max} zu viel).`;
      if (spec.muster && !new RegExp(spec.muster).test(s)) {
        const bsp = beispielFuer(spec);
        return bsp ? `Das Format passt nicht. So sieht es richtig aus: ${bsp}` : "Das Format passt nicht. Bitte den Hinweis unter dem Feld beachten.";
      }
      if (spec.markup) return pruefeMarkup(s, kontext);
      return null;
    }
    case "janein":
      return typeof wert === "boolean" ? null : "Bitte Ja oder Nein wählen.";
    case "zahl": {
      if (typeof wert !== "number" || !Number.isFinite(wert)) return "Bitte eine Zahl eingeben.";
      if ((spec.min !== undefined && wert < spec.min) || (spec.max !== undefined && wert > spec.max))
        return `Die Zahl muss zwischen ${spec.min} und ${spec.max} liegen.`;
      return null;
    }
    case "auswahl":
      return spec.optionen.some((o) => o.wert === wert) ? null : "Bitte eine Möglichkeit aus der Liste wählen.";
    case "bild":
      if (typeof wert !== "string") return "Bitte ein Foto aus der Liste wählen.";
      if (!kontext.bilder.has(wert)) return `Das Foto „${wert}“ gibt es nicht in der Bildliste.`;
      // Vorschaubild für soziale Netzwerke braucht die JPG-Datei des Fotos (bauen.py, Feld "original"); neu hochgeladene Fotos haben keine
      if (spec.schluessel === "og_bild" && !kontext.bilderMitOriginal.has(wert)) {
        return "Für das Vorschaubild braucht das Foto eine zusätzliche JPG-Datei. Neu hochgeladene Fotos haben keine. Bitte ein anderes Foto wählen oder das Feld leer lassen.";
      }
      return null;
    default:
      return null;
  }
}

/** Hat ein Listeneintrag nur ein Textfeld? (Dann zeigt das Formular es als einzelnes Feld „Nummer 1“, formular.js: einzel.) */
export const einzelFeld = (spec) => !!spec.eintrag && spec.eintrag.typ === "gruppe" && spec.eintrag.felder.length === 1 && ["text", "textarea"].includes(spec.eintrag.felder[0].typ);

/** Bezeichnung eines Eintrags in einer Liste, z. B. "Frage 2". */
export const eintragName = (spec) => (spec.eintrag_label || (spec.eintrag && spec.eintrag.label) || "Eintrag");

/**
 * Prüft eine ganze Inhaltsdatei. Liefert Liste von { pfad, label, meldung }.
 * pfad = Schlüsselliste (Positionen in Listen als Zahl, null-basiert), label = lesbarer Weg.
 */
export function pruefeDatei(felder, daten, kontext, datei) {
  const fehler = [];
  const melde = (pfad, label, meldung) => fehler.push({ pfad, label: label.join(" › "), meldung });

  function gruppe(specs, obj, pfad, label, ohneFeldName = false) {
    for (const f of specs) {
      const v = obj && typeof obj === "object" ? obj[f.schluessel] : undefined;
      const p = [...pfad, f.schluessel];
      const l = ohneFeldName ? label : [...label, f.label || f.schluessel];
      if (f.typ === "liste" && (v === undefined || v === null || (Array.isArray(v) && v.length === 0))) {
        if ((f.min || 0) > 0 && istPflicht(f)) melde(p, l, `Mindestens ${f.min} Einträge nötig.`);
        continue;
      }
      if (istLeer(v, f)) {
        if (istPflicht(f)) melde(p, l, "Pflichtfeld – bitte ausfüllen.");
        continue;
      }
      wert(f, v, p, l);
    }
  }

  function wert(spec, v, pfad, label, ohneFeldName = false) {
    if (spec.typ === "gruppe") {
      if (typeof v !== "object" || Array.isArray(v)) return melde(pfad, label, "Hier muss eine Gruppe stehen.");
      return gruppe(spec.felder, v, pfad, label, ohneFeldName);
    }
    if (spec.typ === "liste") {
      if (!Array.isArray(v)) return melde(pfad, label, "Hier muss eine Liste stehen.");
      if (v.length < (spec.min || 0)) melde(pfad, label, `Zu wenige Einträge: ${v.length} vorhanden, mindestens ${spec.min} nötig.`);
      if (spec.max !== undefined && v.length > spec.max) melde(pfad, label, `Zu viele Einträge: ${v.length} vorhanden, höchstens ${spec.max} erlaubt.`);
      v.forEach((e, i) => {
        const p = [...pfad, i];
        const l = [...label.slice(0, -1), `${label[label.length - 1]}: ${eintragName(spec)} ${i + 1}`];
        if (e === null || e === undefined || (typeof e === "string" && e.trim() === "")) {
          melde(p, l, "Dieser Eintrag ist leer. Bitte ausfüllen oder entfernen.");
        } else {
          // Ein Eintrag mit nur einem Textfeld erscheint im Formular als „Nummer 1“ (ohne Feldname): die Fehlerliste nennt ihn genauso
          wert(spec.eintrag, e, p, l, einzelFeld(spec));
        }
      });
      return undefined;
    }
    const m = pruefeBlatt(spec, v, kontext);
    if (m) melde(pfad, label, m);
    return undefined;
  }

  gruppe(felder, daten, [], []);
  if (datei === "inhalt/seiten/startseite.json") queraus(daten, kontext, melde);
  festeMuster(datei, daten, fehler);
  return fehler;
}

// Feste Formate prüfen (auch wenn das Schema sie nicht oder lockerer beschreibt). Keine zweite Meldung zum selben Feld.
function festeMuster(datei, daten, fehler) {
  const regeln = FESTE_MUSTER[datei];
  if (!regeln) return;
  for (const [pfad, [muster, label, meldung]] of Object.entries(regeln)) {
    const teile = pfad.split(".");
    let w = daten;
    for (const k of teile) w = w && typeof w === "object" ? w[k] : undefined;
    if (typeof w !== "string" || w.trim() === "") continue; // fehlt oder leer: meldet schon die normale Prüfung
    if (muster.test(w)) continue;
    if (fehler.some((f) => f.pfad.join(".") === pfad)) continue;
    fehler.push({ pfad: teile, label, meldung });
  }
}

// Querprüfung wie in bauen.py: Jede Leistung steht genau einmal auf der Startseite.
function queraus(daten, kontext, melde) {
  const e = daten && daten.leistungen && daten.leistungen.eintraege;
  if (!Array.isArray(e) || !kontext.leistungen.length) return;
  const gelistet = e.map((x) => x && x.seite);
  const p = ["leistungen", "eintraege"];
  const l = ["Leistungs-Übersicht", "Leistungen"];
  for (const id of kontext.leistungen) if (!gelistet.includes(id)) melde(p, l, `Die Leistung „${id}“ fehlt in der Übersicht. Jede Leistung muss genau einmal vorkommen.`);
  if (new Set(gelistet).size !== gelistet.length) melde(p, l, "Eine Leistung kommt doppelt vor. Jede Leistung darf nur einmal vorkommen.");
}

// ---------------------------------------------------------------- Rechtstexte (HTML-Block)
// Gleiche Regeln wie bauen.py (pruefe_rechtstext); gemeinsame Testfälle: admin/test/rechtstext_faelle.json.
// Jedes "<" muss ein genau so geschriebenes erlaubtes Tag beginnen, sonst ist es ein Fehler.
const RECHT_TAGS = ["p", "h2", "h3", "ul", "ol", "li", "br", "strong", "em", "a"];
const RECHT_LEER = ["br"];
const RECHT_REL = ["noopener", "noreferrer"];
const WS = "[ \\t\\n\\r\\f]";   // nur ASCII-Leerraum (HTML), wie in bauen.py
const RECHT_START = new RegExp(`<([A-Za-z][A-Za-z0-9]*)((?:${WS}+[A-Za-z][A-Za-z0-9-]*${WS}*=${WS}*"[^"<>&]*")*)${WS}*(/?)>`, "y");
const RECHT_ENDE = new RegExp(`</([A-Za-z][A-Za-z0-9]*)${WS}*>`, "y");
const RECHT_ATTR = new RegExp(`([A-Za-z][A-Za-z0-9-]*)${WS}*=${WS}*"([^"]*)"`, "g");
const LINK_OHNE_SONDERZEICHEN = /^[^\x00-\x20\x7f-\x9f\\\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]*$/;

export const linkZielOk = (url) => URL_OK.some((p) => url.startsWith(p)) && !url.startsWith("//") && LINK_OHNE_SONDERZEICHEN.test(url);
const htmlMaskiert = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");

/** Prüft den HTML-Text eines Rechtstexts (Platzhalter schon eingesetzt). Gibt die erste Meldung oder null zurück. */
export function pruefeRechtHtml(text, kontext) {
  const erlaubt = RECHT_TAGS.join(", ");
  let meldung = null;
  const zeile = (pos) => text.slice(0, pos).split("\n").length;
  const m = (pos, t) => { if (!meldung) meldung = `Zeile ${zeile(pos)}: ${t}`; };
  const stapel = [];
  let i = text.indexOf("<");
  while (i !== -1) {
    RECHT_START.lastIndex = i;
    const s = RECHT_START.exec(text);
    let e = null;
    if (!s) { RECHT_ENDE.lastIndex = i; e = RECHT_ENDE.exec(text); }
    const treffer = s || e;
    if (!treffer) {
      m(i, `Unerlaubtes oder kaputtes HTML bei „${text.slice(i, i + 24).replace(/\n/g, " ")}“. Erlaubt sind nur die Tags ${erlaubt} (Attribute nur bei <a>: href, target="_blank", rel). Ein einzelnes < bitte als &lt; schreiben.`);
      i = text.indexOf("<", i + 1);
      continue;
    }
    const tag = treffer[1].toLowerCase();
    if (!RECHT_TAGS.includes(tag)) {
      m(i, `<${tag}> ist in Rechtstexten nicht erlaubt. Erlaubt sind nur: ${erlaubt}.`);
    } else if (e) {
      if (RECHT_LEER.includes(tag)) m(i, `</${tag}> gibt es nicht (<${tag}> hat kein Ende).`);
      else if (stapel.length && stapel[stapel.length - 1] === tag) stapel.pop();
      else m(i, `</${tag}> ohne passendes <${tag}> davor (Tags falsch verschachtelt).`);
    } else {
      const attrs = [];
      RECHT_ATTR.lastIndex = 0;
      for (let a; (a = RECHT_ATTR.exec(s[2])) !== null;) attrs.push([a[1].toLowerCase(), a[2]]);
      const namen = attrs.map((a) => a[0]);
      if (new Set(namen).size !== namen.length) m(i, `<${tag}>: ein Attribut kommt doppelt vor.`);
      if (RECHT_LEER.includes(tag)) {
        if (attrs.length) m(i, `<${tag}> darf keine Attribute haben.`);
      } else {
        if (s[3]) m(i, `<${tag}/> ist nicht erlaubt; Tags außer <br> werden mit </${tag}> geschlossen.`);
        stapel.push(tag);
      }
      if (tag === "a") {
        for (const [name, wert] of attrs) {
          if (name === "href") {
            if (!linkZielOk(wert)) m(i, `Das Link-Ziel „${wert}“ ist nicht erlaubt. Erlaubt: /seite/, #anker, https://, http://, mailto:, tel: (ohne Leerzeichen, Backslash und &).`);
            else if (wert.startsWith("/")) {
              const ziel = wert.split(/[#?]/)[0];
              if (!(kontext.seitenPfade.has(ziel) || ziel.startsWith("/images/") || ziel.startsWith("/assets/"))) m(i, `Der interne Link „${wert}“ zeigt auf keine bekannte Seite.`);
            }
          } else if (name === "target") {
            if (wert !== "_blank") m(i, `target="${wert}" ist nicht erlaubt (nur "_blank").`);
          } else if (name === "rel") {
            const teile = wert.split(/[ \t\n\r\f]+/).filter(Boolean);
            if (!teile.length || teile.some((r) => !RECHT_REL.includes(r))) m(i, `rel="${wert}" ist nicht erlaubt (nur ${RECHT_REL.join(" und ")}).`);
          } else {
            m(i, `Das Attribut „${name}“ ist bei <a> nicht erlaubt (nur href, target, rel).`);
          }
        }
        if (!namen.includes("href")) m(i, "<a> ohne href ist nicht erlaubt.");
      } else if (attrs.length) {
        m(i, `<${tag}> darf keine Attribute haben (nur <a>: href, target, rel).`);
      }
    }
    i = text.indexOf("<", i + treffer[0].length);
  }
  for (const t of stapel.reverse()) m(text.length, `Tag nicht geschlossen: <${t}> hat kein </${t}>.`);
  return meldung;
}

/** Rechtstext (HTML-Block): Platzhalter prüfen, dann das HTML gegen die Allowlist. */
export function pruefeRechtstext(text, kontext) {
  if (typeof text !== "string" || text.trim() === "") return "Der Rechtstext darf nicht leer sein.";
  const [, ph] = ersetzePlatzhalter(text, kontext);
  if (ph) return ph;
  // Werte maskiert einsetzen, wie bauen.py es tut
  const mitWerten = text.replace(PH, (_m, name) => htmlMaskiert(kontext.platzhalter[name]));
  return pruefeRechtHtml(mitWerten, kontext);
}
