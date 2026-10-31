// formular.js – baut Formulare GENERISCH aus den Schema-Dateien (inhalt/schema/*.json).
//
// Eingabe: eine Feldbeschreibung (Schema), das bearbeitete Objekt (Arbeitskopie) und das Original zum Vergleichen.
// Typen: text, textarea, liste (hinzufügen/entfernen/hoch/runter), auswahl, janein, bild (Auswahl aus der Bildliste mit Vorschau, neues Foto hochladen),
//        zahl, gruppe (auch optionale Abschnitte).
// Alle Werte der Seite gelangen nur über value/textContent ins DOM, nie über innerHTML.

import { h, icon, leere, dialog, hinweis, ansage } from "./ui.js";
import { gleich, leseWert, istPflicht, leerWert, ordneSchluessel, zeichenAnzahl } from "./daten.js";
import { pruefeBlatt, istLeer, ersetzePlatzhalter, eintragName } from "./pruefung.js";

let zaehler = 0;
const neueId = () => `f${++zaehler}`;

/** Sammelt die Felder eines Formularteils, damit sie gemeinsam aktualisiert werden können. */
export class Sammler {
  constructor() { this.eigene = []; this.kinder = []; }
  add(handle) { this.eigene.push(handle); return handle; }
  kind() { const k = new Sammler(); this.kinder.push(k); return k; }
  leeren() { this.eigene = []; this.kinder = []; }
  alle() { return [...this.eigene, ...this.kinder.flatMap((k) => k.alle())]; }
}

/**
 * ctx (Kontext eines Formularteils):
 *   daten, original   Arbeitskopie und Original der Datei
 *   kontext()         Prüfkontext (Platzhalter, Bilder, Seiten)
 *   bilderListe()     alle Fotos der Bildliste ([{name, alt, original?}])   seitenListe  [{pfad, name}]
 *   vorschauBild(n)   Vorschaubild-Element   waehleFoto(opt)  Auswahldialog   neuesFoto()  Upload-Dialog (Name oder null)
 *   aenderung()       wird nach jeder Änderung aufgerufen
 *   zeigeAlle()       true: Fehler auch an noch nicht berührten Feldern zeigen
 *   offen             WeakSet geöffneter Listeneinträge
 */

// ---------------------------------------------------------------- gemeinsame Teile
function eingabeHinweise(spec) {
  const m = spec.muster || "";
  if (m.includes("@")) return { inputmode: "email", autocapitalize: "none", spellcheck: "false" };
  if (m.startsWith("^https")) return { inputmode: "url", autocapitalize: "none", spellcheck: "false" };
  if (m.includes("(\\+|0)")) return { inputmode: "tel", spellcheck: "false" };
  if (/^\^\[0-9\]\{\d\}\$$/.test(m)) return { inputmode: "numeric", spellcheck: "false" };
  if (m.startsWith("^#") || m.startsWith("^RAL")) return { autocapitalize: "characters", spellcheck: "false" };
  return {};
}

function kopfzeile(spec, id, optional, extra) {
  const marker = h("span", { class: "marker", hidden: true }, "Geändert");
  const kopf = h("div", { class: "feld-kopf" },
    h("label", { for: id, class: "feld-label" }, spec.label || "",
      optional ? h("span", { class: "optional" }, " (optional)") : null),
    marker, extra || null);
  return { kopf, marker };
}

function fehlerFuer(spec, wert, ctx, pflicht) {
  if (istLeer(wert, spec)) return pflicht ? "Pflichtfeld – bitte ausfüllen." : null;
  return pruefeBlatt(spec, wert, ctx.kontext());
}

/** Schreibt einen Wert in die Arbeitskopie; leere optionale Felder werden aus dem JSON entfernt. */
function setze(behaelter, schluessel, wert, spec) {
  if (!Array.isArray(behaelter) && spec.pflicht === false && (wert === "" || wert === null)) delete behaelter[schluessel];
  else behaelter[schluessel] = wert;
}

