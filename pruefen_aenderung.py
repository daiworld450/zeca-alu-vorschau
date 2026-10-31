#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
pruefen_aenderung.py – prüft automatisch, dass Änderungen in inhalt/seite.json
überall auf der Seite ankommen. Arbeitet nur an temporären Kopien des Projekts
(Ihre Dateien bleiben unverändert).

Tests:
  1. Telefonnummer ändern  -> alte Nummer darf NIRGENDS mehr vorkommen (13 Seiten,
     Kopfzeile, Handy-Menü, Fußzeile, Handy-Leiste, Kontaktblock, JSON-LD, Rechtstexte,
     Meta-Beschreibung, main.js), die neue Nummer muss an den festen Stellen stehen.
  2. E-Mail und Adresse ändern -> alte Werte weg (einzige gewollte Ausnahme: die
     Formular-Adresse des Kontaktformulars, die bewusst getrennt gepflegt wird).
  3. Vorschau-Modus (basis_pfad + noindex + andere Domain) -> alle internen Links und
     Dateien tragen den Basis-Pfad, Seiten sind gesperrt, robots.txt sperrt.
  4. Sicherungen: fehlende Pflichtfelder, unbekannte/fehlende Fotos, unerlaubte Links,
     zu lange Texte, kaputtes JSON -> bauen.py bricht mit deutscher Meldung ab und
     lässt die bisherige _site/ unangetastet.
  5. Wirkung: Jedes Feld aus inhalt/schema/*.json verändert nachweislich die fertige
     Seite (Texte erscheinen, Ja/Nein-Schalter, Fotos, Zahlen wirken). So gibt es keine
     toten Formularfelder.
  6. Verwaltungsseite: admin/ wird (nur bei admin.aktiv) mit konfig.json ausgeliefert, ohne test/, robots sperrt /admin/ immer.
  7. Fotos aus der Verwaltung: Der Generator nimmt nur die tatsächlich vorhandenen Größen (<name>-<Breite>.webp) ins
     srcset, auch wenn es nur eine oder eine ungewöhnliche Breite gibt (Foto kleiner als 800 px).
  8. Sicherheit des Generators (Sicherheitsreview): manipulierte Werte aus inhalt/ dürfen nie als Code auf der Seite landen
     (E-Mail, Domain, Rechtstexte, Formular-Adresse, Dateitypen, Pfade, Inhalts-Sicherheitsrichtlinie).
  9. Schutz des Branches "inhalt" (.github/skripte/pruefe_inhalt_branch.py) in einem temporären Git-Projekt: erlaubte und
     unerlaubte Änderungen (Pfade, Dateitypen, Symlinks, Entwickler-Dateien), main läuft weiter, Merge von main.

Aufruf:  python3 pruefen_aenderung.py [--behalten]
Ende-Code 0 = alles in Ordnung.
"""
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile

HIER = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HIER)
import pruefen_gleich as g  # noqa: E402  (HTML-Parser wiederverwenden)

ERGEBNIS = {"ok": 0, "fehler": 0}


def pruefe(bedingung, text):
    if bedingung:
        ERGEBNIS["ok"] += 1
    else:
        ERGEBNIS["fehler"] += 1
        print("   FEHLER: " + text)


def kopie_anlegen(wurzel, name):
    ziel = os.path.join(wurzel, name)
    ignorieren = shutil.ignore_patterns(".git", "_site", "referenz-original", "__pycache__", ".DS_Store")
    shutil.copytree(HIER, ziel, ignore=ignorieren)
    return ziel


def seite_json(ziel):
    pfad = os.path.join(ziel, "inhalt", "seite.json")
    with open(pfad, encoding="utf-8") as f:
        return pfad, json.load(f)


def speichere(pfad, daten):
    with open(pfad, "w", encoding="utf-8") as f:
        json.dump(daten, f, ensure_ascii=False, indent=2)
        f.write("\n")


def baue(ziel):
    r = subprocess.run([sys.executable, "bauen.py"], cwd=ziel, capture_output=True, text=True)
    if r.returncode != 0:
        print(r.stdout + r.stderr)
        raise SystemExit("bauen.py ist in der Kopie fehlgeschlagen.")
    return os.path.join(ziel, "_site")


def dateien(site, endungen=(".html", ".js", ".css", ".txt", ".xml", ".svg")):
    for wurzel, _d, fs in os.walk(site):
        for f in sorted(fs):
            if f.endswith(endungen):
                yield os.path.relpath(os.path.join(wurzel, f), site), os.path.join(wurzel, f)


def lies(pfad):
    with open(pfad, encoding="utf-8") as f:
        return f.read()


def alle(k, pred):
    out = []
    for c in k.kinder:
        if isinstance(c, g.Knoten):
            if pred(c):
                out.append(c)
            out.extend(alle(c, pred))
    return out


def text_von(k):
    return " ".join("".join(c if isinstance(c, str) else text_von(c) for c in k.kinder).split())


def hat_klasse(k, name):
    return name in k.attrs.get("class", "").split()


def seiten_baeume(site):
    out = {}
    for rel, pfad in dateien(site, (".html",)):
        if rel.startswith("admin" + os.sep):
            continue   # Verwaltungsseite hat nicht den Seitenaufbau der Webseite
        baum, _ = g.parse(lies(pfad))
        out[rel] = baum
    return out


def ohne_formularadresse(text):
    """Die Formular-Adresse (action=...) und der Betreff des Formulars sind bewusst getrennt gepflegte Werte."""
    text = re.sub(r'action="[^"]*"', 'action=""', text)
    return text


# ---------------------------------------------------------------------- Test 1
def test_telefon(wurzel):
    print("Test 1: Telefonnummer ändern")
    ziel = kopie_anlegen(wurzel, "t1")
    pfad, daten = seite_json(ziel)
    alt = daten["kontakt"]["telefone"][0]["anzeige"]
    zweite = daten["kontakt"]["telefone"][1]["anzeige"]
    zweite_tel = "+49" + re.sub(r"\D", "", zweite)[1:]
    alt_ziffern = re.sub(r"\D", "", alt)[1:]  # 17624860016
    # Vorher: Die alte Nummer muss tatsächlich überall vorkommen, sonst wäre der Test wertlos
    site0 = baue(ziel)
    seiten0 = [(r, p) for r, p in dateien(site0, (".html",)) if not r.startswith("admin" + os.sep)]
    pruefe(lies(os.path.join(site0, "CNAME")).strip() == "zeca-alu.de", "Live-Modus: CNAME fehlt oder falsch")
    for rel, p in seiten0:
        pruefe(alt in lies(p), "Vor der Änderung fehlt die Nummer %s auf %s (Test sinnlos)" % (alt, rel))

    neu = "0151 99887766"
    neu_tel = "+4915199887766"
    neu_schema = "+49-151-99887766"
    daten["kontakt"]["telefone"][0]["anzeige"] = neu
    speichere(pfad, daten)
    site = baue(ziel)

    n_seiten = 0
    for rel, p in dateien(site):
        text = lies(p)
        for verboten in (alt, alt_ziffern, "24860016"):
            pruefe(verboten not in text, "Alte Nummer \"%s\" kommt noch in %s vor" % (verboten, rel))
    # Feste Stellen auf jeder Seite
    for rel, baum in sorted(seiten_baeume(site).items()):
        n_seiten += 1
        a_alle = alle(baum, lambda k: k.tag == "a")
        nav = [a for a in a_alle if hat_klasse(a, "nav-phone")]
        pruefe(len(nav) == 1 and nav[0].attrs["href"] == "tel:" + neu_tel and text_von(nav[0]) == neu,
               "%s: Telefon in der Kopfzeile stimmt nicht" % rel)
        mob = [a for a in a_alle if hat_klasse(a, "mnav-cta")]
        pruefe(len(mob) == 1 and mob[0].attrs["href"] == "tel:" + neu_tel and text_von(mob[0]).startswith(neu),
               "%s: Telefon im Handy-Menü stimmt nicht" % rel)
        fuss = alle(baum, lambda k: k.tag == "footer")
        fa = [a for a in alle(fuss[0], lambda k: k.tag == "a") if a.attrs.get("href", "").startswith("tel:")]
        pruefe(len(fa) == 1 and fa[0].attrs["href"] == "tel:" + neu_tel and text_von(fa[0]) == neu,
               "%s: Telefon in der Fußzeile stimmt nicht" % rel)
        leiste = alle(baum, lambda k: hat_klasse(k, "mobile-bar"))
        la = [a for a in alle(leiste[0], lambda k: k.tag == "a") if a.attrs.get("href", "").startswith("tel:")]
        pruefe(len(la) == 1 and la[0].attrs["href"] == "tel:" + neu_tel, "%s: Telefon in der Handy-Leiste stimmt nicht" % rel)
        # irgendein tel:-Link muss auf neue oder zweite Nummer zeigen
        for a in a_alle:
            h = a.attrs.get("href", "")
            if h.startswith("tel:"):
                pruefe(h in ("tel:" + neu_tel, "tel:" + zweite_tel), "%s: unerwarteter tel-Link %s" % (rel, h))
        # JSON-LD
        for s in alle(baum, lambda k: k.tag == "script" and k.attrs.get("type") == "application/ld+json"):
            j = json.loads("".join(c for c in s.kinder if isinstance(c, str)))
            tel = j.get("telephone") or (j.get("provider") or {}).get("telephone")
            if j.get("@type") != "BreadcrumbList":
                pruefe(tel == neu_schema, "%s: JSON-LD-Telefon ist %r statt %s" % (rel, tel, neu_schema))
    # Sonderstellen
    kontakt = lies(os.path.join(site, "kontakt", "index.html"))
    pruefe('content="Kostenlose Beratung anfordern: ZeCa-Alu in Mülheim an der Ruhr, Telefon %s,' % neu in kontakt,
           "Meta-Beschreibung der Kontaktseite trägt die neue Nummer nicht")
    kdaten = re.findall(r'<div class="row"><svg[^>]*>.*?</svg><div><h3>Telefon</h3>(.*?)</div></div>', kontakt, re.S)
    pruefe(len(kdaten) == 1 and 'href="tel:%s">%s</a>' % (neu_tel, neu) in kdaten[0]
           and zweite in kdaten[0], "Kontaktblock zeigt nicht beide Nummern (neu + zweite)")
    for rel in ("impressum", "datenschutz"):
        t = lies(os.path.join(site, rel, "index.html"))
        pruefe('<a href="tel:%s">%s</a>' % (neu_tel, neu) in t, "%s: Rechtstext hat die neue Nummer nicht" % rel)
    js = lies(os.path.join(site, "assets", "main.js"))
    pruefe('<a href="tel:%s">%s</a> oder schreiben Sie an' % (neu_tel, neu) in js, "main.js: Fehlermeldung des Formulars hat die neue Nummer nicht")
    print("   %d Seiten geprüft, alte Nummer %s ist überall ersetzt durch %s" % (n_seiten, alt, neu))


# ---------------------------------------------------------------------- Test 2
def test_email_adresse(wurzel):
    print("Test 2: E-Mail und Adresse ändern")
    ziel = kopie_anlegen(wurzel, "t2")
    pfad, daten = seite_json(ziel)
    k = daten["kontakt"]
    alt_mail, alt_str, alt_plz = k["email"], k["strasse"], k["plz"]
    k["email"], k["strasse"], k["plz"] = "kontakt@beispiel-test.de", "Teststraße 7", "45468"
    speichere(pfad, daten)
    site = baue(ziel)
    zahl = 0
    for rel, p in dateien(site):
        text = ohne_formularadresse(lies(p))
        zahl += 1
        pruefe(alt_mail not in text.replace('value="Neue Anfrage über zeca-alu.de"', ""),
               "Alte E-Mail %s kommt noch in %s vor" % (alt_mail, rel))
        for alt in (alt_str, "Folkenborn", alt_plz + " "):
            pruefe(alt not in text, "Alter Adresswert \"%s\" kommt noch in %s vor" % (alt, rel))
    index = lies(os.path.join(site, "index.html"))
    pruefe("Teststraße 7" in index and "kontakt@beispiel-test.de" in index and '"postalCode": "45468"' in index,
           "Startseite zeigt die neuen Adress-/Mailwerte nicht (Text/JSON-LD)")
    for rel in ("kontakt", "einsatzgebiet"):
        pruefe("Teststra%C3%9Fe+7,+45468" in lies(os.path.join(site, rel, "index.html")),
               "%s: Karten-Adresse (Google Maps) wurde nicht angepasst" % rel)
    print("   %d Dateien geprüft (Ausnahme: Formular-Adresse bleibt bewusst unverändert)" % zahl)


# ---------------------------------------------------------------------- Test 3
def test_vorschau(wurzel):
    print("Test 3: Vorschau-Modus (basis_pfad, noindex, andere Domain)")
    ziel = kopie_anlegen(wurzel, "t3")
    pfad, daten = seite_json(ziel)
    basis = "/zeca-alu-vorschau/"
    domain = "https://vorschau.example.org"
    daten["veroeffentlichung"].update({"basis_pfad": basis, "domain": domain, "noindex": True})
    speichere(pfad, daten)
    site = baue(ziel)
    n = 0
    for rel, baum in sorted(seiten_baeume(site).items()):
        n += 1
        for k in [baum] + alle(baum, lambda x: True):
            for attr in ("href", "src", "imagesrcset", "srcset", "data-src"):
                wert = k.attrs.get(attr)
                if wert is None:
                    continue
                teile = [t.strip().split()[0] for t in wert.split(",") if t.strip()] if "srcset" in attr else [wert]
                for t in teile:
                    if t.startswith("/") and not t.startswith(basis):
                        pruefe(False, "%s: <%s %s=\"%s\"> hat den Basis-Pfad nicht" % (rel, k.tag, attr, t))
                    elif t.startswith("/"):
                        # Datei muss in _site existieren
                        ziel_pfad = os.path.join(site, t[len(basis):].split("#")[0].split("?")[0])
                        pruefe(os.path.exists(ziel_pfad), "%s: Ziel %s existiert in _site nicht" % (rel, t))
        text = lies(os.path.join(site, rel))
        pruefe('<meta name="robots" content="noindex, nofollow" />' in text, "%s: robots-Meta fehlt/falsch" % rel)
        pruefe(re.search(r'<link rel="canonical" href="%s%s[^"]*"' % (re.escape(domain), re.escape(basis)), text) is not None,
               "%s: canonical trägt nicht Domain + Basis-Pfad" % rel)
        pruefe("https://zeca-alu.de" not in text, "%s: alte Domain kommt noch vor" % rel)
        for s in alle(baum, lambda x: x.tag == "script" and x.attrs.get("type") == "application/ld+json"):
            j = json.dumps(json.loads("".join(c for c in s.kinder if isinstance(c, str))))
            for url in re.findall(r'"(https?://[^"]+)"', j):
                if "instagram" in url or "facebook" in url or "schema.org" in url:
                    continue
                pruefe(url.startswith(domain + basis), "%s: JSON-LD-Adresse %s hat nicht Domain + Basis-Pfad" % (rel, url))
    robots = lies(os.path.join(site, "robots.txt"))
    pruefe("Disallow: /\n" in robots and "Allow:" not in robots, "robots.txt sperrt nicht (noindex=true)")
    pruefe("Disallow: %sadmin/" % basis in robots, "robots.txt sperrt die Verwaltungsseite nicht")
    pruefe(not os.path.exists(os.path.join(site, "CNAME")), "Vorschau-Modus darf keine CNAME-Datei erzeugen")
    sm = lies(os.path.join(site, "sitemap.xml"))
    pruefe(all(l.startswith("  <url><loc>%s%s" % (domain, basis)) for l in sm.splitlines() if "<loc>" in l), "sitemap.xml: Adressen ohne Basis-Pfad")
    css = lies(os.path.join(site, "assets", "style.css"))
    pruefe("url('%sassets/fonts/archivo-latin-wdth.woff2')" % basis in css, "style.css: Schrift-URL ohne Basis-Pfad")
    pruefe("url('/assets/" not in css, "style.css: root-absolute Schrift-URL übrig")
    # Gegenprobe: noindex=false -> robots erlaubt
    daten["veroeffentlichung"]["noindex"] = False
    speichere(pfad, daten)
    site = baue(ziel)
    robots = lies(os.path.join(site, "robots.txt"))
    pruefe("Allow: /" in robots and "Disallow: /\n" not in robots and "Disallow: %sadmin/" % basis in robots
           and "Sitemap: %s%ssitemap.xml" % (domain, basis) in robots,
           "robots.txt erlaubt nicht (noindex=false)")
    pruefe('content="index, follow"' in lies(os.path.join(site, "index.html")), "noindex=false: robots-Meta ist nicht index, follow")
    print("   %d Seiten geprüft, Basis-Pfad %s" % (n, basis))


# ---------------------------------------------------------------------- Test 4
def test_sicherungen(wurzel):
    print("Test 4: Sicherungen des Generators")
    ziel = kopie_anlegen(wurzel, "t4")
    site = baue(ziel)
    vorher = lies(os.path.join(site, "index.html"))
    carport = os.path.join(ziel, "inhalt", "seiten", "carport.json")
    original = lies(carport)

    def fall(name, aendern, erwartet):
        d = json.loads(original)
        aendern(d)
        speichere(carport, d)
        r = subprocess.run([sys.executable, "bauen.py"], cwd=ziel, capture_output=True, text=True)
        ausgabe = r.stdout + r.stderr
        pruefe(r.returncode == 1, "%s: bauen.py hätte mit Fehler enden müssen" % name)
        for muster in erwartet:
            pruefe(muster in ausgabe, "%s: Meldung enthält nicht \"%s\"" % (name, muster))
        pruefe(lies(os.path.join(site, "index.html")) == vorher, "%s: bisherige _site wurde verändert" % name)
        pruefe("FEHLER" in ausgabe and "Es wurde nichts gebaut" in ausgabe, "%s: keine deutsche Fehlermeldung" % name)

    fall("Pflichtfeld fehlt", lambda d: d["kopf"].pop("lead"), ["inhalt/seiten/carport.json", "kopf.lead", "Pflichtfeld"])
    fall("Unbekanntes Foto", lambda d: d["text"]["foto"].update(bild="gibt-es-nicht"), ["gibt-es-nicht", "Bildliste"])
    fall("Unerlaubter Link", lambda d: d["text"]["absaetze"].__setitem__(0, '<a href="javascript:alert(1)">x</a>'), ["nicht erlaubt"])
    fall("Interner Link ins Leere", lambda d: d["text"]["absaetze"].__setitem__(0, '<a href="/gibt-es-nicht/">x</a>'), ["keine bekannte Seite"])
    fall("Zu langer Text", lambda d: d["text"]["absaetze"].__setitem__(0, "x" * 700), ["Zu lang"])
    fall("Markup offen", lambda d: d["text"]["absaetze"].__setitem__(0, "<strong>offen"), ["nicht geschlossen"])
    fall("Unbekannter Platzhalter", lambda d: d["text"]["absaetze"].__setitem__(0, "{{fax}}"), ["Unbekannter Platzhalter"])
    fall("Unbekanntes Feld", lambda d: d.update(blabla="x"), ["Unbekanntes Feld"])
    # Kaputtes JSON
    with open(carport, "w", encoding="utf-8") as f:
        f.write(original.replace('"name"', "name", 1))
    r = subprocess.run([sys.executable, "bauen.py"], cwd=ziel, capture_output=True, text=True)
    pruefe(r.returncode == 1 and "Keine gültige JSON-Datei" in r.stdout, "Kaputtes JSON wurde nicht gemeldet")
    pruefe(lies(os.path.join(site, "index.html")) == vorher, "Kaputtes JSON: bisherige _site wurde verändert")
    # Foto in der Bildliste ohne Dateien
    with open(carport, "w", encoding="utf-8") as f:
        f.write(original)
    bl = os.path.join(ziel, "inhalt", "bilder.json")
    d = json.loads(lies(bl))
    d["bilder"].append({"name": "ohne-dateien", "alt": "x"})
    speichere(bl, d)
    r = subprocess.run([sys.executable, "bauen.py"], cwd=ziel, capture_output=True, text=True)
    pruefe(r.returncode == 1 and "ohne-dateien" in r.stdout and "Keine Dateien" in r.stdout, "Foto ohne Dateien wurde nicht gemeldet")
    pruefe(lies(os.path.join(site, "index.html")) == vorher, "Foto ohne Dateien: bisherige _site wurde verändert")
    print("   10 Fehlerfälle geprüft, bisherige _site blieb jedes Mal unverändert")


# ---------------------------------------------------------------------- Test 5
def laufe(container, key, spec, pfad, norm):
    """Geht durch alle vorhandenen Werte einer Inhaltsdatei (gesteuert durch das Schema)."""
    typ = spec["typ"]
    wert = container[key]
    if typ == "gruppe":
        for f in spec["felder"]:
            k = f["schluessel"]
            if isinstance(wert, dict) and k in wert:
                for x in laufe(wert, k, f, (pfad + "." if pfad else "") + k, (norm + "." if norm else "") + k):
                    yield x
    elif typ == "liste":
        for i in range(len(wert)):
            for x in laufe(wert, i, spec["eintrag"], "%s[%d]" % (pfad, i + 1), norm + "[]"):
                yield x
    else:
        yield container, key, spec, pfad, norm


# Felder mit festem Format, die in Test 1-3 gesondert geprüft werden
UEBERSPRINGEN = {"kontakt.telefone[].anzeige", "veroeffentlichung.domain", "veroeffentlichung.basis_pfad",
                 "admin.repo", "admin.branch",
                 "bilder[].name", "bilder[].original", "logo.datei", "ordner", "bilder[].alt"}


def marker_fuer(spec, n):
    m = spec.get("muster")
    if m is None:
        return "ZQ%04d" % n
    if m == "^#[0-9A-Fa-f]{6}$":
        return "#%06X" % (0xA00000 + n)
    if m == "^RAL [0-9]{4}$":
        return "RAL %04d" % (1000 + n)
    if m == "^https://":
        return "https://zq%04d.example.org/x" % n
    if m.startswith("^https://formsubmit"):
        return "https://formsubmit.co/ajax/zq%04d" % n
    if m.startswith("^[^@") or m.startswith("^[A-Za-z0-9._%+-]+@"):
        return "zq%04d@example.org" % n
    if m == "^[0-9]{4}$":
        return "7%03d" % (n % 1000)
    return None


def test_wirkung(wurzel):
    print("Test 5: Jedes Schema-Feld wirkt")
    ziel = kopie_anlegen(wurzel, "t5")
    site0 = baue(ziel)
    basis = {rel: lies(p) for rel, p in dateien(site0)}
    schemadir = os.path.join(ziel, "inhalt", "schema")
    schemas = [json.loads(lies(os.path.join(schemadir, f))) for f in sorted(os.listdir(schemadir)) if f.endswith(".json")]

    def laden(rel):
        return json.loads(lies(os.path.join(ziel, rel)))

    def sichern(rel, d):
        speichere(os.path.join(ziel, rel), d)

    # --- Phase A: Texte (und Zahlen) bekommen eindeutige Markierungen
    n = 0
    marken = []   # (datei, pfad, norm, erwartet)
    geschrieben = {}
    for sch in schemas:
        for rel in sch["gilt_fuer"]:
            d = laden(rel)
            for cont, key, spec, pfad, norm in laufe({"w": d}, "w", sch, "", ""):
                if spec["typ"] in ("text", "textarea") and norm not in UEBERSPRINGEN:
                    n += 1
                    mk = marker_fuer(spec, n)
                    if mk is None:
                        continue
                    cont[key] = mk
                    marken.append((rel, pfad, norm, mk))
                elif spec["typ"] == "zahl":
                    n += 1
                    cont[key] = (900 + n) if "x" == norm.split(".")[-1] else (700 + n)
                    marken.append((rel, pfad, norm, str(cont[key])))
            geschrieben[rel] = d
    for rel, d in geschrieben.items():
        sichern(rel, d)
    site = baue(ziel)
    alles = "\n".join(lies(p) for _r, p in dateien(site))
    fehlt = [(r, p, m) for r, p, _n, m in marken if m not in alles]
    for r, p, m in fehlt:
        pruefe(False, "%s Feld \"%s\" (Markierung %s) erscheint nirgends auf der Seite" % (r, p, m))
    pruefe(len(marken) > 200, "zu wenige Felder markiert (%d)" % len(marken))
    felder_text = len({(sch_titel(r), norm) for r, _p, norm, _m in marken})
    print("   Phase A: %d Werte in %d verschiedenen Schema-Feldern markiert, alle sichtbar: %s" % (
        len(marken), felder_text, "ja" if not fehlt else "NEIN (%d fehlen)" % len(fehlt)))
    # Ausgangszustand wiederherstellen
    shutil.rmtree(os.path.join(ziel, "inhalt"))
    shutil.copytree(os.path.join(HIER, "inhalt"), os.path.join(ziel, "inhalt"))

    # --- Phase B: Ja/Nein, Fotos, Auswahl: je Schema-Feld einmal umschalten und Seite vergleichen
    ziele = []
    gesehen = set()
    for sch in schemas:
        for rel in sch["gilt_fuer"]:
            d = laden_original(rel)
            for cont, key, spec, pfad, norm in laufe({"w": d}, "w", sch, "", ""):
                if spec["typ"] in ("janein", "bild", "auswahl") and (sch["titel"], norm) not in gesehen:
                    gesehen.add((sch["titel"], norm))
                    ziele.append((rel, pfad, spec["typ"]))
    geprueft = 0
    for rel, pfad, typ in ziele:
        d = laden_original(rel)
        cont, key = stelle(d, pfad)
        alt = cont[key]
        if typ == "janein":
            cont[key] = not alt
        elif typ == "bild":
            cont[key] = "terrasse-doppelhaus-2" if alt == "terrasse-doppelhaus-1" else "terrasse-doppelhaus-1"
        else:
            # Auswahl (Reihenfolge der Leistungen auf der Startseite): zwei Einträge vertauschen
            e = d["leistungen"]["eintraege"]
            e[0]["seite"], e[1]["seite"] = e[1]["seite"], e[0]["seite"]
        sichern(rel, d)
        r = subprocess.run([sys.executable, "bauen.py", "--ziel", "_site_probe"], cwd=ziel, capture_output=True, text=True)
        if r.returncode != 0:
            pruefe(False, "%s Feld \"%s\": Umschalten führt zu Fehler:\n%s" % (rel, pfad, r.stdout[-300:]))
        else:
            neu = {rel2: lies(p2) for rel2, p2 in dateien(os.path.join(ziel, "_site_probe"))}
            pruefe(neu != basis, "%s Feld \"%s\" (%s) ändert die Seite nicht" % (rel, pfad, typ))
            geprueft += 1
        shutil.rmtree(os.path.join(ziel, "_site_probe"), ignore_errors=True)
        sichern(rel, laden_original(rel))
    print("   Phase B: %d Schalter-/Foto-/Auswahlfelder einzeln umgelegt, jedes ändert die Seite" % geprueft)

    # --- Phase C: Standard-Bildbeschreibung wirkt, wenn an der Einbaustelle keine steht
    bl = laden("inhalt/bilder.json")
    for i, b in enumerate(bl["bilder"]):
        b["alt"] = "ZQALT%d" % i
    sichern("inhalt/bilder.json", bl)
    for f in os.listdir(os.path.join(ziel, "inhalt", "seiten")):
        rel = "inhalt/seiten/" + f
        d = laden(rel)

        def leere_alt(o):
            if isinstance(o, dict):
                if "bild" in o and "alt" in o:
                    o.pop("alt")
                for v in o.values():
                    leere_alt(v)
            elif isinstance(o, list):
                for v in o:
                    leere_alt(v)
        leere_alt(d)
        sichern(rel, d)
    site = baue(ziel)
    alles = "\n".join(lies(p) for _r, p in dateien(site))
    pruefe("ZQALT0" in alles and "ZQALT1" in alles, "Standard-Bildbeschreibungen aus bilder.json werden nicht eingesetzt")
    print("   Phase C: Standard-Bildbeschreibung aus der Bildliste wird eingesetzt, wenn die Einbaustelle keine hat")


def sch_titel(rel):
    return "leistung" if os.path.basename(rel)[:-5] in ("terrassenueberdachung", "carport", "wintergarten", "vordach", "alu-zaun", "fliegengitter") else rel


def stelle(d, pfad):
    """Pfad wie 'projekte[1].fotos[2].bild' -> (Container, Schlüssel) im geladenen JSON."""
    teile = pfad.split(".")
    cur = d
    for t in teile[:-1]:
        m = re.match(r"^([^\[]+)((?:\[\d+\])*)$", t)
        cur = cur[m.group(1)]
        for i in re.findall(r"\[(\d+)\]", m.group(2)):
            cur = cur[int(i) - 1]
    m = re.match(r"^([^\[]+)((?:\[\d+\])*)$", teile[-1])
    idx = re.findall(r"\[(\d+)\]", m.group(2))
    if not idx:
        return cur, m.group(1)
    cur = cur[m.group(1)]
    for i in idx[:-1]:
        cur = cur[int(i) - 1]
    return cur, int(idx[-1]) - 1


def laden_original(rel):
    with open(os.path.join(HIER, rel), encoding="utf-8") as f:
        return json.load(f)


def test_admin(wurzel):
    print("Test 6: Verwaltungsseite (admin/)")
    ziel = kopie_anlegen(wurzel, "t6")
    pfad, daten = seite_json(ziel)
    site = baue(ziel)
    admin = os.path.join(site, "admin")
    pruefe(os.path.isfile(os.path.join(admin, "index.html")), "admin.aktiv=true: _site/admin/index.html fehlt")
    pruefe(not os.path.exists(os.path.join(admin, "test")), "admin/test/ darf nicht ausgeliefert werden")
    pruefe(not any(f.endswith((".py", ".md")) for _w, _d, fs in os.walk(admin) for f in fs), "Python-/Notiz-Dateien in _site/admin")
    k = json.loads(lies(os.path.join(admin, "konfig.json")))
    pruefe(k["repo"] == daten["admin"]["repo"] and k["branch"] == daten["admin"]["branch"]
           and k["seite"] == daten["veroeffentlichung"]["domain"] + daten["veroeffentlichung"]["basis_pfad"], "konfig.json stimmt nicht mit seite.json überein")
    pruefe("Disallow: /admin/" in lies(os.path.join(site, "robots.txt")), "robots.txt sperrt /admin/ nicht")
    index = lies(os.path.join(admin, "index.html"))
    pruefe('name="robots" content="noindex, nofollow"' in index, "admin/index.html: noindex fehlt")
    pruefe("Content-Security-Policy" in index and "unsafe-inline" not in index, "admin/index.html: Content-Security-Policy fehlt oder zu offen")
    pruefe("img-src 'self' blob:;" in index and "data:" not in index, "admin/index.html: img-src darf kein data: enthalten (nur 'self' und blob: für Foto-Vorschauen)")
    pruefe("admin/" not in lies(os.path.join(site, "sitemap.xml")), "sitemap.xml enthält /admin/")
    css_admin = lies(os.path.join(admin, "admin.css"))
    pruefe("html{visibility:hidden}" in css_admin and "html.sichtbar{visibility:visible}" in css_admin, "admin.css: Seite ist nicht standardmäßig unsichtbar (Clickjacking-Schutz)")
    pruefe("window.top === window.self" in lies(os.path.join(admin, "admin.js")) and 'classList.add("sichtbar")' in lies(os.path.join(admin, "admin.js")),
           "admin.js macht die Seite nicht nur im obersten Fenster sichtbar")
    pruefe('<noscript><link rel="stylesheet" href="ohne-js.css"></noscript>' in index and "html{visibility:visible}" in lies(os.path.join(admin, "ohne-js.css")),
           "ohne JavaScript bleibt die Verwaltung unsichtbar (noscript-Stylesheet fehlt)")
    admin_js = lies(os.path.join(admin, "admin.js"))
    pruefe("linkSchluessel" not in admin_js and "decodeURIComponent" not in admin_js and "#schluessel=(" not in admin_js,
           "admin.js liest noch einen Schlüssel aus der Adresse (Anmelde-Link ist entfernt)")
    anleitung = lies(os.path.join(HIER, "ADMIN-ANLEITUNG.md"))
    pruefe("admin/#schluessel=IHR" not in anleitung, "ADMIN-ANLEITUNG.md beschreibt noch den Anmelde-Link")
    pruefe("teilt sich der Browser-Speicher die Herkunft" in anleitung and "Vorschau-Herkunft" in lies(os.path.join(HIER, "README.md")),
           "Hinweis zur Vorschau-Herkunft (localStorage mit anderen Pages-Projekten) fehlt in Anleitung oder README")
    pruefe("höchstens 1 Jahr" not in anleitung and "30 bis 90 Tage" in anleitung, "ADMIN-ANLEITUNG.md: empfohlene Schlüssel-Laufzeit ist nicht 30 bis 90 Tage")
    pruefe("Abmelden widerruft den Schlüssel bei GitHub nicht" in anleitung and "Developer settings" in anleitung, "ADMIN-ANLEITUNG.md: Hinweis Abmelden/Widerruf fehlt")
    zugangsdaten = [rel for rel, p in dateien(site, (".js", ".html", ".css")) if rel.startswith("admin") and re.search(r"gh[pousr]_[A-Za-z0-9]{20}|github_pat_", lies(p))]
    pruefe(not zugangsdaten, "Zugangsdaten in _site/admin: %s" % zugangsdaten)
    # Ausgeschaltet: keine Verwaltungsseite, robots sperrt trotzdem
    daten["admin"]["aktiv"] = False
    speichere(pfad, daten)
    site = baue(ziel)
    pruefe(not os.path.exists(os.path.join(site, "admin")), "admin.aktiv=false: _site/admin darf nicht entstehen")
    pruefe("Disallow: /admin/" in lies(os.path.join(site, "robots.txt")), "robots.txt: Sperre muss auch ohne Verwaltungsseite stehen")
    # Vorschau-Modus: Sperre trägt den Basis-Pfad
    daten["admin"]["aktiv"] = True
    daten["veroeffentlichung"].update({"basis_pfad": "/zeca-alu-vorschau/", "noindex": True})
    speichere(pfad, daten)
    site = baue(ziel)
    pruefe("Disallow: /zeca-alu-vorschau/admin/" in lies(os.path.join(site, "robots.txt")), "robots.txt: Sperre ohne Basis-Pfad im Vorschau-Modus")
    pruefe(json.loads(lies(os.path.join(site, "admin", "konfig.json")))["seite"].endswith("/zeca-alu-vorschau/"), "konfig.json: Basis-Pfad fehlt")
    print("   Verwaltungsseite: Kopie, konfig.json, robots, noindex, CSP, keine Zugangsdaten geprüft")


def test_fotos(wurzel):
    print("Test 7: Fotos mit beliebig vielen Größen (Upload aus der Verwaltung)")
    ziel = kopie_anlegen(wurzel, "t7")
    bestand = os.path.join(ziel, "images", "bestand")
    quelle = os.path.join(bestand, "terrasse-doppelhaus-1-800.webp")
    faelle = [("test-nur-800", [800]), ("test-zwei-groessen", [800, 1600]), ("test-kleines-foto", [640]),
              ("test-drei-groessen", [800, 1600, 2048])]
    bilder_pfad = os.path.join(ziel, "inhalt", "bilder.json")
    ref_pfad = os.path.join(ziel, "inhalt", "seiten", "referenzen.json")
    with open(bilder_pfad, encoding="utf-8") as f:
        bilder = json.load(f)
    for name, breiten in faelle:
        for b in breiten:
            shutil.copyfile(quelle, os.path.join(bestand, "%s-%d.webp" % (name, b)))
        bilder["bilder"].append({"name": name, "alt": "Testfoto %s" % name})
    speichere(bilder_pfad, bilder)
    with open(ref_pfad, encoding="utf-8") as f:
        ref0 = json.load(f)
    for name, breiten in faelle:
        ref = json.loads(json.dumps(ref0))
        ref["projekte"][0]["fotos"][0]["bild"] = name
        ref["projekte"][0]["fotos"][0]["alt"] = ""    # Standardtext aus der Bildliste
        speichere(ref_pfad, ref)
        site = baue(ziel)
        html_text = lies(os.path.join(site, "referenzen", "index.html"))
        m = re.search(r'<img [^>]*src="[^"]*/%s-\d+\.webp"[^>]*>' % re.escape(name), html_text)
        pruefe(m is not None, "%s: <img> nicht auf der Referenzen-Seite gefunden" % name)
        if not m:
            continue
        tag = m.group(0)
        srcset = re.search(r'srcset="([^"]*)"', tag).group(1)
        eintraege = re.findall(r"/%s-(\d+)\.webp (\d+)w" % re.escape(name), srcset)
        pruefe([b for b, _w in eintraege] == [str(x) for x in breiten] and all(b == w for b, w in eintraege),
               "%s: srcset %r passt nicht zu den vorhandenen Größen %s" % (name, srcset, breiten))
        pruefe(srcset.count(" ") == 2 * len(breiten) - 1, "%s: srcset enthält mehr als die vorhandenen Größen: %s" % (name, srcset))
        std = 1600 if 1600 in breiten else breiten[-1]
        pruefe(re.search(r'src="[^"]*/%s-%d\.webp"' % (re.escape(name), std), tag) is not None, "%s: src ist nicht die Größe %d" % (name, std))
        pruefe('width="800" height="600"' in tag, "%s: width/height fehlen oder stammen nicht aus der Datei: %s" % (name, tag))
        pruefe('alt="Testfoto %s"' % name in tag, "%s: Standard-Bildbeschreibung aus der Bildliste fehlt" % name)
    # Foto ganz ohne Größen-Datei bleibt ein Fehler (Seite wird nicht gebaut)
    ref = json.loads(json.dumps(ref0))
    ref["projekte"][0]["fotos"][0]["bild"] = "test-nur-800"
    speichere(ref_pfad, ref)
    for b in (800,):
        os.remove(os.path.join(bestand, "test-nur-800-%d.webp" % b))
    r = subprocess.run([sys.executable, "bauen.py"], cwd=ziel, capture_output=True, text=True)
    pruefe(r.returncode != 0 and "test-nur-800" in r.stdout, "Foto ohne Dateien muss den Bau mit Fotonamen abbrechen")
    print("   Fotos: %d Fälle (nur 800, 800+1600, 640 px, alle drei Größen), srcset nur mit vorhandenen Größen, Maße aus der Datei" % len(faelle))


