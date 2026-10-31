// ansichten.js – die Bildschirme: Anmeldung, Übersicht, Bereiche (Formulare), Rechtstexte, Fotos, Verlauf.
// Jede Funktion füllt <main> und gibt { titel, aufraeumen } zurück.

import { h, icon, leere, datumZeit, bremse, fokussiere, anhaengen, seitenKopf } from "./ui.js";

const fuelle = (el, ...kinder) => anhaengen(el, kinder);
import { S, auf, arbeitskopie, zaehleAlle, kontext, aenderung } from "./zustand.js";
import { bilderListe, vorschauUrl } from "./fotozustand.js";
import { oeffneUpload, waehleFoto, vorschauBild } from "./fotoansicht.js";
import { alleBereiche, rechtBereiche, findeBereich, bereichAenderungen } from "./bereiche.js";
import { baueAbschnitt, baueFelder, baueFeld } from "./formular.js";
import { gleich, istPflicht, leerWert } from "./daten.js";
import { pruefeRechtstext } from "./pruefung.js";
import { speicherStatus } from "./entwurf.js";
import { verlaufLaden, letzteAenderungRueckgaengig, stelleWiederHer, verwerfeMitRueckfrage } from "./aktionen.js";
import { GhFehler } from "./api.js";

// ---------------------------------------------------------------- Bausteine

function warnung(titel, text) {
  return h("div", { class: "warnung", role: "note" }, icon("warnung"), h("div", null, h("p", { class: "warnung-titel" }, titel), h("p", null, text)));
}

export function zeigeLaden(main, text = "Inhalte werden geladen …", fortschritt) {
  leere(main);
  const balken = h("div", { class: "fortschritt", role: "progressbar", "aria-label": "Fortschritt", "aria-valuemin": 0, "aria-valuemax": 100 }, h("div", { class: "fortschritt-fuellung" }));
  fuelle(main, h("div", { class: "laden" }, h("h1", { class: "seitentitel", id: "titel", tabindex: "-1" }, "Verwaltung"), h("p", { class: "laden-text" }, text), balken));
  return {
    titel: "Wird geladen",
    aufraeumen() {},
    setze(n, gesamt) {
      const p = Math.round((n / gesamt) * 100);
      balken.setAttribute("aria-valuenow", String(p));
      balken.firstChild.style.setProperty("--anteil", p + "%");
    },
  };
}

export function zeigeMeldungSeite(main, titel, text, knoepfe = []) {
  leere(main);
  fuelle(main, h("div", { class: "meldungsseite" }, h("h1", { class: "seitentitel", id: "titel", tabindex: "-1" }, titel),
    h("p", { class: "meldung meldung-fehler", role: "alert" }, text), h("div", { class: "knopfreihe" }, ...knoepfe)));
  return { titel, aufraeumen() {} };
}