// ---------------------------------------------------------------- Textfelder
function baueText(spec, b, k, pfad, ctx, sammler, opt) {
  const id = neueId();
  const pflicht = opt.pflicht !== undefined ? opt.pflicht : istPflicht(spec);
  const mehr = spec.typ === "textarea";
  const label = opt.label ? { ...spec, label: opt.label } : spec;
  const { kopf, marker } = kopfzeile(label, id, !pflicht && !opt.imEintrag, opt.kopfExtra);
  const zaehlerEl = h("p", { class: "zaehler", id: `${id}-z`, hidden: spec.max === undefined });
  const fehlerEl = h("p", { class: "fehler", id: `${id}-f`, "aria-live": "polite" });
  // Der technische Satz "Erlaubtes Markup: …" aus dem Schema wird durch die einfache Erklärung unter dem Feld ersetzt
  const hilfeText = spec.markup ? String(spec.hilfe || "").split(/Erlaubtes Markup/)[0].trim() : spec.hilfe;
  const hilfeEl = hilfeText ? h("p", { class: "hilfe", id: `${id}-h` }, hilfeText) : null;
  const beschr = [`${id}-f`, hilfeEl ? `${id}-h` : null, spec.max !== undefined ? `${id}-z` : null].filter(Boolean).join(" ");
  const eingabe = h(mehr ? "textarea" : "input", {
    id, class: "eingabe" + (mehr ? " eingabe-mehrzeilig" : ""), "aria-describedby": beschr, autocomplete: "off",
    ...(mehr ? { rows: spec.max && spec.max > 200 ? 4 : 2 } : { type: "text" }),
    ...eingabeHinweise(spec),
  });
  eingabe.value = b[k] === undefined || b[k] === null ? "" : String(b[k]);
  if (pflicht) eingabe.required = true;

  const wachsen = () => {
    if (!mehr) return;
    eingabe.style.height = "auto";
    eingabe.style.height = Math.min(eingabe.scrollHeight + 2, window.innerHeight * 0.7) + "px";
  };

  const handle = {
    pfad, el: null, beruehrt: false, fehlerSichtbar: false, geaendert: false, art: "blatt",
    aktualisiere() {
      const wert = b[k] === undefined ? "" : b[k];
      const fehler = fehlerFuer(spec, wert, ctx, pflicht);
      const zeige = !!fehler && (this.beruehrt || ctx.zeigeAlle());
      this.fehlerSichtbar = zeige;
      fehlerEl.textContent = zeige ? fehler : "";
      eingabe.setAttribute("aria-invalid", zeige ? "true" : "false");
      eingabe.setCustomValidity(fehler || "");
      if (spec.max !== undefined) {
        const n = zeichenAnzahl(ersetzePlatzhalter(String(wert), ctx.kontext())[0]);
        zaehlerEl.textContent = `${n} von ${spec.max} Zeichen`;
        zaehlerEl.classList.toggle("zu-lang", n > spec.max);
      }
      const orig = leseWert(ctx.original, pfad);
      this.geaendert = orig !== undefined && !gleich(wert, orig === undefined ? "" : orig);
      marker.hidden = !this.geaendert;
      wurzel.classList.toggle("geaendert", this.geaendert);
    },
  };
  eingabe.addEventListener("input", () => {
    setze(b, k, eingabe.value, spec);
    wachsen();
    handle.aktualisiere();
    ctx.aenderung();
  });
  eingabe.addEventListener("blur", () => { handle.beruehrt = true; handle.aktualisiere(); });
  if (!mehr) eingabe.addEventListener("keydown", (ev) => { if (ev.key === "Enter") ev.preventDefault(); });

  const teile = [kopf];
  if (spec.markup) teile.push(markupLeiste(eingabe, ctx));
  teile.push(eingabe, fehlerEl, h("div", { class: "feld-fuss" }, hilfeEl, zaehlerEl));
  if (spec.markup) {
    teile.push(h("p", { class: "format-hinweis" },
      "Wörter fett machen: den Text markieren und „Fett“ drücken. Genauso geht es mit „Kursiv“ und „Link“. Im Feld erscheinen dann Zeichen in spitzen Klammern, zum Beispiel <strong>. Die gehören dazu und bitte nicht löschen. Alles andere erscheint als normaler Text."));
  }
  const wurzel = h("div", { class: "feld", "data-pfad": pfad.join(".") }, teile);
  handle.el = wurzel;
  handle.eingabe = eingabe;
  sammler.add(handle);
  requestAnimationFrame(wachsen);
  handle.aktualisiere();
  return wurzel;
}

// ---------------------------------------------------------------- Markup-Knöpfe (Fett, Kursiv, Link)
function markupLeiste(eingabe, ctx) {
  const umschliessen = (vor, nach, text) => {
    const von = eingabe.selectionStart ?? eingabe.value.length;
    const bis = eingabe.selectionEnd ?? von;
    const sel = text !== undefined ? text : (eingabe.value.slice(von, bis) || "Text");
    eingabe.setRangeText(vor + sel + nach, von, bis, "end");
    const start = von + vor.length;
    eingabe.setSelectionRange(start, start + sel.length);
    eingabe.dispatchEvent(new Event("input", { bubbles: true }));
    eingabe.focus();
  };
  const knopf = (text, klasse, beschr, fn) => h("button", {
    type: "button", class: "knopf knopf-klein " + klasse, "aria-label": beschr,
    onmousedown: (ev) => ev.preventDefault(), onclick: fn,
  }, text);
  return h("div", { class: "format-leiste", role: "group", "aria-label": "Formatierung" },
    knopf("Fett", "fett", "Markierten Text fett machen", () => umschliessen("<strong>", "</strong>")),
    knopf("Kursiv", "kursiv", "Markierten Text kursiv machen", () => umschliessen("<em>", "</em>")),
    knopf("Link", "", "Markierten Text zu einem Link machen", async () => {
      const von = eingabe.selectionStart ?? 0, bis = eingabe.selectionEnd ?? von;
      const markiert = eingabe.value.slice(von, bis);
      const auswahl = h("select", { class: "eingabe", id: "link-ziel" },
        ...ctx.seitenListe.map((s) => h("option", { value: "/" + s.pfad }, s.name)),
        h("option", { value: "__andere__" }, "Andere Adresse …"));
      const adresse = h("input", { class: "eingabe", id: "link-adresse", type: "text", placeholder: "https://…", inputmode: "url", autocapitalize: "none", spellcheck: "false", autocomplete: "off", hidden: true });
      const text = h("input", { class: "eingabe", id: "link-text", type: "text", autocomplete: "off", value: markiert });
      auswahl.addEventListener("change", () => { adresse.hidden = auswahl.value !== "__andere__"; if (!adresse.hidden) adresse.focus(); });
      const inhalt = h("div", { class: "dialog-felder" },
        h("div", { class: "feld" }, h("label", { class: "feld-label", for: "link-text" }, "Text des Links"), text),
        h("div", { class: "feld" }, h("label", { class: "feld-label", for: "link-ziel" }, "Wohin soll der Link führen?"), auswahl, adresse,
          h("p", { class: "hilfe" }, "Andere Adressen: https://…, mailto:… (E-Mail) oder tel:+49… (Telefon).")));
      const ok = await dialog({ titel: "Link einfügen", inhalt, ok: "Einfügen", fokus: text });
      if (!ok) { eingabe.focus(); return; }
      const ziel = auswahl.value === "__andere__" ? adresse.value.trim() : auswahl.value;
      const linkText = text.value.trim() || ziel;
      if (!ziel) { eingabe.focus(); return; }
      eingabe.setSelectionRange(von, bis);
      umschliessen(`<a href="${ziel.replace(/"/g, "&quot;")}">`, "</a>", linkText);
    }),
  );
}

