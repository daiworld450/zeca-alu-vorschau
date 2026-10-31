// admin.js – Einstieg der Verwaltungsseite: Anmeldung, Laden, Navigation (Hash-Adressen), Kopfzeile.
//
// Adressen:  #/  Übersicht   #/b/<bereich>  Formular   #/recht   #/fotos   #/verlauf
// Den Schlüssel gibt es nur über das Anmeldefeld. Einen Anmelde-Link (#schluessel=…) gibt es nicht mehr (ein Schlüssel in der Adresse
// landet in Verlauf, Lesezeichen und Notizen).

import { ladeKonfig } from "./konfig.js";
import * as Speicher from "./entwurf.js";
import { S, auf, melde, stelleEntwurfHer, sichereEntwurf } from "./zustand.js";
import { hinweis, fokussiere, entferneAktionshinweise } from "./ui.js";
import * as Ansichten from "./ansichten.js";
import { zeigeFotos } from "./fotoansicht.js";
import { ladeFotosAusSpeicher } from "./fotozustand.js";
import * as Aktionen from "./aktionen.js";
import { starteLeiste } from "./leiste.js";
import { GhFehler } from "./api.js";

// Clickjacking-Schutz: admin.css blendet die Seite aus; sichtbar wird sie nur, wenn sie das oberste Fenster ist (nicht in einem fremden Rahmen)
if (window.top === window.self) document.documentElement.classList.add("sichtbar");

const main = document.getElementById("inhalt");
const abmeldeKnopf = document.getElementById("abmelden");
let ansicht = null;
let angemeldet = false;
let leisteGestartet = false;

