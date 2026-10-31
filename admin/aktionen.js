// aktionen.js – Abläufe: Inhalte laden, veröffentlichen, Bauauftrag beobachten, rückgängig machen, wiederherstellen.

import { h, dialog, melde as meldeDialog, hinweis, datumZeit, datumKurz } from "./ui.js";
import { GhFehler, Abbruch, warte, erstelleClient } from "./api.js";
import { formatJson, klon } from "./daten.js";
import { pruefeDatei, pruefeRechtstext } from "./pruefung.js";
import * as Speicher from "./entwurf.js";
import {
  S, BILDER, melde, auf, istText, istRecht, arbeitskopie, geaenderteDateien, dateiGeaendert, zaehleAlle, kontext, verwerfe, stelleEntwurfHer, sichereEntwurf,
} from "./zustand.js";
import { bereichFuer, geaenderteBereiche, findeBereich, bereichAenderungen, bereichAdresse } from "./bereiche.js";
import { baueFotoAenderungen, bilderListe } from "./fotozustand.js";
import { speichereFoto, loescheFoto as loescheGespeichertesFoto, leereFotos } from "./fotospeicher.js";

// ---------------------------------------------------------------- Zugang und Laden
export function erzeugeClient(token) {
  return erstelleClient({
    basis: S.konfig.api, repo: S.konfig.repo, branch: S.konfig.branch, token, lokalErlaubt: S.konfig.lokalErlaubt,
  });
}

async function pool(aufgaben, parallel, fortschritt) {
  let i = 0, fertig = 0;
  const arbeiter = Array.from({ length: Math.min(parallel, aufgaben.length) }, async () => {
    while (i < aufgaben.length) {
      const mein = i++;
      await aufgaben[mein]();
      fortschritt && fortschritt(++fertig, aufgaben.length);
    }
  });
  await Promise.all(arbeiter);
}

const BRAUCHT = (p) => p.startsWith("inhalt/") && (p.endsWith(".json") || p.startsWith("inhalt/recht/")) && !p.endsWith("README.md");

/** Lädt alle Inhaltsdateien des aktuellen Stands. Bereits geladene unveränderte Dateien werden nicht erneut geholt. */
export async function ladeInhalte(stand, fortschritt) {
  const alt = S.stand ? S.stand.dateien : new Map();
  const neu = new Map();
  const aufgaben = [];
  for (const [pfad, e] of stand.dateien) {
    if (!BRAUCHT(pfad)) continue;
    if (S.original.has(pfad) && alt.has(pfad) && alt.get(pfad).sha === e.sha) { neu.set(pfad, S.original.get(pfad)); continue; }
    aufgaben.push(async () => {
      const text = await S.client.holeText(e.sha);
      if (istText(pfad)) { neu.set(pfad, text); return; }
      try { neu.set(pfad, JSON.parse(text)); }
      catch (err) { throw new Error(`Die Datei ${pfad} ist kein gültiges JSON. Bitte einen Entwickler fragen.`); }
    });
  }
  await pool(aufgaben, 6, fortschritt);
  for (const p of ["inhalt/seite.json", "inhalt/bilder.json", "inhalt/struktur.json"]) {
    if (!neu.has(p)) throw new Error(`Die Datei ${p} fehlt im Projekt. Die Verwaltung kann nicht starten.`);
  }
  S.original = neu;
  S.stand = stand;
  S.schemas = new Map();
  for (const [pfad, inh] of neu) {
    if (pfad.startsWith("inhalt/schema/")) for (const ziel of inh.gilt_fuer || []) S.schemas.set(ziel, inh);
  }
  S.bilder = neu.get("inhalt/bilder.json");
  S.struktur = neu.get("inhalt/struktur.json");
  // Arbeitskopien, die nicht mehr geändert sind, gehen weg; geänderte Dateien, deren Grundlage sich verschoben hat, werden markiert
  for (const d of [...S.arbeit.keys()]) {
    if (!neu.has(d)) { S.arbeit.delete(d); S.entwurfBlob.delete(d); continue; }
    if (!dateiGeaendert(d)) { S.arbeit.delete(d); S.entwurfBlob.delete(d); S.konflikte.delete(d); continue; }
    if (S.entwurfBlob.has(d) && S.entwurfBlob.get(d) !== (stand.dateien.get(d) || {}).sha) S.konflikte.add(d);
  }
  S.version++;
}

export async function ladeAlles(fortschritt) {
  const stand = await S.client.ladeStand();
  await ladeInhalte(stand, fortschritt);
}