// ---------------------------------------------------------------- Schalter, Auswahl, Zahl, Bild
function baueSchalter(spec, b, k, pfad, ctx, sammler, opt) {
  const id = neueId();
  const box = h("input", { type: "checkbox", id, class: "schalter-box", "aria-describedby": spec.hilfe ? `${id}-h` : null });
  box.checked = b[k] === true;
  const marker = h("span", { class: "marker", hidden: true }, "Geändert");
  const wurzel = h("div", { class: "feld feld-schalter", "data-pfad": pfad.join(".") },
    h("label", { class: "schalter", for: id }, box, h("span", { class: "schalter-text" }, opt.label || spec.label)),
    marker,
    spec.hilfe ? h("p", { class: "hilfe", id: `${id}-h` }, spec.hilfe) : null);
  const handle = {
    pfad, el: wurzel, fehlerSichtbar: false, geaendert: false, art: "blatt",
    aktualisiere() {
      const orig = leseWert(ctx.original, pfad);
      this.geaendert = orig !== undefined && (b[k] === true) !== (orig === true);
      marker.hidden = !this.geaendert;
      wurzel.classList.toggle("geaendert", this.geaendert);
    },
  };
  box.addEventListener("change", () => { b[k] = box.checked; handle.aktualisiere(); ctx.aenderung(); });
  sammler.add(handle);
  handle.aktualisiere();
  return wurzel;
}

function baueAuswahl(spec, b, k, pfad, ctx, sammler, opt) {
  const id = neueId();
  const pflicht = opt.pflicht !== undefined ? opt.pflicht : istPflicht(spec);
  const { kopf, marker } = kopfzeile(opt.label ? { ...spec, label: opt.label } : spec, id, !pflicht);
  const sel = h("select", { id, class: "eingabe", "aria-describedby": `${id}-f${spec.hilfe ? ` ${id}-h` : ""}` });
  const optionen = spec.optionen.slice();
  const aktuell = b[k] === undefined ? "" : b[k];
  if (!optionen.some((o) => o.wert === aktuell)) sel.append(h("option", { value: "" }, pflicht ? "Bitte wählen …" : "(keine Auswahl)"));
  for (const o of optionen) sel.append(h("option", { value: o.wert }, o.label || o.wert));
  sel.value = aktuell;
  if (pflicht) sel.required = true;
  const fehlerEl = h("p", { class: "fehler", id: `${id}-f`, "aria-live": "polite" });
  const wurzel = h("div", { class: "feld", "data-pfad": pfad.join(".") }, kopf, sel, fehlerEl,
    spec.hilfe ? h("div", { class: "feld-fuss" }, h("p", { class: "hilfe", id: `${id}-h` }, spec.hilfe)) : null);
  const handle = {
    pfad, el: wurzel, beruehrt: false, fehlerSichtbar: false, geaendert: false, art: "blatt", eingabe: sel,
    aktualisiere() {
      const wert = b[k] === undefined ? "" : b[k];
      const fehler = fehlerFuer(spec, wert, ctx, pflicht);
      const zeige = !!fehler && (this.beruehrt || ctx.zeigeAlle());
      this.fehlerSichtbar = zeige;
      fehlerEl.textContent = zeige ? fehler : "";
      sel.setAttribute("aria-invalid", zeige ? "true" : "false");
      sel.setCustomValidity(fehler || "");
      const orig = leseWert(ctx.original, pfad);
      this.geaendert = orig !== undefined && !gleich(wert, orig);
      marker.hidden = !this.geaendert;
      wurzel.classList.toggle("geaendert", this.geaendert);
    },
  };
  sel.addEventListener("change", () => { setze(b, k, sel.value, spec); handle.beruehrt = true; handle.aktualisiere(); ctx.aenderung(); });
  sammler.add(handle);
  handle.aktualisiere();
  return wurzel;
}

