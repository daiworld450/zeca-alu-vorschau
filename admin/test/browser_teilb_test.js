// browser_teilb_test.js – Browser-Tests zum Barrierefreiheits-/Bedienbarkeitsreview (Teil B): Leiste, Fokus, Rückgängig, Abmelden, JPEG-Rückfall.
// Gehört nicht zur ausgelieferten Seite (bauen.py liefert admin/test/ nicht aus).
//
// Voraussetzung: Mock läuft (python3 admin/test/mock_github.py), Seite http://127.0.0.1:8791/admin/ mit Schlüssel „test-token“ angemeldet.
// Aufruf in der Seite:   const T = await import("/admin/test/browser_teilb_test.js");  await T.befund12();   (usw.)
// Jede Funktion gibt { ok, schlecht, fehler: [...], daten } zurück. Die Größe des Fensters bestimmt der Aufrufer (375×812, 320×256, 1440×900).

const MOCK = location.origin;
let E = { ok: 0, schlecht: 0, fehler: [], daten: {} };
const neu = () => { E = { ok: 0, schlecht: 0, fehler: [], daten: {} }; return E; };
const t = (bedingung, text) => { if (bedingung) E.ok++; else { E.schlecht++; E.fehler.push(text); } };
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
export async function warteBis(fn, text, ms = 15000) {
  const ende = Date.now() + ms;
  for (;;) {
    let w; try { w = fn(); } catch (e) { w = null; }
    if (w) return w;
    if (Date.now() > ende) { E.schlecht++; E.fehler.push("Zeitüberschreitung: " + text); throw new Error("Zeitüberschreitung: " + text); }
    await pause(40);
  }
}
const dlg = () => document.getElementById("dialog");
/** Dialog ganz zu: auch sein eigener Verlaufseintrag ist abgebaut (sonst kommt die Rückwärts-Navigation einem direkt folgenden Seitenwechsel in die Quere). */
const dialogZu = (text, ms) => warteBis(() => !dlg().open && !(history.state && history.state.zecaDialog), text, ms);
const leiste = () => document.getElementById("leiste");
const knopfText = (wurzel, text) => [...wurzel.querySelectorAll("button, a")].find((b) => b.textContent.trim().includes(text));
const mock = (pfad, body) => fetch(MOCK + "/__test/" + pfad, body ? { method: "POST", body: JSON.stringify(body) } : {}).then((r) => r.json());
const setzeText = (el, wert) => { el.value = wert; el.dispatchEvent(new Event("input", { bubbles: true })); };
const vh = () => window.innerHeight;
/** Bricht ein Test mit einem Fehler ab, kommt das Ergebnis bis dahin trotzdem zurück (mit „ABBRUCH“ in der Fehlerliste). */
const sicher = (lauf) => async (...a) => { try { return await lauf(...a); } catch (e) { E.schlecht++; E.fehler.push("ABBRUCH: " + e.message); return E; } };
const px = (v) => parseFloat(v) || 0;

/** Liegt das Element sichtbar im Fenster und weder unter der festen Leiste noch unter der festen Kopfzeile? (WCAG 2.4.11) */
function frei(el) {
  const r = el.getBoundingClientRect();
  const l = leiste();
  const k = document.getElementById("kopf");
  const lr = !l.hidden && getComputedStyle(l).position === "fixed" ? l.getBoundingClientRect() : null;
  const kr = getComputedStyle(k).position === "sticky" ? k.getBoundingClientRect() : null;
  const oben = kr ? kr.bottom : 0;
  const unten = lr ? lr.top : vh();
  return r.top >= oben - 0.5 && r.bottom <= unten + 0.5 && r.bottom > r.top;
}

async function oeffne(hash) {
  location.hash = hash;
  await warteBis(() => document.getElementById("titel"), "Titel von " + hash);
  await pause(120);
}

/** Zurück in einen sauberen Zustand: alle Änderungen verwerfen (ohne Rückfrage, direkt im Zustand). */
async function sauber() {
  const Z = await import("/admin/zustand.js");
  Z.verwerfe();
  const A = await import("/admin/aktionen.js");
  A.ruheStatus();
  await pause(150);
}