/** Nach Kollision oder Rückgängig: aktuellen Stand holen, Entwurf behalten. */
export async function neuLaden() {
  const stand = await S.client.ladeStand();
  await ladeInhalte(stand);
  melde("neuzeichnen");
  melde("aenderung");
}

// ---------------------------------------------------------------- Fehlerdialoge
function technikZeile(e) {
  if (!e || !e.technisch) return null;
  return h("details", { class: "technik" }, h("summary", null, "Technische Einzelheiten"), h("p", { class: "technik-text" }, e.technisch));
}

async function zeigeFehler(titel, e, zusatz) {
  const text = [e instanceof GhFehler ? e.message : "Es ist ein unerwarteter Fehler aufgetreten.", ...(zusatz ? [zusatz] : [])];
  await dialog({ titel, text, inhalt: technikZeile(e), ok: "Verstanden", abbrechen: false });
}

// ---------------------------------------------------------------- Prüfung vor dem Veröffentlichen
export function pruefeAlle(dateien) {
  const fehler = [];
  const k = kontext();
  for (const d of dateien) {
    if (istText(d)) {
      const m = pruefeRechtstext(S.arbeit.get(d), k);
      if (m) fehler.push({ datei: d, bereich: bereichFuer(d), label: "Rechtstext", meldung: m });
      continue;
    }
    const schema = S.schemas.get(d);
    if (!schema) continue;
    for (const f of pruefeDatei(schema.felder, S.arbeit.get(d), k, d)) {
      fehler.push({ datei: d, bereich: bereichFuer(d, f.pfad[0]), label: f.label, meldung: f.meldung, pfad: f.pfad });
    }
  }
  if (dateien.includes(BILDER)) {
    // Jedes neue Foto braucht seine Dateien, sonst bricht der Bauauftrag ab (bauen.py: „Keine Dateien … gefunden“)
    const vorher = new Set((((S.original.get(BILDER) || {}).bilder) || []).map((b) => b.name));
    for (const b of bilderListe()) {
      if (vorher.has(b.name) || (S.fotos.get(b.name) || { varianten: [] }).varianten.length) continue;
      fehler.push({ datei: BILDER, bereich: bereichFuer(BILDER), label: `Foto „${b.name}“`,
        meldung: "Die Foto-Dateien fehlen (zum Beispiel nach dem Neuladen in einem Browser ohne Zwischenspeicher). Bitte das Foto auf der Seite „Fotos“ entfernen und noch einmal hochladen." });
    }
  }
  return fehler;
}

function textVon(datei) {
  if (!istText(datei)) return formatJson(S.arbeit.get(datei));
  const t = S.arbeit.get(datei);
  const orig = S.original.get(datei);
  return orig.endsWith("\n") && !t.endsWith("\n") ? t + "\n" : t;
}

function commitNachricht() {
  const namen = geaenderteBereiche();
  let n = "Admin: " + (namen.length ? namen.join(", ") : "Änderung");
  if (n.length > 120) n = n.slice(0, 117) + "…";
  return n;
}

// ---------------------------------------------------------------- Status der Veröffentlichung
export function setzeStatus(neu) {
  S.ver = { ...neu };
  melde("status");
}
let beobachter = null;

export function beendeBeobachtung() {
  if (beobachter) beobachter.abort();
  beobachter = null;
}

