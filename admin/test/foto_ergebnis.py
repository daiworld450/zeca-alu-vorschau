#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
foto_ergebnis.py – baut die Seite aus dem Stand, den die Verwaltung (Browser-Test) im Mock-GitHub hinterlassen hat, und prüft,
dass das hochgeladene Foto auf der Seite richtig ankommt: srcset mit allen Größen, width/height aus der Datei, Alt-Text.

Voraussetzung: Mock läuft und der Browser-Test (admin/test/browser_foto_test.js, phase1 + phase2) wurde ausgeführt.
Aufruf:  python3 admin/test/foto_ergebnis.py [--mock http://127.0.0.1:8791] [--seite referenzen] [--behalten]
Arbeitet nur in einem temporären Ordner. Ende-Code 0 = alles in Ordnung.
"""
import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import urllib.parse
import urllib.request

QUELLE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ERG = {"ok": 0, "fehler": 0}


def pruefe(b, text):
    if b:
        ERG["ok"] += 1
    else:
        ERG["fehler"] += 1
        print("   FEHLER: " + text)


def hole(url):
    with urllib.request.urlopen(url, timeout=20) as r:
        return r.read()


def webp_masse(daten):
    art = daten[12:16]
    if art == b"VP8 ":
        return int.from_bytes(daten[26:28], "little") & 0x3FFF, int.from_bytes(daten[28:30], "little") & 0x3FFF
    if art == b"VP8L":
        bits = int.from_bytes(daten[21:25], "little")
        return (bits & 0x3FFF) + 1, ((bits >> 14) & 0x3FFF) + 1
    return int.from_bytes(daten[24:27], "little") + 1, int.from_bytes(daten[27:30], "little") + 1


def jpeg_masse(daten):
    """Breite, Höhe aus dem JPEG-Kopf (Rahmenkopf SOF)."""
    i = 2
    while i + 9 <= len(daten):
        if daten[i] != 0xFF:
            break
        m = daten[i + 1]
        if m == 0xFF:
            i += 1
            continue
        if m in (0xD8, 0x01) or 0xD0 <= m <= 0xD7:
            i += 2
            continue
        if 0xC0 <= m <= 0xCF and m not in (0xC4, 0xC8, 0xCC):
            return int.from_bytes(daten[i + 7:i + 9], "big"), int.from_bytes(daten[i + 5:i + 7], "big")
        i += 2 + int.from_bytes(daten[i + 2:i + 4], "big")
    raise ValueError("kein JPEG-Rahmenkopf")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--mock", default="http://127.0.0.1:8791")
    ap.add_argument("--seite", default="referenzen")
    ap.add_argument("--behalten", action="store_true")
    a = ap.parse_args()

    stand = json.loads(hole(a.mock + "/__test/stand"))
    tmp = tempfile.mkdtemp(prefix="zeca-foto-ergebnis-")
    try:
        for datei in ("bauen.py", "favicon.svg"):
            shutil.copy(os.path.join(QUELLE, datei), tmp)
        for ordner in ("assets", "vorlagen", "admin"):
            shutil.copytree(os.path.join(QUELLE, ordner), os.path.join(tmp, ordner), ignore=shutil.ignore_patterns("test", "__pycache__"))
        n = 0
        for pfad in stand["dateien"]:
            if pfad.startswith(("inhalt/", "images/")):
                ziel = os.path.join(tmp, pfad)
                os.makedirs(os.path.dirname(ziel), exist_ok=True)
                with open(ziel, "wb") as f:
                    f.write(hole(a.mock + "/__test/datei?pfad=" + urllib.parse.quote(pfad)))
                n += 1
        print("Stand %s: %d Dateien aus dem Mock geholt" % (stand["kopf"][:8], n))

        r = subprocess.run([sys.executable, "bauen.py"], cwd=tmp, capture_output=True, text=True)
        pruefe(r.returncode == 0, "bauen.py auf dem Stand der Verwaltung ist fehlgeschlagen:\n" + r.stdout + r.stderr)
        if r.returncode != 0:
            return 1

        bilder = json.load(open(os.path.join(tmp, "inhalt", "bilder.json"), encoding="utf-8"))
        original = json.load(open(os.path.join(QUELLE, "inhalt", "bilder.json"), encoding="utf-8"))
        alt_namen = {b["name"] for b in original["bilder"]}
        neu = [b for b in bilder["bilder"] if b["name"] not in alt_namen]
        pruefe(len(neu) >= 1, "bilder.json enthält kein neues Foto")
        seite = open(os.path.join(tmp, "_site", a.seite, "index.html"), encoding="utf-8").read()
        endung = lambda b: "jpg" if b.get("format") == "jpg" else "webp"      # Feld "format" der Bildliste (fehlt = WebP)
        benutzt = [b for b in neu if re.search(r'<img [^>]*src="[^"]*/%s-\d+\.%s"' % (re.escape(b["name"]), endung(b)), seite)]
        pruefe(len(benutzt) >= 1, "kein neues Foto steht auf der Seite %s" % a.seite)
        for b in benutzt:
            name, ext = b["name"], endung(b)
            tag = re.search(r'<img [^>]*src="[^"]*/%s-\d+\.%s"[^>]*>' % (re.escape(name), ext), seite).group(0)
            dateien = {int(m.group(1)): m.group(0) for p in os.listdir(os.path.join(tmp, "images", "bestand"))
                       for m in [re.match(r"^%s-(\d+)\.%s$" % (re.escape(name), ext), p)] if m}
            breiten = sorted(dateien)
            srcset = re.search(r'srcset="([^"]*)"', tag).group(1)
            gefunden = [(int(w), int(x)) for w, x in re.findall(r"/%s-(\d+)\.%s (\d+)w" % (re.escape(name), ext), srcset)]
            pruefe([w for w, _ in gefunden] == breiten and all(w == x for w, x in gefunden),
                   "%s: srcset %r passt nicht zu den Dateien %s" % (name, srcset, breiten))
            std = 1600 if 1600 in breiten else breiten[-1]
            roh = open(os.path.join(tmp, "images", "bestand", "%s-%d.%s" % (name, std, ext)), "rb").read()
            if ext == "jpg":
                pruefe(roh[:3] == b"\xff\xd8\xff" and b"Exif" not in roh[:2000], "%s: keine echte JPEG-Datei oder Aufnahmedaten (EXIF) enthalten" % name)
            mb, mh = jpeg_masse(roh) if ext == "jpg" else webp_masse(roh)
            pruefe('width="%d" height="%d"' % (mb, mh) in tag, "%s: width/height %dx%d fehlen im Tag: %s" % (name, mb, mh, tag))
            pruefe('src="/images/bestand/%s-%d.%s"' % (name, std, ext) in tag, "%s: src ist nicht die Größe %d" % (name, std))
            pruefe((".webp" not in srcset) if ext == "jpg" else (".jpg" not in srcset), "%s: srcset mischt die Formate: %s" % (name, srcset))
            pruefe(re.search(r'alt="([^"]+)"', tag) is not None and ('alt="%s"' % b["alt"]) in tag,
                   "%s: Alt-Text %r fehlt im Tag: %s" % (name, b["alt"], tag))
            pruefe('loading="lazy"' in tag or 'loading="eager"' in tag, "%s: loading fehlt" % name)
            print("   %s (%s): %d Größen %s, src %d, %dx%d, Alt „%s“" % (name, ext, len(breiten), breiten, std, mb, mh, b["alt"]))
            if len(breiten) == 3:
                pruefe(breiten == [800, 1600, 2048], "%s: erwartet 800/1600/2048, vorhanden %s" % (name, breiten))
        # Die Seite insgesamt darf sich sonst nicht verändert haben: Texte anderer Seiten unverändert, keine Fehlverweise
        pruefe("undefined" not in seite and "None" not in seite, "Platzhalter wie undefined/None auf der Seite")
        pruefe(os.path.isfile(os.path.join(tmp, "_site", "index.html")) and not os.path.exists(os.path.join(tmp, "_site", "admin", "test")), "Gesamtseite fehlt oder test/ ausgeliefert")
    finally:
        if a.behalten:
            print("Temporärer Ordner: " + tmp)
        else:
            shutil.rmtree(tmp, ignore_errors=True)
    print("Einzelprüfungen ok: %d, Fehler: %d" % (ERG["ok"], ERG["fehler"]))
    return 0 if ERG["fehler"] == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