def jpeg_datei(breite, hoehe, mit_exif_gross=False):
    """Kleinste JPEG-Datei mit gültigem Kopf (SOI, APP0, DQT, SOF0, SOS, EOI) und den angegebenen Maßen: der Bau liest nur den Kopf."""
    def abschnitt(marke, nutzlast):
        return b"\xff" + bytes([marke]) + (len(nutzlast) + 2).to_bytes(2, "big") + nutzlast
    sof0 = abschnitt(0xC0, bytes([8]) + hoehe.to_bytes(2, "big") + breite.to_bytes(2, "big") + bytes([3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]))
    exif = abschnitt(0xE1, b"Exif\0\0" + bytes(30000)) if mit_exif_gross else b""
    return (b"\xff\xd8" + abschnitt(0xE0, b"JFIF\0\1\1\0\0\1\0\1\0\0") + exif + abschnitt(0xDB, bytes([0]) + bytes(64)) + sof0
            + abschnitt(0xDA, bytes([3, 1, 0, 2, 0x11, 3, 0x11, 0, 63, 0])) + b"\0\0\xff\xd9")


def test_fotos_jpeg(wurzel):
    print("Test 7b: JPEG-Fotos (Browser ohne WebP-Erzeugung, zum Beispiel Safari am iPhone)")
    ziel = kopie_anlegen(wurzel, "t7b")
    bestand = os.path.join(ziel, "images", "bestand")
    bilder_pfad = os.path.join(ziel, "inhalt", "bilder.json")
    ref_pfad = os.path.join(ziel, "inhalt", "seiten", "referenzen.json")
    start_pfad = os.path.join(ziel, "inhalt", "seiten", "startseite.json")
    with open(bilder_pfad, encoding="utf-8") as f:
        bilder = json.load(f)
    faelle = [("test-jpg-drei", [800, 1600, 2048], 4 / 3), ("test-jpg-klein", [640], 4 / 3), ("test-jpg-hoch", [800, 1600], 3 / 4)]
    for name, breiten, verhaeltnis in faelle:
        for b in breiten:
            with open(os.path.join(bestand, "%s-%d.jpg" % (name, b)), "wb") as f:
                f.write(jpeg_datei(b, round(b / verhaeltnis), mit_exif_gross=(name == "test-jpg-hoch")))
        bilder["bilder"].append({"name": name, "alt": "JPEG-Testfoto %s" % name, "format": "jpg"})
    # WebP-Foto ohne Formatfeld und Foto mit format "webp" laufen unverändert weiter
    shutil.copyfile(os.path.join(bestand, "terrasse-doppelhaus-1-800.webp"), os.path.join(bestand, "test-webp-explizit-800.webp"))
    bilder["bilder"].append({"name": "test-webp-explizit", "alt": "WebP mit Formatangabe", "format": "webp"})
    speichere(bilder_pfad, bilder)
    with open(ref_pfad, encoding="utf-8") as f:
        ref0 = json.load(f)
    with open(start_pfad, encoding="utf-8") as f:
        start0 = json.load(f)
    for name, breiten, verhaeltnis in faelle:
        ref = json.loads(json.dumps(ref0))
        ref["projekte"][0]["fotos"][0]["bild"] = name
        ref["projekte"][0]["fotos"][0]["alt"] = ""
        speichere(ref_pfad, ref)
        site = baue(ziel)
        text = lies(os.path.join(site, "referenzen", "index.html"))
        m = re.search(r'<img [^>]*src="[^"]*/%s-\d+\.jpg"[^>]*>' % re.escape(name), text)
        pruefe(m is not None, "%s: <img> mit .jpg nicht auf der Seite" % name)
        if not m:
            continue
        tag = m.group(0)
        srcset = re.search(r'srcset="([^"]*)"', tag).group(1)
        eintraege = re.findall(r"/%s-(\d+)\.jpg (\d+)w" % re.escape(name), srcset)
        pruefe([b for b, _w in eintraege] == [str(x) for x in breiten] and all(b == w for b, w in eintraege),
               "%s: srcset %r passt nicht zu den JPEG-Größen %s" % (name, srcset, breiten))
        pruefe(".webp" not in srcset and srcset.count(" ") == 2 * len(breiten) - 1, "%s: srcset enthält Fremdes: %s" % (name, srcset))
        std = 1600 if 1600 in breiten else breiten[-1]
        pruefe(re.search(r'src="[^"]*/%s-%d\.jpg"' % (re.escape(name), std), tag) is not None, "%s: src ist nicht die Größe %d" % (name, std))
        pruefe('width="%d" height="%d"' % (std, round(std / verhaeltnis)) in tag, "%s: width/height müssen aus dem JPEG-Kopf stammen (%d x %d): %s" % (name, std, round(std / verhaeltnis), tag))
        pruefe('alt="JPEG-Testfoto %s"' % name in tag, "%s: Standard-Bildbeschreibung fehlt" % name)
    # Vorab-Laden der Hauptbild-Datei: bei JPEG mit Typ, bei WebP unverändert ohne Typ
    start = json.loads(json.dumps(start0))
    start["hero"]["foto"]["bild"] = "test-jpg-drei"
    start["hero"]["foto"]["alt"] = ""
    speichere(start_pfad, start)
    site = baue(ziel)
    seite = lies(os.path.join(site, "index.html"))
    pl = re.search(r'<link rel="preload" as="image"[^>]*>', seite)
    pruefe(pl is not None and 'type="image/jpeg"' in pl.group(0) and "test-jpg-drei-1600.jpg" in pl.group(0) and "test-jpg-drei-2048.jpg 2048w" in pl.group(0),
           "Preload des JPEG-Hauptbilds fehlt oder ohne Typ: %s" % (pl and pl.group(0)))
    start["hero"]["foto"]["bild"] = "test-webp-explizit"
    speichere(start_pfad, start)
    seite = lies(os.path.join(baue(ziel), "index.html"))
    pl = re.search(r'<link rel="preload" as="image"[^>]*>', seite)
    pruefe(pl is not None and "type=" not in pl.group(0) and "test-webp-explizit-800.webp" in pl.group(0), "Preload eines WebP-Fotos ändert sich nicht: %s" % (pl and pl.group(0)))
    speichere(start_pfad, start0)
    # Fehlerfälle: Format jpg, aber nur WebP-Dateien da; kaputter JPEG-Kopf; unbekanntes Format
    ref = json.loads(json.dumps(ref0))
    ref["projekte"][0]["fotos"][0]["bild"] = "test-webp-explizit"
    speichere(ref_pfad, ref)
    bilder["bilder"][-1]["format"] = "jpg"
    speichere(bilder_pfad, bilder)
    code, aus = bau_fehler(ziel)
    pruefe(code != 0 and "test-webp-explizit" in aus and "<Breite>.jpg" in aus, "Format jpg ohne JPEG-Dateien muss den Bau mit Fotonamen und Endung .jpg abbrechen: %s" % aus[:300])
    bilder["bilder"][-1]["format"] = "gif"
    speichere(bilder_pfad, bilder)
    code, aus = bau_fehler(ziel)
    pruefe(code != 0 and "format" in aus, "Unbekanntes Format muss abgelehnt werden: %s" % aus[:300])
    bilder["bilder"][-1]["format"] = "webp"
    speichere(bilder_pfad, bilder)
    with open(os.path.join(bestand, "test-jpg-klein-640.jpg"), "wb") as f:
        f.write(b"\xff\xd8\xff\xd9")
    ref["projekte"][0]["fotos"][0]["bild"] = "test-jpg-klein"
    speichere(ref_pfad, ref)
    code, aus = bau_fehler(ziel)
    pruefe(code != 0 and "test-jpg-klein" in aus and "JPEG" in aus and "Traceback" not in aus, "Kaputter JPEG-Kopf muss mit klarer Meldung (ohne Traceback) abbrechen: %s" % aus[:300])
    with open(os.path.join(bestand, "test-jpg-klein-640.jpg"), "wb") as f:
        f.write(b"RIFF" + bytes(40))
    code, aus = bau_fehler(ziel)
    pruefe(code != 0 and "test-jpg-klein" in aus and "Traceback" not in aus, "Falscher Dateikopf (kein JPEG) bricht ab: %s" % aus[:300])
    print("   JPEG-Fotos: %d Fälle, srcset/src/Maße aus dem JPEG-Kopf, Preload mit Typ, WebP unverändert, 3 Fehlerfälle" % len(faelle))