function baueZahl(spec, b, k, pfad, ctx, sammler, opt) {
  const id = neueId();
  const pflicht = opt.pflicht !== undefined ? opt.pflicht : istPflicht(spec);
  const { kopf, marker } = kopfzeile(opt.label ? { ...spec, label: opt.label } : spec, id, !pflicht);
  const eingabe = h("input", {
    id, class: "eingabe eingabe-zahl", type: "number", inputmode: "numeric", step: "1", min: spec.min, max: spec.max,
    "aria-describedby": `${id}-f${spec.hilfe ? ` ${id}-h` : ""}`, autocomplete: "off",
  });
  eingabe.value = b[k] === undefined || b[k] === "" ? "" : String(b[k]);
  if (pflicht) eingabe.required = true;
  const fehlerEl = h("p", { class: "fehler", id: `${id}-f`, "aria-live": "polite" });
  const wurzel = h("div", { class: "feld", "data-pfad": pfad.join(".") }, kopf, eingabe, fehlerEl,
    h("div", { class: "feld-fuss" }, spec.hilfe ? h("p", { class: "hilfe", id: `${id}-h` }, spec.hilfe) : null,
      (spec.min !== undefined && spec.max !== undefined) ? h("p", { class: "zaehler" }, `${spec.min} bis ${spec.max}`) : null));
  const handle = {
    pfad, el: wurzel, beruehrt: false, fehlerSichtbar: false, geaendert: false, art: "blatt", eingabe,
    aktualisiere() {
      const wert = b[k] === undefined ? "" : b[k];
      const fehler = fehlerFuer(spec, wert, ctx, pflicht);
      const zeige = !!fehler && (this.beruehrt || ctx.zeigeAlle());
      this.fehlerSichtbar = zeige;
      fehlerEl.textContent = zeige ? fehler : "";
      eingabe.setAttribute("aria-invalid", zeige ? "true" : "false");
      eingabe.setCustomValidity(fehler || "");
      const orig = leseWert(ctx.original, pfad);
      this.geaendert = orig !== undefined && !gleich(wert, orig);
      marker.hidden = !this.geaendert;
      wurzel.classList.toggle("geaendert", this.geaendert);
    },
  };
  eingabe.addEventListener("input", () => {
    const t = eingabe.value.trim();
    b[k] = t === "" ? "" : Number(t.replace(",", "."));
    if (typeof b[k] === "number" && Number.isNaN(b[k])) b[k] = "";
    handle.aktualisiere(); ctx.aenderung();
  });
  eingabe.addEventListener("blur", () => { handle.beruehrt = true; handle.aktualisiere(); });
  eingabe.addEventListener("keydown", (ev) => { if (ev.key === "Enter") ev.preventDefault(); });
  sammler.add(handle);
  handle.aktualisiere();
  return wurzel;
}