// ---------------------------------------------------------------- Befund 1 und 2: Fokus nicht verdeckt, Leiste nicht zu hoch
async function befund12Lauf() {
  neu();
  const Z = await import("/admin/zustand.js");
  const A = await import("/admin/aktionen.js");
  await mock("zustand", { queued_s: 0.3, laufend_s: 0.6, fremder_lauf: false, naechster_lauf: null });
  await sauber();
  const schmal = innerWidth <= 480;
  const niedrig = innerHeight <= 600;
  E.daten.fenster = `${innerWidth}×${innerHeight}`;

  // Firmendaten öffnen, eine Telefonnummer ändern -> Leiste mit Änderungszeile
  await oeffne("#/b/firma");
  const nummer = document.querySelector('[data-pfad="kontakt.telefone.0.anzeige"] input');
  t(!!nummer, "Telefonnummer-Feld gefunden");
  nummer.focus();
  setzeText(nummer, nummer.value + " ");
  setzeText(nummer, nummer.value.trim() + "1");
  await warteBis(() => !leiste().hidden, "Leiste sichtbar nach Änderung");
  await pause(200);

  // Messwerte der Leiste im Normalbetrieb
  const lr = leiste().getBoundingClientRect();
  const fest = getComputedStyle(leiste()).position === "fixed";
  const cssH = px(getComputedStyle(document.documentElement).getPropertyValue("--leiste-h"));
  E.daten.leisteHoehe = Math.round(lr.height);
  E.daten.leisteAnteil = Math.round((lr.height / vh()) * 1000) / 10;
  E.daten.leistePosition = getComputedStyle(leiste()).position;
  if (niedrig) {
    t(!fest, "Niedriges Fenster: Leiste klebt nicht am Rand (position " + E.daten.leistePosition + ")");
    t(cssH === 0, "Niedriges Fenster: --leiste-h = 0 (Leiste verdeckt nichts), ist " + cssH);
    t(getComputedStyle(document.getElementById("kopf")).position !== "sticky", "Niedriges Fenster: Kopfzeile klebt nicht");
  } else {
    t(fest, "Leiste ist am unteren Rand fest");
    t(lr.height / vh() < 0.25, `Leiste im Normalbetrieb unter 25 % des Fensters (${Math.round(lr.height)} von ${vh()} px = ${E.daten.leisteAnteil} %)`);
    t(Math.abs(cssH - Math.ceil(lr.height)) <= 1, `--leiste-h (${cssH}) entspricht der echten Höhe (${Math.round(lr.height)})`);
    const polster = px(getComputedStyle(document.querySelector(".inhalt")).paddingBottom);
    t(polster >= lr.height + 16, `Seitenpolster unten (${polster}) größer als Leistenhöhe (${Math.round(lr.height)}) plus Abstand`);
    const sp = px(getComputedStyle(document.documentElement).scrollPaddingBottom);
    t(sp >= lr.height + 8, `scroll-padding-bottom (${sp}) aus der Leistenhöhe (${Math.round(lr.height)})`);
  }

  // „Nummer hinzufügen“ per Tastatur erreichen: der Fokus bleibt sichtbar
  const hinzu = [...document.querySelectorAll('[data-pfad="kontakt.telefone"] .liste-fuss button')].find((b) => /hinzufügen/.test(b.textContent));
  t(!!hinzu, "Knopf „Nummer hinzufügen“ gefunden");
  // Wie ein Tab-Stopp: erst weit weg (Seitenanfang), dann fokussieren; der Browser scrollt den Fokus ins Bild (scroll-padding)
  // Schwierigster Fall: das Element liegt gerade noch im Fenster, aber unter der Leiste (der Browser scrollt dann nicht von selbst).
  hinzu.blur();
  window.scrollBy(0, hinzu.getBoundingClientRect().bottom - (innerHeight - 20));
  await pause(200);
  hinzu.focus();
  await pause(350);
  t(document.activeElement === hinzu, "„Nummer hinzufügen“ hat den Fokus");
  t(frei(hinzu), `„Nummer hinzufügen“ liegt frei (nicht unter Leiste/Kopfzeile): ${JSON.stringify(hinzu.getBoundingClientRect().toJSON ? hinzu.getBoundingClientRect().toJSON() : {})} Fenster ${innerHeight} Leiste ${Math.round(lr.top)}`);
  // auch ganz unten im Formular (letztes fokussierbares Element im Abschnitt) und mit Dialog "Verwerfen"
  const letzter = [...document.querySelectorAll(".formular-fuss button")].pop();
  if (letzter && !letzter.hidden) {
    letzter.blur();
    window.scrollBy(0, letzter.getBoundingClientRect().bottom - (innerHeight - 20));
    await pause(200);
    letzter.focus(); await pause(350);
    t(frei(letzter), "„Änderungen in diesem Bereich verwerfen“ liegt frei");
  }
  // Wie viel Platz bleibt dem Inhalt? (fest stehende Teile abziehen)
  const festeHoehe = (getComputedStyle(leiste()).position === "fixed" ? leiste().getBoundingClientRect().height : 0)
    + (getComputedStyle(document.getElementById("kopf")).position === "sticky" ? document.getElementById("kopf").getBoundingClientRect().height : 0);
  E.daten.platzFuerInhalt = Math.round(vh() - festeHoehe);
  t(niedrig ? festeHoehe === 0 : vh() - festeHoehe >= 400, `Platz für den Inhalt neben festen Teilen: ${Math.round(vh() - festeHoehe)} von ${vh()} px`);

  // Mit zusätzlicher „Live“-Zeile: Leiste wird höher, Hinweis darf Leistentext nicht überlappen
  const hoeheOhneLive = leiste().getBoundingClientRect().height;
  // Veröffentlichen anstoßen: Änderungszeile bleibt bis zum Ende des Speicherns, danach kommt „Live“ (Mock-Lauf dauert ~1 s)
  A.setzeStatus({ phase: "live", sha: "a".repeat(40), art: "veroeffentlichung", lauf: null });
  await pause(250);
  const hoeheMitLive = leiste().getBoundingClientRect().height;
  t(hoeheMitLive > hoeheOhneLive, `Mit „Live“-Zeile ist die Leiste höher (${Math.round(hoeheMitLive)} > ${Math.round(hoeheOhneLive)})`);
  E.daten.leisteMitLive = Math.round(hoeheMitLive);
  if (!niedrig) {
    // Hinweis erscheint über der Leiste, ohne Überlappung
    const ui = await import("/admin/ui.js");
    ui.hinweis("Testhinweis zur Lage", { dauer: 20000 });
    await pause(250);
    const hw = document.querySelector(".hinweis");
    const hr = hw.getBoundingClientRect();
    const lr2 = leiste().getBoundingClientRect();
    t(hr.bottom <= lr2.top + 0.5, `Hinweis (unten ${Math.round(hr.bottom)}) liegt über der Leiste (oben ${Math.round(lr2.top)})`);
    hw.remove();
  }

  // „Live“ verschwindet nach etwa 10 s von selbst (Maus nicht darüber, Fokus nicht darin)
  document.activeElement && document.activeElement.blur && document.activeElement.blur();
  const t0 = Date.now();
  await warteBis(() => !leiste().textContent.includes("Live"), "Live verschwindet von selbst", 16000);
  const dauer = Date.now() - t0;
  E.daten.liveSichtbarMs = dauer;
  t(dauer >= 9000 && dauer <= 14500, `„Live“ bleibt etwa 10 s stehen (gemessen ${dauer} ms)`);
  t(Z.S.ver.phase === "ruhig", "Danach ist der Status ruhig");
  t(document.getElementById("sprecher") !== null && document.getElementById("sprecher").getAttribute("aria-live") === "polite", "Die Statusmeldung läuft über die dauerhafte Live-Region");
  const hoeheNach = leiste().getBoundingClientRect().height;
  E.daten.leisteNachLive = Math.round(hoeheNach);
  if (!niedrig) t(hoeheNach / vh() < 0.25, `Nach „Live“: Leiste wieder unter 25 % (${Math.round(hoeheNach)} px)`);

  // Landmark
  t(leiste().getAttribute("role") === "region" && !!leiste().getAttribute("aria-label"), "Leiste ist ein beschrifteter Bereich (Landmark)");
  await sauber();
  return E;
}

// ---------------------------------------------------------------- Befund 3: „Rückgängig“ bleibt erreichbar (ohne Zeitlimit, direkt im Fokusfluss)
const klick = (el) => { el.scrollIntoView({ block: "center" }); el.click(); };
/** Klappt alle zugeklappten Abschnitte um das Element auf (wie es ein Nutzer vor dem Bedienen tut). */
const oeffneUm = (el) => { for (let d = el.closest("details"); d; d = d.parentElement && d.parentElement.closest("details")) d.open = true; };