/** Fragt den Bauauftrag (GitHub Actions) ab, bis er fertig ist. art: "veroeffentlichung" | "rueckgaengig" */
export async function beobachte(sha, art = "veroeffentlichung", seit = Date.now()) {
  beendeBeobachtung();
  const ctrl = new AbortController();
  beobachter = ctrl;
  Speicher.merkeLaufend(sha);
  const basis = { sha, art, seit };
  if (!S.zugang.actionsLesbar) {
    setzeStatus({ ...basis, phase: "unbekannt" });
    Speicher.loescheLaufend();
    return;
  }
  setzeStatus({ ...basis, phase: "beobachten", lauf: null });
  let netzFehler = 0;
  for (;;) {
    if (ctrl.signal.aborted) return;
    let lauf = null;
    try {
      lauf = await S.client.leseLauf(sha, ctrl.signal);
      netzFehler = 0;
    } catch (e) {
      if (e instanceof Abbruch) return;
      if (e instanceof GhFehler && (e.art === "recht" || e.art === "schluessel" || e.art === "nicht-gefunden")) {
        setzeStatus({ ...basis, phase: "unbekannt", meldung: e.message });
        Speicher.loescheLaufend();
        return;
      }
      netzFehler++;
      if (e instanceof GhFehler && e.art === "limit") { setzeStatus({ ...basis, phase: "unbekannt", meldung: e.message }); return; }
    }
    if (lauf && lauf.status === "completed") {
      Speicher.loescheLaufend();
      if (lauf.ergebnis === "cancelled") {
        // GitHub ersetzt einen wartenden Lauf, wenn danach noch eine Veröffentlichung kommt (die neuere enthält diese Änderung): dem neueren folgen
        let kopf = null;
        try { kopf = await S.client.leseRef(); } catch (e) { /* dann als Abbruch melden */ }
        if (kopf && kopf !== sha) { beobachte(kopf, art, seit); return; }
      }
      if (lauf.ergebnis === "success") setzeStatus({ ...basis, phase: "live", lauf });
      else setzeStatus({ ...basis, phase: "fehler", lauf });
      return;
    }
    if (Date.now() - seit > S.konfig.abfrageMaxMs) {
      Speicher.loescheLaufend();
      setzeStatus({ ...basis, phase: "zeitlimit", lauf });
      return;
    }
    if (netzFehler >= 5) {
      setzeStatus({ ...basis, phase: "zeitlimit", lauf, meldung: "Die Verbindung zu GitHub ist unterbrochen." });
      return;
    }
    if (S.ver.sha === sha && S.ver.phase === "beobachten") setzeStatus({ ...basis, phase: "beobachten", lauf, verbindung: netzFehler === 0 });
    try { await warte(S.konfig.abfrageMs, ctrl.signal); } catch (e) { return; }
  }
}

export function ruheStatus() {
  beendeBeobachtung();
  Speicher.loescheLaufend();
  setzeStatus({ phase: "ruhig" });
}

// ---------------------------------------------------------------- Veröffentlichen
export async function veroeffentlichen() {
  if (S.beschaeftigt) return;
  const dateien = geaenderteDateien();
  if (!dateien.length) return;
  S.beschaeftigt = true;
  melde("status");
  try {
    // 1. Prüfen
    const fehler = pruefeAlle(dateien);
    if (fehler.length) {
      S.zeigeAlleFehler = true;
      melde("neuzeichnen");
      melde("fehler-zeigen");
      await zeigeFehlerListe(fehler);
      return;
    }
    // 2. Rechtstexte: zusätzliche Bestätigung
    if (dateien.some(istRecht)) {
      const ok = await dialog({
        titel: "Rechtstext wird geändert",
        text: [
          "Sie ändern Impressum oder Datenschutzerklärung. Das sind Rechtstexte. Fehler darin können rechtliche Folgen haben.",
          "Bitte nur veröffentlichen, wenn das mit Anwalt oder Steuerberater abgesprochen ist.",
        ],
        bestaetigung: "Ich habe das mit Rücksprache geklärt und möchte die Rechtstexte veröffentlichen.",
        ok: "Trotzdem veröffentlichen", gefahr: true,
      });
      if (!ok) return;
    }
    // 3. Konflikte
    const kf = dateien.filter((d) => S.konflikte.has(d));
    if (kf.length) {
      const ok = await dialog({
        titel: "Diese Seiten wurden zwischenzeitlich geändert",
        text: ["Folgende Inhalte hat inzwischen jemand anderes verändert (oder sie wurden zurückgenommen):",
          ...kf.map((d) => "• " + dateiName(d)),
          "Wenn Sie jetzt veröffentlichen, ersetzt Ihre Version diese Änderungen. Der alte Stand bleibt im Verlauf erhalten."],
        ok: "Meine Version veröffentlichen", abbrechen: "Abbrechen", gefahr: true,
      });
      if (!ok) return;
    }
    // 4. Schreiben
    setzeStatus({ phase: "speichern" });
    const texte = Object.fromEntries(dateien.map((d) => [d, textVon(d)]));
    const nachricht = commitNachricht();
    let erg, foto;
    try {
      foto = await baueFotoAenderungen();   // neue Fotos (Base64) und zu löschende Dateien gehören in DENSELBEN Commit
      erg = await S.client.veroeffentliche(S.stand, texte, nachricht, foto.zusatz);
    } catch (e) {
      setzeStatus({ phase: "ruhig" });
      if (e instanceof GhFehler && e.art === "kollision") { await behandleKollision(); return; }
      if (e instanceof GhFehler && e.art === "schluessel") { melde("sitzung-abgelaufen"); return; }
      await zeigeFehler("Das Veröffentlichen hat nicht geklappt", e, "Es wurde nichts veröffentlicht. Ihre Änderungen sind noch als Entwurf da.");
      return;
    }
    // 5. Stand und Entwurf nachführen
    S.zuletzt = {
      sha: erg.commit, dateien: new Map(dateien.map((d) => [d, klon(S.arbeit.get(d))])), nachricht,
      fotos: new Map(foto.neueNamen.filter((n) => S.fotos.has(n)).map((n) => [n, S.fotos.get(n)])),
    };
    for (const p of foto.neuePfade) S.stand.dateien.set(p, { sha: erg.blobs.get(p), mode: "100644" });
    for (const p of foto.wegPfade) S.stand.dateien.delete(p);
    for (const n of foto.neueNamen) { S.fotos.delete(n); loescheGespeichertesFoto(n); }
    for (const d of dateien) {
      S.original.set(d, istText(d) ? texte[d] : klon(S.arbeit.get(d)));
      S.stand.dateien.set(d, { sha: erg.blobs.get(d), mode: "100644" });
      S.arbeit.delete(d);
      S.entwurfBlob.delete(d);
      S.konflikte.delete(d);
    }
    S.stand.commit = erg.commit;
    S.stand.baum = erg.baum;
    S.stand.nachricht = nachricht;
    S.bilder = S.original.get(BILDER);
    S.zeigeAlleFehler = false;
    S.version++;
    sichereEntwurf();
    melde("neuzeichnen");
    melde("aenderung");
    S.beschaeftigt = false;
    beobachte(erg.commit, "veroeffentlichung");
  } finally {
    S.beschaeftigt = false;
    melde("status");
  }
}