function baueBild(spec, b, k, pfad, ctx, sammler, opt) {
  const id = neueId();
  const pflicht = opt.pflicht !== undefined ? opt.pflicht : istPflicht(spec);
  const { kopf, marker } = kopfzeile(opt.label ? { ...spec, label: opt.label } : spec, id, !pflicht);
  const nurOriginal = spec.schluessel === "og_bild";   // Vorschaubild für soziale Netzwerke: nur Fotos mit JPG-Datei
  const aktuell = b[k] === undefined ? "" : b[k];
  const beschr = `${id}-f ${id}-a${spec.hilfe ? ` ${id}-h` : ""}`;
  const waehlen = h("button", { type: "button", id, class: "knopf knopf-klein", "aria-describedby": beschr }, "Foto wählen …");
  const neu = nurOriginal ? null : h("button", { type: "button", class: "knopf knopf-klein knopf-leise" }, icon("hochladen"), "Neues Foto hochladen");
  const halter = h("div", { class: "bild-halter" });
  const nameEl = h("p", { class: "bild-name" });
  const altEl = h("p", { class: "hilfe bild-alt", id: `${id}-a` });
  const fehlerEl = h("p", { class: "fehler", id: `${id}-f`, "aria-live": "polite" });
  const wurzel = h("div", { class: "feld feld-bild", "data-pfad": pfad.join(".") }, kopf,
    h("div", { class: "bild-zeile" }, halter, h("div", { class: "bild-wahl" }, nameEl, altEl, h("div", { class: "bild-knoepfe" }, waehlen, neu))),
    fehlerEl, spec.hilfe ? h("div", { class: "feld-fuss" }, h("p", { class: "hilfe", id: `${id}-h` }, spec.hilfe)) : null);
  const zeige = () => {
    const name = b[k] === undefined ? "" : b[k];
    const bild = ctx.bilderListe().find((x) => x.name === name);
    leere(halter);
    halter.append(bild ? ctx.vorschauBild(name) : h("span", { class: "bild-vorschau bild-leer", "aria-hidden": "true" }));
    nameEl.textContent = bild ? bild.name : name ? `${name} (nicht in der Bildliste)` : pflicht ? "Noch kein Foto gewählt" : "Kein Foto";
    altEl.textContent = bild ? `Standard-Bildbeschreibung: ${bild.alt}` : "";
    waehlen.textContent = name ? "Anderes Foto wählen …" : "Foto wählen …";
  };
  const handle = {
    pfad, el: wurzel, beruehrt: false, fehlerSichtbar: false, geaendert: false, art: "blatt", eingabe: waehlen,
    aktualisiere() {
      const wert = b[k] === undefined ? "" : b[k];
      const fehler = fehlerFuer(spec, wert, ctx, pflicht);
      const zeigeFehler = !!fehler && (this.beruehrt || ctx.zeigeAlle());
      this.fehlerSichtbar = zeigeFehler;
      fehlerEl.textContent = zeigeFehler ? fehler : "";
      waehlen.setAttribute("aria-invalid", zeigeFehler ? "true" : "false");
      waehlen.setCustomValidity(fehler || "");
      const orig = leseWert(ctx.original, pfad);
      this.geaendert = orig !== undefined && !gleich(wert, orig);
      marker.hidden = !this.geaendert;
      wurzel.classList.toggle("geaendert", this.geaendert);
    },
  };
  /** Die eigene Bildbeschreibung an dieser Stelle gehört zum alten Foto: beim Wechsel leeren, damit die des neuen Fotos gilt. */
  const leereAlteBeschreibung = () => {
    const altPfad = [...pfad.slice(0, -1), "alt"].join(".");
    const feld = wurzel.parentElement && [...wurzel.parentElement.children].find((c) => c.getAttribute && c.getAttribute("data-pfad") === altPfad);
    const eingabe = feld && feld.querySelector("input.eingabe, textarea.eingabe");
    if (!eingabe || !eingabe.value.trim()) return;
    const alt = eingabe.value;
    const setzeAlt = (wert) => { eingabe.value = wert; eingabe.dispatchEvent(new Event("input", { bubbles: true })); };
    setzeAlt("");
    hinweis("Die eigene Bildbeschreibung an dieser Stelle gehörte zum alten Foto und wurde geleert. Jetzt gilt die Beschreibung des neuen Fotos.", {
      aktion: { text: "Rückgängig", fn: () => { if (eingabe.isConnected) setzeAlt(alt); } }, dauer: 9000 });
  };
  const uebernimm = (name) => {
    const vorher = b[k] === undefined ? "" : b[k];
    setze(b, k, name, spec);
    if (name && vorher && name !== vorher) leereAlteBeschreibung();
    zeige();
    handle.beruehrt = true;
    handle.aktualisiere();
    ctx.aenderung();
    ansage(name ? `Foto ${name} gewählt` : "Foto entfernt");
  };
  waehlen.addEventListener("click", async () => {
    const wahl = await ctx.waehleFoto({ aktuell: b[k] === undefined ? "" : b[k], optional: !pflicht, nurMitOriginal: nurOriginal, titel: `${opt.label || spec.label || "Foto"} wählen` });
    if (wahl !== null && wahl !== (b[k] === undefined ? "" : b[k])) uebernimm(wahl);
    waehlen.focus();
  });
  if (neu) {
    neu.addEventListener("click", async () => {
      const name = await ctx.neuesFoto();
      if (name) uebernimm(name);
      neu.focus();
    });
  }
  waehlen.addEventListener("blur", () => { handle.beruehrt = true; handle.aktualisiere(); });
  zeige();
  sammler.add(handle);
  handle.aktualisiere();
  return wurzel;
}

// ---------------------------------------------------------------- Gruppen
/** Felder einer Gruppe untereinander. */
export function baueFelder(felder, obj, pfad, ctx, sammler) {
  return felder.map((f) => baueFeld(f, obj, f.schluessel, [...pfad, f.schluessel], ctx, sammler, { elternFelder: felder }));
}