async function befund3Lauf() {
  neu();
  const Z = await import("/admin/zustand.js");
  const UI = await import("/admin/ui.js");
  await sauber();

  // --- Listeneintrag entfernen (Frage 2 der Carport-Seite)
  await oeffne("#/b/carport");
  const fragenListe = [...document.querySelectorAll(".liste")].find((l) => /Fragen/.test(l.querySelector(".liste-titel").textContent));
  t(!!fragenListe, "Liste der Fragen gefunden");
  const anzahl = () => fragenListe.querySelectorAll(":scope > ol > li:not([data-rueck])").length;
  const vorher = anzahl();
  const datenVorher = JSON.stringify(Z.arbeitskopie("inhalt/seiten/carport.json").faq);
  const weg2 = fragenListe.querySelector('button[aria-label="Frage 2 entfernen"]');
  t(!!weg2, "Papierkorb-Knopf von Frage 2 vorhanden");
  oeffneUm(weg2);
  await pause(50);
  weg2.focus();
  const tabindex = [...fragenListe.querySelectorAll("button")];
  weg2.click();
  await pause(150);
  const rueck = fragenListe.querySelector("[data-rueck] button");
  t(!!rueck, "Rückgängig-Zeile steht in der Liste");
  t(anzahl() === vorher - 1, `Eintrag ist entfernt (${vorher} -> ${anzahl()})`);
  t(document.activeElement === rueck, "Der Fokus liegt direkt auf „Rückgängig“ (0 Tab-Stopps vom Auslöser)");
  t(/Rückgängig/.test(rueck.getAttribute("aria-label")) && rueck.textContent.trim() === "Rückgängig", "Sichtbares Label „Rückgängig“ steckt im zugänglichen Namen: " + rueck.getAttribute("aria-label"));
  t(fragenListe.querySelector("[data-rueck]").textContent.includes("Frage 2 entfernt"), "Text: „Frage 2 entfernt.“");
  t(!document.querySelector("#hinweise .hinweis"), "Kein zusätzlicher Toast (keine doppelte Ansage)");
  t(rueck.getBoundingClientRect().height >= 43.5, "Rückgängig-Knopf mindestens 44 px hoch: " + Math.round(rueck.getBoundingClientRect().height));
  // Es dürfen mehr als die früheren 8 Sekunden vergehen
  await pause(9500);
  t(!!fragenListe.querySelector("[data-rueck] button"), "Nach 9,5 s ist „Rückgängig“ noch da (früher nach 8 s weg)");
  rueck.click();
  await pause(150);
  t(anzahl() === vorher && !fragenListe.querySelector("[data-rueck]"), "Rückgängig: Eintrag ist wieder da, Zeile weg");
  t(JSON.stringify(Z.arbeitskopie("inhalt/seiten/carport.json").faq) === datenVorher, "Rückgängig: Daten sind unverändert");
  t(leiste().hidden, "Rückgängig: keine ungespeicherte Änderung mehr");
  t(fragenListe.contains(document.activeElement) && document.activeElement.tagName === "BUTTON", "Nach Rückgängig liegt der Fokus im wiederhergestellten Eintrag: " + (document.activeElement && document.activeElement.getAttribute("aria-label")));
  // Nächste Aktion räumt die Zeile weg: entfernen, dann hinzufügen
  oeffneUm(fragenListe.querySelector('button[aria-label="Frage 1 entfernen"]'));
  fragenListe.querySelector('button[aria-label="Frage 1 entfernen"]').click();
  await pause(100);
  t(!!fragenListe.querySelector("[data-rueck]"), "Zweites Entfernen: Zeile da");
  [...fragenListe.querySelectorAll(".liste-fuss button")].find((b) => /hinzufügen/.test(b.textContent)).click();
  await pause(100);
  t(!fragenListe.querySelector("[data-rueck]"), "Nach „Frage hinzufügen“ ist die Rückgängig-Zeile weg (nächste Aktion)");
  await sauber();

  // --- Abschnitt entfernen (optionaler Abschnitt)
  let abschnittGefunden = false;
  for (const id of ["start", "carport", "kontakt", "ueber-uns"]) {
    await oeffne("#/b/" + id);
    const weg = document.querySelector(".gruppe-weg");
    if (!weg) continue;
    abschnittGefunden = true;
    const block = weg.closest(".gruppe-huelle");
    oeffneUm(weg);
    await pause(50);
    weg.focus();
    weg.click();
    await pause(150);
    const r2 = block.querySelector('[data-fokus="rueck"]');
    t(!!r2 && document.activeElement === r2, "Abschnitt entfernt: Fokus auf „Rückgängig“ im selben Block");
    t(!document.querySelector("#hinweise .hinweis"), "Abschnitt entfernt: kein zusätzlicher Toast");
    await pause(9000);
    t(!!block.querySelector('[data-fokus="rueck"]'), "Abschnitt: „Rückgängig“ nach 9 s noch da");
    block.querySelector('[data-fokus="rueck"]').click();
    await pause(150);
    t(!block.querySelector(".optional-leer") && !!block.querySelector("fieldset"), "Abschnitt wieder da");
    t(leiste().hidden, "Abschnitt: keine Änderung mehr");
    break;
  }
  t(abschnittGefunden, "Ein optionaler Abschnitt zum Testen ist vorhanden");

  // --- Toast mit Aktion: kein Zeitlimit, Schließen-Knopf, Esc, Ersetzen
  let rufe = 0;
  UI.hinweis("Testaktion", { aktion: { text: "Rückgängig", fn: () => { rufe++; } }, fokus: true });
  const toast = document.querySelector("#hinweise .hinweis-aktion");
  t(!!toast && document.activeElement === toast.querySelector("[data-aktion]"), "Toast mit Aktion: Fokus direkt auf der Aktion (fokus: true)");
  t(!!toast.querySelector('[aria-label="Hinweis schließen"]'), "Toast mit Aktion hat einen Schließen-Knopf");
  await pause(9500);
  t(document.querySelector("#hinweise .hinweis-aktion") === toast, "Toast mit Aktion bleibt nach 9,5 s stehen");
  UI.hinweis("Ersatz", { aktion: { text: "Rückgängig", fn: () => {} } });
  await pause(300);
  t(document.querySelectorAll("#hinweise .hinweis-aktion").length === 1, "Ein neuer Hinweis mit Aktion ersetzt den alten");
  const zweiter = document.querySelector("#hinweise .hinweis-aktion");
  zweiter.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  await pause(300);
  t(!document.querySelector("#hinweise .hinweis-aktion"), "Esc schließt den Hinweis");
  UI.hinweis("kurz", { dauer: 600 });
  await pause(1000);
  t(!document.querySelector("#hinweise .hinweis"), "Hinweis ohne Aktion verschwindet nach der Dauer");
  void tabindex; void Z;
  await sauber();
  return E;
}

// ---------------------------------------------------------------- Befund 4: Abmelden fragt IMMER nach
// Danach ist der Schlüssel gelöscht: der Aufrufer meldet sich wieder an (localStorage setzen, Seite neu laden).
async function befund4Lauf() {
  neu();
  const Z = await import("/admin/zustand.js");
  await sauber();
  await oeffne("#/");
  t(Z.zaehleAlle() === 0, "Ausgangslage: keine ungespeicherten Änderungen");
  const abmelden = document.getElementById("abmelden");
  t(!abmelden.hidden, "Abmelden-Knopf sichtbar");
  abmelden.click();
  await warteBis(() => dlg().open, "Abmelden-Dialog erscheint auch ohne Änderungen");
  t(true, "Dialog erscheint ohne offene Änderungen");
  const txt = dlg().textContent.replace(/\s+/g, " ");
  t(/neuen Schlüssel von GitHub/.test(txt) && /selbst neu erzeugen/.test(txt), "Dialog sagt: neuer Schlüssel von GitHub nötig, selbst neu erzeugbar: " + txt.slice(0, 200));
  t(document.activeElement && document.activeElement.textContent.trim() === "Angemeldet bleiben", "Sicher vorbelegt: Fokus auf „Angemeldet bleiben“ (war: " + (document.activeElement && document.activeElement.textContent.trim()) + ")");
  // Esc: bleibt angemeldet
  dlg().dispatchEvent(new Event("cancel", { cancelable: true }));
  await dialogZu("Dialog nach Esc zu");
  t(localStorage.getItem("zeca-admin.schluessel") === "test-token", "Esc: Schlüssel noch im Browser");
  t(!document.getElementById("abmelden").hidden, "Esc: noch angemeldet");
  // „Angemeldet bleiben“
  abmelden.click();
  await warteBis(() => dlg().open, "Dialog zum zweiten Mal");
  [...dlg().querySelectorAll("button")].find((b) => b.textContent.trim() === "Angemeldet bleiben").click();
  await dialogZu("Dialog nach „Angemeldet bleiben“ zu");
  t(localStorage.getItem("zeca-admin.schluessel") === "test-token", "„Angemeldet bleiben“: Schlüssel noch da");
  // Abmelden bestätigen
  abmelden.click();
  await warteBis(() => dlg().open, "Dialog zum dritten Mal");
  [...dlg().querySelectorAll("button")].find((b) => b.textContent.trim() === "Abmelden").click();
  await dialogZu("Dialog nach „Abmelden“ zu");
  await pause(300);
  t(localStorage.getItem("zeca-admin.schluessel") === null, "Abmelden: Schlüssel gelöscht");
  t(!!document.getElementById("schluessel"), "Abmelden: Anmeldeseite sichtbar");
  return E;
}

