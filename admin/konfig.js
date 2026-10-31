// konfig.js – Einstellungen der Verwaltungsseite.
//
// konfig.json wird von bauen.py aus inhalt/seite.json erzeugt (admin.repo, admin.branch, Adresse der Webseite).
// Zugangsdaten stehen dort nie.
//
// Testkonfiguration: admin/test/konfig.test.json wird NUR gelesen, wenn die Seite von localhost/127.0.0.1 kommt.
// bauen.py kopiert den Ordner test/ nicht nach _site/, auf der echten Seite gibt es die Datei also gar nicht;
// zusätzlich ignoriert dieser Code sie dort. Erlaubte Schlüssel: api, abfrage_ms, abfrage_max_ms.

import { GITHUB_API } from "./api.js";

const PRODUKTION = { api: GITHUB_API, abfrageMs: 5000, abfrageMaxMs: 10 * 60 * 1000, lokalErlaubt: false, test: false };
const LOKAL = ["localhost", "127.0.0.1", "[::1]"];

export async function ladeKonfig() {
  let roh;
  try {
    const r = await fetch("konfig.json", { cache: "no-store" });
    if (!r.ok) throw new Error(String(r.status));
    roh = await r.json();
  } catch (e) {
    throw new Error("Die Einstellungen (konfig.json) fehlen. Die Verwaltungsseite wurde nicht richtig gebaut. Bitte „python3 bauen.py“ ausführen.");
  }
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(roh.repo || "") || !/^[A-Za-z0-9_.][A-Za-z0-9_./-]*$/.test(roh.branch || "")) {
    throw new Error("Die Einstellungen (konfig.json) sind ungültig: Projekt oder Arbeitsbereich fehlt.");
  }
  const k = { ...PRODUKTION, repo: roh.repo, branch: roh.branch, seiteUrl: String(roh.seite || "") };
  if (LOKAL.includes(location.hostname)) {
    try {
      const r = await fetch("test/konfig.test.json", { cache: "no-store" });
      if (r.ok) {
        const t = await r.json();
        if (typeof t.api === "string" && t.api.startsWith("/")) { // nur gleiche Herkunft, z. B. "/api"
          k.api = location.origin + t.api;
          k.lokalErlaubt = true;
          k.test = true;
        }
        if (Number.isFinite(t.abfrage_ms)) k.abfrageMs = t.abfrage_ms;
        if (Number.isFinite(t.abfrage_max_ms)) k.abfrageMaxMs = t.abfrage_max_ms;
      }
    } catch (e) { /* keine Testkonfiguration vorhanden */ }
    // Nur im Testmodus: Wartezeit der Statusabfrage per Adresse verkürzen (?abfrage_max_ms=3000)
    const q = new URLSearchParams(location.search);
    if (k.test && Number(q.get("abfrage_max_ms")) > 0) k.abfrageMaxMs = Number(q.get("abfrage_max_ms"));
  }
  return k;
}