function baueGruppe(spec, b, k, pfad, ctx, sammler, opt) {
  const optional = !istPflicht(spec) && !opt.imEintrag;
  const huelle = h("div", { class: "gruppe-huelle" });
  const kinder = sammler.kind();
  const marker = h("span", { class: "marker", hidden: true }, "Geändert");
  const handle = {
    pfad, el: huelle, fehlerSichtbar: false, geaendert: false, art: "gruppe",
    aktualisiere() {
      const norm = (v) => (v === undefined || !hatInhalt(v) ? null : v);
      this.geaendert = !gleich(norm(b[k]), norm(leseWert(ctx.original, pfad)));
      marker.hidden = !this.geaendert;
    },
  };
  const hatInhalt = (v) => v && typeof v === "object" && Object.keys(v).length > 0;
  let weggenommen = null;   // zuletzt entfernter Abschnitt: „Rückgängig“ steht im ausgeschalteten Block, bis „Hinzufügen“ gedrückt wird
  sammler.add(handle);

  function zeichne(fokus) {
    leere(huelle);
    kinder.leeren();
    const vorhanden = hatInhalt(b[k]);
    if (optional && !vorhanden) {
      huelle.append(h("div", { class: "optional-leer" },
        h("div", null, opt.ohneTitel ? null : h("p", { class: "gruppe-titel" }, spec.label, h("span", { class: "optional" }, " (optional)")),
          h("p", { class: "hilfe" }, opt.ohneTitel ? "Dieser Abschnitt ist ausgeschaltet. Mit „Hinzufügen“ erscheint er auf der Seite." : (spec.hilfe || "")),
          weggenommen ? h("p", { class: "eintrag-rueck-text" }, `Abschnitt „${spec.label}“ entfernt.`) : null),
        h("div", { class: "optional-aktionen" },
          weggenommen ? h("button", { type: "button", class: "knopf knopf-klein", "data-fokus": "rueck", "aria-label": `Rückgängig: Abschnitt ${spec.label} wieder einfügen`, onclick: () => {
            b[k] = weggenommen.alt;
            weggenommen = null;
            if (opt.elternFelder) ordneSchluessel(b, opt.elternFelder);
            zeichne("erstes"); ctx.aenderung();
            ansage(`Abschnitt ${spec.label} ist wieder da`);
          } }, "Rückgängig") : null,
          h("button", { type: "button", class: "knopf knopf-klein", "data-fokus": "hinzu", onclick: () => {
            weggenommen = null;
            b[k] = leerWert(spec);
            const felder = (opt.elternFelder || null);
            if (felder) ordneSchluessel(b, felder);
            zeichne("erstes"); ctx.aenderung();
          } }, icon("plus"), "Hinzufügen")),
      ));
      if (fokus === "entfernt") huelle.querySelector(weggenommen ? "[data-fokus=rueck]" : "[data-fokus=hinzu]").focus();
      handle.aktualisiere();
      return;
    }
    if (b[k] === undefined || typeof b[k] !== "object") b[k] = leerWert(spec);
    const kopfTeil = opt.ohneTitel ? null : h("legend", { class: "gruppe-titel" }, opt.label || spec.label, marker);
    const fs = h(opt.ohneTitel ? "div" : "fieldset", { class: "gruppe" },
      kopfTeil,
      optional ? h("button", { type: "button", class: "knopf knopf-klein knopf-leise gruppe-weg", onclick: () => entferne() }, icon("weg"), "Abschnitt entfernen") : null,
      spec.hilfe && !opt.ohneTitel ? h("p", { class: "hilfe" }, spec.hilfe) : null,
      ...baueFelder(spec.felder, b[k], pfad, ctx, kinder));
    huelle.append(fs);
    handle.aktualisiere();
    if (fokus === "erstes") { const e = fs.querySelector("input, select, textarea"); if (e) e.focus(); }
  }

  function entferne() {
    weggenommen = { alt: b[k] };
    delete b[k];
    zeichne("entfernt");
    ctx.aenderung();
    ansage(`Abschnitt ${spec.label} entfernt`);
  }

  zeichne();
  return huelle;
}

// ---------------------------------------------------------------- Listen
function ersteTextVorschau(eintrag) {
  const suche = (v) => {
    if (typeof v === "string" && v.trim()) return v;
    if (v && typeof v === "object") for (const x of Object.values(v)) { const r = suche(x); if (r) return r; }
    return "";
  };
  const t = suche(eintrag).replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  return t.length > 64 ? t.slice(0, 63) + "…" : t;
}