// ---------------------------------------------------------------- Navigation
function route({ behalte = false } = {}) {
  if (!angemeldet) return;
  const hash = location.hash || "#/";
  let m;
  let neu = null;
  const alt = ansicht;
  if (hash === "#/" || hash === "#") neu = Ansichten.zeigeUebersicht(main);
  else if ((m = /^#\/b\/([a-z0-9-]+)$/.exec(hash))) neu = Ansichten.zeigeBereich(main, m[1]);
  else if (hash === "#/recht") neu = Ansichten.zeigeRecht(main);
  else if (hash === "#/fotos") neu = zeigeFotos(main);
  else if (hash === "#/verlauf") neu = Ansichten.zeigeVerlauf(main);
  if (alt) alt.aufraeumen();
  if (!neu) { location.replace("#/"); return; }
  ansicht = neu;
  document.title = `${neu.titel} – Verwaltung ZeCa-Alu`;
  if (!behalte) {
    window.scrollTo(0, 0);
    fokussiere(document.getElementById("titel"));
  }
}

window.addEventListener("hashchange", () => route());
document.getElementById("sprunglink").addEventListener("click", (ev) => { ev.preventDefault(); fokussiere(main); });

auf("neuzeichnen", () => {
  entferneAktionshinweise();   // „Rückgängig“-Hinweise beziehen sich auf den alten Stand der Formulare
  if (!angemeldet) return;
  const y = window.scrollY;
  const fokusImInhalt = main.contains(document.activeElement);
  route({ behalte: true });
  window.scrollTo(0, y);
  // Der Neuaufbau ersetzt auch das Element mit dem Fokus: dann auf die neue Überschrift, nicht auf <body>
  if (fokusImInhalt && (!document.activeElement || document.activeElement === document.body)) fokussiere(document.getElementById("titel"));
});

// ---------------------------------------------------------------- Anmeldung und Laden
function zeigeLogin(fehler = "") {
  angemeldet = false;
  if (ansicht) ansicht.aufraeumen();
  abmeldeKnopf.hidden = true;
  ansicht = Ansichten.zeigeLogin(main, { fehler, beiAnmelden: anmelden, repo: S.konfig.repo });
  document.title = "Anmelden – Verwaltung ZeCa-Alu";
  fokussiere(document.getElementById("titel"));
}

/** Gibt eine Fehlermeldung zurück oder "" bei Erfolg. */
async function anmelden(token) {
  let client;
  try { client = Aktionen.erzeugeClient(token); } catch (e) { return "Der Schlüssel sieht ungültig aus."; }
  try {
    S.zugang = await client.pruefeZugang();
  } catch (e) {
    return e instanceof GhFehler ? e.message : "Die Anmeldung hat nicht geklappt.";
  }
  S.client = client;
  Speicher.speichereSchluessel(token);
  await ladeUndZeige();
  return "";
}

async function ladeUndZeige() {
  const lade = Ansichten.zeigeLaden(main);
  fokussiere(document.getElementById("titel"));
  try {
    await Aktionen.ladeAlles((n, g) => lade.setze(n, g));
  } catch (e) {
    Ansichten.zeigeMeldungSeite(main, "Die Inhalte konnten nicht geladen werden",
      e instanceof GhFehler ? e.message : (e && e.message) || "Unbekannter Fehler.",
      [Ansichten_knopf("Noch einmal versuchen", () => ladeUndZeige()), Ansichten_knopf("Abmelden", () => abmelden(), true)]);
    document.title = "Fehler – Verwaltung ZeCa-Alu";
    return;
  }
  stelleEntwurfHer();
  await ladeFotosAusSpeicher();   // noch nicht veröffentlichte Fotos des Entwurfs
  melde("aenderung");
  angemeldet = true;
  abmeldeKnopf.hidden = false;
  const lauf = Speicher.leseLaufend();
  if (lauf && Date.now() - lauf.seit < S.konfig.abfrageMaxMs) Aktionen.beobachte(lauf.sha, "veroeffentlichung", lauf.seit);
  else Speicher.loescheLaufend();
  ansicht = null;
  route();
}

function Ansichten_knopf(text, fn, leise = false) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "knopf" + (leise ? " knopf-leise" : " knopf-haupt");
  b.textContent = text;
  b.addEventListener("click", fn);
  return b;
}

async function abmelden() {
  if (await Aktionen.abmelden()) zeigeLogin();
}

// Schlüssel abgelaufen oder zurückgezogen: Entwurf bleibt erhalten
auf("sitzung-abgelaufen", () => {
  sichereEntwurf();
  Aktionen.beendeBeobachtung();
  Speicher.loescheSchluessel();
  S.client = null; S.stand = null; S.original = new Map(); S.arbeit = new Map(); S.entwurfBlob = new Map(); S.konflikte = new Set();
  S.ver = { phase: "ruhig" };
  S.version++;
  melde("aenderung");
  zeigeLogin("Der Schlüssel ist abgelaufen oder wurde zurückgezogen. Ihre Änderungen bleiben als Entwurf erhalten. Bitte einen neuen Schlüssel eingeben.");
});

abmeldeKnopf.addEventListener("click", abmelden);

window.addEventListener("beforeunload", (ev) => {
  if (S.ver.phase === "speichern") { ev.preventDefault(); ev.returnValue = ""; }
});
// Entwurf sofort sichern, wenn die Seite in den Hintergrund geht oder geschlossen wird (sonst wartet das Sichern bis zu einer drittel Sekunde)
const sichereJetzt = () => { if (angemeldet && S.client && S.stand) sichereEntwurf(); };
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") sichereJetzt(); });
window.addEventListener("pagehide", sichereJetzt);
window.addEventListener("unhandledrejection", () => hinweis("Etwas ist schiefgelaufen. Bitte noch einmal versuchen oder die Seite neu laden."));

// ---------------------------------------------------------------- Start
async function start() {
  // Alte Anmelde-Links (#schluessel=…) werden nicht mehr ausgewertet; den Schlüssel trotzdem sofort aus der Adresszeile entfernen
  if (/^#schluessel=/i.test(location.hash)) history.replaceState(null, "", location.pathname + location.search);
  try {
    S.konfig = await ladeKonfig();
  } catch (e) {
    Ansichten.zeigeMeldungSeite(main, "Die Verwaltung ist nicht bereit", e.message);
    return;
  }
  if (!leisteGestartet) { starteLeiste(document.getElementById("leiste")); leisteGestartet = true; }
  const gespeichert = Speicher.leseSchluessel();
  if (!gespeichert) { zeigeLogin(); return; }
  const fehler = await anmeldenBeimStart(gespeichert, true);
  if (fehler) {
    if (fehler.neuAnmelden) { Speicher.loescheSchluessel(); zeigeLogin(fehler.text); }
    else Ansichten.zeigeMeldungSeite(main, fehler.titel || "Die Anmeldung hat nicht geklappt", fehler.text,
      [Ansichten_knopf("Noch einmal versuchen", () => start()), Ansichten_knopf("Abmelden", () => abmelden(), true)]);
  }
}

async function anmeldenBeimStart(token, gespeichert) {
  let client;
  try { client = Aktionen.erzeugeClient(token); } catch (e) { return { neuAnmelden: true, text: "Der Schlüssel sieht ungültig aus." }; }
  try {
    S.zugang = await client.pruefeZugang();
  } catch (e) {
    const text = e instanceof GhFehler ? e.message : "Die Anmeldung hat nicht geklappt.";
    if (e instanceof GhFehler && ["schluessel", "recht", "nicht-gefunden"].includes(e.art)) {
      return { neuAnmelden: true, text: (gespeichert ? "Der gespeicherte Schlüssel funktioniert nicht mehr. " : "") + text };
    }
    const titel = e instanceof GhFehler && e.art === "netz" ? "Keine Verbindung zu GitHub"
      : e instanceof GhFehler && e.art === "limit" ? "GitHub bremst gerade" : "Die Anmeldung hat nicht geklappt";
    return { neuAnmelden: false, text, titel };
  }
  S.client = client;
  Speicher.speichereSchluessel(token);
  await ladeUndZeige();
  return null;
}

start();