const dateiName = (d) => {
  const b = bereichFuer(d);
  return b ? b.titel : d;
};

async function zeigeFehlerListe(fehler) {
  const zeigen = fehler.slice(0, 6);
  const liste = h("ul", { class: "fehlerliste" },
    ...zeigen.map((f) => h("li", null, h("strong", null, `${f.bereich ? f.bereich.titel : dateiName(f.datei)} › ${f.label}: `), f.meldung)),
    fehler.length > zeigen.length ? h("li", null, `… und ${fehler.length - zeigen.length} weitere`) : null);
  const erster = fehler[0];
  const hin = await dialog({
    titel: fehler.length === 1 ? "Ein Feld ist noch nicht in Ordnung" : `${fehler.length} Felder sind noch nicht in Ordnung`,
    text: "Es wurde nichts veröffentlicht. Bitte zuerst korrigieren:",
    inhalt: liste, ok: "Zum ersten Fehler", abbrechen: "Schließen",
  });
  if (hin && erster.bereich) {
    location.hash = bereichAdresse(erster.bereich);
    setTimeout(() => melde("fehler-zeigen"), 120);
  }
}

async function behandleKollision() {
  const vorher = new Map([...S.stand.dateien].map(([p, e]) => [p, e.sha]));
  try { await neuLaden(); } catch (e) { await zeigeFehler("Neu laden hat nicht geklappt", e); return; }
  const auch = geaenderteDateien().filter((d) => vorher.get(d) !== (S.stand.dateien.get(d) || {}).sha);
  await meldeDialog("Die Seite wurde inzwischen geändert", [
    "Während Sie gearbeitet haben, hat jemand anderes etwas verändert (oder eine Änderung wurde zurückgenommen). Deshalb wurde NICHTS veröffentlicht.",
    "Ich habe den neuesten Stand geladen. Ihre Änderungen sind als Entwurf noch da." + (auch.length ? ` Achtung: ${auch.map(dateiName).join(", ")} wurde auch anderswo geändert. Bitte kurz prüfen.` : ""),
    "Bitte tippen Sie noch einmal auf „Veröffentlichen“.",
  ], "Verstanden");
}

