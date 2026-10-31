#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
pruefen_gleich.py – vergleicht die generierte Seite (_site/) mit den
handgeschriebenen Originalseiten (referenz-original/).

Verglichen wird NICHT Zeichen für Zeichen, sondern der DOM-Baum:
  - Tag-Struktur (Reihenfolge, Verschachtelung)
  - Attribute (Reihenfolge egal, class-Reihenfolge egal)
  - Text (Whitespace zusammengefasst)
  - JSON-LD (als JSON verglichen)
Zusätzlich: robots.txt, sitemap.xml und die statischen Dateien (assets/, images/,
favicon.svg) müssen identisch sein.

Dokumentierte, harmlose Abweichungen (werden mit "Hinweis:" gemeldet, zählen
nicht als Abweichung):
  - HTML-Kommentare
  - Reihenfolge der Städte in "areaServed" der Startseiten-JSON-LD
    (eine Liste für alle Seiten statt zwei unterschiedlich sortierter)
  - robots.txt: zusätzliche Zeile "Disallow: .../admin/" (Verwaltungsseite)
  - Kopf (<head>): <meta http-equiv="Content-Security-Policy" ...> (strenge Inhalts-Sicherheitsrichtlinie, im Original nicht
    vorhanden). Sie muss auf JEDER generierten Seite genau einmal stehen (fehlt sie, zählt das als Abweichung); für den
    Vergleich wird sie aus dem Baum genommen, alles andere im Kopf muss gleich sein.
Der Ordner admin/ (Verwaltungsseite) gehört nicht zu den Original-Seiten und wird nicht verglichen.

