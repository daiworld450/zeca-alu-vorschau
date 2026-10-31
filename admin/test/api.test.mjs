// Tests für api.js gegen den Mock-Server (startet ihn selbst). Aufruf: node admin/test/api.test.mjs
// Voraussetzung: python3 bauen.py (der Mock liefert _site/admin/ aus).
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { erstelleClient, GhFehler, warte } from "../api.js";
import { formatJson } from "../daten.js";

const wurzel = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PORT = 8800 + Math.floor(Math.random() * 100);
const BASIS = `http://127.0.0.1:${PORT}`;
const REPO = "daiworld450/zeca-alu-vorschau";
// Zweig der Verwaltung aus der Konfiguration (admin.branch in inhalt/seite.json): Inhalte liegen auf "inhalt", der Code auf "main"
const BRANCH = JSON.parse(readFileSync(join(wurzel, "inhalt/seite.json"), "utf8")).admin.branch;

let ok = 0, schlecht = 0;
const pruefe = (b, t) => { if (b) ok++; else { schlecht++; console.log("   FEHLER: " + t); } };
const test = (name) => console.log(name);

const mock = spawn("python3", [join(wurzel, "admin/test/mock_github.py"), "--port", String(PORT)], { stdio: ["ignore", "pipe", "inherit"] });
async function bereit() {
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch(`${BASIS}/__test/stand`); if (r.ok) return; } catch (e) { /* noch nicht da */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("Mock startet nicht");
}
const mockPost = (pfad, body) => fetch(`${BASIS}/__test/${pfad}`, { method: "POST", body: JSON.stringify(body || {}) }).then((r) => r.json());
const mockGet = (pfad) => fetch(`${BASIS}/__test/${pfad}`).then((r) => r.json());
const mockText = (pfad) => fetch(`${BASIS}/__test/datei?pfad=${encodeURIComponent(pfad)}`).then((r) => r.text());
const client = (token = "test-token", extra = {}) =>
  erstelleClient({ basis: `${BASIS}/api`, repo: REPO, branch: BRANCH, token, lokalErlaubt: true, ...extra });

async function wirft(f) { try { await f(); } catch (e) { return e; } return null; }

async function warteAufLauf(c, sha, maxS = 20) {
  for (let i = 0; i < maxS * 4; i++) {
    const l = await c.leseLauf(sha);
    if (l && l.status === "completed") return l;
    await warte(250);
  }
  return null;
}

