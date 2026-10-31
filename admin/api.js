// api.js – schmaler Client für die GitHub-REST-API (nur das, was die Verwaltung braucht).
// Kein Zugriff auf Browser-Objekte außer fetch, daher auch in Node testbar.
//
// Sicherheit:
//  - Der Schlüssel (Token) geht nur im Header "Authorization" an die API-Adresse, nie in eine URL.
//  - Der Schlüssel wird nirgends protokolliert und steckt in keiner Fehlermeldung.
//  - Die API-Adresse ist https://api.github.com. Andere Adressen nur im lokalen Test (siehe konfig.js).
//  - Veröffentlichen = Blobs -> Tree -> Commit -> Ref-Update ohne force. Erst das Ref-Update macht die Änderung
//    sichtbar; scheitert vorher etwas, bleibt das Projekt unverändert (keine halben Commits).

export const GITHUB_API = "https://api.github.com";
const REPO_MUSTER = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const BRANCH_MUSTER = /^[A-Za-z0-9_.][A-Za-z0-9_./-]*$/;
const INHALT_PRAEFIXE = ["inhalt/", "images/"];
export const WORKFLOW_DATEI = "veroeffentlichen.yml";   // .github/workflows/veroeffentlichen.yml ("Bauen und veröffentlichen")

export class GhFehler extends Error {
  /** art: netz | schluessel | recht | nicht-gefunden | limit | kollision | abgelehnt | server | nichts | unbekannt */
  constructor(art, text, { status = 0, technisch = "" } = {}) {
    super(text);
    this.name = "GhFehler";
    this.art = art;
    this.status = status;
    this.technisch = technisch;
  }
}

export class Abbruch extends Error {
  constructor() { super("abgebrochen"); this.name = "Abbruch"; }
}

export function warte(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal && signal.aborted) return reject(new Abbruch());
    const t = setTimeout(() => { if (signal) signal.removeEventListener("abort", ab); resolve(); }, ms);
    const ab = () => { clearTimeout(t); reject(new Abbruch()); };
    if (signal) signal.addEventListener("abort", ab, { once: true });
  });
}

const uhrzeit = (sekundenSeit1970) =>
  new Date(sekundenSeit1970 * 1000).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" });