# ---------------------------------------------------------------------- Test 8
def bau_fehler(ziel):
    """bauen.py in der Kopie ausführen. Gibt (Ende-Code, Ausgabe) zurück."""
    r = subprocess.run([sys.executable, "bauen.py"], cwd=ziel, capture_output=True, text=True)
    return r.returncode, r.stdout + r.stderr


def csp_hash_von(text):
    import base64
    import hashlib
    return "'sha256-%s'" % base64.b64encode(hashlib.sha256(text.encode("utf-8")).digest()).decode()


def js_ausgewertet(literal):
    """Wertet ein JS-String-Literal mit Node aus (genau so, wie der Browser es täte). Gibt den Text zurück."""
    r = subprocess.run(["node", "-e", "process.stdout.write(%s)" % literal], capture_output=True)
    return r.stdout.decode("utf-8") if r.returncode == 0 else None


def test_sicherheit(wurzel):
    print("Test 8: Sicherheit des Generators")
    ziel = kopie_anlegen(wurzel, "t8")
    site = baue(ziel)
    vorher = lies(os.path.join(site, "index.html"))
    pfad, original = seite_json(ziel)

    def abbruch(name, aendern, erwartet):
        d = json.loads(json.dumps(original))
        aendern(d)
        speichere(pfad, d)
        code, ausgabe = bau_fehler(ziel)
        pruefe(code == 1, "%s: bauen.py hätte mit Fehler enden müssen" % name)
        for muster in erwartet:
            pruefe(muster in ausgabe, "%s: Meldung enthält nicht \"%s\":\n%s" % (name, muster, ausgabe[-400:]))
        pruefe("Es wurde nichts gebaut" in ausgabe, "%s: keine deutsche Abbruchmeldung" % name)
        pruefe(lies(os.path.join(site, "index.html")) == vorher, "%s: bisherige _site wurde verändert" % name)
        speichere(pfad, original)

    # 8.1 E-Mail und Domain: nur strenge Formate
    for boese in ('"><img src=x onerror=1>', "a@b.de'<b>", "info@zeca-alu.de\n<i>", "a b@c.de", "x@y", "a@b.c", "\\@b.de", "ä@b.de"):
        abbruch("E-Mail %r" % boese, lambda d, b=boese: d["kontakt"].__setitem__("email", b), ["kontakt.email", "E-Mail"])
    for boese in ('https://a.de/"x', "https://a.de/", "javascript:alert(1)", "https://a b.de", "https://a.de'x"):
        abbruch("Domain %r" % boese, lambda d, b=boese: d["veroeffentlichung"].__setitem__("domain", b), ["veroeffentlichung.domain", "Domain"])
    for boese in ("https://evil.example/ajax/x", "http://formsubmit.co/ajax/x", "https://formsubmit.co.evil.example/ajax/x",
                  "https://formsubmit.co/ajax/", "https://formsubmit.co/ajax/a/b", 'https://formsubmit.co/ajax/x"onload=1',
                  "https://formsubmit.co@evil.example/ajax/x", "https://formsubmit.co/f/abc", "https://formsubmit.co/ajax/a b"):
        abbruch("Formular-Adresse %r" % boese, lambda d, b=boese: d["formular"].__setitem__("aktion", b), ["formular.aktion", "Formular-Adresse"])
    # Auch bei gelockertem Schema (Muster entfernt) bleibt die feste Prüfung in bauen.py
    schema = os.path.join(ziel, "inhalt", "schema", "seite.json")
    s0 = lies(schema)
    s = json.loads(s0)
    k = [f for f in s["felder"] if f["schluessel"] == "kontakt"][0]
    [f for f in k["felder"] if f["schluessel"] == "email"][0].pop("muster")
    speichere(schema, s)
    abbruch("E-Mail ohne Schema-Muster", lambda d: d["kontakt"].__setitem__("email", '"><img src=x onerror=1>'), ["kontakt.email", "E-Mail"])
    fo = [f for f in s["felder"] if f["schluessel"] == "formular"][0]
    [f for f in fo["felder"] if f["schluessel"] == "aktion"][0].pop("muster")
    speichere(schema, s)
    abbruch("Formular-Adresse ohne Schema-Muster", lambda d: d["formular"].__setitem__("aktion", "https://evil.example/x"), ["formular.aktion", "Formular-Adresse"])
    with open(schema, "w", encoding="utf-8") as f:
        f.write(s0)
    pruefe(True, "Schema zurückgesetzt")

    # 8.2 Gültige, ungewöhnliche Adresse: kommt unverändert in Seite UND in main.js (Formular-Fehlermeldung) an
    d = json.loads(json.dumps(original))
    d["kontakt"]["email"] = "a.b+c%d@sub-test.example.de"
    speichere(pfad, d)
    site2 = baue(ziel)
    js = lies(os.path.join(site2, "assets", "main.js"))
    pruefe('mailto:a.b+c%d@sub-test.example.de">a.b+c%d@sub-test.example.de</a>' in js, "main.js: gültige E-Mail fehlt in der Fehlermeldung")
    speichere(pfad, original)

    # 8.2b Gültige Formular-Adressen (E-Mail-Form und Kennung) werden gebaut und stehen im Formular
    for gut in ("https://formsubmit.co/ajax/info@zeca-alu.de", "https://formsubmit.co/ajax/3f2a9c1b7d4e5f60a1b2c3d4e5f60718"):
        d = json.loads(json.dumps(original))
        d["formular"]["aktion"] = gut
        speichere(pfad, d)
        pruefe('action="%s"' % gut in lies(os.path.join(baue(ziel), "kontakt", "index.html")), "gültige Formular-Adresse %s steht nicht im Formular" % gut)
    speichere(pfad, original)

    # 8.3 js_zeichenkette: Gegenprobe mit Node. Egal was drinsteht, das Ergebnis ist reiner Text ohne Markup
    sys.path.insert(0, HIER)
    import importlib
    bauen = importlib.import_module("bauen")
    for roh in ["x@y.de", "a\"b<c>&d'e\\f", "</script><img src=x onerror=1>", "a\u2028b\u2029c\nd\re", "'+alert(1)+'", "\\'; alert(1); //"]:
        lit = "'%s'" % bauen.js_zeichenkette(roh)
        auswertung = js_ausgewertet(lit)
        pruefe(auswertung is not None, "js_zeichenkette(%r): kein gültiges JS-Literal: %s" % (roh, lit))
        if auswertung is not None:
            pruefe("<" not in auswertung and ">" not in auswertung and '"' not in auswertung and "'" not in auswertung,
                   "js_zeichenkette(%r): ausgewerteter Text enthält noch Markup-Zeichen: %r" % (roh, auswertung))
            pruefe(__import__("html").unescape(auswertung) == roh, "js_zeichenkette(%r): Text geht beim Maskieren verloren: %r" % (roh, auswertung))
        pruefe("<" not in lit and ">" not in lit and "\u2028" not in lit and "\u2029" not in lit and "\n" not in lit,
               "js_zeichenkette(%r): Literal enthält rohe Sonderzeichen: %r" % (roh, lit))

    # 8.4 JSON-LD: Inhalte können den Skript-Block nicht verlassen
    d = json.loads(json.dumps(original))
    d["firma"]["name"] = "Z</script><script>alert(1)</script><!--"
    speichere(pfad, d)
    site3 = baue(ziel)
    for rel in ("index.html", "carport/index.html"):
        text = lies(os.path.join(site3, rel))
        pruefe(text.count("<script") == text.count("</script>") and "<script>alert(1)" not in text and "<!--" not in text.replace("<!-- impeccable", ""),
               "%s: Inhalt hat den JSON-LD-Block verlassen" % rel)
        baum, _ = g.parse(text)
        skripte = alle(baum, lambda x: x.tag == "script")
        pruefe(all(("alert(1)" not in "".join(c for c in s_.kinder if isinstance(c, str))) or s_.attrs.get("type") == "application/ld+json" for s_ in skripte),
               "%s: alert(1) steht in einem ausführbaren Skript" % rel)
    speichere(pfad, original)

    # 8.5 Rechtstexte: Allowlist. Dieselben Testfälle wie im Browser-Teil (admin/test/unit.mjs)
    with open(os.path.join(HIER, "admin", "test", "rechtstext_faelle.json"), encoding="utf-8") as f:
        faelle = json.load(f)
    for fall in faelle:
        del bauen.FEHLER[:]
        ausgabe_text = bauen.pruefe_rechtstext(fall["text"], "fall")
        pruefe((not bauen.FEHLER) == fall["ok"], "Rechtstext-Fall \"%s\": erwartet %s, Fehler: %s"
               % (fall["name"], "erlaubt" if fall["ok"] else "abgelehnt", bauen.FEHLER[:1]))
        if fall["ok"] and "href=\"/" not in fall["text"]:
            pruefe(ausgabe_text == fall["text"], "Rechtstext-Fall \"%s\": erlaubter Text wurde verändert" % fall["name"])
    del bauen.FEHLER[:]
    rt_pfad = os.path.join(ziel, "inhalt", "recht", "impressum.html")
    rt_orig = lies(rt_pfad)
    site = baue(ziel)    # frischer Stand mit den ursprünglichen Dateien (die Ordner _site der Teilprüfungen davor sind derselbe Ordner)
    impressum_vorher = lies(os.path.join(site, "impressum", "index.html"))

    def recht_abbruch(name, neuer_text, erwartet):
        with open(rt_pfad, "w", encoding="utf-8") as f:
            f.write(neuer_text)
        code, ausgabe = bau_fehler(ziel)
        pruefe(code == 1, "Rechtstext %s: bauen.py hätte mit Fehler enden müssen" % name)
        for muster in erwartet:
            pruefe(muster in ausgabe, "Rechtstext %s: Meldung enthält nicht \"%s\":\n%s" % (name, muster, ausgabe[-300:]))
        pruefe("inhalt/recht/impressum.html" in ausgabe, "Rechtstext %s: Meldung nennt die Datei nicht" % name)
        pruefe(lies(os.path.join(site, "impressum", "index.html")) == impressum_vorher, "Rechtstext %s: bisherige _site wurde verändert" % name)

    recht_abbruch("script", rt_orig + "\n<script>alert(1)</script>\n", ["<script> ist in Rechtstexten nicht erlaubt"])
    recht_abbruch("onclick", rt_orig.replace("<p>", '<p onclick="x()">', 1), ["darf keine Attribute haben"])
    recht_abbruch("javascript-Link", rt_orig.replace('href="https://ec.europa.eu/consumers/odr/"', 'href="javascript:alert(1)"', 1), ["Link-Ziel", "nicht erlaubt"])
    recht_abbruch("img", rt_orig + '<img src="x" onerror="1">', ["<img> ist in Rechtstexten nicht erlaubt"])
    recht_abbruch("Kommentar", rt_orig + "<!-- x -->", ["Unerlaubtes oder kaputtes HTML"])
    recht_abbruch("offenes Tag", rt_orig + "<p>offen", ["Tag nicht geschlossen"])
    recht_abbruch("interner Link ins Leere", rt_orig + '<p><a href="/gibt-es-nicht/">x</a></p>', ["keine bekannte Seite"])
    # Erlaubter Text mit Liste und internem Link besteht; interner Link bekommt im Vorschau-Modus den Basis-Pfad
    with open(rt_pfad, "w", encoding="utf-8") as f:
        f.write(rt_orig + '\n<h3>Liste</h3><ul><li>a</li><li><a href="/kontakt/">Kontakt</a></li></ul>\n')
    site4 = baue(ziel)
    text = lies(os.path.join(site4, "impressum", "index.html"))
    pruefe('<ul><li>a</li><li><a href="/kontakt/">Kontakt</a></li></ul>' in text, "erlaubter Rechtstext mit Liste und Link wurde nicht übernommen")
    d = json.loads(json.dumps(original))
    d["veroeffentlichung"].update({"basis_pfad": "/vorschau/", "noindex": True})
    speichere(pfad, d)
    text = lies(os.path.join(baue(ziel), "impressum", "index.html"))
    pruefe('<a href="/vorschau/kontakt/">Kontakt</a>' in text, "interner Link im Rechtstext bekommt den Basis-Pfad nicht")
    speichere(pfad, original)
    with open(rt_pfad, "w", encoding="utf-8") as f:
        f.write(rt_orig)
    site5 = baue(ziel)
    pruefe(lies(os.path.join(site5, "impressum", "index.html")) == impressum_vorher, "ursprünglicher Rechtstext ergibt nicht wieder dieselbe Seite")

    # 8.6 Inhalts-Sicherheitsrichtlinie (CSP) der öffentlichen Seiten
    import base64
    import hashlib
    site6 = baue(ziel)
    seiten = [(r, p) for r, p in dateien(site6, (".html",)) if not r.startswith("admin" + os.sep)]
    n_attr = 0
    for rel, p in seiten:
        text = lies(p)
        metas = re.findall(r'<meta http-equiv="Content-Security-Policy" content="([^"]*)" />', text)
        pruefe(len(metas) == 1, "%s: Content-Security-Policy-Meta fehlt oder mehrfach" % rel)
        if len(metas) != 1:
            continue
        csp = metas[0]
        pruefe(text.index("Content-Security-Policy") < text.index("<script") and text.index("Content-Security-Policy") < text.index("<link"),
               "%s: Richtlinie steht nicht vor Skripten und Stylesheets" % rel)
        direktiven = {}
        for teil in csp.split(";"):
            teil = teil.strip()
            if teil:
                name, _s, rest = teil.partition(" ")
                direktiven[name] = rest.split()
        pruefe("unsafe-inline" not in csp and "unsafe-eval" not in csp and "*" not in csp.replace("'self'", ""),
               "%s: Richtlinie ist zu offen: %s" % (rel, csp))
        for d in ("default-src", "script-src", "style-src", "img-src", "font-src", "connect-src", "object-src", "base-uri", "form-action", "frame-src"):
            pruefe(d in direktiven, "%s: Direktive %s fehlt" % (rel, d))
        pruefe(direktiven.get("object-src") == ["'none'"] and direktiven.get("base-uri") == ["'none'"], "%s: object-src/base-uri nicht 'none'" % rel)
        pruefe(direktiven.get("default-src") == ["'self'"] and direktiven.get("img-src") == ["'self'"], "%s: default-src/img-src nicht nur 'self'" % rel)
        # Hashes unabhängig neu berechnen: jedes Inline-Skript und jedes style-Attribut muss in der Richtlinie stehen
        h = lambda s: "'sha256-%s'" % base64.b64encode(hashlib.sha256(s.encode("utf-8")).digest()).decode()
        inline = [m.group(2) for m in re.finditer(r"<script((?:\s[^>]*)?)>(.*?)</script>", text, re.S)
                  if "src=" not in m.group(1) and "ld+json" not in m.group(1)]
        pruefe(len(inline) == 2, "%s: erwartet 2 Inline-Skripte, gefunden %d" % (rel, len(inline)))
        for s in inline:
            pruefe(h(s) in direktiven["script-src"], "%s: Hash des Inline-Skripts fehlt: %s" % (rel, s[:50]))
        pruefe(len(direktiven["script-src"]) == 1 + len(set(inline)), "%s: script-src enthält mehr als eigene Herkunft + Inline-Skripte: %s" % (rel, direktiven["script-src"]))
        baum, _ = g.parse(text)
        styles = [k.attrs["style"] for k in alle(baum, lambda x: "style" in x.attrs)]
        n_attr += len(styles)
        for s in styles:
            pruefe(h(s) in direktiven.get("style-src-attr", []), "%s: Hash des style-Attributs fehlt: %s" % (rel, s))
        pruefe(len(direktiven.get("style-src-attr", [])) == (1 + len(set(styles)) if styles else 1), "%s: style-src-attr enthält überzählige Einträge" % rel)
        pruefe(not [k for k in alle(baum, lambda x: any(a.startswith("on") for a in x.attrs))], "%s: Ereignis-Attribut auf der Seite" % rel)
        # Alle geladenen Ressourcen kommen von der eigenen Herkunft (Pfad mit / beginnend, nicht //)
        for k in alle(baum, lambda x: x.tag in ("script", "img", "link", "source", "iframe")):
            for a in ("src", "href", "srcset", "imagesrcset"):
                if k.tag == "link" and a == "href" and k.attrs.get("rel") == "canonical":
                    continue
                v = k.attrs.get(a)
                if not v:
                    continue
                for u in ([x.strip().split()[0] for x in v.split(",") if x.strip()] if "srcset" in a else [v]):
                    pruefe(u.startswith("/") and not u.startswith("//"), "%s: <%s %s=\"%s\"> lädt nicht von der eigenen Herkunft" % (rel, k.tag, a, u))
        hat_form = bool(alle(baum, lambda x: x.tag == "form"))
        hat_karte = bool(alle(baum, lambda x: "data-map-src" in x.attrs))
        pruefe(("https://formsubmit.co" in direktiven["connect-src"]) == hat_form and ("https://formsubmit.co" in direktiven["form-action"]) == hat_form,
               "%s: Formular-Host in connect-src/form-action passt nicht zur Seite (Formular: %s)" % (rel, hat_form))
        pruefe((direktiven["frame-src"] == ["https://www.google.com"]) == hat_karte, "%s: frame-src passt nicht zur Karte (Karte: %s)" % (rel, hat_karte))
        for f in alle(baum, lambda x: x.tag == "form"):
            ak = f.attrs.get("action", "")
            pruefe(re.match(r"^https://formsubmit\.co/ajax/", ak) and "https://formsubmit.co" in direktiven["connect-src"] + direktiven["form-action"],
                   "%s: Formular-Adresse %s ist in der Richtlinie nicht erlaubt" % (rel, ak))
        for k in alle(baum, lambda x: "data-map-src" in x.attrs):
            pruefe(k.attrs["data-map-src"].startswith("https://www.google.com/maps?"), "%s: Karten-Adresse nicht bei %s" % (rel, "https://www.google.com"))
    pruefe(n_attr > 30, "zu wenige style-Attribute gefunden (%d)" % n_attr)

    # Der Bau bricht ab, wenn eine Seite etwas enthielte, das die Richtlinie blockieren würde
    basis_vorlage = os.path.join(ziel, "vorlagen", "basis.html")
    ueber_vorlage = os.path.join(ziel, "vorlagen", "seiten", "ueber-uns.html")
    b0, u0 = lies(basis_vorlage), lies(ueber_vorlage)
    faelle_csp = [
        ("onclick im Inhalt", ueber_vorlage, u0.replace("<h1", '<h1 onclick="x()"', 1), "Ereignis-Attribute"),
        ("fremdes Skript", basis_vorlage, b0.replace("</body>", '<script src="https://evil.example/x.js"></script></body>', 1), "fremder Adresse"),
        ("Meta fehlt", basis_vorlage, b0.replace('<meta http-equiv="Content-Security-Policy" content="{{meta.csp}}" />\n', "", 1), "Content-Security-Policy"),
    ]
    for name, datei, neu, erwartet in faelle_csp:
        with open(datei, "w", encoding="utf-8") as f:
            f.write(neu)
        code, ausgabe = bau_fehler(ziel)
        pruefe(code == 1 and erwartet in ausgabe, "CSP-Fall \"%s\": Bau hätte mit Meldung \"%s\" abbrechen müssen:\n%s" % (name, erwartet, ausgabe[-300:]))
        with open(datei, "w", encoding="utf-8") as f:
            f.write(b0 if datei == basis_vorlage else u0)
    # Neues Inline-Skript in der Vorlage: wird automatisch in die Richtlinie aufgenommen
    with open(basis_vorlage, "w", encoding="utf-8") as f:
        f.write(b0.replace("</body>", "<script>window.x=1</script></body>", 1))
    text = lies(os.path.join(baue(ziel), "index.html"))
    pruefe(csp_hash_von("window.x=1") in text, "neues Inline-Skript wurde nicht in die Richtlinie aufgenommen")
    with open(basis_vorlage, "w", encoding="utf-8") as f:
        f.write(b0)
    # 8.7 Dateitypen: aus images/ und assets/ wird nur Bekanntes ausgeliefert, alles andere mit Warnung ausgelassen
    for rel in ("images/bestand/evil.svg", "images/bestand/evil.html", "images/evil.php", "images/bestand/evil.js", "images/bestand/ohne-endung",
                "assets/evil.html", "assets/evil.svg", "assets/fonts/evil.exe", "assets/fonts/ok.TXT", "images/bestand/gross.PNG"):
        pfad_x = os.path.join(ziel, rel)
        os.makedirs(os.path.dirname(pfad_x), exist_ok=True)
        with open(pfad_x, "wb") as f:
            f.write(b"<script>alert(1)</script>" if "evil" in rel else b"x")
    os.symlink("/etc/hosts", os.path.join(ziel, "images", "bestand", "link-800.webp"))
    os.symlink("../../.git", os.path.join(ziel, "assets", "fonts", "linkordner"))
    r = subprocess.run([sys.executable, "bauen.py"], cwd=ziel, capture_output=True, text=True)
    pruefe(r.returncode == 0, "Bau mit überzähligen Dateien soll mit Warnung gelingen, nicht abbrechen:\n%s" % (r.stdout + r.stderr)[-300:])
    site7 = os.path.join(ziel, "_site")
    for rel in ("images/bestand/evil.svg", "images/bestand/evil.html", "images/evil.php", "images/bestand/evil.js", "images/bestand/ohne-endung",
                "assets/evil.html", "assets/evil.svg", "assets/fonts/evil.exe", "images/bestand/link-800.webp", "assets/fonts/linkordner"):
        pruefe(not os.path.exists(os.path.join(site7, rel)), "%s wurde ausgeliefert (Dateityp nicht erlaubt)" % rel)
        if not rel.endswith("linkordner"):
            pruefe(("Hinweis %s" % rel) in r.stdout, "keine Warnung zu %s:\n%s" % (rel, r.stdout[-400:]))
    for rel in ("assets/fonts/ok.TXT", "images/bestand/gross.PNG", "assets/fonts/archivo-latin-wdth.woff2", "images/bestand/terrasse-doppelhaus-1-800.webp", "favicon.svg"):
        pruefe(os.path.exists(os.path.join(site7, rel)), "%s fehlt in _site (erlaubter Dateityp)" % rel)
    pruefe(not [f for _w, _d, fs in os.walk(site7) for f in fs if f.lower().endswith((".svg", ".html", ".php", ".exe")) and not _w.endswith("_site") and "admin" not in _w and f not in ("index.html", "favicon.svg")],
           "unerwartete Dateitypen in _site")
    for rel in ("images/bestand/evil.svg", "images/bestand/evil.html", "images/evil.php", "images/bestand/evil.js", "images/bestand/ohne-endung",
                "assets/evil.html", "assets/evil.svg", "assets/fonts/evil.exe", "assets/fonts/ok.TXT", "images/bestand/gross.PNG",
                "images/bestand/link-800.webp", "assets/fonts/linkordner"):
        os.remove(os.path.join(ziel, rel))
    baue(ziel)
    # 8.8 Bildliste: Pfade in bilder.json (ordner, original, Logo) dürfen den Bilderordner nicht verlassen
    bl_pfad = os.path.join(ziel, "inhalt", "bilder.json")
    bl0 = json.loads(lies(bl_pfad))
    site_bl = baue(ziel)
    index_bl = lies(os.path.join(site_bl, "index.html"))

    def bilder_abbruch(name, aendern, erwartet):
        d_ = json.loads(json.dumps(bl0))
        aendern(d_)
        speichere(bl_pfad, d_)
        code, ausgabe = bau_fehler(ziel)
        pruefe(code == 1 and erwartet in ausgabe, "bilder.json %s: Bau hätte mit Meldung \"%s\" abbrechen müssen:\n%s" % (name, erwartet, ausgabe[-300:]))
        pruefe(lies(os.path.join(site_bl, "index.html")) == index_bl, "bilder.json %s: bisherige _site wurde verändert" % name)
        speichere(bl_pfad, bl0)

    for boese in ("../..", "images/../..", "/etc", "images/", "images//x", "images/Bestand", "admin", "images/bestand/../../admin", "images\\bestand"):
        bilder_abbruch("ordner %r" % boese, lambda d_, b=boese: d_.__setitem__("ordner", b), "Format passt nicht")
    for boese in ("../../admin/index.html", "/etc/passwd", "x.svg", "x.jpg.html", "x", "a b.jpg", "../x.jpg"):
        bilder_abbruch("original %r" % boese, lambda d_, b=boese: d_["bilder"][0].__setitem__("original", b), "Format passt nicht")
    bilder_abbruch("original mit Zeilenumbruch", lambda d_: d_["bilder"][0].__setitem__("original", "x.jpg\n"), "Zeilenumbrüche")
    for boese in ("../x.webp", "/etc/passwd", "logo.svg", "logo.webp/../../x.webp", "Logo.webp"):
        bilder_abbruch("logo.datei %r" % boese, lambda d_, b=boese: d_["logo"].__setitem__("datei", b), "Format passt nicht")
    d_ = json.loads(json.dumps(bl0))
    d_["bilder"][0]["original"] = "terrasse-doppelhaus-1.jpg"
    speichere(bl_pfad, d_)
    pruefe(os.path.exists(os.path.join(baue(ziel), "images", "bestand", "terrasse-doppelhaus-1.jpg")), "gültiges original wird nicht ausgeliefert")
    speichere(bl_pfad, bl0)
    baue(ziel)
    print("   %d Rechtstext-Testfälle (gleiche wie im Browser-Teil), 7 Build-Abbrüche, erlaubte Texte bestehen" % len(faelle))
    print("   Richtlinie auf %d Seiten: Hashes, kein unsafe-inline, nur eigene Herkunft, FormSubmit/Google nur wo nötig, 3 Bau-Abbrüche" % len(seiten))

    print("   E-Mail/Domain-Muster, JS-Maskierung (Node-Gegenprobe), JSON-LD geprüft")