// ---------------------------------------------------------------- Anmeldung
export function zeigeLogin(main, { fehler = "", beiAnmelden, repo }) {
  leere(main);
  const feld = h("input", { id: "schluessel", class: "eingabe", type: "password", autocomplete: "off", autocapitalize: "none", spellcheck: "false", required: true, "aria-describedby": "schluessel-fehler schluessel-hilfe" });
  const fehlerEl = h("p", { class: "fehler fehler-gross", id: "schluessel-fehler", role: "alert" }, fehler);
  const anzeigen = h("input", { type: "checkbox", id: "schluessel-zeigen" });
  anzeigen.addEventListener("change", () => { feld.type = anzeigen.checked ? "text" : "password"; });
  const knopf = h("button", { type: "submit", class: "knopf knopf-haupt knopf-gross" }, "Anmelden");
  const form = h("form", { class: "login-form", novalidate: true },
    h("div", { class: "feld" },
      h("label", { class: "feld-label", for: "schluessel" }, "Schlüssel"),
      feld, fehlerEl,
      h("p", { class: "hilfe", id: "schluessel-hilfe" }, "Den Schlüssel gibt es im nächsten Schritt. Er bleibt nur in diesem Browser gespeichert."),
      h("label", { class: "schalter schalter-klein", for: "schluessel-zeigen" }, anzeigen, h("span", { class: "schalter-text" }, "Schlüssel anzeigen"))),
    knopf);
  let laeuft = false;
  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    if (laeuft) return;
    const wert = feld.value.trim();
    if (!/^[A-Za-z0-9_.-]{8,255}$/.test(wert)) {
      fehlerEl.textContent = wert ? "Das sieht nicht nach einem Schlüssel aus. Er besteht aus Buchstaben, Ziffern und Unterstrichen und ist ziemlich lang. Bitte ohne Leerzeichen einfügen." : "Bitte den Schlüssel einfügen.";
      feld.setAttribute("aria-invalid", "true");
      feld.focus();
      return;
    }
    laeuft = true;
    knopf.disabled = true;
    knopf.textContent = "Wird geprüft …";
    fehlerEl.textContent = "";
    feld.removeAttribute("aria-invalid");
    const f = await beiAnmelden(wert);
    laeuft = false;
    if (f) {
      knopf.disabled = false;
      knopf.textContent = "Anmelden";
      fehlerEl.textContent = f;
      feld.setAttribute("aria-invalid", "true");
      feld.focus();
    }
  });
  const schritt = (...k) => h("li", null, ...k);
  fuelle(main, h("div", { class: "login" },
    h("h1", { class: "seitentitel", id: "titel", tabindex: "-1" }, "Anmelden"),
    h("p", { class: "seitenbeschr" }, "Hier ändern Sie Texte, Telefonnummer, Leistungen und mehr auf Ihrer Webseite. Dafür brauchen Sie einmalig einen Schlüssel von GitHub."),
    form,
    h("section", { class: "anleitung", "aria-labelledby": "anleitung-titel" },
      h("h2", { id: "anleitung-titel" }, "So bekommen Sie den Schlüssel"),
      h("ol", { class: "schritte" },
        schritt("Bei GitHub anmelden und ",
          h("a", { href: "https://github.com/settings/personal-access-tokens/new", target: "_blank", rel: "noopener noreferrer" }, "diese Seite öffnen", icon("extern")),
          " („Fine-grained personal access token“, neuer Schlüssel)."),
        schritt("Name: ", h("strong", null, "ZeCa-Alu Verwaltung"), ". Ablauf („Expiration“): ", h("strong", null, "30 bis 90 Tage"), " (empfohlen: 90 Tage), nicht länger."),
        schritt("Bei „Repository access“ ", h("strong", null, "Only select repositories"), " wählen und genau dieses Projekt auswählen: ", h("strong", { class: "mono" }, repo), "."),
        schritt("Unter „Permissions“ → „Repository permissions“ einstellen:",
          h("ul", { class: "rechte" },
            h("li", null, h("strong", null, "Contents"), ": Read and write (Lesen und Schreiben)"),
            h("li", null, h("strong", null, "Actions"), ": Read-only (nur Lesen)"),
            h("li", null, h("strong", null, "Metadata"), ": Read-only (wird automatisch gesetzt)"))),
        schritt("Unten „Generate token“ drücken, den Schlüssel kopieren (er wird nur einmal angezeigt) und oben einfügen.")),
      h("p", { class: "hilfe" }, "Auf einem fremden oder gemeinsam genutzten Gerät nach der Arbeit oben rechts „Abmelden“ drücken. Dann wird der Schlüssel aus dem Browser gelöscht."))));
  return { titel: "Anmelden", aufraeumen() {} };
}

// ---------------------------------------------------------------- Übersicht
function statusText() {
  const n = zaehleAlle();
  const p = S.ver.phase;
  if (n > 0) return { art: "aenderung", text: n === 1 ? "1 ungespeicherte Änderung" : `${n} ungespeicherte Änderungen` };
  if (p === "speichern" || p === "beobachten") return { art: "laeuft", text: "Wird veröffentlicht …" };
  if (p === "fehler") return { art: "fehler", text: "Die letzte Veröffentlichung ist fehlgeschlagen" };
  if (p === "zeitlimit" || p === "unbekannt") return { art: "warn", text: "Gespeichert, Stand der Veröffentlichung unklar" };
  return { art: "ok", text: "Alles veröffentlicht" };
}

