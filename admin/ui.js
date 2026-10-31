// ui.js – kleine Bausteine für die Oberfläche: Elemente erzeugen, Symbole, Dialog, Hinweise.
// Alle Texte kommen über textContent bzw. Textknoten in die Seite, nie über innerHTML.

const SVG_NS = "http://www.w3.org/2000/svg";

/** h("button", {class: "knopf", onclick: fn}, "Text", andereElemente) */
export function h(tag, eigenschaften, ...kinder) {
  const el = document.createElement(tag);
  if (eigenschaften) {
    for (const [k, v] of Object.entries(eigenschaften)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "text") el.textContent = v;
      else if (k === "value") el.value = v;
      else if (k === "checked") el.checked = !!v;
      else if (k === "disabled") el.disabled = !!v;
      else if (k === "hidden") el.hidden = !!v;
      else if (k === "open") el.open = !!v;
      else if (k === "dataset") Object.assign(el.dataset, v);
      else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? "" : String(v));
    }
  }
  anhaengen(el, kinder);
  return el;
}

export function anhaengen(el, kinder) {
  for (const k of kinder.flat(Infinity)) {
    if (k === null || k === undefined || k === false) continue;
    el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
  return el;
}

export function leere(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

// Symbole: eine Strichstärke, ein Raster (24), gezeichnet als Pfade
const PFADE = {
  zurueck: "M15 18l-6-6 6-6",
  weiter: "M9 18l6-6-6-6",
  hoch: "M18 15l-6-6-6 6",
  runter: "M6 9l6 6 6-6",
  plus: "M12 5v14M5 12h14",
  weg: "M18 6L6 18M6 6l12 12",
  haken: "M20 6L9 17l-5-5",
  papierkorb: "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5M14 11v5",
  warnung: "M12 4L2.5 20h19L12 4zM12 10v4.5M12 17.5h.01",
  extern: "M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5",
  verlauf: "M3 12a9 9 0 109-9 9.7 9.7 0 00-6.7 2.7L3 8M3 3v5h5M12 7v5l3 2",
  schloss: "M6 11h12v9H6zM8 11V8a4 4 0 018 0v3",
  hochladen: "M12 16V5M7 9.5L12 4.5l5 5M4 15v4a1 1 0 001 1h14a1 1 0 001-1v-4",
};

export function icon(name, klasse = "symbol") {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("class", klasse);
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  const p = document.createElementNS(SVG_NS, "path");
  p.setAttribute("d", PFADE[name]);
  svg.append(p);
  return svg;
}

/** Zurück-Link und Seitenkopf (Titel, Beschreibung) wie auf allen Ansichten. */
export const zurueckLink = (ziel, text) => h("a", { class: "zurueck", href: ziel }, icon("zurueck"), text);

export function seitenKopf(titel, { zurueck, beschreibung } = {}) {
  return h("div", { class: "seitenkopf" },
    zurueck ? zurueckLink(zurueck[0], zurueck[1]) : null,
    h("h1", { class: "seitentitel", id: "titel", tabindex: "-1" }, titel),
    beschreibung ? h("p", { class: "seitenbeschr" }, beschreibung) : null);
}

const berlin = { timeZone: "Europe/Berlin" };
export function datumZeit(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Datum unbekannt";
  const tag = new Intl.DateTimeFormat("de-DE", { ...berlin, day: "numeric", month: "long", year: "numeric" }).format(d);
  const zeit = new Intl.DateTimeFormat("de-DE", { ...berlin, hour: "2-digit", minute: "2-digit" }).format(d);
  return `${tag}, ${zeit} Uhr`;
}

/** Kurzform für Commit-Nachrichten: 26.10.2026 23:21 */
export function datumKurz(iso) {
  const d = new Date(iso);
  const t = new Intl.DateTimeFormat("de-DE", { ...berlin, day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
  const z = new Intl.DateTimeFormat("de-DE", { ...berlin, hour: "2-digit", minute: "2-digit" }).format(d);
  return `${t} ${z}`;
}

// ---------------------------------------------------------------- Dialog (<dialog>, kein confirm())
let dialogReihe = Promise.resolve();

/**
 * Zeigt den gemeinsamen Dialog. Gibt true zurück, wenn bestätigt wurde, sonst false.
 * optionen: titel, text (Absatz oder Liste von Absätzen), inhalt (Element), ok, abbrechen (false = nur ein Knopf),
 *           gefahr (roter Knopf, Fokus auf „Abbrechen“), bestaetigung (Text einer Pflicht-Checkbox), fokus (Element für den Startfokus),
 *           klasse (zusätzliche CSS-Klasse), nurKnoepfe (Klick neben den Dialog schließt nicht), okAus (OK-Knopf zunächst gesperrt), beiBereit({ okKnopf }) (nach dem Aufbau),
 *           pruefeOk() (vor dem Schließen mit OK; false = Dialog bleibt offen)
 */
export function dialog(optionen) {
  const lauf = dialogReihe.then(() => zeigeDialog(optionen));
  dialogReihe = lauf.catch(() => {});
  return lauf;
}

function zeigeDialog({ titel, text, inhalt, ok = "OK", abbrechen = "Abbrechen", gefahr = false, bestaetigung = null, fokus = null,
  klasse = "", nurKnoepfe = false, okAus = false, beiBereit = null, pruefeOk = null }) {
  const dlg = document.getElementById("dialog");
  dlg.className = "dialog" + (klasse ? " " + klasse : "");
  return new Promise((resolve) => {
    leere(dlg);
    const absaetze = [].concat(text || []).map((t) => h("p", { class: "dialog-text" }, t));
    let box = null;
    let okKnopf;
    if (bestaetigung) {
      box = h("input", { type: "checkbox", id: "dialog-box" });
      absaetze.push(h("label", { class: "pruefzeile", for: "dialog-box" }, box, h("span", null, bestaetigung)));
    }
    const abbruchKnopf = abbrechen === false ? null
      : h("button", { type: "button", class: "knopf knopf-leise", onclick: () => schliesse(false) }, abbrechen);
    okKnopf = h("button", {
      type: "button", class: "knopf " + (gefahr ? "knopf-gefahr" : "knopf-haupt"),
      onclick: () => { if (!pruefeOk || pruefeOk()) schliesse(true); }, disabled: !!bestaetigung || okAus,
    }, ok);
    if (box) box.addEventListener("change", () => { okKnopf.disabled = !box.checked; });
    dlg.append(
      h("div", { class: "dialog-innen" },
        h("h2", { class: "dialog-titel", id: "dialog-titel" }, titel),
        ...absaetze,
        inhalt || null,
        h("div", { class: "dialog-knoepfe" }, abbruchKnopf, okKnopf)),
    );
    let fertig = false;
    // Zurück-Wischen oder Zurück-Taste (Handy) schließt den Dialog, statt die Seite zu wechseln: der Dialog bekommt einen eigenen Verlaufseintrag
    let eintrag = false;
    try { history.pushState({ zecaDialog: true }, "", location.href); eintrag = true; } catch (e) { eintrag = false; }
    function schliesse(wert) {
      if (fertig) return;
      fertig = true;
      dlg.removeEventListener("cancel", beiAbbruch);
      dlg.removeEventListener("click", beiKlick);
      window.removeEventListener("popstate", beiZurueck);
      dlg.close();
      if (!eintrag) { resolve(wert); return; }
      // Den eigenen Verlaufseintrag wieder abbauen und erst danach weitermachen (sonst kollidiert ein sofort folgender Dialog damit)
      let t;
      const weiter = () => { clearTimeout(t); window.removeEventListener("popstate", weiter); resolve(wert); };
      window.addEventListener("popstate", weiter);
      t = setTimeout(weiter, 500);
      try { history.back(); } catch (e) { weiter(); }
    }
    const beiAbbruch = (ev) => { ev.preventDefault(); schliesse(false); };
    const beiKlick = (ev) => { if (ev.target === dlg && abbrechen !== false && !nurKnoepfe) schliesse(false); };
    const beiZurueck = () => { eintrag = false; schliesse(false); };   // der Verlaufseintrag ist durch das Zurück schon weg
    dlg.addEventListener("cancel", beiAbbruch);
    dlg.addEventListener("click", beiKlick);
    window.addEventListener("popstate", beiZurueck);
    dlg.showModal();
    if (beiBereit) beiBereit({ okKnopf });
    // Bei gefährlichen oder bestätigungspflichtigen Aktionen landet der Fokus auf der sicheren Wahl
    const start = (gefahr || bestaetigung) && abbruchKnopf ? abbruchKnopf : okKnopf;
    (fokus || (box && !gefahr ? box : start)).focus();
  });
}

/** Dialog mit nur einem Knopf. */
export const melde = (titel, text, ok = "Verstanden") => dialog({ titel, text, ok, abbrechen: false });

// ---------------------------------------------------------------- Hinweise (Toast)
/**
 * Kurze Meldung am unteren Rand (liegt über der Leiste). Die Ansage für Screenreader übernimmt der Behälter (aria-live).
 *  - Ohne Aktion: verschwindet nach `dauer` ms; solange die Maus darüber ist, bleibt sie stehen.
 *  - Mit Aktion (zum Beispiel „Rückgängig“): bleibt OHNE Zeitlimit stehen, bis sie benutzt oder geschlossen wird (WCAG 2.2.1, 2.2.3),
 *    hat einen Schließen-Knopf und schließt mit Esc. Es gibt immer nur einen solchen Hinweis; ein neuer ersetzt den alten.
 *    fokus: true setzt den Fokus sofort auf die Aktion (wenn der Auslöser, zum Beispiel ein Papierkorb-Knopf, verschwunden ist).
 */
export function hinweis(text, { aktion = null, dauer = 5000, fokus = false } = {}) {
  const box = document.getElementById("hinweise");
  if (aktion) entferneAktionshinweise();
  const vorher = document.activeElement;
  const el = h("div", { class: "hinweis" + (aktion ? " hinweis-aktion" : "") }, h("span", { class: "hinweis-text" }, text));
  let timer = null;
  const ersatzFokus = () => {
    const f = document.activeElement;
    if (f && f !== document.body && f.isConnected) return;
    const ziel = vorher && vorher !== document.body && vorher.isConnected ? vorher : document.getElementById("titel");
    if (ziel) fokussiere(ziel);
  };
  const weg = () => {
    clearTimeout(timer);
    if (el.classList.contains("hinweis-aus")) return;
    const hatteFokus = el.contains(document.activeElement);
    el.classList.add("hinweis-aus");
    setTimeout(() => el.remove(), 160);
    if (hatteFokus) setTimeout(ersatzFokus, 0);
  };
  el.entferne = weg;
  if (aktion) {
    const knopf = h("button", { type: "button", class: "knopf knopf-hinweis", "data-aktion": "1",
      onclick: () => { weg(); aktion.fn(); setTimeout(ersatzFokus, 0); } }, aktion.text);
    const zu = h("button", { type: "button", class: "knopf knopf-symbol knopf-hinweis-zu", "aria-label": "Hinweis schließen", title: "Schließen", onclick: weg }, icon("weg"));
    el.append(knopf, zu);
    el.addEventListener("keydown", (ev) => { if (ev.key === "Escape") { ev.preventDefault(); ev.stopPropagation(); weg(); } });
    box.append(el);
    if (fokus) knopf.focus();
  } else {
    box.append(el);
    const starte = (ms) => { clearTimeout(timer); timer = setTimeout(weg, ms); };
    el.addEventListener("mouseenter", () => clearTimeout(timer));
    el.addEventListener("mouseleave", () => starte(2000));
    starte(dauer);
  }
  return weg;
}

/** Entfernt Hinweise mit Aktion (zum Beispiel „Rückgängig“), deren Grundlage weg ist (nach Veröffentlichen, Verwerfen, Neuladen). */
export function entferneAktionshinweise() {
  for (const el of document.querySelectorAll("#hinweise .hinweis-aktion")) { if (el.entferne) el.entferne(); else el.remove(); }
}

export function fokussiere(el) {
  if (!el) return;
  if (!el.hasAttribute("tabindex") && !/^(A|BUTTON|INPUT|SELECT|TEXTAREA|SUMMARY)$/.test(el.tagName)) el.setAttribute("tabindex", "-1");
  el.focus({ preventScroll: false });
}

export const bremse = (fn, ms) => {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
};

/** Ansage nur für Screenreader (unsichtbare Live-Region). */
export function ansage(text) {
  const el = document.getElementById("sprecher");
  if (!el) return;
  el.textContent = "";
  setTimeout(() => { el.textContent = text; }, 30);
}