// ---------------------------------------------------------------- Verwerfen
function verwerfeBereich(b) {
  for (const t of b.teile || []) {
    const arb = S.arbeit.get(t.datei);
    if (!arb) continue;
    if (t.gruppen) {
      const orig = S.original.get(t.datei);
      for (const g of t.gruppen) {
        if (orig[g] === undefined) delete arb[g]; else arb[g] = klon(orig[g]);
      }
      if (!dateiGeaendert(t.datei)) { S.arbeit.delete(t.datei); S.entwurfBlob.delete(t.datei); S.konflikte.delete(t.datei); }
    } else {
      S.arbeit.delete(t.datei); S.entwurfBlob.delete(t.datei); S.konflikte.delete(t.datei);
    }
  }
  if (b.rechtDatei) { S.arbeit.delete(b.rechtDatei); S.entwurfBlob.delete(b.rechtDatei); S.konflikte.delete(b.rechtDatei); }
  S.zeigeAlleFehler = false;
  S.version++;
  sichereEntwurf();
  melde("aenderung");
  melde("neuzeichnen");
}

/** Ohne Angabe: alles verwerfen. Mit Bereich: nur dessen Änderungen. */
export async function verwerfeMitRueckfrage(bereich) {
  const n = bereich ? bereichAenderungen(bereich) : zaehleAlle();
  if (!n) return false;
  const ok = await dialog({
    titel: "Änderungen verwerfen?",
    text: [bereich ? `Alle nicht veröffentlichten Änderungen in „${bereich.titel}“ (${n}) gehen verloren.` : `Alle nicht veröffentlichten Änderungen (${n}) gehen verloren.`,
      "Die Seite im Internet bleibt, wie sie jetzt ist. Das lässt sich nicht rückgängig machen."],
    ok: "Verwerfen", abbrechen: "Behalten", gefahr: true,
  });
  if (!ok) return false;
  if (bereich) verwerfeBereich(bereich); else verwerfe();
  hinweis("Änderungen verworfen.");
  return true;
}

// ---------------------------------------------------------------- Rückgängig und Wiederherstellen
function ohneAdminPraefix(n) { return n.replace(/^Admin:\s*/, ""); }

async function frischerStand() {
  // Immer vom aktuellen Zweig ausgehen, nicht vom (womöglich alten) Stand im Speicher
  return S.client.ladeStand();
}

export async function verlaufLaden() {
  return S.client.listeVerlauf(20);
}

/** Änderungen eines Commits zurücknehmen (neuer Commit). Gibt true zurück, wenn es geklappt hat. */
export async function macheRueckgaengig(eintrag, { nachFehler = false } = {}) {
  if (S.beschaeftigt) return false;
  S.beschaeftigt = true;
  melde("status");
  try {
    let kopf;
    try {
      kopf = await frischerStand();
      const nachricht = `Admin: Rückgängig – ${ohneAdminPraefix(eintrag.nachricht)}`.slice(0, 120);
      const erg = await S.client.macheRueckgaengig(eintrag.sha, kopf, nachricht);
      await ladeInhalte(await S.client.ladeStand(erg.commit));
      S.stand.commit = erg.commit;
      if (nachFehler && S.zuletzt) {
        for (const [d, wert] of S.zuletzt.dateien) {
          S.arbeit.set(d, wert);
          S.entwurfBlob.set(d, (S.stand.dateien.get(d) || {}).sha || "");
        }
        for (const [n, f] of S.zuletzt.fotos || []) { S.fotos.set(n, f); speichereFoto(f); }
        S.zuletzt = null;
        S.version++;
        sichereEntwurf();
      }
      melde("neuzeichnen");
      melde("aenderung");
      S.beschaeftigt = false;
      beobachte(erg.commit, "rueckgaengig");
      return { ok: true, uebersprungen: erg.uebersprungen || [] };
    } catch (e) {
      if (e instanceof GhFehler && e.art === "kollision") { await behandleKollision(); return false; }
      if (e instanceof GhFehler && e.art === "schluessel") { melde("sitzung-abgelaufen"); return false; }
      if (e instanceof GhFehler && e.art === "nichts") { await meldeDialog("Nichts zurückzunehmen", e.message); return false; }
      await zeigeFehler("Rückgängig machen hat nicht geklappt", e, "Es wurde nichts verändert.");
      return false;
    }
  } finally {
    S.beschaeftigt = false;
    melde("status");
  }
}

export async function rueckgaengigNachFehler() {
  const sha = S.ver.sha;
  const nachricht = (S.zuletzt && S.zuletzt.nachricht) || S.stand.nachricht || "Admin: Änderung";
  const ok = await macheRueckgaengig({ sha, nachricht }, { nachFehler: true });
  if (ok) hinweis("Zurückgenommen. Ihre Änderungen stehen wieder als Entwurf bereit.", { dauer: 7000 });
}