try {
  await bereit();
  await mockPost("zustand", { queued_s: 0.3, laufend_s: 0.5 });

  test("Zugang");
  let c = client();
  const z = await c.pruefeZugang();
  pruefe(z.name === REPO && z.actionsLesbar === true, "Zugang mit gültigem Schlüssel");
  let e = await wirft(() => client("abgelaufen").pruefeZugang());
  pruefe(e instanceof GhFehler && e.art === "schluessel" && /abgelaufen/.test(e.message), "abgelaufener Schlüssel -> art schluessel");
  e = await wirft(() => client("nur-lesen").pruefeZugang());
  pruefe(e instanceof GhFehler && e.art === "recht" && /nur lesen/.test(e.message), "Schlüssel ohne Schreibrecht");
  e = await wirft(() => client("falsches-projekt").pruefeZugang());
  pruefe(e instanceof GhFehler && e.art === "nicht-gefunden" && e.message.includes(REPO), "falsches Projekt");
  const zo = await client("ohne-actions").pruefeZugang();
  pruefe(zo.actionsLesbar === false, "Actions nicht lesbar wird erkannt");
  e = await wirft(() => client("limit-token").pruefeZugang());
  pruefe(e instanceof GhFehler && e.art === "limit", "Rate-Limit wird erkannt");
  e = await wirft(() => erstelleClient({ basis: "https://evil.example", repo: REPO, branch: BRANCH, token: "x" }));
  pruefe(e instanceof Error && /nicht erlaubt/.test(e.message), "fremde API-Adresse wird abgelehnt");
  e = await wirft(() => erstelleClient({ basis: `${BASIS}/api`, repo: "../../x", branch: BRANCH, token: "x", lokalErlaubt: true }));
  pruefe(e instanceof Error, "ungültiger Projektname wird abgelehnt");
  e = await wirft(() => erstelleClient({ basis: "http://127.0.0.1:1/api", repo: REPO, branch: BRANCH, token: "x", lokalErlaubt: true }).pruefeZugang());
  pruefe(e instanceof GhFehler && e.art === "netz", "Netzfehler -> art netz");

  test("Lesen");
  let stand = await c.ladeStand();
  pruefe(stand.dateien.has("inhalt/seite.json") && stand.dateien.has("inhalt/schema/seite.json"), "Stand enthält Inhaltsdateien");
  const seiteText = await c.holeText(stand.dateien.get("inhalt/seite.json").sha);
  pruefe(seiteText === readFileSync(join(wurzel, "inhalt/seite.json"), "utf8"), "holeText liefert die Datei byte-gleich (UTF-8)");

  test("Verlauf");
  let v = await c.listeVerlauf();
  pruefe(v.length === 2 && v.every((x) => x.nachricht.startsWith("Admin:")), `nur Admin-Commits im Verlauf (${v.map((x) => x.nachricht)})`);
  pruefe(!Number.isNaN(Date.parse(v[0].datum)), "Verlauf hat ein Datum");

  test("Veröffentlichen");
  const seite = JSON.parse(seiteText);
  seite.kontakt.telefone[0].anzeige = "0151 99887766";
  const neuText = formatJson(seite);
  const vorher = (await mockGet("stand")).verlauf.length;
  let erg = await c.veroeffentliche(stand, { "inhalt/seite.json": neuText }, "Admin: Firmendaten");
  const nach = await mockGet("stand");
  pruefe(nach.kopf === erg.commit && nach.verlauf.length === vorher + 1, "genau EIN neuer Commit");
  pruefe((await mockText("inhalt/seite.json")) === neuText, "Commit enthält die geänderte seite.json");
  pruefe((await mockText("inhalt/seiten/startseite.json")) === readFileSync(join(wurzel, "inhalt/seiten/startseite.json"), "utf8"), "andere Dateien unverändert");
  pruefe(nach.verlauf[0].parents[0] === stand.commit, "Elter des neuen Commits ist der bisherige Stand");
  let lauf = await warteAufLauf(c, erg.commit);
  pruefe(lauf && lauf.ergebnis === "success", `Bauauftrag erfolgreich (${lauf && lauf.ergebnis})`);

  test("Kollision");
  const alterStand = stand; // beruht auf überholtem Commit
  const anzahl = (await mockGet("stand")).verlauf.length;
  e = await wirft(() => c.veroeffentliche(alterStand, { "inhalt/seite.json": neuText }, "Admin: Test"));
  pruefe(e instanceof GhFehler && e.art === "kollision", "überholter Stand -> Kollision");
  pruefe((await mockGet("stand")).verlauf.length === anzahl, "bei Kollision entsteht kein Commit");
  stand = await c.ladeStand();
  await mockPost("fremder_commit", { datei: "inhalt/seiten/kontakt.json", ersetze: ["Rufen Sie an", "Rufen Sie gern an"] });
  e = await wirft(() => c.veroeffentliche(stand, { "inhalt/seite.json": neuText + " " }, "Admin: Test"));
  pruefe(e instanceof GhFehler && e.art === "kollision", "fremder Commit zwischen Laden und Veröffentlichen -> Kollision");

  test("Fehlerfall im Bauauftrag und Rückgängig");
  stand = await c.ladeStand();
  const kaputt = JSON.parse(await c.holeText(stand.dateien.get("inhalt/seite.json").sha));
  kaputt.firma.slogan = "BAUFEHLER";
  const vorTest = await mockText("inhalt/seite.json");
  erg = await c.veroeffentliche(stand, { "inhalt/seite.json": formatJson(kaputt) }, "Admin: Firmendaten");
  lauf = await warteAufLauf(c, erg.commit);
  pruefe(lauf && lauf.ergebnis === "failure" && lauf.url.includes("/actions/runs/"), "Bauauftrag meldet Fehler und Link");
  const nachFehler = await c.ladeStand();
  const rg = await c.macheRueckgaengig(erg.commit, nachFehler, "Admin: Rückgängig – Firmendaten");
  pruefe((await mockText("inhalt/seite.json")) === vorTest, "Rückgängig stellt die vorherige seite.json her");
  pruefe(rg.anzahl === 1, "Rückgängig ändert genau eine Datei");
  lauf = await warteAufLauf(c, rg.commit);
  pruefe(lauf && lauf.ergebnis === "success", "Bauauftrag nach Rückgängig erfolgreich");

  test("Rückgängig bei späterer Änderung derselben Datei");
  let s2 = await c.ladeStand();
  const a = JSON.parse(await c.holeText(s2.dateien.get("inhalt/seite.json").sha)); a.firma.slogan = "Stand A";
  const ra = await c.veroeffentliche(s2, { "inhalt/seite.json": formatJson(a) }, "Admin: A");
  s2 = await c.ladeStand();
  const b = JSON.parse(await c.holeText(s2.dateien.get("inhalt/seite.json").sha)); b.firma.slogan = "Stand B";
  await c.veroeffentliche(s2, { "inhalt/seite.json": formatJson(b) }, "Admin: B");
  s2 = await c.ladeStand();
  e = await wirft(() => c.macheRueckgaengig(ra.commit, s2, "Admin: Rückgängig"));
  pruefe(e instanceof GhFehler && e.art === "nichts", "A rückgängig, obwohl B danach kam -> verständliche Meldung statt Überschreiben");

  test("Fotos: Binärdateien im selben Commit wie bilder.json");
  const bytes800 = readFileSync(join(wurzel, "images/bestand/terrasse-doppelhaus-1-800.webp"));
  const bytes1600 = readFileSync(join(wurzel, "images/bestand/terrasse-doppelhaus-1-1600.webp"));
  const holeBilder = async (st) => JSON.parse(await c.holeText(st.dateien.get("inhalt/bilder.json").sha));
  let s3 = await c.ladeStand();
  let bl = await holeBilder(s3);
  bl.bilder.push({ name: "api-test", alt: "Testfoto für den Schnittstellen-Test" });
  const anzahl3 = (await mockGet("stand")).verlauf.length;
  erg = await c.veroeffentliche(s3, { "inhalt/bilder.json": formatJson(bl) }, "Admin: Fotos", [
    { pfad: "images/bestand/api-test-800.webp", base64: bytes800.toString("base64") },
    { pfad: "images/bestand/api-test-1600.webp", base64: bytes1600.toString("base64") },
  ]);
  let nach3 = await mockGet("stand");
  pruefe(nach3.verlauf.length === anzahl3 + 1 && nach3.kopf === erg.commit, "genau EIN Commit für bilder.json und beide Größen");
  pruefe(["images/bestand/api-test-800.webp", "images/bestand/api-test-1600.webp", "inhalt/bilder.json"].every((p) => nach3.dateien.includes(p)), "Commit enthält Fotos und Bildliste");
  const roh = async (pfad) => Buffer.from(await (await fetch(`${BASIS}/__test/datei?pfad=${encodeURIComponent(pfad)}`)).arrayBuffer());
  pruefe((await roh("images/bestand/api-test-800.webp")).equals(bytes800) && (await roh("images/bestand/api-test-1600.webp")).equals(bytes1600), "Fotodateien kommen byte-gleich an (Base64-Blobs)");
  pruefe(/^[0-9a-f]{40}$/.test(erg.blobs.get("images/bestand/api-test-800.webp") || ""), "Ergebnis nennt die Blob-Kennung der Fotodatei");
  pruefe(JSON.parse(await mockText("inhalt/bilder.json")).bilder.some((b) => b.name === "api-test"), "bilder.json enthält den neuen Eintrag");
  lauf = await warteAufLauf(c, erg.commit);
  pruefe(lauf && lauf.ergebnis === "success", `Bauauftrag mit neuem Foto erfolgreich (${lauf && lauf.ergebnis})`);

  test("Fotos: Eintrag ohne Dateien lässt den Bau scheitern, Rückgängig repariert");
  s3 = await c.ladeStand();
  bl = await holeBilder(s3);
  bl.bilder.push({ name: "ohne-dateien", alt: "Eintrag ohne Fotodateien" });
  erg = await c.veroeffentliche(s3, { "inhalt/bilder.json": formatJson(bl) }, "Admin: Fotos");
  lauf = await warteAufLauf(c, erg.commit);
  pruefe(lauf && lauf.ergebnis === "failure", `fehlende Fotodateien -> Bauauftrag scheitert, nichts wird veröffentlicht (${lauf && lauf.ergebnis})`);
  const rg3 = await c.macheRueckgaengig(erg.commit, await c.ladeStand(), "Admin: Rückgängig – Fotos");
  lauf = await warteAufLauf(c, rg3.commit);
  pruefe(lauf && lauf.ergebnis === "success", "nach Rückgängig wieder erfolgreich");

  test("Fotos: Löschen entfernt die Dateien im selben Commit");
  s3 = await c.ladeStand();
  bl = await holeBilder(s3);
  bl.bilder = bl.bilder.filter((b) => b.name !== "api-test");
  erg = await c.veroeffentliche(s3, { "inhalt/bilder.json": formatJson(bl) }, "Admin: Fotos", [
    { pfad: "images/bestand/api-test-800.webp", loeschen: true }, { pfad: "images/bestand/api-test-1600.webp", loeschen: true },
  ]);
  nach3 = await mockGet("stand");
  pruefe(!nach3.dateien.some((p) => p.includes("api-test")), "beide Größen sind weg");
  pruefe(nach3.dateien.includes("images/bestand/terrasse-doppelhaus-1-800.webp"), "andere Fotos bleiben");
  lauf = await warteAufLauf(c, erg.commit);
  pruefe(lauf && lauf.ergebnis === "success", "Bauauftrag nach dem Löschen erfolgreich");

  test("Bauauftrag: richtiger Workflow, abgebrochener Lauf");
  await mockPost("zustand", { fremder_lauf: true });
  s3 = await c.ladeStand();
  const sl = JSON.parse(await c.holeText(s3.dateien.get("inhalt/seite.json").sha)); sl.firma.slogan = "Workflow-Test";
  erg = await c.veroeffentliche(s3, { "inhalt/seite.json": formatJson(sl) }, "Admin: Firmendaten");
  lauf = await warteAufLauf(c, erg.commit);
  const laeufe3 = (await mockGet("stand")).laeufe.filter((x) => x.head_sha === erg.commit);
  pruefe(laeufe3.length === 2, "zum Commit gibt es zwei Läufe (unserer und ein fremder)");
  pruefe(lauf && lauf.ergebnis === "success" && lauf.url.includes("/actions/runs/") && !laeufe3.find((x) => x.id === lauf.id).path.includes("pages-build"), "gemeldet wird der Lauf von veroeffentlichen.yml, nicht der fremde (fehlgeschlagene)");
  await mockPost("zustand", { fremder_lauf: false, naechster_lauf: "abgebrochen" });
  s3 = await c.ladeStand();
  sl.firma.slogan = "Workflow-Test 2";
  erg = await c.veroeffentliche(s3, { "inhalt/seite.json": formatJson(sl) }, "Admin: Firmendaten");
  lauf = await warteAufLauf(c, erg.commit);
  pruefe(lauf && lauf.status === "completed" && lauf.ergebnis === "cancelled", `abgebrochener Lauf wird als cancelled gemeldet (${lauf && lauf.ergebnis})`);

  test("Stand wiederherstellen");
  v = await c.listeVerlauf();
  const aeltester = v[v.length - 1]; // "Admin: Kontakt"
  s2 = await c.ladeStand();
  const wh = await c.stelleWiederHer(aeltester.sha, s2, "Admin: Stand wiederhergestellt");
  const verlaufNach = (await mockGet("stand"));
  pruefe(verlaufNach.kopf === wh.commit && verlaufNach.verlauf[0].parents[0] === s2.commit, "Wiederherstellen = neuer Commit auf dem bisherigen Stand (kein Umschreiben)");
  const alt = await c.ladeStand(aeltester.sha);
  const jetzt = await c.ladeStand();
  const imInhalt = (p) => p.startsWith("inhalt/") || p.startsWith("images/");
  const gleichInhalt = [...alt.dateien].filter(([p]) => imInhalt(p)).every(([p, e2]) => jetzt.dateien.get(p) && jetzt.dateien.get(p).sha === e2.sha)
    && [...jetzt.dateien.keys()].filter(imInhalt).length === [...alt.dateien.keys()].filter(imInhalt).length;
  pruefe(gleichInhalt, "inhalt/ und images/ entsprechen exakt dem gewählten Stand");
  pruefe(!jetzt.dateien.has("inhalt/README-technik.txt"), "später hinzugekommene Datei wird entfernt");
  e = await wirft(() => c.stelleWiederHer(aeltester.sha, jetzt, "Admin: nochmal"));
  pruefe(e instanceof GhFehler && e.art === "nichts", "bereits aktueller Stand -> nichts zu tun");

  test("Sicherheit");
  const protokoll = await mockGet("anfragen");
  pruefe(protokoll.length > 20, `API-Aufrufe protokolliert (${protokoll.length})`);
  pruefe(!protokoll.some((p) => /token|Bearer/i.test(p)), "kein Schlüssel in einer Anfrage-Adresse");
  pruefe(protokoll.filter((p) => p.startsWith("PATCH")).every((p) => p.includes(`/git/refs/heads/${BRANCH}`)), `PATCH nur auf das Ref ${BRANCH}`);
  pruefe(BRANCH !== "main", "Die Verwaltung schreibt nicht auf main (Code), sondern auf den Inhalts-Zweig");
  e = await wirft(() => erstelleClient({ basis: `${BASIS}/api`, repo: REPO, branch: "main", token: "test-token", lokalErlaubt: true }).ladeStand());
  pruefe(e instanceof GhFehler && e.art === "nicht-gefunden", "Der Code-Zweig main ist für die Verwaltung im Mock nicht vorhanden (Gegenprobe: Zweig kommt aus der Konfiguration)");
} catch (err) {
  schlecht++;
  console.log("   ABBRUCH: " + (err && err.stack || err));
} finally {
  mock.kill();
}
console.log(`\nEinzelprüfungen ok: ${ok}, Fehler: ${schlecht}`);
process.exit(schlecht ? 1 : 0);