export function zeigeUebersicht(main) {
  leere(main);
  const status = h("p", { class: "status-zeile", id: "uebersicht-status" });
  const zeichneStatus = () => {
    const s = statusText();
    leere(status);
    status.className = `status-zeile status-${s.art}`;
    status.append(s.art === "ok" ? icon("haken") : s.art === "aenderung" || s.art === "fehler" || s.art === "warn" ? icon("warnung") : h("span", { class: "dreher", "aria-hidden": "true" }), s.text);
  };
  zeichneStatus();

  const gruppen = [
    { id: "firma", titel: "Firma" },
    { id: "seiten", titel: "Seiten" },
    { id: "weiteres", titel: "Weiteres" },
  ];
  const zeilen = [];
  const bereiche = alleBereiche();
  const markerFuer = new Map();
  const abschnitte = gruppen.map((g) => {
    const liste = h("ul", { class: "zeilen" });
    for (const b of bereiche.filter((x) => x.gruppe === g.id)) {
      const marker = h("span", { class: "marker", hidden: true }, "Geändert");
      markerFuer.set(b, marker);
      const platzhalter = b.art === "fotos";
      liste.append(h("li", null, h("a", {
        class: "zeile" + (b.warnung ? " zeile-warn" : ""), href: platzhalter ? "#/fotos" : b.art === "recht" ? "#/recht" : b.art === "verlauf" ? "#/verlauf" : `#/b/${b.id}`,
      },
        h("span", { class: "zeile-text" }, h("span", { class: "zeile-titel" }, b.titel), h("span", { class: "zeile-beschr" }, b.text)),
        b.warnung ? h("span", { class: "marker marker-warn" }, "Vorsicht") : null,
        marker, icon("weiter", "symbol symbol-weiter"))));
    }
    return h("section", { class: `uebersicht-${g.id}`, "aria-labelledby": `gruppe-${g.id}` }, h("h2", { class: "gruppen-titel", id: `gruppe-${g.id}` }, g.titel), liste);
  });
  const markerAktualisieren = () => {
    for (const [b, m] of markerFuer) m.hidden = bereichAenderungen(b) === 0;
    zeichneStatus();
  };
  markerAktualisieren();

  fuelle(main, 
    h("div", { class: "seitenkopf" },
      h("h1", { class: "seitentitel", id: "titel", tabindex: "-1" }, "Was möchten Sie ändern?"), status),
    !speicherStatus.ok ? h("p", { class: "meldung meldung-warn", role: "note" }, "Dieser Browser erlaubt kein Zwischenspeichern. Entwürfe gehen beim Neuladen der Seite verloren. Bitte vor dem Schließen veröffentlichen.") : null,
    h("div", { class: "uebersicht" }, ...abschnitte));

  const weg = [auf("aenderung", markerAktualisieren), auf("status", markerAktualisieren)];
  return { titel: "Übersicht", aufraeumen() { weg.forEach((w) => w()); } };
}

// ---------------------------------------------------------------- Bereiche (Formulare)
function zaehleBlaetter(spec) {
  if (spec.typ === "gruppe") return spec.felder.reduce((n, f) => n + zaehleBlaetter(f), 0);
  if (spec.typ === "liste") return 2 + (spec.min || 1) * zaehleBlaetter(spec.eintrag);
  return 1;
}