// ---------------------------------------------------------------- Befund 5: Fokus nach Veröffentlichen, Schließen, Verwerfen landet nie auf <body>
function fokusWaechter() {
  const proben = [];
  let lauf = true;
  const schleife = () => {
    if (!lauf) return;
    const a = document.activeElement;
    proben.push(!a || a === document.body ? "BODY" : a.tagName + (a.id ? "#" + a.id : "") + ":" + (a.getAttribute("data-id") || a.getAttribute("data-status") || a.textContent.trim().slice(0, 20)));
    requestAnimationFrame(schleife);
  };
  requestAnimationFrame(schleife);
  return { stopp() { lauf = false; return proben; } };
}
const beschreibe = (a) => (!a || a === document.body ? "BODY" : a.tagName + (a.id ? "#" + a.id : "") + " " + (a.getAttribute("data-id") || a.textContent.trim().slice(0, 30)));

async function befund5Lauf() {
  neu();
  const Z = await import("/admin/zustand.js");
  await mock("zustand", { queued_s: 0.3, laufend_s: 0.6, fremder_lauf: false, naechster_lauf: null });
  await sauber();
  const aendere = async () => {
    await oeffne("#/b/firma");
    const f = document.querySelector('[data-pfad="firma.slogan"] input, [data-pfad="firma.name"] input');
    f.value = f.value + "x";
    f.dispatchEvent(new Event("input", { bubbles: true }));
    await warteBis(() => !leiste().hidden, "Leiste sichtbar");
    await pause(150);
  };
  const knopf = (id) => leiste().querySelector(`[data-id="${id}"]`);

  // --- Veröffentlichen: Fokus bleibt in der Leiste, nie auf <body>, bis „Live“ erscheint
  await aendere();
  knopf("veroeffentlichen").focus();
  t(document.activeElement === knopf("veroeffentlichen"), "Fokus auf „Veröffentlichen“");
  const w1 = fokusWaechter();
  knopf("veroeffentlichen").click();
  await warteBis(() => /Live/.test(leiste().textContent), "Live nach Veröffentlichen", 30000);
  await pause(300);
  const proben1 = w1.stopp();
  const body1 = proben1.filter((p) => p === "BODY").length;
  t(body1 === 0, `Veröffentlichen: Fokus nie auf <body> (${proben1.length} Proben, ${body1} auf body; Verlauf: ${[...new Set(proben1)].join(" > ")})`);
  t(document.activeElement !== document.body && (leiste().contains(document.activeElement) || document.activeElement.id === "titel"), "Nach „Live“ liegt der Fokus in der Leiste oder auf der Überschrift: " + beschreibe(document.activeElement));

  E.daten.probenVeroeffentlichen = proben1.length;

  // --- Schließen: Fokus geht auf die Überschrift der Ansicht
  const schliessen = knopf("ruhe");
  t(!!schliessen && /Schließen/.test(schliessen.textContent), "Knopf „Schließen“ im Live-Status");
  schliessen.focus();
  const w2 = fokusWaechter();
  schliessen.click();
  await pause(400);
  const proben2 = w2.stopp();
  t(proben2.filter((p) => p === "BODY").length === 0, `Schließen: Fokus nie auf <body> (Verlauf: ${[...new Set(proben2)].join(" > ")})`);
  t(leiste().hidden && document.activeElement && document.activeElement.id === "titel", "Schließen: Leiste weg, Fokus auf der Überschrift: " + beschreibe(document.activeElement));

  // --- Verwerfen: Dialog, bestätigen, Fokus nicht auf <body>
  await aendere();
  knopf("verwerfen").focus();
  const w3 = fokusWaechter();
  knopf("verwerfen").click();
  await warteBis(() => dlg().open, "Verwerfen-Rückfrage");
  [...dlg().querySelectorAll("button")].find((b) => b.textContent.trim() === "Verwerfen").click();
  await dialogZu("Dialog zu");
  await pause(400);
  const proben3 = w3.stopp();
  t(proben3.filter((p) => p === "BODY").length === 0, `Verwerfen: Fokus nie auf <body> (Verlauf: ${[...new Set(proben3)].join(" > ")})`);
  t(leiste().hidden && document.activeElement && document.activeElement.id === "titel", "Verwerfen: Fokus auf der Überschrift: " + beschreibe(document.activeElement));

  // --- Verwerfen abbrechen: Fokus kehrt zum Knopf zurück
  await aendere();
  knopf("verwerfen").focus();
  knopf("verwerfen").click();
  await warteBis(() => dlg().open, "Verwerfen-Rückfrage 2");
  [...dlg().querySelectorAll("button")].find((b) => b.textContent.trim() === "Behalten").click();
  await dialogZu("Dialog zu 2");
  await pause(200);
  t(document.activeElement === knopf("verwerfen"), "Behalten: Fokus zurück auf „Verwerfen“: " + beschreibe(document.activeElement));

  // --- Gesperrter Knopf behält den Fokus (aria-disabled statt disabled)
  Z.S.beschaeftigt = true; Z.melde("status");
  await pause(100);
  t(knopf("veroeffentlichen").getAttribute("aria-disabled") === "true" && !knopf("veroeffentlichen").disabled, "Während des Speicherns: „Veröffentlichen“ ist aria-disabled, nicht disabled");
  knopf("veroeffentlichen").focus();
  Z.melde("status");
  await pause(50);
  t(document.activeElement === knopf("veroeffentlichen"), "Gesperrter Knopf behält den Fokus");
  Z.S.beschaeftigt = false; Z.melde("status");
  await sauber();
  return E;
}