# ---------------------------------------------------------------------- Test 9
def test_inhalt_branch(wurzel):
    print("Test 9: Schutz des Branches inhalt (pruefe_inhalt_branch.py)")
    skript = os.path.join(HIER, ".github", "skripte", "pruefe_inhalt_branch.py")
    repo = os.path.join(wurzel, "t9")
    os.makedirs(repo)
    env = dict(os.environ, GIT_AUTHOR_NAME="Test", GIT_AUTHOR_EMAIL="t@example.org", GIT_COMMITTER_NAME="Test", GIT_COMMITTER_EMAIL="t@example.org",
               GIT_CONFIG_GLOBAL=os.devnull, GIT_CONFIG_SYSTEM=os.devnull)

    def git(*args, ok=True):
        r = subprocess.run(["git", "-C", repo] + list(args), capture_output=True, text=True, env=env)
        if ok and r.returncode != 0:
            raise SystemExit("git %s fehlgeschlagen: %s" % (" ".join(args), r.stderr))
        return r

    def datei(rel, inhalt=b"x"):
        pfad = os.path.join(repo, rel)
        os.makedirs(os.path.dirname(pfad), exist_ok=True)
        with open(pfad, "wb") as f:
            f.write(inhalt)

    def pruefe_skript(inhalt="inhalt", basis="main"):
        r = subprocess.run([sys.executable, "-I", skript, "--repo", repo, "--basis", basis, "--inhalt", inhalt], capture_output=True, text=True)
        return r.returncode, r.stdout + r.stderr

    git("init", "-q")
    git("checkout", "-q", "-b", "main")
    for rel in ("inhalt/seite.json", "inhalt/seiten/start.json", "inhalt/schema/seite.json", "inhalt/struktur.json", "inhalt/recht/impressum.html",
                "images/bestand/a-800.webp", "images/bestand/a-800.webp.json", "images/README.md", "admin/admin.js", "assets/main.js",
                "vorlagen/basis.html", "bauen.py", ".github/workflows/veroeffentlichen.yml"):
        datei(rel)
    git("add", "-A")
    git("commit", "-q", "-m", "Ausgang")

    def neuer_zweig(name):
        git("checkout", "-q", "-B", name, "main")

    def fall(name, aufbau, erwartet_ok, muster=()):
        neuer_zweig("inhalt")
        aufbau()
        git("add", "-A")
        git("commit", "-q", "-m", "Admin: Test", "--allow-empty")
        code, ausgabe = pruefe_skript()
        pruefe((code == 0) == erwartet_ok, "Fall \"%s\": erwartet %s, Ende-Code %d:\n%s" % (name, "ok" if erwartet_ok else "Abbruch", code, ausgabe[-300:]))
        for m in muster:
            pruefe(m in ausgabe, "Fall \"%s\": Meldung enthält nicht \"%s\":\n%s" % (name, m, ausgabe[-300:]))
        if not erwartet_ok:
            pruefe("Es wird nichts gebaut" in ausgabe, "Fall \"%s\": keine deutsche Abbruchmeldung" % name)

    def symlink(ziel, rel):
        pfad = os.path.join(repo, rel)
        os.makedirs(os.path.dirname(pfad), exist_ok=True)
        os.symlink(ziel, pfad)

    def ausfuehrbar(rel):
        datei(rel)
        os.chmod(os.path.join(repo, rel), 0o755)

    # --- erlaubt
    fall("nichts geändert", lambda: None, True)
    fall("Inhalte und Fotos",
         lambda: (datei("inhalt/seite.json", b"neu"), datei("inhalt/seiten/neu.json"), datei("inhalt/recht/impressum.html", b"neu"),
                  datei("images/bestand/b-800.webp"), datei("images/bestand/b-1600.WEBP"), datei("images/bestand/b.jpg"),
                  datei("images/bestand/b.jpeg"), datei("images/bestand/b.png")), True)
    fall("JPEG-Foto aus der Verwaltung (Größen -800/-1600/-2048.jpg anlegen und wieder löschen)",
         lambda: (datei("images/bestand/iphone-800.jpg"), datei("images/bestand/iphone-1600.jpg"), datei("images/bestand/iphone-2048.jpg"),
                  datei("inhalt/bilder.json", b"neu")), True)
    fall("JPEG-Foto löschen", lambda: (datei("images/bestand/iphone-800.jpg"), os.remove(os.path.join(repo, "images/bestand/iphone-800.jpg"))), True)
    fall("Foto löschen (auch Maßdatei und Notiz)", lambda: (os.remove(os.path.join(repo, "images/bestand/a-800.webp")),
                                                           os.remove(os.path.join(repo, "images/bestand/a-800.webp.json")),
                                                           os.remove(os.path.join(repo, "images/README.md"))), True)
    fall("unter inhalt/ beliebige Notiz", lambda: datei("inhalt/README-technik.txt"), True)
    # --- unerlaubt
    fall("Panel-Code geändert", lambda: datei("admin/admin.js", b"boese"), False, ["admin/admin.js"])
    fall("Panel-Code neu", lambda: datei("admin/neu.js"), False, ["admin/neu.js"])
    fall("Generator geändert", lambda: datei("bauen.py", b"boese"), False, ["bauen.py"])
    fall("Workflow geändert", lambda: datei(".github/workflows/veroeffentlichen.yml", b"boese"), False, [".github/workflows/veroeffentlichen.yml"])
    fall("Prüfskript geändert", lambda: datei(".github/skripte/pruefe_inhalt_branch.py", b"exit 0"), False, [".github/skripte/"])
    fall("Vorlage geändert", lambda: datei("vorlagen/basis.html", b"<script>"), False, ["vorlagen/basis.html"])
    fall("assets geändert", lambda: datei("assets/main.js", b"boese"), False, ["assets/main.js"])
    fall("Admin gelöscht", lambda: os.remove(os.path.join(repo, "admin/admin.js")), False, ["admin/admin.js"])
    fall("ähnlicher Ordnername", lambda: datei("inhalt-evil/x.json"), False, ["inhalt-evil/x.json"])
    fall("Datei neben inhalt", lambda: datei("inhalt.json"), False, ["inhalt.json"])
    fall("Datei im Hauptordner", lambda: datei("index.html"), False, ["index.html"])
    fall("Feldbeschreibung geändert", lambda: datei("inhalt/schema/seite.json", b"lockerer"), False, ["inhalt/schema/seite.json", "main"])
    fall("Seitenregister geändert", lambda: datei("inhalt/struktur.json", b"neu"), False, ["inhalt/struktur.json"])
    fall("SVG in images", lambda: datei("images/bestand/x.svg"), False, ["images/bestand/x.svg", "erlaubt"])
    fall("HTML in images", lambda: datei("images/bestand/x.html"), False, ["images/bestand/x.html"])
    fall("PHP in images", lambda: datei("images/x.php"), False, ["images/x.php"])
    fall("Datei ohne Endung in images", lambda: datei("images/bestand/x"), False, ["images/bestand/x"])
    fall("Doppelendung in images", lambda: datei("images/bestand/x.webp.html"), False, ["images/bestand/x.webp.html"])
    fall("Maßdatei geändert (kein Bild)", lambda: datei("images/bestand/a-800.webp.json", b"neu"), False, ["a-800.webp.json"])
    fall("Symlink als Bild", lambda: symlink("../../.git/config", "images/bestand/c-800.webp"), False, ["images/bestand/c-800.webp", "Dateityp"])
    fall("Symlink unter inhalt", lambda: symlink("/etc/passwd", "inhalt/seiten/p.json"), False, ["inhalt/seiten/p.json", "Dateityp"])
    fall("ausführbare Datei", lambda: ausfuehrbar("images/bestand/d-800.webp"), False, ["images/bestand/d-800.webp", "Dateityp"])
    fall("Mischung erlaubt und unerlaubt", lambda: (datei("inhalt/seite.json", b"neu"), datei("admin/x.js")), False, ["admin/x.js"])
    # Pfadregeln direkt (ohne Git): auch eine Datei "inhalt/schema" (statt des Ordners) und Verwechslungen sind verboten
    import importlib.util
    spec = importlib.util.spec_from_file_location("pruefe_inhalt_branch", skript)
    modul = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modul)
    for status, modus, rel, erwartet in [("A", "100644", "inhalt/schema", False), ("M", "100644", "inhalt/schema/seite.json", False),
                                         ("M", "100644", "inhalt/struktur.json", False), ("A", "100644", "inhalt/struktur.json/x", False),
                                         ("A", "100644", "inhalt/schemas.json", True), ("M", "100644", "inhalt/seiten/a.json", True),
                                         ("A", "100644", "inhalt/../admin/x.js", False), ("A", "100644", "inhalt//x.json", False),
                                         ("A", "100644", "images/./a.webp", False), ("A", "100644", "images/a\\b.webp", False),
                                         ("A", "100644", "images/a.webp", True), ("A", "160000", "images/sub.webp", False)]:
        pruefe((not modul.pruefe([(status, modus, rel)])) == erwartet, "Pfadregel %s %s: erwartet %s" % (status, rel, "erlaubt" if erwartet else "verboten"))
    # --- main läuft weiter: Änderungen an main zählen nicht gegen inhalt
    neuer_zweig("inhalt")
    datei("inhalt/seite.json", b"neu")
    git("add", "-A")
    git("commit", "-q", "-m", "Admin: Inhalt")
    git("checkout", "-q", "main")
    datei("admin/admin.js", b"Entwickler hat weitergearbeitet")
    datei("inhalt/schema/seite.json", b"Entwickler: neues Feld")
    git("add", "-A")
    git("commit", "-q", "-m", "Entwickler: Code")
    code, ausgabe = pruefe_skript()
    pruefe(code == 0, "main ist weitergelaufen, inhalt unverändert: sollte erlaubt sein:\n%s" % ausgabe[-300:])
    # ... und nach dem Zusammenführen von main in inhalt
    git("checkout", "-q", "inhalt")
    git("merge", "-q", "--no-edit", "main")
    code, ausgabe = pruefe_skript()
    pruefe(code == 0, "nach 'git merge main' in inhalt: sollte erlaubt sein:\n%s" % ausgabe[-300:])
    git("checkout", "-q", "main")
    # --- fehlende Zweige
    code, ausgabe = pruefe_skript(inhalt="gibt-es-nicht")
    pruefe(code == 1 and "gibt es nicht" in ausgabe, "fehlender Zweig muss abbrechen:\n%s" % ausgabe)
    git("checkout", "-q", "--orphan", "fremd")
    git("rm", "-rq", "--cached", ".")
    datei("inhalt/seite.json", b"ohne Vorgeschichte")
    git("add", "inhalt/seite.json")
    git("commit", "-q", "-m", "fremde Vorgeschichte")
    code, ausgabe = pruefe_skript(inhalt="fremd")
    pruefe(code == 1 and "gemeinsame Vorgeschichte" in ausgabe, "Zweig ohne gemeinsame Vorgeschichte muss abbrechen:\n%s" % ausgabe)
    print("   Prüfskript: 6 erlaubte (darunter JPEG-Größen) und 23 unerlaubte Änderungen, main läuft weiter, Merge von main, fehlender Zweig, fremde Vorgeschichte")

    # Der Workflow selbst (Textprüfung: ob er wirklich in GitHub läuft, lässt sich nur dort zeigen)
    wf = lies(os.path.join(HIER, ".github", "workflows", "veroeffentlichen.yml"))
    zeilen = [z for z in wf.splitlines() if not z.lstrip().startswith("#")]
    wf_ohne_kommentare = "\n".join(zeilen)
    pruefe(re.search(r"branches: \[main, inhalt\]", wf_ohne_kommentare) is not None, "Workflow startet nicht auf main UND inhalt")
    pruefe(re.search(r"^permissions: \{\}$", wf_ohne_kommentare, re.M) is not None, "Workflow: Standardrechte sind nicht leer")
    build = wf_ohne_kommentare[wf_ohne_kommentare.index("\n  build:"):wf_ohne_kommentare.index("\n  deploy:")]
    deploy = wf_ohne_kommentare[wf_ohne_kommentare.index("\n  deploy:"):]
    pruefe(re.search(r"permissions:\n      contents: read\n    steps:", build) is not None and "write" not in build, "build-Auftrag hat mehr als contents: read")
    pruefe(re.search(r"permissions:\n      pages: write\n      id-token: write\n", deploy) is not None and "contents" not in deploy, "deploy-Auftrag hat nicht genau pages: write und id-token: write")
    pruefe("ref: main" in build and "fetch-depth: 0" in build and "persist-credentials: false" in build, "build checkt nicht main (mit Verlauf, ohne Zugangsdaten) aus")
    pruefe(build.index("pruefe_inhalt_branch.py") < build.index("git worktree add") < build.index("python3 bauen.py"),
           "Reihenfolge im build: erst prüfen, dann Inhalt übernehmen, dann bauen")
    pruefe("--exclude='schema/'" in build and "--exclude='struktur.json'" in build and "--no-links" in build, "Übernahme: schema/, struktur.json oder Links nicht ausgeschlossen")
    pruefe(all(("--include='*.%s'" % e) in build for e in ("webp", "jpg", "jpeg", "png")) and "--exclude='*'" in build, "Übernahme der Fotos: Dateitypen nicht eingeschränkt")
    pruefe(re.search(r"inhalt/\*\*", wf_ohne_kommentare) and ".github/skripte/**" in wf_ohne_kommentare, "Workflow: paths enthält inhalt/** oder die Skripte nicht")
    pruefe("pull_request_target" not in wf, "Workflow darf pull_request_target nicht benutzen")
    with open(os.path.join(HIER, "inhalt", "seite.json"), encoding="utf-8") as f:
        pruefe(json.load(f)["admin"]["branch"] == "inhalt", "admin.branch in inhalt/seite.json ist nicht \"inhalt\"")
    pruefe(os.path.exists(os.path.join(HIER, "einrichten.sh")), "einrichten.sh fehlt")
    with open(os.path.join(HIER, "einrichten.sh"), encoding="utf-8") as f:
        es = f.read()
    pruefe("EINRICHTEN_BESTAETIGT" in es and "NICHT AUTOMATISCH AUSFÜHREN" in es and "BESITZER/PROJEKT" in es, "einrichten.sh: Sicherung gegen Ausführen oder Platzhalter fehlt")
    r = subprocess.run(["bash", "-n", os.path.join(HIER, "einrichten.sh")], capture_output=True, text=True)
    pruefe(r.returncode == 0, "einrichten.sh: Syntaxfehler: %s" % r.stderr)
    r = subprocess.run(["bash", os.path.join(HIER, "einrichten.sh"), "2"], capture_output=True, text=True, env=dict(os.environ, EINRICHTEN_BESTAETIGT="ja"))
    pruefe(r.returncode == 1 and "REPO" in r.stderr, "einrichten.sh läuft mit Platzhalter-Repo weiter (darf nicht)")
    print("   Workflow: main+inhalt, Rechte je Auftrag, Reihenfolge Prüfen/Übernehmen/Bauen; einrichten.sh nur als Vorlage")


def main():
    behalten = "--behalten" in sys.argv
    wurzel = tempfile.mkdtemp(prefix="zeca-aenderung-")
    try:
        test_telefon(wurzel)
        test_email_adresse(wurzel)
        test_vorschau(wurzel)
        test_sicherungen(wurzel)
        test_wirkung(wurzel)
        test_admin(wurzel)
        test_fotos(wurzel)
        test_fotos_jpeg(wurzel)
        test_sicherheit(wurzel)
        test_inhalt_branch(wurzel)
    finally:
        if behalten:
            print("Kopien liegen in %s" % wurzel)
        else:
            shutil.rmtree(wurzel, ignore_errors=True)
    print()
    print("Einzelprüfungen ok: %d, Fehler: %d" % (ERGEBNIS["ok"], ERGEBNIS["fehler"]))
    return 0 if ERGEBNIS["fehler"] == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
