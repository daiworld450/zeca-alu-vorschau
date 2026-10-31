// Messungen für den Browser-Test (wird im Test per import() geladen, gehört nicht zur ausgelieferten Seite):
// Textkontrast (WCAG: 4,5:1, große Schrift 3:1), Touch-Ziele (mind. 44 x 44 px), waagerechter Überlauf.

const lum = ([r, g, b]) => {
  const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const farbe = (c) => {
  const m = c.match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
  return { rgb: p.slice(0, 3), a: p.length > 3 ? p[3] : 1 };
};
function hintergrund(el) {
  const schichten = [];
  for (let e = el; e; e = e.parentElement) {
    const c = farbe(getComputedStyle(e).backgroundColor);
    if (c && c.a > 0) { schichten.push(c); if (c.a >= 1) break; }
  }
  let basis = [255, 255, 255];
  for (const l of schichten.reverse()) basis = basis.map((v, i) => Math.round(l.rgb[i] * l.a + v * (1 - l.a)));
  return basis;
}
const verhaeltnis = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
function sichtbar(el) {
  const r = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none" && !el.closest("[hidden]")
    && !el.closest("details:not([open]) > :not(summary)");
}

export function pruefe(wurzel = document.body) {
  const aus = { geprueftTexte: 0, geprueftZiele: 0, kontrast: [], ziele: [], ueberlauf: document.documentElement.scrollWidth > innerWidth + 1, kleinsterKontrast: 99 };
  const walker = document.createTreeWalker(wurzel, NodeFilter.SHOW_TEXT);
  const gesehen = new Set();
  while (walker.nextNode()) {
    const n = walker.currentNode;
    if (!n.textContent.trim()) continue;
    const el = n.parentElement;
    if (gesehen.has(el) || !sichtbar(el) || el.closest("[disabled]")) continue;
    gesehen.add(el);
    const cs = getComputedStyle(el);
    const fg = farbe(cs.color);
    if (!fg) continue;
    const bg = hintergrund(el);
    const f = fg.a < 1 ? fg.rgb.map((v, i) => Math.round(v * fg.a + bg[i] * (1 - fg.a))) : fg.rgb;
    const size = parseFloat(cs.fontSize);
    const gross = size >= 24 || (size >= 18.66 && parseInt(cs.fontWeight, 10) >= 700);
    const r = verhaeltnis(f, bg);
    aus.geprueftTexte++;
    aus.kleinsterKontrast = Math.min(aus.kleinsterKontrast, +r.toFixed(2));
    if (r < (gross ? 3 : 4.5)) aus.kontrast.push(`${el.tagName}.${el.className} "${n.textContent.trim().slice(0, 30)}" ${r.toFixed(2)}`);
  }
  for (const el of wurzel.querySelectorAll("button, a[href], input:not([type=hidden]), select, textarea, summary, label.schalter")) {
    if (!sichtbar(el)) continue;
    if (el.closest(".schritte") && el.tagName === "A") continue; // Link mitten im Fließtext
    if (el.type === "checkbox" || el.type === "radio") continue; // liegt in einem mindestens 48 px hohen Beschriftungsfeld
    if (el.classList.contains("datei-eingabe")) continue; // unsichtbares Datei-Feld im großen Knopf (das Beschriftungsfeld ist das Ziel)
    const r = el.getBoundingClientRect();
    aus.geprueftZiele++;
    if (Math.round(r.height) < 44 || Math.round(r.width) < 44)
      aus.ziele.push(`${el.tagName}.${el.className} ${Math.round(r.width)}x${Math.round(r.height)} "${(el.getAttribute("aria-label") || el.textContent).trim().slice(0, 24)}"`);
  }
  return aus;
}