function baueListe(spec, b, k, pfad, ctx, sammler, opt) {
  const id = neueId();
  const name = eintragName(spec);
  const eintragSpec = spec.eintrag;
  // Einträge mit nur einem Textfeld (z. B. Telefonnummern) erscheinen als einzelnes Feld statt als aufklappbarer Eintrag
  const einzel = eintragSpec.typ === "gruppe" && eintragSpec.felder.length === 1 && ["text", "textarea"].includes(eintragSpec.felder[0].typ);
  const einfach = eintragSpec.typ !== "gruppe" || einzel;
  const min = spec.min || 0;
  const max = spec.max === undefined ? Infinity : spec.max;
  if (!Array.isArray(b[k])) b[k] = [];
  const feld = () => b[k];
  let rueck = null;   // zuletzt entfernter Eintrag { i, weg }: „Rückgängig“ steht an dessen Stelle, bis zur nächsten Aktion in dieser Liste
  const kinder = sammler.kind();
  const marker = h("span", { class: "marker", hidden: true }, "Geändert");
  const fehlerEl = h("p", { class: "fehler", id: `${id}-f`, "aria-live": "polite" });
  const liste = h("ol", { class: "eintraege", "aria-labelledby": `${id}-t` });
  const hinzuKnopf = h("button", { type: "button", class: "knopf knopf-klein", onclick: () => hinzufuegen() }, icon("plus"), `${name} hinzufügen`);
  const grenzHinweis = h("p", { class: "hilfe" });
  const wurzel = h("div", { class: "liste", "data-pfad": pfad.join(".") },
    h("div", { class: "liste-kopf" }, h("h3", { class: "liste-titel", id: `${id}-t` }, opt.label || spec.label), marker),
    spec.hilfe ? h("p", { class: "hilfe" }, spec.hilfe) : null,
    fehlerEl, liste,
    h("div", { class: "liste-fuss" }, hinzuKnopf, grenzHinweis));

  const handle = {
    pfad, el: wurzel, fehlerSichtbar: false, geaendert: false, art: "liste", aktualisiere() {
      const orig = leseWert(ctx.original, pfad);
      this.geaendert = !gleich(feld(), orig === undefined ? [] : orig);
      marker.hidden = !this.geaendert;
      const n = feld().length;
      hinzuKnopf.hidden = n >= max;
      grenzHinweis.textContent = min === max || max === Infinity ? "" : `Bis zu ${max} möglich (jetzt ${n}).`;
      let fehler = null;
      if (n < min) fehler = `Mindestens ${min} Einträge nötig (jetzt ${n}).`;
      else if (n > max) fehler = `Höchstens ${max} Einträge erlaubt (jetzt ${n}).`;
      const zeige = !!fehler && (this.beruehrt || ctx.zeigeAlle());
      this.fehlerSichtbar = zeige;
      fehlerEl.textContent = zeige ? fehler : "";
      // Zusammenfassungen der Einträge (erste Textzeile) auffrischen
      if (!einfach) liste.querySelectorAll(":scope > li > details > summary .eintrag-vorschau").forEach((el, i) => {
        el.textContent = ersteTextVorschau(feld()[i]);
      });
    },
  };
  sammler.add(handle);

  function zeichne(fokus) {
    leere(liste);
    kinder.leeren();
    const daten = feld();
    daten.forEach((eintrag, i) => liste.append(baueEintrag(eintrag, i, daten.length)));
    if (rueck) liste.insertBefore(baueRueckZeile(), liste.children[Math.min(rueck.i, liste.children.length)] || null);
    handle.aktualisiere();
    if (fokus) {
      const ziel = wurzel.querySelector(`[data-fokus="${fokus}"]`);
      if (ziel && !ziel.disabled) ziel.focus();
      else if (fokus.startsWith("hoch") || fokus.startsWith("runter")) {
        const alt = wurzel.querySelector(`[data-fokus="${fokus.startsWith("hoch") ? fokus.replace("hoch", "runter") : fokus.replace("runter", "hoch")}"]`);
        if (alt && !alt.disabled) alt.focus();
      }
    }
  }

  function steuerung(i, n) {
    const bez = `${name} ${i + 1}`;
    const kn = (symbol, text, fokus, fn, aus) => h("button", {
      type: "button", class: "knopf knopf-symbol", "aria-label": text, title: text, "data-fokus": fokus, disabled: aus, onclick: fn,
    }, icon(symbol));
    return h("div", { class: "eintrag-knoepfe", role: "group", "aria-label": `${bez} bearbeiten` },
      kn("hoch", `${bez} nach oben schieben`, `hoch${i}`, () => verschiebe(i, -1), i === 0),
      kn("runter", `${bez} nach unten schieben`, `runter${i}`, () => verschiebe(i, 1), i === n - 1),
      kn("papierkorb", `${bez} entfernen`, `weg${i}`, () => entferne(i), n <= min));
  }

  function baueEintrag(eintrag, i, n) {
    const li = h("li", { class: "eintrag" });
    const bez = `${name} ${i + 1}`;
    const unter = kinder.kind();
    if (einfach) {
      const kind = einzel ? eintragSpec.felder[0] : null;
      const inhalt = einzel
        ? baueFeld({ ...kind, hilfe: i === 0 ? kind.hilfe : "" }, feld()[i], kind.schluessel, [...pfad, i, kind.schluessel], ctx, unter, { label: bez, imEintrag: true, pflicht: true, kopfExtra: steuerung(i, n) })
        : baueFeld(eintragSpec, feld(), i, [...pfad, i], ctx, unter, { label: bez, imEintrag: true, pflicht: true, kopfExtra: steuerung(i, n) });
      li.append(inhalt);
      return li;
    }
    const neu = !leseWert(ctx.original, [...pfad, i]);
    const marke = h("span", { class: "marker", hidden: !neu }, "Neu");
    const det = h("details", { class: "eintrag-details", open: ctx.offen.has(eintrag) || n <= 4 });
    det.append(
      h("summary", { class: "eintrag-kopf" },
        h("span", { class: "eintrag-name", id: `${id}-e${i}` }, bez),
        h("span", { class: "eintrag-vorschau" }, ersteTextVorschau(eintrag)),
        marke, icon("runter", "symbol symbol-pfeil")),
      // Die Felder eines Eintrags sind eine benannte Gruppe („Frage 1“): Screenreader sagen so, zu welchem Eintrag „Antwort“ gehört
      h("div", { class: "eintrag-koerper", role: "group", "aria-labelledby": `${id}-e${i}` },
        steuerung(i, n),
        ...baueFelder(eintragSpec.felder, eintrag, [...pfad, i], ctx, unter)));
    det.addEventListener("toggle", () => { if (det.open) ctx.offen.add(eintrag); else ctx.offen.delete(eintrag); });
    li.append(det);
    return li;
  }

  /** Zeile „<Eintrag> entfernt. [Rückgängig]“ an der Stelle des entfernten Eintrags: ohne Zeitlimit, direkt im Fokusfluss. */
  function baueRueckZeile() {
    const bez = `${name} ${rueck.i + 1}`;
    return h("li", { class: "eintrag-rueck", "data-rueck": "1" },
      h("p", { class: "eintrag-rueck-text" }, `${bez} entfernt.`),
      h("button", { type: "button", class: "knopf knopf-klein", "data-fokus": "rueck", "aria-label": `Rückgängig: ${bez} wieder einfügen`, onclick: holeZurueck }, "Rückgängig"));
  }

  function holeZurueck() {
    if (!rueck) return;
    const { i, weg } = rueck;
    rueck = null;
    feld().splice(Math.min(i, feld().length), 0, weg);
    zeichne(`hoch${i}`);
    ctx.aenderung();
    ansage(`${name} ${i + 1} ist wieder da`);
  }

  function verschiebe(i, d) {
    rueck = null;
    const daten = feld();
    const j = i + d;
    if (j < 0 || j >= daten.length) return;
    [daten[i], daten[j]] = [daten[j], daten[i]];
    zeichne(`${d < 0 ? "hoch" : "runter"}${j}`);
    ctx.aenderung();
    ansage(`${name} steht jetzt an Position ${j + 1} von ${daten.length}`);
  }

  function entferne(i) {
    const daten = feld();
    if (daten.length <= min) return;
    const [weg] = daten.splice(i, 1);
    rueck = { i, weg };
    zeichne("rueck");   // der Fokus geht auf „Rückgängig“ (der Papierkorb-Knopf ist ja weg)
    ctx.aenderung();
    ansage(`${name} ${i + 1} entfernt`);
  }

  function hinzufuegen() {
    rueck = null;
    const daten = feld();
    if (daten.length >= max) return;
    const neuer = leerWert(eintragSpec);
    daten.push(neuer);
    if (!einfach) ctx.offen.add(neuer);
    zeichne();
    const letzter = liste.lastElementChild;
    const e = letzter && letzter.querySelector("input, textarea, select");
    if (e) e.focus();
    ctx.aenderung();
    ansage(`${name} ${daten.length} hinzugefügt`);
  }

  zeichne();
  return wurzel;
}