export async function letzteAenderungRueckgaengig(verlauf) {
  const e = verlauf && verlauf[0];
  if (!e) { await meldeDialog("Nichts zurückzunehmen", "Über die Verwaltung wurde noch nichts veröffentlicht."); return false; }
  const ok = await dialog({
    titel: "Letzte Änderung rückgängig machen?",
    text: [`Zurückgenommen wird: „${ohneAdminPraefix(e.nachricht)}“ vom ${datumZeit(e.datum)}.`,
      "Das ist ein neuer Eintrag im Verlauf und kann selbst wieder zurückgenommen werden.",
      zaehleAlle() ? "Ihre ungespeicherten Änderungen bleiben als Entwurf erhalten." : null].filter(Boolean),
    ok: "Rückgängig machen", abbrechen: "Abbrechen", gefahr: true,
  });
  if (!ok) return false;
  const r = await macheRueckgaengig(e);
  if (r && r.ok) hinweis("Die letzte Änderung wird zurückgenommen.");
  return !!(r && r.ok);
}

export async function stelleWiederHer(eintrag) {
  if (S.beschaeftigt) return false;
  const verwirft = geaenderteDateien().length;
  const ok = await dialog({
    titel: "Diesen Stand wiederherstellen?",
    text: [`Alle Texte und Fotos kehren zum Stand vom ${datumZeit(eintrag.datum)} zurück („${ohneAdminPraefix(eintrag.nachricht)}“).`,
      "Das ist ein neuer Eintrag im Verlauf. Sie können jederzeit wieder zu einem anderen Stand wechseln.",
      verwirft ? `Ihre ungespeicherten Änderungen (${zaehleAlle()}) werden dabei verworfen.` : null].filter(Boolean),
    ok: "Wiederherstellen", abbrechen: "Abbrechen", gefahr: true,
  });
  if (!ok) return false;
  S.beschaeftigt = true;
  melde("status");
  try {
    const kopf = await frischerStand();
    const nachricht = `Admin: Stand vom ${datumKurz(eintrag.datum)} wiederhergestellt`;
    const erg = await S.client.stelleWiederHer(eintrag.sha, kopf, nachricht);
    verwerfe();
    await ladeInhalte(await S.client.ladeStand(erg.commit));
    melde("neuzeichnen");
    S.beschaeftigt = false;
    beobachte(erg.commit, "rueckgaengig");
    hinweis("Der Stand wird wiederhergestellt.");
    return true;
  } catch (e) {
    if (e instanceof GhFehler && e.art === "kollision") { await behandleKollision(); return false; }
    if (e instanceof GhFehler && e.art === "schluessel") { melde("sitzung-abgelaufen"); return false; }
    if (e instanceof GhFehler && e.art === "nichts") { await meldeDialog("Nichts zu tun", e.message); return false; }
    await zeigeFehler("Wiederherstellen hat nicht geklappt", e, "Es wurde nichts verändert.");
    return false;
  } finally {
    S.beschaeftigt = false;
    melde("status");
  }
}

// ---------------------------------------------------------------- Abmelden
export async function abmelden() {
  // Immer nachfragen: Der Schlüssel wird gelöscht, ein neuer ist nur bei GitHub zu holen. Sicher vorbelegt ist „Angemeldet bleiben“.
  const n = zaehleAlle();
  const text = [
    "Danach brauchen Sie einen neuen Schlüssel von GitHub. Sie können ihn dort selbst neu erzeugen.",
    "Der Schlüssel wird nur aus diesem Browser gelöscht.",
  ];
  if (n) text.unshift(`Ihre ${n === 1 ? "ungespeicherte Änderung geht" : `${n} ungespeicherten Änderungen gehen`} dabei verloren.`);
  const ok = await dialog({ titel: "Abmelden?", text, ok: "Abmelden", abbrechen: "Angemeldet bleiben", gefahr: true });
  if (!ok) return false;
  beendeBeobachtung();
  Speicher.loescheAlles();
  leereFotos();
  for (const url of S.fotoUrls.values()) { try { URL.revokeObjectURL(url); } catch (e) { /* egal */ } }
  S.fotos = new Map();
  S.fotoUrls = new Map();
  S.client = null;
  S.arbeit = new Map();
  S.original = new Map();
  S.entwurfBlob = new Map();
  S.konflikte = new Set();
  S.stand = null;
  S.ver = { phase: "ruhig" };
  S.version++;
  melde("aenderung");
  melde("status");
  melde("abgemeldet");
  return true;
}

export { stelleEntwurfHer, findeBereich, auf };
