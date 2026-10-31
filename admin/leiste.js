// leiste.js – die Leiste am unteren Rand: Anzahl der Änderungen, Veröffentlichen/Verwerfen und der Stand der Veröffentlichung.

import { h, leere, icon, ansage, fokussiere } from "./ui.js";
import { S, auf, zaehleAlle, geaenderteDateien } from "./zustand.js";
import { veroeffentlichen, verwerfeMitRueckfrage, ruheStatus, beendeBeobachtung, rueckgaengigNachFehler, beobachte } from "./aktionen.js";

let uhr = null;
let liveTimer = null;
let liveFuer = "";

const LIVE_SICHTBAR_MS = 10000;   // "Live" bleibt so lange stehen und verschwindet dann von selbst (die Ansage für Screenreader kam schon)
const LIVE_NACHFRIST_MS = 3000;   // solange die Leiste mit Maus oder Tastatur benutzt wird, wird noch einmal so lange gewartet

/** Misst Kopfzeile und Leiste und legt ihre echte Höhe in CSS-Variablen (--kopf-h, --leiste-h): Fokus und Hinweise bleiben so frei. */
function beobachteHoehen(leiste) {
  const wurzel = document.documentElement;
  const kopf = document.getElementById("kopf");
  const hoehe = (el, art) => {
    if (!el || el.hidden) return 0;
    return getComputedStyle(el).position === art ? Math.ceil(el.getBoundingClientRect().height) : 0;
  };
  const messe = () => {
    wurzel.style.setProperty("--leiste-h", hoehe(leiste, "fixed") + "px");
    wurzel.style.setProperty("--kopf-h", (hoehe(kopf, "sticky") || 0) + "px");
  };
  if (typeof ResizeObserver === "function") {
    const ro = new ResizeObserver(messe);
    ro.observe(leiste);
    if (kopf) ro.observe(kopf);
  }
  window.addEventListener("resize", messe);
  messe();
  return messe;
}

const minuten = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

function sichereUrl(u) {
  try { const x = new URL(u); return x.protocol === "https:" || x.protocol === "http:" ? x.href : null; } catch (e) { return null; }
}

const ANSAGE = {
  speichern: "Änderungen werden gespeichert.",
  beobachten: "Wird veröffentlicht. Das dauert meist ein bis zwei Minuten.",
  live: "Live. Ihre Änderung ist auf der Seite.",
  // "fehler" wird nicht hier angesagt: die Fehlerzeile hat role="alert" (sonst würde es doppelt vorgelesen)
  zeitlimit: "Der Stand der Veröffentlichung ist noch unklar.",
  unbekannt: "Gespeichert. Der Stand der Veröffentlichung ist nicht sichtbar.",
};