// ---------------------------------------------------------------- Befund 6: JPEG-Rückfall für Browser ohne WebP-Erzeugung (Safari/iPhone)
// Ablauf: Mock zurücksetzen, Seite NEU laden (die Format-Erkennung merkt sich ihr Ergebnis), dann diese Funktion aufrufen.
// Sie baut einen Browser ohne WebP-Encoder nach (toBlob liefert für "image/webp" – wie Safari – still ein PNG), lädt ein Foto hoch,
// wählt es bei „Referenzen“ aus, veröffentlicht, prüft die Dateien im Mock-Commit und räumt am Ende (Foto löschen) wieder auf.
// Danach: python3 admin/test/foto_ergebnis.py  (Bauprobe auf dem Mock-Ergebnis) – vor dem Aufräumen: Parameter phase "ohneAufraeumen".
async function jpegRueckfallLauf({ aufraeumen = true } = {}) {
  neu();
  const Z = await import("/admin/zustand.js");
  const Sp = await import("/admin/fotospeicher.js");
  const { testbild } = await import("/admin/test/browser_foto_test.js");
  const F = await import("/admin/fotos.js");
  await mock("zustand", { queued_s: 0.3, laufend_s: 0.6, fremder_lauf: false, naechster_lauf: null });
  await sauber();

  // Browser ohne WebP-Encoder: toBlob("image/webp") liefert ein PNG
  const original = HTMLCanvasElement.prototype.toBlob;
  let webpAnfragen = 0;
  HTMLCanvasElement.prototype.toBlob = function (cb, typ, q) {
    if (typ === "image/webp") { webpAnfragen++; return original.call(this, cb, "image/png"); }
    return original.call(this, cb, typ, q);
  };
  try {
    const probe = await new Promise((ok) => { const c = document.createElement("canvas"); c.width = c.height = 2; c.toBlob(ok, "image/webp", 0.8); });
    t(probe.type === "image/png", "Simulierter Browser ohne WebP-Encoder: toBlob(webp) liefert " + probe.type);

    await oeffne("#/fotos");
    const hinweisJpeg = await warteBis(() => document.querySelector("[data-jpeg-hinweis]"), "Hinweis „speichert Fotos als JPEG“ auf der Fotos-Seite");
    t(/JPEG/.test(hinweisJpeg.textContent) && !/Chrome, Edge oder Firefox/.test(document.body.textContent), "Statt der Sackgasse „bitte anderen Browser“ steht ein Hinweis, dass JPEG verwendet wird");
    t(!document.querySelector(".meldung-warn[role=note]"), "Keine Warnung „Browser kann keine WebP-Fotos“ mehr");

    // Foto hochladen (4032 x 3024 -> 800, 1600, 2048)
    const datei = await testbild({ breite: 4032, hoehe: 3024, name: "IMG_JPEG.jpg" });
    const eingabe = document.querySelector(".upload-zone input[type=file]");
    const dt = new DataTransfer(); dt.items.add(datei); eingabe.files = dt.files; eingabe.dispatchEvent(new Event("change", { bubbles: true }));
    await warteBis(() => dlg().open, "Upload-Dialog");
    await warteBis(() => !dlg().querySelector(".upload-lauf") && dlg().querySelector(".upload-info") && !dlg().querySelector(".upload-info").hidden, "Verarbeitung fertig");
    const info = dlg().querySelector(".upload-info").textContent;
    t(info.includes("3 Größen (800, 1600, 2048 Pixel breit)") && info.includes("Gespeichert als JPEG"), "Info nennt drei Größen und JPEG: " + info);
    t(!dlg().querySelector(".meldung-fehler"), "Kein Fehler im Dialog (früher: Sackgasse mit „Browser wechseln“)");
    t(!!dlg().querySelector("[data-jpeg-hinweis]"), "Hinweis auch im Upload-Dialog");
    setzeText(dlg().querySelector("#foto-alt"), "Terrassenüberdachung aus Aluminium vom iPhone aufgenommen, Abendlicht");
    setzeText(dlg().querySelector("#foto-name"), "iPhone Foto");
    [...dlg().querySelectorAll("button")].find((b) => b.textContent.includes("Foto übernehmen")).click();
    await dialogZu("Dialog zu");
    await warteBis(() => Z.S.fotos.has("iphone-foto"), "Foto im Zustand");

    const f = Z.S.fotos.get("iphone-foto");
    t(f.format === "jpg", "Zustand: format = jpg");
    t(JSON.stringify(f.varianten.map((v) => [v.breite, v.hoehe])) === "[[800,600],[1600,1200],[2048,1536]]", "Größen 800×600, 1600×1200, 2048×1536: " + JSON.stringify(f.varianten.map((v) => [v.breite, v.hoehe])));
    t(f.varianten.every((v) => v.blob.type === "image/jpeg"), "Alle Größen sind JPEG-Blobs");
    let maßeOk = true;
    for (const v of f.varianten) {
      const k = new Uint8Array(await v.blob.slice(0, 65536).arrayBuffer());
      const m = F.bildMasse(k);
      if (!(k[0] === 0xff && k[1] === 0xd8 && m && m.format === "jpeg" && m.breite === v.breite && m.hoehe === v.hoehe)) maßeOk = false;
    }
    t(maßeOk, "JPEG-Köpfe stimmen mit den Maßen überein (so liest sie auch bauen.py)");
    t(f.varianten[0].blob.size < 250 * 1024, `800er JPEG unter 250 KB (${Math.round(f.varianten[0].blob.size / 1024)} KB)`);
    const eintrag = Z.arbeitskopie("inhalt/bilder.json").bilder.find((b) => b.name === "iphone-foto");
    t(eintrag && eintrag.format === "jpg" && eintrag.alt.includes("iPhone"), "bilder.json (Entwurf): Eintrag mit format \"jpg\": " + JSON.stringify(eintrag));
    t(webpAnfragen >= 1, "Die Erkennung hat WebP angefragt (und ist auf JPEG ausgewichen)");
    await pause(500);
    const gespeichert = (await Sp.ladeFotos()).find((x) => x.name === "iphone-foto");
    t(gespeichert && gespeichert.format === "jpg", "Zwischenspeicher (IndexedDB) merkt sich das Format");

    // Beim Foto einsetzen: Referenzen, Projekt 1, Foto 1
    location.hash = "#/b/referenzen";
    const feld = await warteBis(() => document.querySelector('[data-pfad="projekte.0.fotos.0.bild"]'), "Bildfeld Referenzen");
    oeffneUm(feld);
    klick(knopfText(feld, "Anderes Foto wählen"));
    await warteBis(() => dlg().open, "Auswahldialog");
    dlg().querySelector('input[value="iphone-foto"]').click();
    klick(knopfText(dlg(), "Dieses Foto verwenden"));
    await dialogZu("Auswahldialog zu");
    await pause(300);
    const img = feld.querySelector("img.bild-vorschau");
    if (img) img.loading = "eager";   // „lazy“ lädt erst in Sichtnähe
    let geladen = false;
    try { await warteBis(() => img && img.complete && img.naturalWidth > 0, "Vorschau lädt", 4000); geladen = true; } catch (e) { E.schlecht--; E.fehler.pop(); }
    t(geladen, "Vorschau des JPEG-Fotos im Bildfeld lädt");

    // Veröffentlichen
    const vorher = (await mock("stand")).verlauf.length;
    klick(leiste().querySelector('[data-id="veroeffentlichen"]'));
    await warteBis(() => /Live/.test(leiste().textContent), "Live nach Veröffentlichen", 60000);
    const nach = await mock("stand");
    t(nach.verlauf.length === vorher + 1, "Genau ein neuer Commit");
    t([800, 1600, 2048].every((b) => nach.dateien.includes(`images/bestand/iphone-foto-${b}.jpg`)), "Commit enthält iphone-foto-800/1600/2048.jpg");
    t(!nach.dateien.some((p) => /iphone-foto-\d+\.webp/.test(p)), "Keine WebP-Dateien für das JPEG-Foto");
    t(nach.laeufe.at(-1).conclusion === "success", "Bauauftrag (bauen.py auf dem Stand mit JPEG-Foto) erfolgreich: " + nach.laeufe.at(-1).conclusion);
    const bl = JSON.parse(await (await fetch(`${MOCK}/__test/datei?pfad=inhalt/bilder.json`)).text());
    const e2 = bl.bilder.find((b) => b.name === "iphone-foto");
    t(e2 && e2.format === "jpg", "bilder.json im Commit: format jpg");
    const neuAlt = bl.bilder.filter((b) => b.name !== "iphone-foto").every((b) => !("format" in b));
    t(neuAlt, "Vorhandene Fotos in bilder.json bleiben unverändert (kein format-Feld nachgetragen)");
    E.daten.commit = nach.kopf;
    if (!aufraeumen) return E;

    // Aufräumen: Foto wieder aus „Referenzen“ nehmen, Foto löschen, veröffentlichen -> alle drei JPEG-Dateien weg
    location.hash = "#/b/referenzen";
    const feld2 = await warteBis(() => document.querySelector('[data-pfad="projekte.0.fotos.0.bild"]'), "Bildfeld Referenzen 2");
    oeffneUm(feld2);
    klick(knopfText(feld2, "Anderes Foto wählen"));
    await warteBis(() => dlg().open, "Auswahldialog 2");
    dlg().querySelector('input[value="terrasse-doppelhaus-1"]').click();
    klick(knopfText(dlg(), "Dieses Foto verwenden"));
    await dialogZu("Auswahldialog 2 zu");
    await oeffne("#/fotos");
    const zeile = [...document.querySelectorAll(".foto")].find((li) => li.querySelector(".foto-name")?.firstChild?.textContent === "iphone-foto");
    t(!!zeile && zeile.querySelector("img").complete, "Fotos-Liste zeigt das JPEG-Foto");
    klick(knopfText(zeile, "Löschen"));
    await pause(300);
    document.querySelector("#hinweise .hinweis-aktion .hinweis-text") && t(/gelöscht/.test(document.querySelector("#hinweise .hinweis-aktion .hinweis-text").textContent), "Hinweis: wird beim Veröffentlichen gelöscht");
    klick(leiste().querySelector('[data-id="veroeffentlichen"]'));
    await warteBis(() => /Live/.test(leiste().textContent), "Live nach Löschen", 60000);
    const ende = await mock("stand");
    t(!ende.dateien.some((p) => /iphone-foto-/.test(p)), "Alle JPEG-Dateien des Fotos sind gelöscht: " + ende.dateien.filter((p) => /iphone-foto/.test(p)).join(","));
    t(ende.laeufe.at(-1).conclusion === "success", "Bauauftrag nach dem Löschen erfolgreich");
  } finally {
    HTMLCanvasElement.prototype.toBlob = original;
  }
  await sauber();
  return E;
}