export function zeigeBereich(main, id) {
  const b = findeBereich(id);
  if (!b || b.art !== "formular") return null;
  leere(main);
  const abschnitte = [];
  const dateien = b.teile.map((t) => t.datei).concat(b.rechtDatei ? [b.rechtDatei] : []);
  let nummer = 0;

  const seitenListe = ((S.struktur && S.struktur.seiten) || []).map((r) => ({
    pfad: r.pfad, name: ((S.original.get(`inhalt/seiten/${r.inhalt}.json`) || {}).name) || r.id,
  })).map((s) => (s.pfad === "" ? { ...s, name: "Startseite" } : s));
  const planung = [];
  for (const teil of b.teile) {
    const schema = S.schemas.get(teil.datei);
    if (!schema) continue;
    const obj = arbeitskopie(teil.datei);
    const orig = S.original.get(teil.datei);
    const ctx = {
      daten: obj, original: orig, seitenListe, offen: S.offen,
      bilderListe, vorschauUrl, vorschauBild, waehleFoto, neuesFoto: () => oeffneUpload(),
      kontext, aenderung, zeigeAlle: () => S.zeigeAlleFehler,
    };
    const felder = teil.gruppen ? schema.felder.filter((f) => teil.gruppen.includes(f.schluessel)) : schema.felder;
    const lose = felder.filter((f) => f.typ !== "gruppe");
    const gruppen = felder.filter((f) => f.typ === "gruppe").sort((x, y) => (x.schluessel === "seo") - (y.schluessel === "seo"));
    if (lose.length) {
      planung.push({
        titel: "Allgemein", hilfe: "", blaetter: lose.length,
        bauInhalt: (s) => baueFelder(lose, obj, [], ctx, s),
        vergleich: () => lose.some((f) => !gleich(obj[f.schluessel], orig[f.schluessel])),
      });
    }
    for (const g of gruppen) {
      const key = g.schluessel;
      const pflicht = istPflicht(g);
      const norm = (v) => (v && typeof v === "object" && Object.keys(v).length ? v : null);
      if (pflicht && (typeof obj[key] !== "object" || obj[key] === null)) obj[key] = leerWert(g);
      planung.push({
        titel: g.label + (pflicht ? "" : " (optional)"), hilfe: g.hilfe || "", blaetter: zaehleBlaetter(g),
        bauInhalt: (s) => (pflicht ? baueFelder(g.felder, obj[key], [key], ctx, s)
          : [baueFeld(g, obj, key, [key], ctx, s, { ohneTitel: true, elternFelder: felder })]),
        vergleich: () => !gleich(norm(obj[key]), norm(orig[key])),
        hatSeo: key === "seo",
      });
    }
  }
  if (b.rechtDatei) {
    planung.push({
      titel: "Rechtstext", hilfe: "", blaetter: 99, offenImmer: true,
      bauInhalt: (s) => rechtsTextFeld(b.rechtDatei, s),
      vergleich: () => S.arbeit.get(b.rechtDatei) !== S.original.get(b.rechtDatei),
    });
  }

  const gesamt = planung.reduce((n, p) => n + p.blaetter, 0);
  const alleOffen = planung.length <= 2 || gesamt <= 24;
  planung.forEach((p, i) => {
    const a = baueAbschnitt({
      id: `abschnitt-${++nummer}`, titel: p.titel, hilfe: p.hilfe, bauInhalt: p.bauInhalt, vergleich: p.vergleich,
      offen: alleOffen || i === 0 || p.offenImmer,
    });
    a.planung = p;
    abschnitte.push(a);
  });

  // Hinweise oben
  const hinweise = [];
  if (b.warnung) hinweise.push(warnung("Rechtstext, nur mit Rücksprache ändern", "Fehler in Impressum oder Datenschutzerklärung können rechtliche Folgen haben. Bitte nur ändern, wenn das mit Anwalt oder Steuerberater abgesprochen ist. Beim Veröffentlichen fragt die Verwaltung noch einmal nach."));
  if (dateien.some((d) => S.konflikte.has(d))) {
    hinweise.push(h("p", { class: "meldung meldung-warn", role: "note" }, "Diese Inhalte wurden seit Ihrem Entwurf auch anderswo geändert. Ihre Änderungen sind gespeichert. Beim Veröffentlichen ersetzen sie die anderen Änderungen (der alte Stand bleibt im Verlauf)."));
  }
  const nav = abschnitte.length >= 4 ? h("nav", { class: "abschnitt-nav", "aria-label": "Zu einem Abschnitt springen" },
    ...abschnitte.map((a) => h("button", { type: "button", class: "knopf knopf-klein knopf-leise", onclick: () => {
      a.details.open = true;
      a.details.scrollIntoView({ block: "start" });
      fokussiere(a.details.querySelector("summary"));
    } }, a.planung.titel.replace(" (optional)", "")))) : null;

  const verwerfen = h("button", { type: "button", class: "knopf knopf-leise", hidden: true, onclick: () => verwerfeMitRueckfrage(b) }, "Änderungen in diesem Bereich verwerfen");

  const form = h("form", { class: "formular", novalidate: true, onsubmit: (ev) => ev.preventDefault() }, ...abschnitte.map((a) => a.el));
  fuelle(main, 
    seitenKopf(b.titel, { zurueck: b.gruppe === "recht" ? ["#/recht", "Rechtstexte"] : ["#/", "Übersicht"], beschreibung: b.text }),
    ...hinweise, nav, form, h("div", { class: "formular-fuss" }, verwerfen));

  const aktualisiere = () => {
    abschnitte.forEach((a) => a.aktualisiere());
    verwerfen.hidden = bereichAenderungen(b) === 0;
  };
  aktualisiere();
  let frame = 0;
  const geplant = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(aktualisiere); };
  const zeigeFehlerNun = () => {
    aktualisiere();
    for (const a of abschnitte) if (a.el.querySelector('[aria-invalid="true"]')) a.details.open = true;
    const erster = main.querySelector('[aria-invalid="true"]');
    if (erster) { erster.scrollIntoView({ block: "center" }); erster.focus({ preventScroll: true }); }
  };
  const weg = [auf("aenderung", geplant), auf("fehler-zeigen", zeigeFehlerNun)];
  if (S.zeigeAlleFehler) setTimeout(zeigeFehlerNun, 0);
  return { titel: b.titel, aufraeumen() { cancelAnimationFrame(frame); weg.forEach((w) => w()); } };
}

