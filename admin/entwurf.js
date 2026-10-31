// entwurf.js – lokaler Speicher im Browser (localStorage).
//
// Schlüssel (alle mit Präfix "zeca-admin."):
//   zeca-admin.schluessel   Zugangsschlüssel (Token) von GitHub. Nur in diesem Browser, nie auf einem Server.
//   zeca-admin.entwurf      Entwurf: { v:1, repo, branch, dateien: { "<Pfad>": { wert, blob } } }
//                           wert = bearbeiteter Inhalt (JSON-Objekt oder Text), blob = Version der Datei, auf der die
//                           Bearbeitung beruht (zum Erkennen von Konflikten).
//   zeca-admin.laufend      Zuletzt veröffentlichter Commit, dessen Bauauftrag noch beobachtet wird: { sha, seit }
//
// Jeder Zugriff ist abgesichert: In privaten Fenstern oder bei gesperrtem Speicher wirft der Browser Fehler.
// Dann arbeitet die Verwaltung weiter, Entwürfe überleben nur kein Neuladen (die Oberfläche weist darauf hin).

const SCHLUESSEL = "zeca-admin.schluessel";
const ENTWURF = "zeca-admin.entwurf";
const LAUFEND = "zeca-admin.laufend";

export const speicherStatus = { ok: true };

function lies(k) {
  try { return localStorage.getItem(k); } catch (e) { speicherStatus.ok = false; return null; }
}
function schreibe(k, v) {
  try { localStorage.setItem(k, v); return true; } catch (e) { speicherStatus.ok = false; return false; }
}
function loesche(k) {
  try { localStorage.removeItem(k); } catch (e) { speicherStatus.ok = false; }
}

export const leseSchluessel = () => lies(SCHLUESSEL);
export const speichereSchluessel = (t) => schreibe(SCHLUESSEL, t);
export const loescheSchluessel = () => loesche(SCHLUESSEL);

export function ladeEntwurf(repo, branch) {
  const roh = lies(ENTWURF);
  if (!roh) return {};
  try {
    const d = JSON.parse(roh);
    if (d && d.v === 1 && d.repo === repo && d.branch === branch && d.dateien && typeof d.dateien === "object") return d.dateien;
  } catch (e) { /* kaputter Entwurf wird ignoriert */ }
  return {};
}

export function speichereEntwurf(repo, branch, dateien) {
  if (!Object.keys(dateien).length) { loesche(ENTWURF); return true; }
  return schreibe(ENTWURF, JSON.stringify({ v: 1, repo, branch, dateien }));
}

export const loescheEntwurf = () => loesche(ENTWURF);

export function leseLaufend() {
  try {
    const d = JSON.parse(lies(LAUFEND) || "null");
    if (d && /^[0-9a-f]{40}$/.test(d.sha) && Number.isFinite(d.seit)) return d;
  } catch (e) { /* ignorieren */ }
  return null;
}
export const merkeLaufend = (sha) => schreibe(LAUFEND, JSON.stringify({ sha, seit: Date.now() }));
export const loescheLaufend = () => loesche(LAUFEND);

/** Abmelden: Schlüssel, Entwurf und Beobachtung löschen. */
export function loescheAlles() {
  loesche(SCHLUESSEL);
  loesche(ENTWURF);
  loesche(LAUFEND);
}