// ---------------------------------------------------------------- Befund 7: Semantik (Gruppen, Namen, Landmark, Live-Regionen)
async function befund7Lauf() {
  neu();
  const Z = await import("/admin/zustand.js");
  const A = await import("/admin/aktionen.js");
  await sauber();

  // Listeneinträge: benannte Gruppen
  await oeffne("#/b/carport");
  const liste = [...document.querySelectorAll(".liste")].find((l) => /Fragen/.test(l.querySelector(".liste-titel").textContent));
  const gruppen = [...liste.querySelectorAll('.eintrag-koerper[role="group"]')];
  t(gruppen.length >= 2, `Jeder Eintrag der Fragen-Liste ist eine Gruppe (${gruppen.length})`);
  const namen = gruppen.map((g) => { const ref = g.getAttribute("aria-labelledby"); const el = ref && document.getElementById(ref); return el ? el.textContent.trim() : null; });
  t(namen.every((n, i) => n === `Frage ${i + 1}`), "Gruppennamen „Frage 1“, „Frage 2“ ...: " + namen.join(", "));
  t(new Set(gruppen.map((g) => g.getAttribute("aria-labelledby"))).size === gruppen.length, "Die Namen verweisen auf eindeutige ids");

  // Live-Regionen dauerhaft im DOM: leere Fehlerzeilen sind nicht display:none
  const leer = [...document.querySelectorAll(".fehler")].find((x) => x.textContent === "");
  t(!!leer && getComputedStyle(leer).display !== "none" && leer.getAttribute("aria-live") === "polite", "Leere Fehlerzeile bleibt im DOM (display " + (leer && getComputedStyle(leer).display) + ") mit aria-live=polite");
  t(leer && leer.getBoundingClientRect().height === 0, "und nimmt keinen Platz ein");
  t(document.getElementById("hinweise").getAttribute("aria-live") === "polite" && document.getElementById("sprecher").getAttribute("aria-live") === "polite", "Hinweis-Behälter und Ansage-Region sind dauerhaft im DOM");

  // Leiste: Landmark; Fehlerzeile mit role=alert wird nicht zusätzlich per ansage() gesprochen
  t(leiste().getAttribute("role") === "region" && leiste().getAttribute("aria-label") === "Änderungen veröffentlichen", "Leiste: region mit Namen");
  document.getElementById("sprecher").textContent = "";   // Reste früherer Ansagen weg
  A.setzeStatus({ phase: "fehler", sha: "b".repeat(40), art: "veroeffentlichung", lauf: null });
  await pause(300);
  t(!!leiste().querySelector('[role="alert"]'), "Fehlerzeile hat role=alert");
  t(document.getElementById("sprecher").textContent === "", "Keine zweite Ansage der Fehlermeldung über #sprecher: „" + document.getElementById("sprecher").textContent + "“");
  A.ruheStatus();
  await pause(100);

  // Verlauf: sichtbarer Text steckt im zugänglichen Namen (WCAG 2.5.3)
  await oeffne("#/verlauf");
  await warteBis(() => document.querySelector(".verlauf-eintrag button, .verlauf-eintrag .marker-aktuell"), "Verlauf geladen");
  const knoepfe = [...document.querySelectorAll(".verlauf-eintrag button")];
  if (knoepfe.length) {
    t(knoepfe.every((b) => b.getAttribute("aria-label").toLowerCase().includes(b.textContent.trim().toLowerCase())), "Verlauf-Knopf: sichtbarer Text steckt im Namen: " + knoepfe[0].getAttribute("aria-label"));
    t(new Set(knoepfe.map((b) => b.getAttribute("aria-label"))).size === knoepfe.length, "Die Namen unterscheiden sich (Datum und Uhrzeit)");
  } else {
    E.daten.hinweis = "Verlauf hat nur einen Eintrag: kein Knopf zu prüfen";
  }
  // Alle Knöpfe/Links mit aria-label: sichtbarer Text steckt im Namen (soweit es sichtbaren Text gibt)
  const verstoesse = [];
  for (const a of ["#/", "#/b/firma", "#/b/carport", "#/fotos", "#/verlauf"]) {
    await oeffne(a);
    for (const el of document.querySelectorAll("button[aria-label], a[aria-label]")) {
      const sichtbar = el.textContent.replace(/\s+/g, " ").trim().toLowerCase();
      if (sichtbar && !el.getAttribute("aria-label").toLowerCase().includes(sichtbar)) verstoesse.push(a + ": „" + sichtbar + "“ / „" + el.getAttribute("aria-label") + "“");
    }
  }
  t(verstoesse.length === 0, "Sichtbarer Text steckt im Namen aller beschrifteten Knöpfe: " + verstoesse.slice(0, 4).join(" | "));
  void Z;
  await sauber();
  return E;
}