// Grosses Textfeld für den HTML-Rechtstext
function rechtsTextFeld(datei, sammler) {
  const id = "rechtstext";
  const text = arbeitskopie(datei);
  const ta = h("textarea", { id, class: "eingabe eingabe-code", rows: 22, spellcheck: "false", autocapitalize: "none", autocomplete: "off", "aria-describedby": `${id}-h ${id}-f` });
  ta.value = text;
  const fehlerEl = h("p", { class: "fehler", id: `${id}-f`, "aria-live": "polite" });
  const marker = h("span", { class: "marker", hidden: true }, "Geändert");
  const wurzel = h("div", { class: "feld" },
    h("div", { class: "feld-kopf" }, h("label", { class: "feld-label", for: id }, "Text der Seite"), marker),
    ta, fehlerEl,
    h("p", { class: "hilfe", id: `${id}-h` }, "Das ist der fertige Text mit Formatierungszeichen wie <p> und <strong> (sogenanntes HTML). Platzhalter wie {{telefon}}, {{email}}, {{strasse}}, {{plz}}, {{ort}}, {{inhaber}} bleiben automatisch aktuell. Nur ändern, wenn Sie wissen, was Sie tun."));
  const handle = {
    pfad: [datei], el: wurzel, art: "blatt", beruehrt: false, fehlerSichtbar: false, geaendert: false,
    aktualisiere() {
      const wert = S.arbeit.get(datei);
      const fehler = pruefeRechtstext(wert, kontext());
      const zeige = !!fehler && (this.beruehrt || S.zeigeAlleFehler);
      this.fehlerSichtbar = zeige;
      fehlerEl.textContent = zeige ? fehler : "";
      ta.setAttribute("aria-invalid", zeige ? "true" : "false");
      ta.setCustomValidity(fehler || "");
      this.geaendert = wert !== S.original.get(datei);
      marker.hidden = !this.geaendert;
    },
  };
  ta.addEventListener("input", () => {
    S.arbeit.set(datei, ta.value);
    handle.aktualisiere();
    aenderung();
  });
  ta.addEventListener("blur", () => { handle.beruehrt = true; handle.aktualisiere(); });
  sammler.add(handle);
  return wurzel;
}