export function erstelleClient({ basis = GITHUB_API, repo, branch, token, lokalErlaubt = false, zeitlimit = 30000 }) {
  if (!REPO_MUSTER.test(repo || "")) throw new Error("Ungültiger Projektname.");
  if (!BRANCH_MUSTER.test(branch || "")) throw new Error("Ungültiger Name des Arbeitsbereichs.");
  if (basis !== GITHUB_API && !lokalErlaubt) throw new Error("Diese API-Adresse ist nicht erlaubt.");
  if (typeof token !== "string" || !token) throw new Error("Kein Schlüssel.");

  const repoPfad = `/repos/${repo}`;
  const zweig = branch.split("/").map(encodeURIComponent).join("/");
  const textCache = new Map();

  async function anfrage(methode, pfad, { body, roh = false, signal, abfrage, kontext = "" } = {}) {
    const url = basis + pfad + (abfrage ? "?" + new URLSearchParams(abfrage).toString() : "");
    const kopf = {
      Accept: roh ? "application/vnd.github.raw+json" : "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    };
    if (body !== undefined) kopf["Content-Type"] = "application/json";
    const ctrl = new AbortController();
    let zeitUeberschritten = false;
    const t = setTimeout(() => { zeitUeberschritten = true; ctrl.abort(); }, zeitlimit);
    const ab = () => ctrl.abort();
    if (signal) {
      if (signal.aborted) { clearTimeout(t); throw new Abbruch(); }
      signal.addEventListener("abort", ab, { once: true });
    }
    let r;
    try {
      r = await fetch(url, {
        method: methode, headers: kopf, body: body === undefined ? undefined : JSON.stringify(body),
        cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer", signal: ctrl.signal,
      });
    } catch (e) {
      if (signal && signal.aborted) throw new Abbruch();
      throw new GhFehler("netz", zeitUeberschritten
        ? "GitHub antwortet nicht (Zeitüberschreitung). Bitte später noch einmal versuchen."
        : "Keine Verbindung zu GitHub. Bitte die Internetverbindung prüfen und noch einmal versuchen.");
    } finally {
      clearTimeout(t);
      if (signal) signal.removeEventListener("abort", ab);
    }
    if (r.ok) {
      if (r.status === 204) return null;
      try { return roh ? await r.text() : await r.json(); }
      catch (e) { throw new GhFehler("unbekannt", "Die Antwort von GitHub war nicht lesbar.", { status: r.status }); }
    }
    let daten = null;
    try { daten = await r.json(); } catch (e) { /* keine JSON-Antwort */ }
    throw fehlerAus(r, daten, `${methode} ${pfad}`, kontext);
  }

  function fehlerAus(r, daten, was, kontext) {
    const msg = (daten && daten.message) || "";
    const technisch = `${was} -> ${r.status}${msg ? " " + msg : ""}`;
    const s = r.status;
    const rest = r.headers.get("x-ratelimit-remaining");
    const reset = Number(r.headers.get("x-ratelimit-reset"));
    const retry = Number(r.headers.get("retry-after"));
    if (s === 429 || (s === 403 && (rest === "0" || retry || /rate limit|abuse/i.test(msg)))) {
      let wann = "";
      if (retry) wann = ` Bitte in ${retry} Sekunden noch einmal versuchen.`;
      else if (reset) wann = ` Bitte bis etwa ${uhrzeit(reset)} Uhr warten, dann geht es wieder.`;
      return new GhFehler("limit", "Zu viele Anfragen an GitHub in kurzer Zeit." + (wann || " Bitte ein paar Minuten warten."), { status: s, technisch });
    }
    if (s === 401) return new GhFehler("schluessel", "GitHub lehnt den Schlüssel ab. Er ist abgelaufen, falsch oder wurde zurückgezogen. Bitte einen neuen Schlüssel anlegen.", { status: s, technisch });
    if (s === 403) return new GhFehler("recht", "Der Schlüssel darf das nicht. Es fehlt eine Berechtigung. Nötig sind: Contents „Read and write“ (lesen und schreiben), Actions „Read-only“ (nur lesen), Metadata „Read-only“ (nur lesen).", { status: s, technisch });
    if (s === 404) return new GhFehler("nicht-gefunden", kontext || "Nicht gefunden. Entweder gibt es das Projekt nicht, oder der Schlüssel hat keinen Zugriff darauf (zum Beispiel ein Schlüssel für ein anderes Projekt).", { status: s, technisch });
    if (s === 409) return new GhFehler("abgelehnt", "GitHub meldet einen Konflikt. Bitte die Seite neu laden und noch einmal versuchen.", { status: s, technisch });
    if (s === 422) return new GhFehler("abgelehnt", "GitHub hat die Änderung abgelehnt. Bitte noch einmal versuchen. Hilft das nicht, den Entwickler fragen.", { status: s, technisch });
    if (s >= 500) return new GhFehler("server", "GitHub hat gerade ein Problem. Bitte in ein bis zwei Minuten noch einmal versuchen.", { status: s, technisch });
    return new GhFehler("unbekannt", "GitHub hat unerwartet geantwortet. Bitte noch einmal versuchen. Hilft das nicht, den Entwickler fragen.", { status: s, technisch });
  }

  // ------------------------------------------------------------------ Lesen
  async function pruefeZugang() {
    const r = await anfrage("GET", repoPfad, {
      kontext: `Das Projekt „${repo}“ wurde nicht gefunden oder der Schlüssel hat keinen Zugriff darauf. Wahrscheinlich gehört der Schlüssel zu einem anderen Projekt. Bitte beim Anlegen genau dieses Projekt auswählen.`,
    });
    if (!r || !r.permissions || !r.permissions.push) {
      throw new GhFehler("recht", "Der Schlüssel darf nur lesen, aber nicht schreiben. Bitte einen neuen Schlüssel anlegen und bei „Contents“ die Stufe „Read and write“ wählen.");
    }
    let actionsLesbar = true;
    try {
      await anfrage("GET", `${repoPfad}/actions/runs`, { abfrage: { per_page: "1" } });
    } catch (e) {
      if (e instanceof GhFehler && (e.art === "recht" || e.art === "nicht-gefunden")) actionsLesbar = false;
      else throw e;
    }
    return { name: r.full_name || repo, actionsLesbar };
  }

  async function holeBaum(baumSha) {
    const r = await anfrage("GET", `${repoPfad}/git/trees/${baumSha}`, { abfrage: { recursive: "1" } });
    if (r.truncated) throw new GhFehler("unbekannt", "Das Projekt hat zu viele Dateien für die Verwaltung.");
    const dateien = new Map();
    for (const e of r.tree) if (e.type === "blob") dateien.set(e.path, { sha: e.sha, mode: e.mode });
    return dateien;
  }

  async function leseRef() {
    const r = await anfrage("GET", `${repoPfad}/git/ref/heads/${zweig}`, {
      kontext: `Den Arbeitsbereich „${branch}“ für die Inhalte gibt es im Projekt nicht. Bitte den Entwickler fragen.`,
    });
    return r.object.sha;
  }

  /** Aktueller Stand des Zweigs: Commit, Baum und alle Dateien (Pfad -> {sha, mode}). */
  async function ladeStand(commitSha) {
    let commit, baum, nachricht = "";
    if (commitSha) {
      const c = await anfrage("GET", `${repoPfad}/git/commits/${commitSha}`);
      commit = c.sha; baum = c.tree.sha; nachricht = c.message;
    } else {
      const b = await anfrage("GET", `${repoPfad}/branches/${zweig}`, {
        kontext: `Den Arbeitsbereich „${branch}“ für die Inhalte gibt es im Projekt nicht. Bitte den Entwickler fragen.`,
      });
      commit = b.commit.sha; baum = b.commit.commit.tree.sha; nachricht = b.commit.commit.message;
    }
    return { commit, baum, nachricht, dateien: await holeBaum(baum) };
  }

  async function holeText(sha) {
    if (textCache.has(sha)) return textCache.get(sha);
    const text = await anfrage("GET", `${repoPfad}/git/blobs/${sha}`, { roh: true });
    textCache.set(sha, text);
    return text;
  }

  // ------------------------------------------------------------------ Schreiben
  const istKollision = (e) => e instanceof GhFehler && e.status === 422 && /fast.?forward/i.test(e.technisch);
  const kollision = () => new GhFehler("kollision",
    "Die Seite wurde in der Zwischenzeit geändert, zum Beispiel von jemand anderem oder durch „Rückgängig“.");

  /**
   * Schreibt Änderungen als EINEN Commit auf den Zweig.
   * basis = {commit, baum}: Stand, auf dem die Änderungen beruhen.
   * aenderungen: [{pfad, text} | {pfad, base64} | {pfad, sha, mode} | {pfad, loeschen: true}]
   *   text = UTF-8-Datei, base64 = Binärdatei (Foto), sha = vorhandener Blob (Rückgängig/Wiederherstellen), loeschen = Datei entfernen
   */
  async function schreibe(basis, aenderungen, nachricht) {
    if ((await leseRef()) !== basis.commit) throw kollision();
    const eintraege = [];
    const blobs = new Map();
    for (const a of aenderungen) {
      if (a.loeschen) {
        eintraege.push({ path: a.pfad, mode: "100644", type: "blob", sha: null });
      } else if (a.text !== undefined) {
        const b = await anfrage("POST", `${repoPfad}/git/blobs`, { body: { content: a.text, encoding: "utf-8" } });
        blobs.set(a.pfad, b.sha);
        eintraege.push({ path: a.pfad, mode: a.mode || "100644", type: "blob", sha: b.sha });
        textCache.set(b.sha, a.text);
      } else if (a.base64 !== undefined) {
        const b = await anfrage("POST", `${repoPfad}/git/blobs`, { body: { content: a.base64, encoding: "base64" } });
        blobs.set(a.pfad, b.sha);
        eintraege.push({ path: a.pfad, mode: a.mode || "100644", type: "blob", sha: b.sha });
      } else {
        eintraege.push({ path: a.pfad, mode: a.mode || "100644", type: "blob", sha: a.sha });
      }
    }
    const baum = await anfrage("POST", `${repoPfad}/git/trees`, { body: { base_tree: basis.baum, tree: eintraege } });
    const commit = await anfrage("POST", `${repoPfad}/git/commits`, {
      body: { message: nachricht, tree: baum.sha, parents: [basis.commit] },
    });
    try {
      await anfrage("PATCH", `${repoPfad}/git/refs/heads/${zweig}`, { body: { sha: commit.sha, force: false } });
    } catch (e) {
      if (istKollision(e)) throw kollision();
      if (e instanceof GhFehler && e.art === "netz") {
        // Ausgang unklar (Verbindung weg während des Schreibens): nachsehen, ob der Commit angekommen ist
        try { if ((await leseRef()) === commit.sha) return { commit: commit.sha, baum: baum.sha, blobs }; } catch (e2) { /* weiter mit Fehler */ }
      }
      throw e;
    }
    return { commit: commit.sha, baum: baum.sha, blobs };
  }

  /** Alle geänderten Dateien ({pfad: text}) und weitere Änderungen (zusatz: Fotos als {pfad, base64}, Löschungen) in einem Commit veröffentlichen. */
  function veroeffentliche(basis, dateien, nachricht, zusatz = []) {
    return schreibe(basis, [...Object.entries(dateien).map(([pfad, text]) => ({ pfad, text })), ...zusatz], nachricht);
  }

  const imInhalt = (pfad) => INHALT_PRAEFIXE.some((p) => pfad.startsWith(p));

  /** Inhalt (inhalt/ + images/) auf den Stand eines früheren Commits zurücksetzen, als neuer Commit. */
  async function stelleWiederHer(commitSha, kopf, nachricht) {
    const c = await anfrage("GET", `${repoPfad}/git/commits/${commitSha}`);
    const alt = await holeBaum(c.tree.sha);
    const aenderungen = [];
    for (const [pfad, e] of alt) {
      if (!imInhalt(pfad)) continue;
      const jetzt = kopf.dateien.get(pfad);
      if (!jetzt || jetzt.sha !== e.sha) aenderungen.push({ pfad, sha: e.sha, mode: e.mode });
    }
    for (const pfad of kopf.dateien.keys()) {
      if (imInhalt(pfad) && !alt.has(pfad)) aenderungen.push({ pfad, loeschen: true });
    }
    if (!aenderungen.length) throw new GhFehler("nichts", "Dieser Stand ist schon der aktuelle. Es gibt nichts wiederherzustellen.");
    return { ...(await schreibe(kopf, aenderungen, nachricht)), anzahl: aenderungen.length };
  }

  /** Die Änderungen eines einzelnen Commits zurücknehmen (neuer Commit), ohne spätere Änderungen anzutasten. */
  async function macheRueckgaengig(commitSha, kopf, nachricht) {
    const c = await anfrage("GET", `${repoPfad}/git/commits/${commitSha}`);
    if (!c.parents || !c.parents.length) throw new GhFehler("nichts", "Dieser Eintrag hat keinen Vorgänger, es gibt nichts zurückzunehmen.");
    const p = await anfrage("GET", `${repoPfad}/git/commits/${c.parents[0].sha}`);
    const [nach, vor] = await Promise.all([holeBaum(c.tree.sha), holeBaum(p.tree.sha)]);
    const aenderungen = [];
    const spaeter = [];
    const pfade = new Set([...nach.keys(), ...vor.keys()]);
    for (const pfad of pfade) {
      if (!imInhalt(pfad)) continue;
      const a = nach.get(pfad), b = vor.get(pfad);
      if ((a && a.sha) === (b && b.sha)) continue; // dieser Commit hat die Datei nicht verändert
      const jetzt = kopf.dateien.get(pfad);
      if ((jetzt && jetzt.sha) !== (a && a.sha)) { spaeter.push(pfad); continue; } // danach nochmal geändert
      aenderungen.push(b ? { pfad, sha: b.sha, mode: b.mode } : { pfad, loeschen: true });
    }
    if (!aenderungen.length) {
      throw new GhFehler("nichts", spaeter.length
        ? "Diese Änderung wurde danach noch einmal überschrieben. Bitte im Verlauf einen früheren Stand wiederherstellen."
        : "Diese Änderung hat nichts verändert. Es gibt nichts zurückzunehmen.");
    }
    return { ...(await schreibe(kopf, aenderungen, nachricht)), anzahl: aenderungen.length, uebersprungen: spaeter };
  }

  // ------------------------------------------------------------------ Verlauf und Status
  async function listeVerlauf(max = 20) {
    const liste = await anfrage("GET", `${repoPfad}/commits`, { abfrage: { sha: branch, per_page: "100" } });
    return liste
      .filter((c) => /^Admin:/.test(c.commit.message))
      .slice(0, max)
      .map((c) => ({
        sha: c.sha,
        nachricht: c.commit.message.split("\n")[0],
        datum: (c.commit.committer && c.commit.committer.date) || (c.commit.author && c.commit.author.date),
      }));
  }

  /**
   * Status des Bauauftrags (GitHub Actions) zu einem Commit: null, solange noch keiner gestartet ist.
   * Zugeordnet wird über head_sha (der Commit) und den Workflow „veroeffentlichen.yml“ (pfad), damit andere Läufe zum selben Commit
   * (zum Beispiel „pages-build-deployment“ bei falsch eingestellter Pages-Quelle) nicht für unseren gehalten werden.
   * ergebnis = conclusion des Laufs: success erst, wenn Bauen UND Veröffentlichen fertig sind; failure, wenn bauen.py abgelehnt hat.
   */
  async function leseLauf(commitSha, signal) {
    const r = await anfrage("GET", `${repoPfad}/actions/runs`, { abfrage: { head_sha: commitSha, per_page: "10" }, signal });
    const laeufe = (r.workflow_runs || []).filter((x) => x.head_sha === commitSha && (!x.path || String(x.path).includes(WORKFLOW_DATEI)));
    if (!laeufe.length) return null;
    laeufe.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    const l = laeufe[0];
    return { id: l.id, status: l.status, ergebnis: l.conclusion, url: l.html_url };
  }

  return { pruefeZugang, ladeStand, holeText, veroeffentliche, stelleWiederHer, macheRueckgaengig, listeVerlauf, leseLauf, leseRef };
}