// ---------------------------------------------------------------- Befund 8: Verständlichkeit (Laiensprache, Beispiele, Zählung)
async function befund8Lauf() {
  neu();
  const Z = await import("/admin/zustand.js");
  const A = await import("/admin/aktionen.js");
  await sauber();
  const FACHWOERTER = /\b(Commit|Token|Branch|Workflow|Bauauftrag|Protokoll|Zweig|Alt-Text|Hex-Code|JSON|Markup|Repository)\b/;

  // Formatierungshinweis ohne rohes HTML
  await oeffne("#/b/carport");
  const hinweise = [...document.querySelectorAll(".format-hinweis")];
  t(hinweise.length > 0, "Formatierungshinweis vorhanden");
  t(hinweise.every((h) => /Wörter fett machen/.test(h.textContent) && !/Von Hand/.test(h.textContent) && !/<a href/.test(h.textContent)), "Hinweis: „Wörter fett machen: Text markieren und „Fett“ drücken“, kein rohes HTML-Beispiel: " + (hinweise[0] && hinweise[0].textContent));

  // Umsortieren zählt als eine Änderung
  const liste = [...document.querySelectorAll(".liste")].find((l) => /Fragen/.test(l.querySelector(".liste-titel").textContent));
  const nachUnten = liste.querySelector('button[aria-label="Frage 1 nach unten schieben"]');
  oeffneUm(nachUnten);
  nachUnten.click();
  await pause(300);
  t(/^1 ungespeicherte Änderung$/.test(leiste().querySelector("#leiste-anzahl").textContent.trim()), "Umsortieren zählt als „1 ungespeicherte Änderung“: " + leiste().querySelector("#leiste-anzahl").textContent);
  await sauber();

  // Fehlerdialog: gleicher Name wie im Formular, Format mit Beispiel
  await oeffne("#/b/firma");
  const nummer = document.querySelector('[data-pfad="kontakt.telefone.0.anzeige"]');
  const eingabe = nummer.querySelector("input");
  const labelImFormular = nummer.querySelector("label").textContent.trim();
  setzeText(eingabe, "abc");
  await warteBis(() => !leiste().hidden, "Leiste");
  leiste().querySelector('[data-id="veroeffentlichen"]').click();
  await warteBis(() => dlg().open, "Fehlerdialog");
  const dt = dlg().textContent.replace(/\s+/g, " ");
  t(labelImFormular === "Nummer 1" && dt.includes(`${labelImFormular}:`), `Fehlerdialog nennt „${labelImFormular}“ wie das Formular: ` + dt.slice(0, 220));
  t(!/so wie sie angezeigt wird/.test(dt), "Fehlerdialog sagt nicht mehr „so wie sie angezeigt wird“");
  t(/Das Format passt nicht\. So sieht es richtig aus: 0176 24860016/.test(dt), "Fehlerdialog: Format mit Beispiel");
  t(!FACHWOERTER.test(dt), "Fehlerdialog ohne Fachwörter");
  [...dlg().querySelectorAll("button")].find((b) => /Schließen/.test(b.textContent)).click();
  await dialogZu("Dialog zu");
  await pause(300);
  const feldFehler = (document.querySelector('[data-pfad="kontakt.telefone.0.anzeige"] .fehler') || { textContent: "" }).textContent;   // die Ansicht wurde neu aufgebaut
  t(/So sieht es richtig aus: 0176 24860016/.test(feldFehler), "Auch am Feld steht das Beispiel: " + feldFehler);
  await sauber();

  // Leiste: „Bauauftrag“ und „Protokoll“ gibt es nicht mehr
  setzeText(document.querySelector('[data-pfad="kontakt.telefone.0.anzeige"] input') || document.createElement("input"), "x");
  await sauber();
  A.setzeStatus({ phase: "beobachten", sha: "c".repeat(40), art: "veroeffentlichung", seit: Date.now(), lauf: { status: "in_progress" } });
  await pause(200);
  let tx = leiste().textContent.replace(/\s+/g, " ");
  t(/Die Seite wird gerade neu aufgebaut\./.test(tx) && !FACHWOERTER.test(tx), "Leiste (läuft): „Die Seite wird gerade neu aufgebaut.“: " + tx);
  A.setzeStatus({ phase: "beobachten", sha: "c".repeat(40), art: "veroeffentlichung", seit: Date.now(), lauf: { status: "queued" } });
  await pause(200);
  tx = leiste().textContent.replace(/\s+/g, " ");
  t(/wartet auf ihren Start/.test(tx) && !FACHWOERTER.test(tx), "Leiste (wartet): " + tx);
  A.setzeStatus({ phase: "fehler", sha: "c".repeat(40), art: "veroeffentlichung", lauf: { url: "https://github.com/x/y/actions/runs/1" } });
  await pause(200);
  const detail = [...leiste().querySelectorAll("a")].find((a) => /Details anzeigen/.test(a.textContent));
  t(!!detail && /Details anzeigen/.test(detail.getAttribute("aria-label")) && !FACHWOERTER.test(leiste().textContent), "Leiste (Fehler): „Details anzeigen“ statt „Protokoll“");
  A.setzeStatus({ phase: "unbekannt", sha: "c".repeat(40), art: "veroeffentlichung" });
  await pause(200);
  tx = leiste().textContent.replace(/\s+/g, " ");
  t(!FACHWOERTER.test(tx) && /nicht sehen, ob die Seite schon fertig ist/.test(tx), "Leiste (unbekannt): ohne Fachwörter: " + tx);
  A.ruheStatus();

  // Alle sichtbaren Texte der Hauptansichten: keine Fachwörter
  const funde = [];
  for (const a of ["#/", "#/b/firma", "#/b/texte", "#/b/start", "#/b/carport", "#/b/referenzen", "#/b/kontakt", "#/fotos", "#/verlauf"]) {
    await oeffne(a);
    for (const d of document.querySelectorAll("#inhalt details")) d.open = true;
    const text = document.getElementById("inhalt").innerText.replace(/\s+/g, " ");
    const m = text.match(FACHWOERTER);
    if (m) funde.push(a + ": „" + m[0] + "“ in …" + text.slice(Math.max(0, text.indexOf(m[0]) - 40), text.indexOf(m[0]) + 40));
  }
  t(funde.length === 0, "Keine Fachwörter in den sichtbaren Texten der Ansichten: " + funde.join(" | "));
  void Z;
  await sauber();
  return E;
}

// ---------------------------------------------------------------- Befund 9: Kleinigkeiten (Zurück-Taste, Entwurf sofort sichern, Ränder, dvh, Zielgröße)
async function befund9Lauf() {
  neu();
  const Z = await import("/admin/zustand.js");
  const UI = await import("/admin/ui.js");
  await sauber();
  await oeffne("#/");
  const hashVorher = location.hash;

  // Zurück-Geste schließt den Dialog, die Seite bleibt
  document.getElementById("abmelden").click();
  await warteBis(() => dlg().open, "Dialog offen");
  t(history.state && history.state.zecaDialog === true, "Der offene Dialog hat einen eigenen Verlaufseintrag");
  history.back();
  await warteBis(() => !dlg().open, "Dialog schließt bei Zurück", 3000);
  await pause(200);
  t(location.hash === hashVorher, "Zurück bei offenem Dialog: die Seite wechselt nicht (" + location.hash + ")");
  t(localStorage.getItem("zeca-admin.schluessel") === "test-token", "Zurück schließt den Abmelden-Dialog, ohne abzumelden");
  t(!document.getElementById("abmelden").hidden, "weiterhin angemeldet");
  t(!history.state || !history.state.zecaDialog, "Danach liegt kein Dialog-Eintrag mehr auf dem Verlauf");

  // Normales Schließen baut den Verlaufseintrag wieder ab
  document.getElementById("abmelden").click();
  await warteBis(() => dlg().open, "Dialog offen 2");
  [...dlg().querySelectorAll("button")].find((b) => b.textContent.trim() === "Angemeldet bleiben").click();
  await dialogZu("Dialog zu 2");
  await pause(250);
  t(!history.state || !history.state.zecaDialog, "Knopf „Angemeldet bleiben“: Verlaufseintrag wieder abgebaut");
  t(location.hash === hashVorher, "Hash unverändert");

  // Zwei Dialoge nacheinander (Rückfrage, dann Meldung) kollidieren nicht mit dem Verlauf
  const erster = UI.dialog({ titel: "Eins", text: "a", ok: "Weiter" });
  await warteBis(() => dlg().open && /Eins/.test(dlg().textContent), "Dialog Eins");
  const zweiter = UI.dialog({ titel: "Zwei", text: "b", ok: "Weiter" });
  [...dlg().querySelectorAll("button")].find((b) => b.textContent.trim() === "Weiter").click();
  await warteBis(() => dlg().open && /Zwei/.test(dlg().textContent), "Dialog Zwei folgt");
  history.back();
  const e2 = await Promise.race([zweiter, pause(3000).then(() => "zeit")]);
  void erster;
  t(e2 === false, "Zweiter Dialog schließt bei Zurück mit „Abbrechen“-Ergebnis");
  await pause(200);
  t(location.hash === hashVorher && !dlg().open, "Nach zwei Dialogen und Zurück: gleiche Seite, kein Dialog offen");

  // Entwurf wird sofort gesichert, wenn die Seite in den Hintergrund geht
  await oeffne("#/b/firma");
  const feld = document.querySelector('[data-pfad="firma.slogan"] input, [data-pfad="firma.name"] input');
  setzeText(feld, feld.value + "!");
  const direkt = localStorage.getItem("zeca-admin.entwurf");
  t(direkt === null, "Direkt nach der Eingabe ist noch nichts gesichert (Sicherung läuft verzögert)");
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
  document.dispatchEvent(new Event("visibilitychange"));
  const sofort = localStorage.getItem("zeca-admin.entwurf");
  delete document.visibilityState;
  t(sofort !== null && sofort.includes("!"), "visibilitychange (Tab verlassen): Entwurf sofort gesichert");
  await sauber();
  t(localStorage.getItem("zeca-admin.entwurf") === null, "Nach Verwerfen ist der Entwurf weg");
  setzeText(document.querySelector('[data-pfad="firma.slogan"] input, [data-pfad="firma.name"] input'), "x");
  localStorage.removeItem("zeca-admin.entwurf");
  window.dispatchEvent(new Event("pagehide"));
  t(localStorage.getItem("zeca-admin.entwurf") !== null, "pagehide: Entwurf sofort gesichert");
  await sauber();

  // Ränder, dvh, Zielgröße
  const css = await (await fetch("/admin/admin.css")).text();
  t(css.includes("safe-area-inset-left") && css.includes("safe-area-inset-right"), "CSS berücksichtigt safe-area-inset-left/right");
  t(css.includes("100dvh") && css.includes("60dvh"), "CSS nutzt dvh (mit vh als Rückfall)");
  const inhalt = document.querySelector(".inhalt");
  t(px(getComputedStyle(inhalt).paddingLeft) >= 16 && px(getComputedStyle(inhalt).paddingRight) >= 16, "Seitenränder mindestens 16 px");
  await UI.dialog({ titel: "Technik", text: "x", inhalt: (() => { const d = document.createElement("details"); d.className = "technik"; const s = document.createElement("summary"); s.textContent = "Technische Einzelheiten"; d.append(s); return d; })(), ok: "Verstanden", abbrechen: false, beiBereit: () => {
    // die Layouthöhe zählt, nicht die Größe während der Einblend-Animation (der Dialog skaliert beim Erscheinen kurz auf 98 %)
    setTimeout(() => {
      const s = dlg().querySelector(".technik summary");
      E.daten.technikHoehe = s.offsetHeight;   // Layouthöhe, unabhängig von der Einblend-Animation (scale)
      t(s.offsetHeight >= 44, "„Technische Einzelheiten“ mindestens 44 px hoch: " + s.offsetHeight);
      dlg().querySelector(".dialog-knoepfe button:last-child").click();
    }, 400);
  } });
  void Z;
  await sauber();
  return E;
}