Aufruf:  python3 pruefen_gleich.py [--site _site] [--original referenz-original]
Ende-Code 0 = keine Abweichung, 1 = Abweichungen.
"""
import argparse
import json
import os
import sys
from html.parser import HTMLParser

# Elemente ohne Inhalt
LEER = {"meta", "link", "img", "br", "input", "hr", "source", "area", "base",
        "col", "embed", "param", "track", "wbr"}

# Elemente, die im Layout "Block" sind: Whitespace an ihren Rändern ist egal
BLOCK = {"html", "head", "body", "header", "footer", "main", "section", "nav",
         "div", "ul", "ol", "li", "dl", "dt", "dd", "p", "h1", "h2", "h3", "h4",
         "h5", "h6", "figure", "figcaption", "details", "summary", "form",
         "select", "option", "table", "tbody", "thead", "tr", "td", "th",
         "fieldset", "script", "style", "title", "textarea", "meta", "link",
         "button"}

# Container, in denen reiner Whitespace nie Bedeutung hat
OHNE_TEXT = {"html", "head", "ul", "ol", "dl", "select", "table", "tbody",
             "thead", "tr", "defs", "svg", "g", "pattern", "body"}


class Knoten:
    def __init__(self, tag, attrs):
        self.tag = tag
        self.attrs = attrs
        self.kinder = []  # Knoten oder str

    def beschreibung(self):
        s = self.tag
        if "id" in self.attrs:
            s += "#" + self.attrs["id"]
        if "class" in self.attrs:
            s += "." + ".".join(self.attrs["class"].split())
        return s


class Baumbauer(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.wurzel = Knoten("#wurzel", {})
        self.stapel = [self.wurzel]
        self.kommentare = 0

    def handle_starttag(self, tag, attrs):
        k = Knoten(tag, {n: (v if v is not None else "") for n, v in attrs})
        self.stapel[-1].kinder.append(k)
        if tag not in LEER:
            self.stapel.append(k)

    def handle_startendtag(self, tag, attrs):
        # <path .../> : Start und Ende in einem
        k = Knoten(tag, {n: (v if v is not None else "") for n, v in attrs})
        self.stapel[-1].kinder.append(k)

    def handle_endtag(self, tag):
        if tag in LEER:
            return
        # bis zum passenden öffnenden Tag zurück
        for i in range(len(self.stapel) - 1, 0, -1):
            if self.stapel[i].tag == tag:
                del self.stapel[i:]
                return

    def handle_data(self, data):
        self.stapel[-1].kinder.append(data)

    def handle_comment(self, data):
        self.kommentare += 1

    def handle_decl(self, decl):
        pass


def nimm_csp_meta_heraus(wurzel):
    """Entfernt <meta http-equiv="Content-Security-Policy"> aus <head> und gibt zurück, wie viele es waren."""
    n = 0
    for html_knoten in [k for k in wurzel.kinder if isinstance(k, Knoten) and k.tag == "html"]:
        for kopf in [k for k in html_knoten.kinder if isinstance(k, Knoten) and k.tag == "head"]:
            for k in list(kopf.kinder):
                if isinstance(k, Knoten) and k.tag == "meta" and k.attrs.get("http-equiv", "").lower() == "content-security-policy":
                    kopf.kinder.remove(k)
                    n += 1
    return n


def parse(text):
    b = Baumbauer()
    b.feed(text)
    b.close()
    return b.wurzel, b.kommentare


def ist_block(k):
    return isinstance(k, Knoten) and k.tag in BLOCK


def normalisiere(knoten):
    """Whitespace so vereinheitlichen, wie ihn ein Browser sichtbar macht."""
    inhalt_text = knoten.tag in ("text", "script", "style", "title", "textarea")
    neu = []
    for k in knoten.kinder:
        if isinstance(k, str):
            if knoten.tag in ("script", "style"):
                neu.append(k)
            else:
                neu.append(" ".join(k.split()) if k.strip() else " ")
        else:
            normalisiere(k)
            neu.append(k)
    # benachbarte Texte verschmelzen
    verschmolzen = []
    for k in neu:
        if isinstance(k, str) and verschmolzen and isinstance(verschmolzen[-1], str):
            verschmolzen[-1] += k
        else:
            verschmolzen.append(k)
    if knoten.tag in ("script", "style"):
        knoten.kinder = verschmolzen
        return
    # Text-Knoten mehrfach-Leerzeichen erneut zusammenfassen
    verschmolzen = [(" ".join(k.split()) + (" " if k.endswith(" ") and k.strip() else "")
                     if isinstance(k, str) and k.strip() else k)
                    for k in verschmolzen]
    # Whitespace-Randbehandlung
    ergebnis = []
    n = len(verschmolzen)
    for i, k in enumerate(verschmolzen):
        if isinstance(k, str):
            vorher = verschmolzen[i - 1] if i > 0 else None
            nachher = verschmolzen[i + 1] if i < n - 1 else None
            text = k
            if knoten.tag in OHNE_TEXT and not text.strip():
                continue
            if knoten.tag in ("svg", "g", "defs", "pattern") and not text.strip():
                continue
            blockrand_links = (vorher is None and knoten.tag in BLOCK) or ist_block(vorher)
            blockrand_rechts = (nachher is None and knoten.tag in BLOCK) or ist_block(nachher)
            if blockrand_links:
                text = text.lstrip()
            if blockrand_rechts:
                text = text.rstrip()
            if not inhalt_text and not text.strip() and (blockrand_links or blockrand_rechts):
                continue
            if text == "":
                continue
            ergebnis.append(text)
        else:
            ergebnis.append(k)
    knoten.kinder = ergebnis


def attribute_norm(k):
    a = dict(k.attrs)
    if "class" in a:
        a["class"] = " ".join(sorted(a["class"].split()))
    if "style" in a:
        teile = [t.strip() for t in a["style"].split(";") if t.strip()]
        teile = [":".join(p.strip() for p in t.split(":", 1)) for t in teile]
        a["style"] = ";".join(teile)
    return a


def jsonld_norm(obj):
    """areaServed-Listen als Menge behandeln (Reihenfolge ist für Suchmaschinen egal)."""
    if isinstance(obj, dict):
        neu = {}
        for key, v in obj.items():
            if key == "areaServed" and isinstance(v, list):
                neu[key] = sorted(v)
            else:
                neu[key] = jsonld_norm(v)
        return neu
    if isinstance(obj, list):
        return [jsonld_norm(x) for x in obj]
    return obj


HINWEISE = []  # harmlose Abweichungen, die nur angezeigt werden


def vergleiche(a, b, pfad, meldungen):
    """Vergleicht zwei normalisierte Knoten rekursiv."""
    if a.tag != b.tag:
        meldungen.append("%s: Tag %s <-> %s" % (pfad, a.tag, b.tag))
        return
    aa, ab = attribute_norm(a), attribute_norm(b)
    if aa != ab:
        for key in sorted(set(aa) | set(ab)):
            if aa.get(key) != ab.get(key):
                meldungen.append("%s: Attribut %s: Original=%r, neu=%r"
                                 % (pfad, key, aa.get(key), ab.get(key)))
    if a.tag == "script" and a.attrs.get("type") == "application/ld+json":
        ta = "".join(k for k in a.kinder if isinstance(k, str))
        tb = "".join(k for k in b.kinder if isinstance(k, str))
        try:
            roh_a, roh_b = json.loads(ta), json.loads(tb)
            ja, jb = jsonld_norm(roh_a), jsonld_norm(roh_b)
        except ValueError as e:
            meldungen.append("%s: JSON-LD nicht lesbar (%s)" % (pfad, e))
            return
        if ja == jb and roh_a != roh_b:
            HINWEISE.append("%s: JSON-LD areaServed in anderer Reihenfolge (Inhalt gleich)" % pfad)
        if ja != jb:
            meldungen.append("%s: JSON-LD unterschiedlich\n      Original: %s\n      neu:      %s"
                             % (pfad, json.dumps(ja, ensure_ascii=False)[:600],
                                json.dumps(jb, ensure_ascii=False)[:600]))
        return
    ka, kb = a.kinder, b.kinder
    # Start der Kinderliste: erster Unterschied zählt, danach Abbruch (keine Kaskade)
    for i in range(max(len(ka), len(kb))):
        if i >= len(ka):
            meldungen.append("%s: im Original fehlt: %s" % (pfad, kurz(kb[i])))
            return
        if i >= len(kb):
            meldungen.append("%s: in neu fehlt: %s" % (pfad, kurz(ka[i])))
            return
        x, y = ka[i], kb[i]
        if isinstance(x, str) or isinstance(y, str):
            if x != y:
                meldungen.append("%s: Text Original=%r, neu=%r" % (pfad, kurz(x), kurz(y)))
                return
            continue
        vergleiche(x, y, "%s > %s" % (pfad, x.beschreibung()), meldungen)
        if x.tag != y.tag:
            return


def kurz(x, n=90):
    if isinstance(x, str):
        s = x
    else:
        s = "<" + x.beschreibung() + ">"
    return s if len(s) <= n else s[:n] + "..."


def seiten_in(ordner):
    gefunden = []
    for wurzel, _dirs, dateien in os.walk(ordner):
        if wurzel == ordner and "admin" in _dirs:
            _dirs.remove("admin")   # Verwaltungsseite (kein Original-Inhalt) wird nicht verglichen
        for d in dateien:
            if d == "index.html":
                gefunden.append(os.path.relpath(os.path.join(wurzel, d), ordner))
    return sorted(gefunden)


def lies(pfad):
    with open(pfad, encoding="utf-8") as f:
        return f.read()


def dateien_in(ordner):
    out = set()
    for wurzel, _d, fs in os.walk(ordner):
        for f in fs:
            out.add(os.path.relpath(os.path.join(wurzel, f), ordner))
    return out


def ohne_admin_sperre(text):
    """robots.txt ohne die Zeile für die Verwaltungsseite (Disallow: .../admin/), die es im Original nicht gab."""
    return "".join(z for z in text.splitlines(True) if not (z.startswith("Disallow:") and z.strip().endswith("admin/")))


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--site", default="_site")
    p.add_argument("--original", default="referenz-original")
    args = p.parse_args()
    hier = os.path.dirname(os.path.abspath(__file__))
    site = args.site if os.path.isabs(args.site) else os.path.join(hier, args.site)
    orig = args.original if os.path.isabs(args.original) else os.path.join(hier, args.original)

    if not os.path.isdir(site):
        print("FEHLER: %s existiert nicht. Erst 'python3 bauen.py' ausführen." % site)
        return 1

    abweichungen = 0
    hinweise = 0
    csp_seiten = 0
    seiten_orig = seiten_in(orig)
    seiten_neu = seiten_in(site)

    for s in sorted(set(seiten_orig) | set(seiten_neu)):
        if s not in seiten_neu:
            print("ABWEICHUNG %s: Seite fehlt in _site" % s)
            abweichungen += 1
            continue
        if s not in seiten_orig:
            print("ABWEICHUNG %s: Seite ist neu (kein Original)" % s)
            abweichungen += 1
            continue
        ba, ka = parse(lies(os.path.join(orig, s)))
        bb, kb = parse(lies(os.path.join(site, s)))
        if nimm_csp_meta_heraus(ba):
            print("ABWEICHUNG %s: Das Original enthält eine Content-Security-Policy (Vergleichsbasis geändert?)" % s)
            abweichungen += 1
        n_csp = nimm_csp_meta_heraus(bb)
        if n_csp != 1:
            print("ABWEICHUNG %s: %d Content-Security-Policy-Angaben im Kopf (erwartet: genau 1)" % (s, n_csp))
            abweichungen += 1
        else:
            csp_seiten += 1
        normalisiere(ba)
        normalisiere(bb)
        meldungen = []
        vergleiche(ba, bb, "#", meldungen)
        if ka != kb:
            print("Hinweis: %s: HTML-Kommentare Original=%d, neu=%d" % (s, ka, kb))
            hinweise += 1
        for h in HINWEISE:
            print("Hinweis: %s %s" % (s, h.split(": ", 1)[1]))
            hinweise += 1
        del HINWEISE[:]
        if meldungen:
            print("ABWEICHUNG %s (%d):" % (s, len(meldungen)))
            for m in meldungen:
                print("   - " + m)
            abweichungen += len(meldungen)
        else:
            print("gleich     %s" % s)

    if csp_seiten:
        print("Hinweis: %d Seiten tragen zusätzlich eine Content-Security-Policy als <meta> im Kopf (im Original nicht vorhanden, sonst gleich)" % csp_seiten)
        hinweise += 1

    # Textdateien: robots.txt, sitemap.xml
    for name in ("robots.txt", "sitemap.xml"):
        po, pn = os.path.join(orig, name), os.path.join(site, name)
        if not os.path.exists(pn):
            print("ABWEICHUNG %s fehlt in _site" % name)
            abweichungen += 1
        elif ohne_admin_sperre(lies(pn)).strip() != lies(po).strip():
            print("ABWEICHUNG %s weicht ab" % name)
            abweichungen += 1
        else:
            print("gleich     %s" % name)
            if name == "robots.txt" and lies(pn).strip() != lies(po).strip():
                print("Hinweis: robots.txt sperrt zusätzlich /admin/ (Verwaltungsseite, gehört nicht zu den Original-Seiten)")
                hinweise += 1

    # Statische Dateien müssen byte-gleich sein (Design unverändert)
    quelle = hier
    statisch = ["favicon.svg"]
    for d in ("assets", "images"):
        for f in sorted(dateien_in(os.path.join(quelle, d))):
            # Bild-Metadaten (.webp.json), Notizen (.md) und .DS_Store werden nicht ausgeliefert
            if f.endswith((".webp.json", ".md")) or os.path.basename(f) == ".DS_Store":
                continue
            statisch.append(os.path.join(d, f))
    fehlend = verschieden = 0
    for f in statisch:
        pn = os.path.join(site, f)
        if not os.path.exists(pn):
            fehlend += 1
            print("ABWEICHUNG %s fehlt in _site" % f)
        else:
            with open(os.path.join(quelle, f), "rb") as a, open(pn, "rb") as b:
                if a.read() != b.read():
                    verschieden += 1
                    print("ABWEICHUNG %s ist in _site nicht byte-gleich" % f)
    abweichungen += fehlend + verschieden
    if not fehlend and not verschieden:
        print("gleich     %d statische Dateien (assets/, images/, favicon.svg) byte-identisch" % len(statisch))

    print()
    print("Seiten verglichen: %d, Abweichungen: %d, Hinweise (harmlos): %d"
          % (len(seiten_orig), abweichungen, hinweise))
    return 0 if abweichungen == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