export function starteLeiste(el) {
  let letzteSig = "";
  let letztePhase = "ruhig";
  const messeHoehen = beobachteHoehen(el);

  // "Live" nach etwa zehn Sekunden ausblenden, außer die Leiste wird gerade benutzt (Maus darüber oder Fokus darin)
  const planeLive = (v) => {
    const schluessel = `${v.sha}|${v.art}`;
    if (liveFuer === schluessel) return;
    liveFuer = schluessel;
    clearTimeout(liveTimer);
    const pruefe = () => {
      if (S.ver.phase !== "live") return;
      if (el.matches(":hover") || el.contains(document.activeElement)) { liveTimer = setTimeout(pruefe, LIVE_NACHFRIST_MS); return; }
      ruheStatus();
    };
    liveTimer = setTimeout(pruefe, LIVE_SICHTBAR_MS);
  };
  const vergissLive = () => { clearTimeout(liveTimer); liveTimer = null; liveFuer = ""; };
  const zeichne = () => {
    const n = zaehleAlle();
    const v = S.ver;
    const sig = [n, v.phase, v.sha, v.art, v.lauf && v.lauf.status, v.meldung, S.beschaeftigt].join("|");
    if (sig === letzteSig) return;
    letzteSig = sig;
    if (v.phase !== letztePhase) {
      letztePhase = v.phase;
      if (ANSAGE[v.phase]) ansage(ANSAGE[v.phase]);
    }
    // Der Fokus darf beim Neuaufbau nie auf <body> fallen: gleicher Knopf, sonst die Statuszeile, sonst die Überschrift der Ansicht
    const hatteFokus = el.contains(document.activeElement);
    const fokusId = hatteFokus ? document.activeElement.getAttribute("data-id") : null;
    clearInterval(uhr);
    uhr = null;
    leere(el);
    const zeilen = [];

    // ---- Status der Veröffentlichung
    if (v.phase === "live") planeLive(v); else vergissLive();
    if (v.phase !== "ruhig") {
      const art = v.art === "rueckgaengig" ? "zurückgenommen" : "veröffentlicht";
      let zeile = null;
      if (v.phase === "speichern") {
        zeile = statusZeile("laeuft", "Änderungen werden gespeichert …");
      } else if (v.phase === "beobachten") {
        const zeit = h("span", { class: "leiste-zeit", "aria-hidden": "true" }, minuten(Date.now() - v.seit));
        uhr = setInterval(() => { zeit.textContent = minuten(Date.now() - v.seit); }, 1000);
        const warte = v.lauf ? (v.lauf.status === "queued" ? "Die Veröffentlichung wartet auf ihren Start." : "Die Seite wird gerade neu aufgebaut.") : "Die Veröffentlichung wird gestartet.";
        zeile = statusZeile("laeuft", v.art === "rueckgaengig" ? "Wird zurückgenommen …" : "Wird veröffentlicht …", `${warte} Das dauert meist ein bis zwei Minuten. `, zeit,
          h("button", { type: "button", class: "knopf knopf-klein knopf-leise", "data-id": "ruhe", onclick: () => { beendeBeobachtung(); ruheStatus(); } }, "Nicht mehr beobachten"));
      } else if (v.phase === "live") {
        const url = sichereUrl(S.konfig.seiteUrl);
        zeile = statusZeile("ok", "Live", v.art === "rueckgaengig" ? "Der frühere Stand ist wieder online." : "Ihre Änderung ist auf der Seite.", null,
          url ? h("a", { class: "knopf knopf-klein", href: url, target: "_blank", rel: "noopener noreferrer" }, "Seite ansehen", icon("extern")) : null,
          h("button", { type: "button", class: "knopf knopf-klein knopf-leise", "data-id": "ruhe", onclick: ruheStatus }, "Schließen"));
      } else if (v.phase === "fehler") {
        const protokoll = v.lauf && sichereUrl(v.lauf.url);
        zeile = statusZeile("fehler", "Fehler: Die Änderung wurde NICHT veröffentlicht",
          "Die Seite ist unverändert. „Rückgängig“ nimmt die Änderung zurück, Ihre Eingaben bleiben als Entwurf.", null,
          h("button", { type: "button", class: "knopf knopf-haupt", "data-id": "rueckgaengig", ...gesperrt(S.beschaeftigt), onclick: () => { if (!S.beschaeftigt) rueckgaengigNachFehler(); } }, "Rückgängig"),
          protokoll ? h("a", { class: "knopf knopf-klein knopf-leise", href: protokoll, target: "_blank", rel: "noopener noreferrer", "aria-label": "Details anzeigen (öffnet sich bei GitHub in einem neuen Tab)" }, "Details anzeigen", icon("extern")) : null,
          h("button", { type: "button", class: "knopf knopf-klein knopf-leise", "data-id": "ruhe", onclick: ruheStatus }, "Schließen"));
      } else if (v.phase === "zeitlimit") {
        zeile = statusZeile("warn", "Der Stand ist noch unklar",
          (v.meldung || "Nach zehn Minuten gibt es noch kein Ergebnis.") + " Die Änderung ist gespeichert. Bitte später die Seite prüfen.", null,
          h("button", { type: "button", class: "knopf knopf-klein", onclick: () => beobachte(v.sha, v.art) }, "Weiter beobachten"),
          h("button", { type: "button", class: "knopf knopf-klein knopf-leise", "data-id": "ruhe", onclick: ruheStatus }, "Schließen"));
      } else if (v.phase === "unbekannt") {
        zeile = statusZeile("warn", `Gespeichert, aber der Stand ist nicht sichtbar`,
          v.meldung || `Die Änderung wurde ${art}. Mit diesem Schlüssel lässt sich nicht sehen, ob die Seite schon fertig ist (es fehlt die Berechtigung „Actions: Read-only“).`, null,
          h("button", { type: "button", class: "knopf knopf-klein knopf-leise", "data-id": "ruhe", onclick: ruheStatus }, "Schließen"));
      }
      if (zeile) zeilen.push(zeile);
    }

    // ---- Änderungen
    if (n > 0) {
      const text = n === 1 ? "1 ungespeicherte Änderung" : `${n} ungespeicherte Änderungen`;
      zeilen.push(h("div", { class: "leiste-zeile leiste-aktion" },
        h("p", { class: "leiste-status", id: "leiste-anzahl", tabindex: "-1", "data-status": "1" }, text),
        h("div", { class: "leiste-knoepfe" },
          h("button", { type: "button", class: "knopf knopf-leise", "data-id": "verwerfen", ...gesperrt(S.beschaeftigt), onclick: () => { if (!S.beschaeftigt) verwerfeMitRueckfrage(); } }, "Verwerfen"),
          h("button", { type: "button", class: "knopf knopf-haupt", "data-id": "veroeffentlichen", ...gesperrt(S.beschaeftigt || S.ver.phase === "speichern"), onclick: () => { if (!S.beschaeftigt && S.ver.phase !== "speichern") veroeffentlichen(); } }, "Veröffentlichen"))));
    }

    el.hidden = zeilen.length === 0;
    document.body.classList.toggle("mit-leiste", zeilen.length > 0);
    if (zeilen.length) el.append(h("div", { class: "leiste-innen" }, ...zeilen));
    if (hatteFokus) {
      const ziel = (fokusId && el.querySelector(`[data-id="${fokusId}"]`)) || el.querySelector("[data-status]");
      if (ziel && !el.hidden) ziel.focus(); else fokussiere(document.getElementById("titel"));
    }
    messeHoehen();
  };

  auf("aenderung", zeichne);
  auf("status", zeichne);
  zeichne();
  return zeichne;
}

/** Gesperrte Knöpfe bleiben fokussierbar (aria-disabled statt disabled), damit der Fokus beim Speichern nicht verloren geht. */
const gesperrt = (an) => (an ? { "aria-disabled": "true" } : {});

function statusZeile(art, titel, text, extra, ...knoepfe) {
  return h("div", { class: `leiste-zeile leiste-${art}`, role: art === "fehler" ? "alert" : null },
    h("div", { class: "leiste-text" },
      h("p", { class: "leiste-status", tabindex: "-1", "data-status": "1" },
        art === "laeuft" ? h("span", { class: "dreher", "aria-hidden": "true" }) : art === "ok" ? icon("haken") : icon("warnung"), titel, extra ? " " : null, extra),
      text ? h("p", { class: "leiste-detail" }, text) : null),
    knoepfe.filter(Boolean).length ? h("div", { class: "leiste-knoepfe" }, ...knoepfe) : null);
}