// ---------------------------------------------------------------- Messwerte: Zielgrößen und Kontraste (für den Bericht)
async function messwerteLauf() {
  neu();
  await sauber();
  const klein = [];
  let gesamt = 0;
  for (const a of ["#/", "#/b/firma", "#/b/carport", "#/fotos", "#/verlauf"]) {
    await oeffne(a);
    for (const d of document.querySelectorAll("#inhalt details")) d.open = true;
    await pause(100);
    for (const el of document.querySelectorAll("#inhalt button, #inhalt summary, #inhalt a.knopf, #inhalt a.zeile, #inhalt a.zurueck, #inhalt input:not([type=checkbox]):not([type=radio]):not(.datei-eingabe), #inhalt select, #inhalt textarea, #kopf button, #kopf a")) {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      gesamt++;
      if (r.height < 44 - 0.5 || r.width < 44 - 0.5) klein.push(`${a}: ${el.tagName.toLowerCase()}.${(el.className || "").toString().split(" ")[0]} „${(el.getAttribute("aria-label") || el.textContent || el.id).trim().slice(0, 30)}“ ${Math.round(r.width)}×${Math.round(r.height)}`);
    }
  }
  E.daten.zielgroessen = { geprueft: gesamt, unter44: klein.length, beispiele: klein.slice(0, 8) };
  t(klein.length === 0, `Alle ${gesamt} bedienbaren Elemente mindestens 44×44 px (Verstöße: ${klein.length}): ${klein.slice(0, 5).join(" | ")}`);

  // Kontraste: Textfarbe gegen den wirksamen Hintergrund
  const lum = (c) => { const [r, g, b] = c.match(/[\d.]+/g).slice(0, 3).map(Number).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const hintergrund = (el) => { for (let e = el; e; e = e.parentElement) { const c = getComputedStyle(e).backgroundColor; if (c && !/rgba\(.*, 0\)$|transparent/.test(c)) return c; } return "rgb(255,255,255)"; };
  const verhaeltnis = (a, b) => { const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };
  const proben = [];
  const pruefeKontrast = (name, el, min = 4.5) => { if (!el) { proben.push([name, null, min]); return; } const v = verhaeltnis(getComputedStyle(el).color, hintergrund(el)); proben.push([name, Math.round(v * 10) / 10, min]); };
  await oeffne("#/b/firma");
  const nummer = document.querySelector('[data-pfad="kontakt.telefone.0.anzeige"] input');
  setzeText(nummer, nummer.value + "1");
  await warteBis(() => !leiste().hidden, "Leiste");
  pruefeKontrast("Fließtext (Tinte auf Blatt)", document.querySelector(".seitenbeschr"));
  pruefeKontrast("Hilfetext (Tinte-2)", document.querySelector(".hilfe"));
  pruefeKontrast("Feldname", document.querySelector(".feld-label"));
  pruefeKontrast("Leiste: Status (weiß auf Navy)", leiste().querySelector(".leiste-status"));
  pruefeKontrast("Leiste: Knopf „Verwerfen“", leiste().querySelector('[data-id="verwerfen"]'));
  pruefeKontrast("Leiste: Knopf „Veröffentlichen“ (Tinte auf Gelb)", leiste().querySelector('[data-id="veroeffentlichen"]'));
  pruefeKontrast("Kopfzeile: Marke", document.querySelector(".marke"));
  pruefeKontrast("Kopfzeile: Abmelden", document.getElementById("abmelden"));
  pruefeKontrast("Marker „Geändert“", document.querySelector(".marker:not([hidden])"));
  const A = await import("/admin/aktionen.js");
  A.setzeStatus({ phase: "live", sha: "d".repeat(40), art: "veroeffentlichung", lauf: null });
  await pause(150);
  pruefeKontrast("Leiste: Detailtext (hell auf Navy)", leiste().querySelector(".leiste-detail"));
  A.setzeStatus({ phase: "fehler", sha: "d".repeat(40), art: "veroeffentlichung", lauf: null });
  await pause(150);
  pruefeKontrast("Leiste: Fehler-Detail", leiste().querySelector(".leiste-detail"));
  A.ruheStatus();
  const UI = await import("/admin/ui.js");
  UI.hinweis("Kontrast", { aktion: { text: "Rückgängig", fn() {} } });
  await pause(150);
  pruefeKontrast("Hinweis: Text (weiß auf Navy)", document.querySelector(".hinweis .hinweis-text"));
  pruefeKontrast("Hinweis: Knopf „Rückgängig“", document.querySelector(".hinweis .knopf-hinweis"));
  UI.entferneAktionshinweise();
  E.daten.kontraste = proben;
  const schlecht = proben.filter(([, v, min]) => v === null || v < min);
  t(schlecht.length === 0, "Kontraste mindestens 4,5:1: " + JSON.stringify(schlecht));
  await sauber();
  return E;
}

export const befund12 = sicher(befund12Lauf);
export const befund3 = sicher(befund3Lauf);
export const befund4 = sicher(befund4Lauf);
export const befund5 = sicher(befund5Lauf);
export const jpegRueckfall = sicher(jpegRueckfallLauf);
export const befund7 = sicher(befund7Lauf);
export const befund8 = sicher(befund8Lauf);
export const befund9 = sicher(befund9Lauf);
export const messwerte = sicher(messwerteLauf);