// ---------------------------------------------------------------- Verteiler
export function baueFeld(spec, b, k, pfad, ctx, sammler, opt = {}) {
  switch (spec.typ) {
    case "text":
    case "textarea": return baueText(spec, b, k, pfad, ctx, sammler, opt);
    case "janein": return baueSchalter(spec, b, k, pfad, ctx, sammler, opt);
    case "auswahl": return baueAuswahl(spec, b, k, pfad, ctx, sammler, opt);
    case "zahl": return baueZahl(spec, b, k, pfad, ctx, sammler, opt);
    case "bild": return baueBild(spec, b, k, pfad, ctx, sammler, opt);
    case "liste": return baueListe(spec, b, k, pfad, ctx, sammler, opt);
    case "gruppe": return baueGruppe(spec, b, k, pfad, ctx, sammler, opt);
    default: return h("p", { class: "fehler" }, `Unbekannter Feldtyp „${spec.typ}“.`);
  }
}

// ---------------------------------------------------------------- Abschnitte (oberste Gruppen einer Seite)
/**
 * Baut einen aufklappbaren Abschnitt (oberste Gruppe einer Seite oder lose Felder).
 * bauInhalt(sammler) liefert die Felder des Abschnitts; vergleich() sagt, ob der Abschnitt geändert wurde.
 * Gibt { el, details, sammler, aktualisiere } zurück.
 */
export function baueAbschnitt({ id, titel, hilfe, bauInhalt, offen, vergleich }) {
  const sammler = new Sammler();
  const marker = h("span", { class: "marker", hidden: true }, "Geändert");
  const fehlerAnzahl = h("span", { class: "abschnitt-fehler", hidden: true });
  const det = h("details", { class: "abschnitt", id, open: offen },
    h("summary", { class: "abschnitt-kopf" },
      h("h2", { class: "abschnitt-titel" }, titel),
      h("span", { class: "abschnitt-status" }, marker, fehlerAnzahl),
      icon("runter", "symbol symbol-pfeil")),
    h("div", { class: "abschnitt-koerper" },
      hilfe ? h("p", { class: "hilfe" }, hilfe) : null,
      ...[].concat(bauInhalt(sammler))));
  return {
    el: det, details: det, sammler,
    aktualisiere() {
      const alle = sammler.alle();
      alle.forEach((x) => x.aktualisiere());
      marker.hidden = !vergleich();
      const n = alle.filter((x) => (x.art === "blatt" || x.art === "liste") && x.fehlerSichtbar).length;
      fehlerAnzahl.hidden = n === 0;
      fehlerAnzahl.textContent = n === 1 ? "1 Fehler" : `${n} Fehler`;
    },
  };
}