// ---------------------------------------------------------------- Rechtstexte (Übersicht)
export function zeigeRecht(main) {
  leere(main);
  const zeilen = rechtBereiche().map((b) => {
    const marker = h("span", { class: "marker", hidden: bereichAenderungen(b) === 0 }, "Geändert");
    return h("li", null, h("a", { class: "zeile", href: `#/b/${b.id}` },
      h("span", { class: "zeile-text" }, h("span", { class: "zeile-titel" }, b.titel), h("span", { class: "zeile-beschr" }, b.text)), marker, icon("weiter", "symbol symbol-weiter")));
  });
  fuelle(main, 
    seitenKopf("Rechtstexte", { zurueck: ["#/", "Übersicht"] }),
    warnung("Rechtstext, nur mit Rücksprache ändern", "Impressum und Datenschutzerklärung müssen stimmen. Fehler können rechtliche Folgen haben. Bitte nur ändern, wenn das mit Anwalt oder Steuerberater abgesprochen ist. Beim Veröffentlichen fragt die Verwaltung noch einmal nach."),
    h("ul", { class: "zeilen zeilen-allein" }, ...zeilen));
  return { titel: "Rechtstexte", aufraeumen() {} };
}

// ---------------------------------------------------------------- Verlauf
export function zeigeVerlauf(main) {
  leere(main);
  const behaelter = h("div", { class: "verlauf-inhalt", "aria-busy": "true" });
  const rueck = h("button", { type: "button", class: "knopf knopf-gross knopf-haupt", disabled: true }, icon("verlauf"), "Letzte Änderung rückgängig");
  fuelle(main, 
    seitenKopf("Verlauf", { zurueck: ["#/", "Übersicht"], beschreibung: "Jede Veröffentlichung über die Verwaltung ist ein Eintrag. Jeden früheren Stand können Sie wiederherstellen. Das ist selbst ein neuer Eintrag, nichts geht verloren." }),
    h("div", { class: "verlauf-oben" }, rueck),
    behaelter);
  let lebt = true;
  let liste = [];

  const skelett = () => { leere(behaelter); behaelter.append(h("ul", { class: "verlauf", "aria-hidden": "true" }, ...[1, 2, 3].map(() => h("li", { class: "verlauf-eintrag skelett" }, h("div", { class: "skelett-zeile" }), h("div", { class: "skelett-zeile kurz" }))))); };

  async function lade() {
    skelett();
    behaelter.setAttribute("aria-busy", "true");
    rueck.disabled = true;
    try {
      liste = await verlaufLaden();
    } catch (e) {
      if (!lebt) return;
      leere(behaelter);
      behaelter.append(h("p", { class: "meldung meldung-fehler", role: "alert" }, e instanceof GhFehler ? e.message : "Der Verlauf konnte nicht geladen werden."),
        h("button", { type: "button", class: "knopf", onclick: lade }, "Noch einmal versuchen"));
      behaelter.setAttribute("aria-busy", "false");
      return;
    }
    if (!lebt) return;
    zeichne();
  }

  function zeichne() {
    leere(behaelter);
    behaelter.setAttribute("aria-busy", "false");
    rueck.disabled = !liste.length || S.beschaeftigt;
    if (!liste.length) {
      behaelter.append(h("p", { class: "leer" }, "Es gibt noch keine Veröffentlichung über die Verwaltung. Sobald Sie etwas veröffentlichen, erscheint es hier."));
      return;
    }
    behaelter.append(h("ol", { class: "verlauf" }, ...liste.map((e, i) => {
      const aktuell = i === 0 && e.sha === S.stand.commit;
      return h("li", { class: "verlauf-eintrag" },
        h("div", { class: "verlauf-text" },
          h("p", { class: "verlauf-datum" }, datumZeit(e.datum), aktuell ? h("span", { class: "marker marker-aktuell" }, "Aktuell") : null),
          h("p", { class: "verlauf-nachricht" }, e.nachricht.replace(/^Admin:\s*/, ""))),
        aktuell ? null : h("button", { type: "button", class: "knopf knopf-klein", disabled: S.beschaeftigt, "aria-label": `Diesen Stand wiederherstellen, vom ${datumZeit(e.datum)}`, onclick: async () => {
          if (await stelleWiederHer(e)) setTimeout(() => lebt && lade(), 800);
        } }, "Diesen Stand wiederherstellen"));
    })));
  }

  rueck.addEventListener("click", async () => {
    if (await letzteAenderungRueckgaengig(liste)) setTimeout(() => lebt && lade(), 800);
  });
  lade();
  return { titel: "Verlauf", aufraeumen() { lebt = false; } };
}

export { bremse };
