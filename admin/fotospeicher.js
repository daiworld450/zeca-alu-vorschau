// fotospeicher.js – Zwischenspeicher für neu hochgeladene, noch nicht veröffentlichte Fotos (IndexedDB im Browser).
//
// Der Entwurf der Texte liegt im localStorage (entwurf.js). Fotos sind dafür zu groß, sie liegen hier als Blobs.
// Bleibt der Speicher gesperrt (privates Fenster), arbeitet die Verwaltung weiter, nur ein Neuladen der Seite verliert dann die
// noch nicht veröffentlichten Fotos (die Fotos-Ansicht zeigt solche Einträge als „Dateien fehlen“).
// Jeder Zugriff ist abgesichert und scheitert still.

const DB_NAME = "zeca-admin";
const STORE = "fotos";

let verbindung = null;

function oeffne() {
  if (verbindung) return verbindung;
  verbindung = new Promise((ok) => {
    try {
      if (typeof indexedDB === "undefined") return ok(null);
      const anfrage = indexedDB.open(DB_NAME, 1);
      anfrage.onupgradeneeded = () => { anfrage.result.createObjectStore(STORE, { keyPath: "name" }); };
      anfrage.onsuccess = () => ok(anfrage.result);
      anfrage.onerror = () => ok(null);
      anfrage.onblocked = () => ok(null);
    } catch (e) { ok(null); }
  });
  return verbindung;
}

async function lauf(modus, fn) {
  const db = await oeffne();
  if (!db) return null;
  return new Promise((ok) => {
    try {
      const t = db.transaction(STORE, modus);
      const erg = fn(t.objectStore(STORE));
      t.oncomplete = () => ok(erg && "result" in erg ? erg.result : true);
      t.onerror = t.onabort = () => ok(null);
    } catch (e) { ok(null); }
  });
}

/** eintrag: { name, format: "webp" | "jpg", varianten: [{ breite, hoehe, blob }] } */
export const speichereFoto = (eintrag) => lauf("readwrite", (s) => s.put({ name: eintrag.name, format: eintrag.format || "webp", varianten: eintrag.varianten }));
export const loescheFoto = (name) => lauf("readwrite", (s) => s.delete(name));
export const leereFotos = () => lauf("readwrite", (s) => s.clear());

/** Alle zwischengespeicherten Fotos als Liste (leer, wenn der Speicher nicht geht). */
export async function ladeFotos() {
  const liste = await lauf("readonly", (s) => s.getAll());
  return Array.isArray(liste) ? liste : [];
}
