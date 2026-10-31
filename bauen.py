#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
bauen.py – erzeugt die ZeCa-Alu-Webseite aus strukturierten Inhalten.

    python3 bauen.py              Seite nach _site/ bauen
    python3 bauen.py --pruefen    nur prüfen (Pflichtfelder, Bilder, Links), nichts schreiben
    python3 bauen.py --ziel ORDNER   anderer Ausgabeordner (Standard: _site)

Eingabe:
    inhalt/        Texte und Einstellungen als JSON (+ inhalt/schema/ = Feldbeschreibungen)
    vorlagen/      HTML-Vorlagen und Zeichnungen (Gestaltung, nicht für Redakteure)
    assets/, images/, favicon.svg    unverändert nach _site/ kopiert
Ausgabe:
    _site/         fertige Seite (kann 1:1 auf den Webserver / GitHub Pages)

Nur Python-Standardbibliothek (getestet mit 3.9). Aufbau dieser Datei:
    1. Fehler sammeln          5. Bilder (srcset, WebP-Größe)
    2. JSON laden              6. Vorlagen-Sprache (kleine Mini-Engine)
    3. Platzhalter und Markup  7. Seiten zusammensetzen
    4. Prüfung gegen Schema    8. Ausgabe (Dateien, robots.txt, sitemap.xml)
"""
import argparse
import base64
import copy
import hashlib
import html
import json
import os
import re
import shutil
import sys
from html.parser import HTMLParser
from urllib.parse import quote_plus, urlsplit

HIER = os.path.dirname(os.path.abspath(__file__))
INHALT = os.path.join(HIER, "inhalt")
VORLAGEN = os.path.join(HIER, "vorlagen")

# ======================================================================
# 1. Fehler sammeln
# ======================================================================
FEHLER = []    # Meldungen, die den Bau stoppen
HINWEISE = []  # Meldungen, die nur angezeigt werden


def fehler(wo, was):
    FEHLER.append("FEHLER  %s\n        %s" % (wo, was))


def hinweis(wo, was):
    HINWEISE.append("Hinweis %s: %s" % (wo, was))


class Sicher(str):
    """Text, der schon gültiges HTML ist und nicht mehr maskiert wird."""


# Feste Formate für Werte, die in HTML, Skripte oder Adressen eingesetzt werden. Sie gelten unabhängig vom Schema
# (inhalt/schema/*.json): Wer das Schema lockert, lockert diese Prüfung nicht. Bei Änderung auch admin/pruefung.js anpassen.
EMAIL_MUSTER = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
FORMULAR_AKTION_MUSTER = re.compile(r"https://formsubmit\.co/ajax/[A-Za-z0-9@._%+\-]+")
DOMAIN_MUSTER = re.compile(r"https?://[A-Za-z0-9.\-]+(:[0-9]{1,5})?")
FORM_HOST_MUSTER = re.compile(r"https://[A-Za-z0-9.\-]+")   # Herkunft der Formular-Adresse in der Sicherheitsrichtlinie
KARTEN_HOST = "https://www.google.com"     # Google Maps (erst nach Klick geladen); gehört zur Inhalts-Sicherheitsrichtlinie (frame-src)
FESTE_MUSTER = {
    # Feldpfad in inhalt/seite.json -> (Muster, Meldung)
    "kontakt.email": (EMAIL_MUSTER, "Ungültige E-Mail-Adresse. Erlaubt sind Buchstaben, Ziffern und . _ % + - vor dem @, danach Domain mit Endung (z. B. info@zeca-alu.de)."),
    "formular.aktion": (FORMULAR_AKTION_MUSTER, "Ungültige Formular-Adresse. Erlaubt ist nur https://formsubmit.co/ajax/<Adresse oder Kennung> (Buchstaben, Ziffern, @ . _ % + -)."),
    "veroeffentlichung.domain": (DOMAIN_MUSTER, "Ungültige Domain. Erwartet z. B. https://zeca-alu.de (nur Buchstaben, Ziffern, Punkt, Bindestrich, optional :Port; ohne Schrägstrich am Ende)."),
}


# ======================================================================
# 2. JSON laden
# ======================================================================
def lade_json(rel):
    """Liest eine JSON-Datei relativ zum Projektordner. Gibt None zurück und merkt sich den Fehler."""
    pfad = os.path.join(HIER, rel)
    try:
        with open(pfad, encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        fehler(rel, "Datei fehlt.")
    except ValueError as e:
        fehler(rel, "Keine gültige JSON-Datei (%s). Meist fehlt ein Komma oder ein Anführungszeichen." % e)
    return None


def lade_text(rel):
    pfad = os.path.join(HIER, rel)
    try:
        with open(pfad, encoding="utf-8") as f:
            return f.read()
    except FileNotFoundError:
        fehler(rel, "Datei fehlt.")
        return ""


# ======================================================================
# 3. Platzhalter und kleines Markup
# ======================================================================
PLATZHALTER = {}   # wird nach dem Laden von seite.json gefüllt
BASIS = "/"        # basis_pfad aus seite.json
INTERNE_LINKS = []  # (Ziel, Fundstelle) für die spätere Prüfung

_PH = re.compile(r"\{\{\s*([a-z0-9_]+)\s*\}\}")


def ersetze_platzhalter(text, wo, maskieren=False):
    """{{telefon}}, {{email}} usw. durch die Werte aus seite.json ersetzen."""
    def f(m):
        name = m.group(1)
        if name not in PLATZHALTER:
            fehler(wo, "Unbekannter Platzhalter {{%s}}. Erlaubt: %s"
                   % (name, ", ".join("{{%s}}" % k for k in sorted(PLATZHALTER))))
            return m.group(0)
        wert = PLATZHALTER[name]
        return html.escape(wert, quote=True) if maskieren else wert
    return _PH.sub(f, text)


_TAG = re.compile(r"<(/?)(strong|em|a)(?:\s+href=(?:\"([^\"]*)\"|'([^']*)'))?\s*>", re.I)
_URL_OK = ("/", "#", "https://", "http://", "mailto:", "tel:")


def markup_zu_html(text, wo):
    """
    Erlaubt nur <strong>, <em> und <a href="...">. Alles andere wird maskiert
    (erscheint als sichtbarer Text). Interne Links ("/carport/") bekommen den Basis-Pfad.
    """
    ausgabe = []
    offen = []
    pos = 0
    for m in _TAG.finditer(text):
        ausgabe.append(html.escape(text[pos:m.start()], quote=False))
        pos = m.end()
        schliessend = m.group(1) == "/"
        tag = m.group(2).lower()
        if schliessend:
            if offen and offen[-1] == "a!" and tag == "a":
                offen.pop()  # schließt einen abgelehnten Link: nichts ausgeben, Fehler wurde schon gemeldet
            elif offen and offen[-1] == tag:
                offen.pop()
                ausgabe.append("</%s>" % tag)
            else:
                fehler(wo, "Markup nicht sauber verschachtelt: </%s> ohne passendes <%s>." % (tag, tag))
            continue
        if tag == "a":
            url = m.group(3) if m.group(3) is not None else m.group(4)
            if url is None:
                ausgabe.append(html.escape(m.group(0), quote=False))
                hinweis(wo, "<a> ohne href wird als Text angezeigt.")
                continue
            if not url.startswith(_URL_OK) or url.startswith("//"):
                fehler(wo, "Link-Ziel \"%s\" nicht erlaubt. Erlaubt: /seite/, #anker, https://, http://, mailto:, tel:" % url)
                offen.append("a!")
                continue
            if url.startswith("/"):
                INTERNE_LINKS.append((url, wo))
                url = BASIS + url[1:]
            ausgabe.append('<a href="%s">' % html.escape(url, quote=True))
            offen.append("a")
        else:
            if m.group(3) is not None or m.group(4) is not None:
                hinweis(wo, "<%s> kennt kein href; das Attribut wird ignoriert." % tag)
            ausgabe.append("<%s>" % tag)
            offen.append(tag)
    ausgabe.append(html.escape(text[pos:], quote=False))
    for tag in reversed(offen):
        tag = tag.rstrip("!")
        fehler(wo, "Markup nicht geschlossen: <%s> hat kein </%s>." % (tag, tag))
    rest = _TAG.sub("", text)
    if re.search(r"<[A-Za-z/!]", rest):
        hinweis(wo, "Enthält HTML, das nicht erlaubt ist; es wird als Text angezeigt.")
    return "".join(ausgabe)


# Rechtstexte (inhalt/recht/*.html) sind ein HTML-Block, der in die Seite eingefügt wird. Erlaubt ist nur dieser kleine
# Ausschnitt; alles andere (Skripte, Ereignis-Attribute, iframe, style, Kommentare ...) bricht den Bau ab.
# Gleiche Regeln in admin/pruefung.js (pruefeRechtHtml); gemeinsame Testfälle: admin/test/rechtstext_faelle.json.
RECHT_TAGS = ("p", "h2", "h3", "ul", "ol", "li", "br", "strong", "em", "a")
RECHT_LEER = ("br",)                       # Tags ohne Ende
RECHT_REL = ("noopener", "noreferrer")
_WS = r"[ \t\n\r\f]"                     # nur ASCII-Leerraum (HTML), damit Python und JavaScript gleich lesen
_RECHT_START = re.compile(r'<([A-Za-z][A-Za-z0-9]*)((?:%s+[A-Za-z][A-Za-z0-9-]*%s*=%s*"[^"<>&]*")*)%s*(/?)>' % (_WS, _WS, _WS, _WS))
_RECHT_ENDE = re.compile(r'</([A-Za-z][A-Za-z0-9]*)%s*>' % _WS)
_RECHT_ATTR = re.compile(r'([A-Za-z][A-Za-z0-9-]*)%s*=%s*"([^"]*)"' % (_WS, _WS))
_LINK_OHNE_SONDERZEICHEN = re.compile(r"[^\x00-\x20\x7f-\x9f\\\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]*")


def link_ziel_ok(url):
    """Link-Ziel erlaubt? (/seite/, #anker, https://, http://, mailto:, tel:; nicht //..., keine Leer- oder Steuerzeichen, kein Backslash)"""
    return url.startswith(_URL_OK) and not url.startswith("//") and _LINK_OHNE_SONDERZEICHEN.fullmatch(url) is not None


class _TagFolge(HTMLParser):
    """Zweiter, unabhängiger Leser (html.parser): liefert die Folge der Tags, zum Abgleich mit der strengen Zerlegung."""

    def __init__(self):
        super().__init__(convert_charrefs=False)
        self.folge = []

    def handle_starttag(self, tag, attrs):
        self.folge.append(tag)

    def handle_startendtag(self, tag, attrs):
        self.folge.append(tag)

    def handle_endtag(self, tag):
        self.folge.append("/" + tag)

    def handle_comment(self, data):
        self.folge.append("!--")

    def handle_decl(self, decl):
        self.folge.append("!")

    def handle_pi(self, data):
        self.folge.append("?")

    def unknown_decl(self, data):
        self.folge.append("![")


def pruefe_rechtstext(text, wo):
    """
    Prüft einen Rechtstext (Platzhalter sind schon eingesetzt und maskiert) gegen die Allowlist und gibt ihn zurück.
    Jedes "<" muss ein genau so geschriebenes erlaubtes Tag beginnen, sonst ist es ein Fehler (so kann kein Leser
    etwas anderes sehen als der Browser). Interne Links (/seite/) bekommen den Basis-Pfad, sonst bleibt der Text unverändert.
    """
    erlaubt = ", ".join(RECHT_TAGS)
    anzahl_vorher = len(FEHLER)

    def f(pos, was):
        fehler("%s, Zeile %d" % (wo, text.count("\n", 0, pos) + 1), was)

    ausgabe, letzte = [], 0
    stapel, folge = [], []
    i = text.find("<")
    while i != -1:
        m = _RECHT_START.match(text, i)
        e = None if m else _RECHT_ENDE.match(text, i)
        if not (m or e):
            f(i, "Unerlaubtes oder kaputtes HTML bei \"%s\". Erlaubt sind nur die Tags %s (Attribute nur bei <a>: href, target=\"_blank\", rel). "
                 "Ein einzelnes < bitte als &lt; schreiben." % (text[i:i + 24].replace("\n", " "), erlaubt))
            i = text.find("<", i + 1)
            continue
        tag = (m or e).group(1).lower()
        folge.append(("/" if e else "") + tag)
        if tag not in RECHT_TAGS:
            f(i, "<%s> ist in Rechtstexten nicht erlaubt. Erlaubt sind nur: %s." % (tag, erlaubt))
        elif e:
            if tag in RECHT_LEER:
                f(i, "</%s> gibt es nicht (<%s> hat kein Ende)." % (tag, tag))
            elif stapel and stapel[-1] == tag:
                stapel.pop()
            else:
                f(i, "</%s> ohne passendes <%s> davor (Tags falsch verschachtelt)." % (tag, tag))
        else:
            attrs = []
            for a in _RECHT_ATTR.finditer(text, m.start(2), m.end(2)):
                attrs.append((a.group(1).lower(), a.group(2), a))
            namen = [a[0] for a in attrs]
            if len(set(namen)) != len(namen):
                f(i, "<%s>: ein Attribut kommt doppelt vor." % tag)
            if tag in RECHT_LEER:
                if attrs:
                    f(i, "<%s> darf keine Attribute haben." % tag)
            else:
                if m.group(3):
                    f(i, "<%s/> ist nicht erlaubt; Tags außer <br> werden mit </%s> geschlossen." % (tag, tag))
                stapel.append(tag)
            if tag == "a":
                for name, wert, a in attrs:
                    if name == "href":
                        if not link_ziel_ok(wert):
                            f(i, "Link-Ziel \"%s\" nicht erlaubt. Erlaubt: /seite/, #anker, https://, http://, mailto:, tel: (ohne Leerzeichen, Backslash und &)." % wert)
                        elif wert.startswith("/"):
                            INTERNE_LINKS.append((wert, wo))
                            ausgabe.append(text[letzte:a.start(2)])
                            ausgabe.append(BASIS + wert[1:])
                            letzte = a.end(2)
                    elif name == "target":
                        if wert != "_blank":
                            f(i, "target=\"%s\" nicht erlaubt (nur \"_blank\")." % wert)
                    elif name == "rel":
                        if not wert.split() or any(r not in RECHT_REL for r in wert.split()):
                            f(i, "rel=\"%s\" nicht erlaubt (nur %s)." % (wert, " und ".join(RECHT_REL)))
                    else:
                        f(i, "Attribut \"%s\" ist bei <a> nicht erlaubt (nur href, target, rel)." % name)
                if "href" not in namen:
                    f(i, "<a> ohne href ist nicht erlaubt.")
            elif attrs:
                f(i, "<%s> darf keine Attribute haben (nur <a>: href, target, rel)." % tag)
        i = text.find("<", (m or e).end())
    for tag in reversed(stapel):
        fehler(wo, "Tag nicht geschlossen: <%s> hat kein </%s>." % (tag, tag))
    if len(FEHLER) == anzahl_vorher:
        leser = _TagFolge()
        leser.feed(text)
        leser.close()
        if [x.lower() for x in leser.folge] != folge:
            fehler(wo, "Der Rechtstext wird von einem zweiten HTML-Leser anders gelesen als erwartet. Bitte den HTML-Text vereinfachen.")
    ausgabe.append(text[letzte:])
    return "".join(ausgabe)


# ======================================================================
# 4. Prüfung gegen das Schema (inhalt/schema/*.json) und Aufbereitung
# ======================================================================
def ist_leer(wert, spec):
    if wert is None:
        return True
    typ = spec["typ"]
    if typ in ("text", "textarea", "bild", "auswahl"):
        return isinstance(wert, str) and wert.strip() == ""
    if typ == "liste":
        return isinstance(wert, list) and len(wert) == 0
    if typ == "gruppe":
        return isinstance(wert, dict) and len(wert) == 0
    return False


def verarbeite(wert, spec, pfad, datei, bilder=None, ph=True):
    """
    Prüft einen Wert gegen seine Feldbeschreibung und gibt ihn aufbereitet zurück
    (Platzhalter ersetzt, Markup-Felder als Sicher-HTML). Fehler landen in FEHLER.
    """
    typ = spec["typ"]
    wo = "%s, Feld \"%s\"%s" % (datei, pfad, (" (%s)" % spec["label"]) if spec.get("label") else "")

    if typ == "gruppe":
        if not isinstance(wert, dict):
            fehler(wo, "Hier muss eine Gruppe (Objekt) stehen.")
            return {}
        bekannt = [f["schluessel"] for f in spec["felder"]]
        for k in wert:
            if k not in bekannt:
                fehler("%s, Feld \"%s\"" % (datei, (pfad + "." if pfad else "") + k),
                       "Unbekanntes Feld. Es steht nicht in der Schema-Datei und würde nie angezeigt. Bekannt: %s" % ", ".join(bekannt))
        aus = {}
        for f in spec["felder"]:
            k = f["schluessel"]
            v = wert.get(k)
            unterpfad = (pfad + "." if pfad else "") + k
            if f["typ"] == "liste" and (v is None or v == []):
                if f.get("min", 0) > 0 and f.get("pflicht", True):
                    fehler("%s, Feld \"%s\" (%s)" % (datei, unterpfad, f.get("label", "")),
                           "Pflichtfeld: mindestens %d Einträge nötig." % f["min"])
                else:
                    aus[k] = []
                continue
            if ist_leer(v, f):
                if f.get("pflicht", True):
                    fehler("%s, Feld \"%s\" (%s)" % (datei, unterpfad, f.get("label", "")),
                           "Pflichtfeld fehlt oder ist leer.")
                continue
            aus[k] = verarbeite(v, f, unterpfad, datei, bilder, ph)
        return aus

    if typ == "liste":
        if not isinstance(wert, list):
            fehler(wo, "Hier muss eine Liste stehen.")
            return []
        n = len(wert)
        if n < spec.get("min", 0):
            fehler(wo, "Zu wenige Einträge: %d vorhanden, mindestens %d nötig." % (n, spec["min"]))
        if n > spec.get("max", 10 ** 6):
            fehler(wo, "Zu viele Einträge: %d vorhanden, höchstens %d erlaubt." % (n, spec["max"]))
        aus = []
        for i, eintrag in enumerate(wert):
            sp = "%s[%d]" % (pfad, i + 1)
            if eintrag is None or (isinstance(eintrag, str) and eintrag.strip() == ""):
                fehler("%s, Feld \"%s\"" % (datei, sp), "Eintrag ist leer. Leere Einträge bitte löschen.")
                continue
            e = copy.deepcopy(spec["eintrag"])
            e.setdefault("label", spec.get("eintrag_label", ""))
            aus.append(verarbeite(eintrag, e, sp, datei, bilder, ph))
        return aus

    if typ in ("text", "textarea"):
        if not isinstance(wert, str):
            fehler(wo, "Hier muss Text stehen.")
            return ""
        s = ersetze_platzhalter(wert, wo) if ph else wert
        if typ == "text" and "\n" in s:
            fehler(wo, "Einzeiliges Feld: Zeilenumbrüche sind nicht erlaubt.")
        if len(s) > spec.get("max", 10 ** 6):
            fehler(wo, "Zu lang: %d Zeichen, erlaubt sind höchstens %d." % (len(s), spec["max"]))
        fest = FESTE_MUSTER.get(pfad) if datei == "inhalt/seite.json" else None
        if fest is not None:
            if not fest[0].fullmatch(s):
                fehler(wo, "%s Gefunden: %r" % (fest[1], s))
        elif "muster" in spec and not re.match(spec["muster"], s):
            fehler(wo, "Format passt nicht: \"%s\"." % s)
        if spec.get("markup"):
            return Sicher(markup_zu_html(s, wo))
        return s

    if typ == "janein":
        if not isinstance(wert, bool):
            fehler(wo, "Hier muss true oder false stehen.")
            return False
        return wert

    if typ == "zahl":
        if isinstance(wert, bool) or not isinstance(wert, (int, float)):
            fehler(wo, "Hier muss eine Zahl stehen.")
            return 0
        if wert < spec.get("min", -10 ** 9) or wert > spec.get("max", 10 ** 9):
            fehler(wo, "Zahl außerhalb des erlaubten Bereichs (%s bis %s)." % (spec.get("min"), spec.get("max")))
        return wert

    if typ == "auswahl":
        werte = [o["wert"] for o in spec["optionen"]]
        if wert not in werte:
            fehler(wo, "\"%s\" ist keine gültige Auswahl. Erlaubt: %s" % (wert, ", ".join(werte)))
        return wert

    if typ == "bild":
        if not isinstance(wert, str):
            fehler(wo, "Hier muss der Basisname eines Fotos stehen.")
            return ""
        if bilder is not None:
            bilder.pruefe(wert, wo)
        return wert

    fehler(wo, "Schema-Fehler: unbekannter Feldtyp \"%s\"." % typ)
    return wert


# ======================================================================
# 5. Bilder
# ======================================================================
def webp_groesse(pfad):
    """Liest Breite/Höhe aus dem WebP-Kopf (ohne Zusatzbibliothek)."""
    with open(pfad, "rb") as f:
        k = f.read(32)
    if len(k) < 30 or k[:4] != b"RIFF" or k[8:12] != b"WEBP":
        raise ValueError("keine gültige WebP-Datei")
    art = k[12:16]
    if art == b"VP8 ":
        return int.from_bytes(k[26:28], "little") & 0x3FFF, int.from_bytes(k[28:30], "little") & 0x3FFF
    if art == b"VP8L":
        bits = int.from_bytes(k[21:25], "little")
        return (bits & 0x3FFF) + 1, ((bits >> 14) & 0x3FFF) + 1
    if art == b"VP8X":
        return int.from_bytes(k[24:27], "little") + 1, int.from_bytes(k[27:30], "little") + 1
    raise ValueError("unbekanntes WebP-Format")


def jpeg_groesse(pfad):
    """Liest Breite/Höhe aus dem JPEG-Kopf (Rahmenkopf SOF), ohne Zusatzbibliothek und ohne das Bild zu dekodieren."""
    with open(pfad, "rb") as f:
        k = f.read(1024 * 1024)
    if k[:2] != b"\xff\xd8":
        raise ValueError("keine gültige JPEG-Datei")
    i = 2
    while i + 4 <= len(k):
        if k[i] != 0xFF:
            break
        m = k[i + 1]
        if m == 0xFF:                       # Füllbyte
            i += 1
            continue
        if m == 0xD8 or m == 0x01 or 0xD0 <= m <= 0xD7:    # Marken ohne Länge
            i += 2
            continue
        if m in (0xD9, 0xDA):               # Ende oder Bilddaten vor dem Rahmenkopf: kaputt
            break
        laenge = int.from_bytes(k[i + 2:i + 4], "big")
        if laenge < 2:
            break
        if 0xC0 <= m <= 0xCF and m not in (0xC4, 0xC8, 0xCC):   # SOF0-SOF15 (ohne DHT, JPG, DAC)
            if i + 9 > len(k):
                break
            hoehe, breite = int.from_bytes(k[i + 5:i + 7], "big"), int.from_bytes(k[i + 7:i + 9], "big")
            if breite and hoehe:
                return breite, hoehe
            break
        i += 2 + laenge
    raise ValueError("JPEG ohne lesbare Größenangabe")


# Dateiformate der Fotos in inhalt/bilder.json (Feld "format"; fehlt es, ist es "webp"): Endung der Größen-Dateien, Kopf-Leser, MIME-Typ
FOTO_FORMATE = {
    "webp": {"endung": "webp", "groesse": webp_groesse, "mime": "image/webp", "name": "WebP"},
    "jpg": {"endung": "jpg", "groesse": jpeg_groesse, "mime": "image/jpeg", "name": "JPEG"},
}


class Bilder:
    """Verwaltet inhalt/bilder.json und rendert <img srcset=...>."""

    def __init__(self, daten):
        self.ordner = daten.get("ordner", "images/bestand")
        self.eintraege = {b["name"]: b for b in daten.get("bilder", [])}
        self.logo_daten = daten.get("logo", {})
        self._cache = {}
        self._probleme = {}

    def format(self, name):
        """Dateiformat des Fotos laut Bildliste: "webp" (Standard) oder "jpg" (Browser ohne WebP-Erzeugung, zum Beispiel Safari)."""
        f = self.eintraege.get(name, {}).get("format", "webp")
        return FOTO_FORMATE[f] if f in FOTO_FORMATE else FOTO_FORMATE["webp"]

    def varianten(self, name):
        """Findet <name>-<Breite>.<webp|jpg> (je nach Format des Fotos) im Bilder-Ordner."""
        verz, _, basis = name.rpartition("/")
        ordner = os.path.join(HIER, self.ordner, verz)
        muster = re.compile(re.escape(basis) + r"-(\d+)\." + self.format(name)["endung"] + "$")
        gefunden = []
        if os.path.isdir(ordner):
            for datei in os.listdir(ordner):
                m = muster.match(datei)
                if m:
                    gefunden.append((int(m.group(1)), (verz + "/" if verz else "") + datei))
        return sorted(gefunden)

    def info(self, name):
        if name in self._cache:
            return self._cache[name]
        v = self.varianten(name)
        if not v:
            self._cache[name] = None
            return None
        breiten = [b for b, _ in v]
        std = 1600 if 1600 in breiten else breiten[-1]
        std_datei = dict(v)[std]
        fmt = self.format(name)
        try:
            b, h = fmt["groesse"](os.path.join(HIER, self.ordner, std_datei))
        except (ValueError, OSError) as e:
            self._probleme[name] = "Die Datei %s/%s ist keine gültige %s-Datei (%s)." % (self.ordner, std_datei, fmt["name"], e)
            self._cache[name] = None
            return None
        self._cache[name] = {"varianten": v, "src": std_datei, "breite": b, "hoehe": h}
        return self._cache[name]

    def pruefe(self, name, wo):
        e = self.eintraege.get(name)
        if e is None:
            fehler(wo, "Foto \"%s\" steht nicht in inhalt/bilder.json (Bildliste)." % name)
            return False
        if self.info(name) is None:
            if name in self._probleme:
                fehler(wo, "Foto \"%s\": %s" % (name, self._probleme[name]))
            else:
                fehler(wo, "Foto \"%s\": Keine Dateien \"%s-<Breite>.%s\" in %s/ gefunden." % (name, name, self.format(name)["endung"], self.ordner))
            return False
        orig = e.get("original")
        if orig and not os.path.exists(os.path.join(HIER, self.ordner, orig)):
            fehler(wo, "Foto \"%s\": Original-Datei %s/%s fehlt." % (name, self.ordner, orig))
        return True

    def url(self, datei):
        return BASIS + self.ordner + "/" + datei

    def img(self, name, alt, sizes, klasse=None, eager=False):
        """<img>-Tag mit srcset (WebP oder JPEG, je nach Format des Fotos); Maße (width/height) stammen aus dem Dateikopf."""
        i = self.info(name)
        eff_alt = alt or self.eintraege[name].get("alt", "")
        if not eff_alt:
            fehler("Foto \"%s\"" % name, "Keine Bildbeschreibung (Alt-Text): weder an der Einbaustelle noch in der Bildliste.")
        srcset = ", ".join("%s %dw" % (self.url(d), b) for b, d in i["varianten"])
        a = []
        if klasse:
            a.append('class="%s"' % klasse)
        a.append('src="%s"' % html.escape(self.url(i["src"]), quote=True))
        a.append('srcset="%s"' % html.escape(srcset, quote=True))
        a.append('sizes="%s"' % html.escape(sizes, quote=True))
        a.append('width="%d" height="%d"' % (i["breite"], i["hoehe"]))
        a.append('alt="%s"' % html.escape(eff_alt, quote=True))
        a.append('loading="%s" decoding="async"' % ("eager" if eager else "lazy"))
        if eager:
            a.append('fetchpriority="high"')
        return Sicher("<img " + " ".join(a) + " />")

    def preload(self, name, sizes):
        i = self.info(name)
        srcset = ", ".join("%s %dw" % (self.url(d), b) for b, d in i["varianten"])
        # JPEG-Fotos (Browser ohne WebP-Erzeugung) bekommen den Typ ausdrücklich; WebP bleibt Byte für Byte wie bisher
        typ = "" if self.format(name)["endung"] == "webp" else ' type="%s"' % self.format(name)["mime"]
        return Sicher('<link rel="preload" as="image"%s href="%s" imagesrcset="%s" imagesizes="%s" fetchpriority="high" />'
                      % (typ, html.escape(self.url(i["src"])), html.escape(srcset), html.escape(sizes)))

    def logo(self):
        datei = self.logo_daten.get("datei", "logo.webp")
        pfad = os.path.join(HIER, self.ordner, datei)
        if not os.path.exists(pfad):
            fehler("inhalt/bilder.json, Feld \"logo.datei\"", "Logo-Datei %s/%s fehlt." % (self.ordner, datei))
            return {"src": "", "breite": 0, "hoehe": 0, "alt": ""}
        b, h = webp_groesse(pfad)
        return {"src": self.url(datei), "breite": b, "hoehe": h, "alt": self.logo_daten.get("alt", "")}


# Layout-Größen ("sizes") je Einbaustelle: gehören zur Gestaltung, nicht zum Inhalt
SIZES = {
    "hero": "100vw",
    "plate": "(min-width:1400px) 1360px, 100vw",
    "split": "(min-width:901px) 58vw, 100vw",
    "gal0": "(min-width:901px) 58vw, 100vw",
    "gal1": "(min-width:901px) 40vw, 100vw",
}


# ======================================================================
# 6. Vorlagen-Sprache
# ======================================================================
#   {{pfad.zum.wert}}            Wert einsetzen (Text wird maskiert, Sicher-HTML nicht)
#   {{#wenn pfad}}..{{#sonst}}..{{/wenn}}     bedingt (auch: {{#wenn nicht pfad}})
#   {{#jede liste}}..{{/jede}}   Schleife; darin {{.}} {{@nr}} (ab 1) {{@index}} (ab 0) {{@erste}} {{@letzte}}
#   {{> name}}                   Teil-Vorlage aus vorlagen/teile/name.html
_TOKEN = re.compile(r"\{\{\s*(.*?)\s*\}\}", re.S)
_TEILE = {}


def zerlege(text, name):
    wurzel = []
    stapel = [("wurzel", wurzel, None)]
    pos = 0
    for m in _TOKEN.finditer(text):
        ziel = stapel[-1][1]
        if m.start() > pos:
            ziel.append(("text", text[pos:m.start()]))
        pos = m.end()
        inh = m.group(1)
        zeile = text.count("\n", 0, m.start()) + 1
        if inh.startswith("#wenn "):
            pfad = inh[6:].strip()
            neg = pfad.startswith("nicht ")
            if neg:
                pfad = pfad[6:].strip()
            knoten = ["wenn", pfad, neg, [], [], zeile]
            ziel.append(knoten)
            stapel.append(("wenn", knoten[3], knoten))
        elif inh == "#sonst":
            if stapel[-1][0] != "wenn":
                raise ValueError("%s, Zeile %d: {{#sonst}} ohne {{#wenn}}" % (name, zeile))
            k = stapel[-1][2]
            stapel[-1] = ("wenn", k[4], k)
        elif inh == "/wenn":
            if stapel[-1][0] != "wenn":
                raise ValueError("%s, Zeile %d: {{/wenn}} ohne {{#wenn}}" % (name, zeile))
            stapel.pop()
        elif inh.startswith("#jede "):
            knoten = ["jede", inh[6:].strip(), [], zeile]
            ziel.append(knoten)
            stapel.append(("jede", knoten[2], knoten))
        elif inh == "/jede":
            if stapel[-1][0] != "jede":
                raise ValueError("%s, Zeile %d: {{/jede}} ohne {{#jede}}" % (name, zeile))
            stapel.pop()
        elif inh.startswith("> "):
            ziel.append(("teil", inh[2:].strip(), zeile))
        else:
            ziel.append(("var", inh, zeile))
    if pos < len(text):
        stapel[-1][1].append(("text", text[pos:]))
    if len(stapel) != 1:
        raise ValueError("%s: {{#%s}} wird nicht geschlossen" % (name, stapel[-1][0]))
    return wurzel


def hole(pfad, ebenen):
    """Sucht pfad (a.b.c) in den Ebenen von innen nach außen. Gibt (gefunden, wert) zurück."""
    teile = pfad.split(".") if pfad != "." else ["."]
    erster = teile[0]
    for ebene in reversed(ebenen):
        if isinstance(ebene, dict) and erster in ebene:
            wert = ebene[erster]
            for t in teile[1:]:
                if isinstance(wert, dict) and t in wert:
                    wert = wert[t]
                else:
                    return False, None
            return True, wert
    return False, None


def wahr(wert):
    if wert is None or wert is False:
        return False
    if isinstance(wert, (int, float)):
        return True
    return bool(wert)


def ausgabe_text(wert, pfad, name, zeile):
    if isinstance(wert, Sicher):
        return str(wert)
    if wert is None:
        return ""
    if isinstance(wert, bool):
        return "true" if wert else "false"
    if isinstance(wert, (int, float)):
        return str(wert)
    if isinstance(wert, str):
        return html.escape(wert, quote=True)
    raise ValueError("%s, Zeile %d: {{%s}} ist eine Liste/Gruppe, kein Text" % (name, zeile, pfad))


def rendere_knoten(knoten, ebenen, name, aus):
    for k in knoten:
        art = k[0]
        if art == "text":
            aus.append(k[1])
        elif art == "var":
            ok, wert = hole(k[1], ebenen)
            if not ok:
                raise ValueError("%s, Zeile %d: Variable {{%s}} ist nicht belegt" % (name, k[2], k[1]))
            aus.append(ausgabe_text(wert, k[1], name, k[2]))
        elif art == "wenn":
            _, pfad, neg, ja, nein, zeile = k
            ok, wert = hole(pfad, ebenen)
            erfuellt = wahr(wert) if ok else False
            if neg:
                erfuellt = not erfuellt
            rendere_knoten(ja if erfuellt else nein, ebenen, name, aus)
        elif art == "jede":
            _, pfad, kinder, zeile = k
            ok, liste = hole(pfad, ebenen)
            if not ok or liste is None:
                raise ValueError("%s, Zeile %d: Liste {{#jede %s}} ist nicht belegt" % (name, zeile, pfad))
            n = len(liste)
            for i, item in enumerate(liste):
                spezial = {"@nr": i + 1, "@index": i, "@anzahl": n, "@erste": i == 0, "@letzte": i == n - 1, ".": item}
                ebenen.append(item if isinstance(item, dict) else {})
                ebenen.append(spezial)
                rendere_knoten(kinder, ebenen, name, aus)
                del ebenen[-2:]
        elif art == "teil":
            ast = lade_teil(k[1])
            rendere_knoten(ast, ebenen, "teile/" + k[1] + ".html", aus)


def lade_teil(name):
    if name not in _TEILE:
        pfad = os.path.join(VORLAGEN, "teile", name + ".html")
        if not os.path.exists(pfad):
            raise ValueError("Teil-Vorlage vorlagen/teile/%s.html fehlt" % name)
        with open(pfad, encoding="utf-8") as f:
            _TEILE[name] = zerlege(f.read().strip(), "teile/%s.html" % name)
    return _TEILE[name]


def rendere(text, kontext, name):
    """Rendert einen Vorlagen-Text mit dem Kontext (dict). Gibt str zurück."""
    aus = []
    rendere_knoten(zerlege(text, name), [kontext], name, aus)
    return "".join(aus)


def rendere_datei(rel, kontext):
    pfad = os.path.join(VORLAGEN, rel)
    if not os.path.exists(pfad):
        raise ValueError("Vorlage vorlagen/%s fehlt" % rel)
    with open(pfad, encoding="utf-8") as f:
        text = f.read()
    return rendere(text, kontext, rel)


# ======================================================================
# 7. Seiten zusammensetzen
# ======================================================================
CUR = Sicher(' aria-current="page"')


def telefon_ableiten(anzeige, wo):
    """'0176 24860016' -> Anruf-Link '+4917624860016' und Schema-Schreibweise '+49-176-24860016'."""
    ziffern = re.sub(r"\D", "", anzeige)
    if anzeige.strip().startswith("+"):
        tel = "+" + ziffern
        return tel, tel
    if not ziffern.startswith("0") or len(ziffern) < 6:
        fehler(wo, "Telefonnummer \"%s\" nicht erkannt. Erwartet z. B. \"0176 24860016\" oder \"+49 176 24860016\"." % anzeige)
        return ziffern, ziffern
    tel = "+49" + ziffern[1:]
    m = re.match(r"^0(\d+)[ /\-]+(\d+)$", anzeige.strip())
    schema = "+49-%s-%s" % (m.group(1), m.group(2)) if m else tel
    return tel, schema


def json_ld(daten):
    # < und > als \u003c / \u003e: Im Skript-Block darf nie ein "</script>" oder "<!--" aus Inhalten entstehen
    s = json.dumps(daten, ensure_ascii=False, indent=2).replace("<", "\\u003c").replace(">", "\\u003e")
    return '<script type="application/ld+json">\n%s\n</script>' % s


def js_zeichenkette(wert):
    """
    Text für das Innere eines '…'-Strings in JavaScript, der danach per innerHTML als HTML erscheint:
    erst für HTML maskieren (html.escape), dann für JS (\\, ', <, >, &, Zeilenumbrüche, U+2028/2029 als \\uXXXX).
    """
    s = html.escape(wert, quote=True)
    aus = []
    for z in s:
        if z in "\\'<>&" or z in "\n\r\u2028\u2029" or ord(z) < 32:
            aus.append("\\u%04x" % ord(z))
        else:
            aus.append(z)
    return "".join(aus)


# ----------------------------------------------------------------------
# Inhalts-Sicherheitsrichtlinie (CSP) der öffentlichen Seiten: als <meta> im Kopf (GitHub Pages kann keine Header setzen).
# Skripte nur aus der eigenen Herkunft plus Hashes der Inline-Skripte; Hashes entstehen beim Bau aus dem fertigen HTML.
# Nicht per <meta> möglich: frame-ancestors, report-uri, sandbox.
CSP_PLATZHALTER = "@@CSP@@"


class _CspSammler(HTMLParser):
    """Liest eine fertige Seite und sammelt, was die Richtlinie kennen muss."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.skripte, self.style_elemente, self.style_attribute = [], [], []
        self.ereignisse, self.fremde_skripte = [], []
        self.hat_formular = self.hat_karte = False
        self.csp_meta = 0
        self._text = None

    def handle_starttag(self, tag, attrs):
        d = {n: (v if v is not None else "") for n, v in attrs}
        for n, v in d.items():
            if n == "style":
                self.style_attribute.append(v)
            elif n.startswith("on"):
                self.ereignisse.append("<%s %s=...>" % (tag, n))
            elif n == "data-map-src":
                self.hat_karte = True
        if tag == "form":
            self.hat_formular = True
        elif tag == "meta" and d.get("http-equiv", "").lower() == "content-security-policy":
            self.csp_meta += 1
        elif tag == "script":
            if "src" in d:
                if re.match(r"^[a-zA-Z][a-zA-Z0-9+.-]*:|^//", d["src"]):
                    self.fremde_skripte.append(d["src"])
            elif d.get("type", "").lower() not in ("application/ld+json", "application/json"):
                self._text = ["script", ""]
        elif tag == "style":
            self._text = ["style", ""]

    def handle_endtag(self, tag):
        if self._text and self._text[0] == tag:
            (self.skripte if tag == "script" else self.style_elemente).append(self._text[1])
            self._text = None

    def handle_data(self, data):
        if self._text:
            self._text[1] += data


def csp_hash(text):
    return "'sha256-%s'" % base64.b64encode(hashlib.sha256(text.encode("utf-8")).digest()).decode("ascii")


def csp_fuer_seite(seite, formular_aktion, wo):
    """
    Baut die Richtlinie für eine fertige Seite (HTML mit CSP_PLATZHALTER im Kopf). Fehler (Ereignis-Attribute, fremde Skripte)
    brechen den Bau ab, weil die Richtlinie sie sonst stillschweigend blockieren würde.
    """
    s = _CspSammler()
    s.feed(seite)
    s.close()
    if s.csp_meta != 1 or seite.count(CSP_PLATZHALTER) != 1:
        fehler(wo, "Die Vorlage vorlagen/basis.html muss genau ein <meta http-equiv=\"Content-Security-Policy\" content=\"{{meta.csp}}\"> enthalten.")
    for e in s.ereignisse:
        fehler(wo, "%s: Ereignis-Attribute (onclick ...) sind in Seiten nicht erlaubt (die Sicherheitsrichtlinie blockiert sie)." % e)
    for u in s.fremde_skripte:
        fehler(wo, "Skript von fremder Adresse %s ist nicht erlaubt." % u)
    host = urlsplit(formular_aktion)
    form_host = "%s://%s" % (host.scheme, host.netloc)
    if not FORM_HOST_MUSTER.fullmatch(form_host):
        fehler(wo, "Formular-Adresse %r hat keinen gültigen Host für die Sicherheitsrichtlinie." % formular_aktion)
    skript = ["'self'"] + sorted(set(csp_hash(x) for x in s.skripte))
    style_elem = ["'self'"] + sorted(set(csp_hash(x) for x in s.style_elemente))
    r = [
        "default-src 'self'",
        "script-src " + " ".join(skript),
        "style-src " + " ".join(style_elem),
    ]
    if s.style_attribute:   # style="..." nur mit genau diesen Werten (Hash je Wert), kein 'unsafe-inline'
        r.append("style-src-attr 'unsafe-hashes' " + " ".join(sorted(set(csp_hash(x) for x in s.style_attribute))))
    else:
        r.append("style-src-attr 'none'")
    r += [
        "img-src 'self'",
        "font-src 'self'",
        "connect-src 'self'" + (" " + form_host if s.hat_formular else ""),
        "frame-src " + (KARTEN_HOST if s.hat_karte else "'none'"),
        "object-src 'none'",
        "base-uri 'none'",
        "form-action " + ("'self' " + form_host if s.hat_formular else "'none'"),
    ]
    return "; ".join(r)


# Dateitypen, die aus images/ und assets/ unverändert ausgeliefert werden (alles andere wird mit Warnung ausgelassen)
STATISCH_ERLAUBT = {
    "images": (".webp", ".jpg", ".jpeg", ".png"),
    "assets": (".woff2", ".css", ".js", ".txt"),
}


class Bau:
    """Hält alle geladenen Daten und baut daraus die Seiten."""

    def __init__(self):
        self.site = None
        self.struktur = None
        self.bilder = None
        self.seiten = {}   # id -> {'reg': Registereintrag, 'inhalt': aufbereiteter Inhalt}
        self.schemas = {}  # Pfad der Inhaltsdatei -> Schema

    # ---------------------------------------------------------- Laden
    def lade_schemas(self):
        ordner = os.path.join(INHALT, "schema")
        if not os.path.isdir(ordner):
            fehler("inhalt/schema/", "Ordner fehlt.")
            return
        for datei in sorted(os.listdir(ordner)):
            if not datei.endswith(".json"):
                continue
            s = lade_json("inhalt/schema/" + datei)
            if not s:
                continue
            for ziel in s.get("gilt_fuer", []):
                self.schemas[ziel] = s

    def schema_fuer(self, rel):
        s = self.schemas.get(rel)
        if s is None:
            fehler(rel, "Keine Schema-Datei in inhalt/schema/ beschreibt diese Datei (\"gilt_fuer\").")
        return s

    def lade_alles(self):
        global BASIS
        self.lade_schemas()
        self.struktur = lade_json("inhalt/struktur.json")
        roh_site = lade_json("inhalt/seite.json")
        roh_bilder = lade_json("inhalt/bilder.json")
        if not (self.struktur and roh_site and roh_bilder):
            return
        # Basis-Pfad früh setzen: interne Links in Texten (z. B. im Formular-Hinweis) brauchen ihn schon beim Aufbereiten
        try:
            if re.match(r"^/([A-Za-z0-9_.\-]+/)*$", roh_site["veroeffentlichung"]["basis_pfad"]):
                BASIS = roh_site["veroeffentlichung"]["basis_pfad"]
        except (KeyError, TypeError):
            pass
        s = self.schema_fuer("inhalt/seite.json")
        if s:
            self.site = verarbeite(roh_site, s, "", "inhalt/seite.json", ph=False)
        s = self.schema_fuer("inhalt/bilder.json")
        if s:
            verarbeite(roh_bilder, s, "", "inhalt/bilder.json", ph=False)
        self.bilder = Bilder(roh_bilder)
        for i, b in enumerate(roh_bilder.get("bilder", [])):
            if isinstance(b, dict) and isinstance(b.get("name"), str):
                self.bilder.pruefe(b["name"], "inhalt/bilder.json, Feld \"bilder[%d].name\" (Basisname)" % (i + 1))
        if not self.site:
            return

        # --- Veröffentlichung
        v = self.site["veroeffentlichung"]
        BASIS = v["basis_pfad"]
        self.domain = v["domain"]
        self.noindex = v["noindex"]

        # --- Telefonnummern ableiten
        self.telefone = []
        for i, t in enumerate(self.site["kontakt"]["telefone"]):
            tel, schema = telefon_ableiten(t["anzeige"], "inhalt/seite.json, Feld \"kontakt.telefone[%d]\"" % (i + 1))
            self.telefone.append({"anzeige": t["anzeige"], "tel": tel, "schema": schema})
        k = self.site["kontakt"]
        PLATZHALTER.update({
            "telefon": self.telefone[0]["anzeige"], "telefon_tel": self.telefone[0]["tel"],
            "email": k["email"], "strasse": k["strasse"], "plz": k["plz"], "ort": k["ort"],
            "adresse": "%s, %s %s" % (k["strasse"], k["plz"], k["ort"]),
            "inhaber": self.site["firma"]["inhaber"], "firma": self.site["firma"]["name"],
        })
        if len(self.telefone) > 1:
            PLATZHALTER.update({"telefon_2": self.telefone[1]["anzeige"], "telefon_2_tel": self.telefone[1]["tel"]})

        # --- Register prüfen und Seiteninhalte laden
        if not self.pruefe_struktur():
            return
        ids = [s_["id"] for s_ in self.struktur["seiten"]]
        for pflicht in ("start", "kontakt"):
            if pflicht not in ids:
                fehler("inhalt/struktur.json", "Seite \"%s\" fehlt im Register." % pflicht)
        for reg in self.struktur["seiten"]:
            rel = "inhalt/seiten/%s.json" % reg["inhalt"]
            roh = lade_json(rel)
            sch = self.schema_fuer(rel)
            if roh is None or sch is None:
                continue
            inhalt = verarbeite(roh, sch, "", rel, self.bilder)
            self.seiten[reg["id"]] = {"reg": reg, "inhalt": inhalt, "datei": rel}
            if reg["vorlage"] == "recht":
                # Rechtstext gleich beim Laden prüfen (Allowlist), damit auch seine internen Links in pruefe_quer geprüft werden
                rel_r = "inhalt/recht/" + reg["recht_datei"]
                text = ersetze_platzhalter(lade_text(rel_r).strip("\n"), rel_r, maskieren=True)
                self.seiten[reg["id"]]["recht_text"] = pruefe_rechtstext(text, rel_r)

    def pruefe_struktur(self):
        """inhalt/struktur.json (Seitenregister) auf Vollständigkeit prüfen."""
        st = self.struktur
        ok = True
        for key in ("technik", "seiten", "hauptmenue", "leistungen", "footer_unternehmen", "footer_recht"):
            if key not in st:
                fehler("inhalt/struktur.json", "Eintrag \"%s\" fehlt." % key)
                ok = False
        if not ok:
            return False
        for key in ("css_version", "js_version"):
            if key not in st["technik"]:
                fehler("inhalt/struktur.json", "technik.%s fehlt." % key)
                ok = False
        ids = []
        for r in st["seiten"]:
            for key in ("id", "pfad", "inhalt", "vorlage", "prioritaet"):
                if key not in r:
                    fehler("inhalt/struktur.json", "Seiten-Eintrag %r: \"%s\" fehlt." % (r.get("id", "?"), key))
                    ok = False
            ids.append(r.get("id"))
            if r.get("vorlage") and not os.path.exists(os.path.join(VORLAGEN, "seiten", r["vorlage"] + ".html")):
                fehler("inhalt/struktur.json", "Seite \"%s\": Vorlage vorlagen/seiten/%s.html fehlt." % (r.get("id"), r["vorlage"]))
                ok = False
            if r.get("vorlage") == "recht" and "recht_datei" not in r:
                fehler("inhalt/struktur.json", "Seite \"%s\": \"recht_datei\" fehlt." % r.get("id"))
                ok = False
        if len(set(ids)) != len(ids):
            fehler("inhalt/struktur.json", "Seiten-IDs sind nicht eindeutig.")
            ok = False
        for key in ("hauptmenue", "leistungen", "footer_unternehmen", "footer_recht"):
            for i in st[key]:
                if i not in ids and not (key == "hauptmenue" and i == "leistungen"):
                    fehler("inhalt/struktur.json", "%s: \"%s\" ist keine Seite im Register." % (key, i))
                    ok = False
        return ok

    # ---------------------------------------------------------- Querprüfungen
    def pruefe_quer(self):
        pfade = {"/" + r["pfad"] for r in self.struktur["seiten"]}
        for url, wo in INTERNE_LINKS:
            ziel = re.split(r"[#?]", url)[0]
            if ziel in pfade:
                continue
            if os.path.exists(os.path.join(HIER, ziel.lstrip("/"))) and ziel != "/":
                continue
            fehler(wo, "Interner Link \"%s\" zeigt auf keine bekannte Seite." % url)
        for lid in self.struktur["leistungen"]:
            if lid not in self.seiten:
                fehler("inhalt/struktur.json", "Leistung \"%s\" hat keine Seite im Register." % lid)
        st = self.seiten.get("start")
        if st:
            gelistet = [e["seite"] for e in st["inhalt"].get("leistungen", {}).get("eintraege", [])]
            for lid in self.struktur["leistungen"]:
                if lid not in gelistet:
                    fehler(st["datei"], "Feld \"leistungen.eintraege\": Leistung \"%s\" fehlt in der Übersicht." % lid)
            if len(set(gelistet)) != len(gelistet):
                fehler(st["datei"], "Feld \"leistungen.eintraege\": Eine Leistung kommt doppelt vor.")
        for sid, s_ in self.seiten.items():
            reg = s_["reg"]
            if reg["vorlage"] == "recht":
                rel = "inhalt/recht/" + reg["recht_datei"]
                if not os.path.exists(os.path.join(HIER, rel)):
                    fehler(rel, "Rechtstext-Datei fehlt.")
        if self.admin_aktiv() and not os.path.exists(os.path.join(HIER, "admin", "index.html")):
            fehler("admin/index.html", "Datei fehlt, obwohl \"admin.aktiv\" in inhalt/seite.json auf true steht.")
        basis_ok = re.match(r"^/([A-Za-z0-9_.\-]+/)*$", BASIS)
        if not basis_ok:
            fehler("inhalt/seite.json, Feld \"veroeffentlichung.basis_pfad\"", "Muss mit / beginnen und enden.")
        # Dateien, die gebraucht werden
        for rel in ("assets/style.css", "assets/main.js", "favicon.svg", "assets/fonts/archivo-latin-wdth.woff2"):
            if not os.path.exists(os.path.join(HIER, rel)):
                fehler(rel, "Datei fehlt.")

    # ---------------------------------------------------------- Bausteine für Seiten
    def href(self, sid):
        return BASIS + [r for r in self.struktur["seiten"] if r["id"] == sid][0]["pfad"]

    def name_von(self, sid):
        return self.seiten[sid]["inhalt"]["name"]

    def navigation(self, aktuell):
        """Menüs mit aria-current / is-here für die gerade gebaute Seite."""
        nav_t = self.site["navigation"]
        leistungen = self.struktur["leistungen"]
        eintraege = [{"href": self.href(i), "name": self.name_von(i), "attr": CUR if i == aktuell else Sicher("")}
                     for i in leistungen]
        haupt = []
        for i in self.struktur["hauptmenue"]:
            if i in ("start", "leistungen"):
                continue
            haupt.append({"href": self.href(i), "name": self.name_von(i), "attr": CUR if i == aktuell else Sicher("")})
        ist_kontakt = aktuell == "kontakt"
        return {
            "start": {"name": self.name_von("start"), "attr": CUR if aktuell == "start" else Sicher("")},
            "leistungen": {"name": nav_t["leistungen"],
                           "attr": Sicher(' class="is-here"') if aktuell in leistungen else Sicher(""),
                           "eintraege": eintraege},
            "haupt": haupt,
            "kontakt": {"name": self.name_von("kontakt"), "attr": CUR if ist_kontakt else Sicher("")},
            "kontakt_cta_attr": CUR if ist_kontakt else Sicher(""),
            "cta": nav_t["cta"],
            "mobil_anrufen": nav_t["mobil_anrufen"],
            "mobilleiste_anrufen": nav_t["mobilleiste_anrufen"],
            "mobilleiste_ziel": "#kontakt" if aktuell in ("start", "kontakt") else self.href("kontakt"),
            "footer_leistungen": [{"href": self.href(i), "name": self.name_von(i)} for i in leistungen],
            "footer_unternehmen": [{"href": self.href(i), "name": self.name_von(i)} for i in self.struktur["footer_unternehmen"]],
            "footer_recht": [{"href": self.href(i), "name": self.name_von(i)} for i in self.struktur["footer_recht"]],
        }

    def orte(self, mit_stil, zusaetzlich=()):
        e = self.site["einsatzgebiet"]

        def mach(namen):
            return [{"name": n, "stil": Sicher(' style="--i:%d"' % i) if mit_stil else Sicher("")}
                    for i, n in enumerate(namen)]
        return {
            "sitz": e["sitz"], "nachbarn": mach(e["nachbarn"]), "weitere": mach(list(e["weitere"]) + list(zusaetzlich)),
            "beschriftung_sitz": e["beschriftung_sitz"], "beschriftung_nachbarn": e["beschriftung_nachbarn"],
            "beschriftung_weitere": e["beschriftung_weitere"],
        }

    def zeichnung(self, datei, beschreibung, wo):
        pfad = os.path.join("zeichnungen", datei)
        if not os.path.exists(os.path.join(VORLAGEN, pfad)):
            fehler(wo, "Zeichnung vorlagen/%s fehlt." % pfad)
            return Sicher("")
        with open(os.path.join(VORLAGEN, pfad), encoding="utf-8") as f:
            text = f.read().strip()
        return Sicher(rendere(text, {"zeichnung_beschreibung": beschreibung}, pfad))

    def foto_html(self, f, slot, **kw):
        return self.bilder.img(f["bild"], f.get("alt", ""), SIZES[slot], **kw)

    def og_bild_url(self, name):
        e = self.bilder.eintraege.get(name)
        if not e or not e.get("original"):
            fehler("Foto \"%s\"" % name, "Für die Vorschau (og:image) braucht das Foto in inhalt/bilder.json das Feld \"original\" (JPG).")
            return ""
        return self.domain + BASIS + self.bilder.ordner + "/" + e["original"]

    # ---------------------------------------------------------- Kopfdaten (Meta, JSON-LD)
    def meta(self, sid, s_):
        inh, reg = s_["inhalt"], s_["reg"]
        seo = inh["seo"]
        canonical = self.domain + BASIS + reg["pfad"]
        m = {
            "title": seo["title"], "beschreibung": seo["beschreibung"], "canonical": canonical,
            "robots": "noindex, nofollow" if self.noindex else "index, follow",
            "og": seo["og_aktiv"], "og_beschreibung": seo.get("og_beschreibung", ""),
            "og_bild": self.og_bild_url(seo["og_bild"]) if seo.get("og_bild") else "",
            "preload_bild": "", "jsonld": Sicher(""), "csp": Sicher(CSP_PLATZHALTER),
        }
        k = self.site["kontakt"]
        adresse = {"@type": "PostalAddress", "streetAddress": k["strasse"], "postalCode": k["plz"],
                   "addressLocality": k["ort"], "addressCountry": "DE"}
        e = self.site["einsatzgebiet"]
        gebiet = [e["sitz"]] + list(e["nachbarn"]) + list(e["weitere"])
        firma = self.site["firma"]["name"]
        tel_schema = self.telefone[0]["schema"]
        if reg["vorlage"] == "startseite":
            daten = {
                "@context": "https://schema.org", "@type": "HomeAndConstructionBusiness", "name": firma,
            }
            if seo.get("og_bild"):
                daten["image"] = m["og_bild"]
            daten.update({
                "url": canonical, "telephone": tel_schema, "email": k["email"], "address": adresse,
                "areaServed": gebiet, "sameAs": [k["instagram"], k["facebook"]],
                "makesOffer": [{"@type": "Offer", "itemOffered": {"@type": "Service", "name": self.name_von(i)}}
                               for i in self.struktur["leistungen"]],
            })
            m["jsonld"] = Sicher(json_ld(daten))
            hero = inh["hero"]["foto"]["bild"]
            m["preload_bild"] = self.bilder.preload(hero, SIZES["hero"])
        elif reg["vorlage"] == "leistung":
            dienst = {
                "@context": "https://schema.org", "@type": "Service", "serviceType": inh["name"],
                "provider": {"@type": "HomeAndConstructionBusiness", "name": firma, "telephone": tel_schema, "address": adresse},
                "areaServed": gebiet, "url": canonical,
            }
            krumen = {
                "@context": "https://schema.org", "@type": "BreadcrumbList",
                "itemListElement": [
                    {"@type": "ListItem", "position": 1, "name": self.name_von("start"), "item": self.domain + BASIS},
                    {"@type": "ListItem", "position": 2, "name": self.site["navigation"]["leistungen"],
                     "item": self.domain + BASIS + "#leistungen"},
                    {"@type": "ListItem", "position": 3, "name": inh["name"], "item": canonical},
                ],
            }
            m["jsonld"] = Sicher(json_ld(dienst) + ("\n" + json_ld(krumen) if seo.get("breadcrumb_schema") else ""))
        return m

    # ---------------------------------------------------------- Seiteninhalt aufbereiten
    def bereite_seite(self, sid, s_):
        """Ergänzt den Inhalt um abgeleitete Werte (HTML für Fotos, Links, Zeichnungen ...)."""
        inh = copy.deepcopy(s_["inhalt"])
        reg = s_["reg"]
        wo = s_["datei"]
        v = reg["vorlage"]
        if v == "startseite":
            inh["hero"]["foto"]["img"] = self.foto_html(inh["hero"]["foto"], "hero", klasse="plate-img", eager=True)
            for e in inh["leistungen"]["eintraege"]:
                lid = e["seite"]
                e["href"] = self.href(lid)
                e["name"] = self.name_von(lid)
                e["icon"] = self.zeichnung("icon-%s.svg" % lid, "", wo)
            f = inh["farbe"]
            f["standard"] = "%s %s" % (f["farben"][0]["code"], f["farben"][0]["name"])
            f["zeichnung"] = self.zeichnung("farbe-terrassenueberdachung.svg", f["zeichnung_beschreibung"], wo)
            for i, c in enumerate(f["farben"]):
                c["checked"] = "true" if i == 0 else "false"
                c["tab"] = "0" if i == 0 else "-1"
            inh["projekt"]["foto"]["img"] = self.foto_html(inh["projekt"]["foto"], "plate", klasse="plate-img")
            self.faq_offen(inh["faq"])
        elif v == "leistung":
            inh["zeichnung"] = self.zeichnung("kopf-%s.svg" % sid, inh["kopf"]["zeichnung_beschreibung"], wo)
            if "foto" in inh["text"]:
                inh["text"]["foto"]["img"] = self.foto_html(inh["text"]["foto"], "split")
            if "galerie" in inh:
                for i, f in enumerate(inh["galerie"]["fotos"]):
                    f["img"] = self.foto_html(f, "gal0" if i == 0 else "gal1")
            inh["schritte"]["anzahl"] = len(inh["schritte"]["eintraege"])
            self.faq_offen(inh["faq"])
        elif v == "referenzen":
            for p in inh["projekte"]:
                p["ueberschrift"] = "%s in %s" % (p["titel"], p["ort"]) if p.get("ort") else p["titel"]
                for i, f in enumerate(p["fotos"]):
                    f["img"] = self.foto_html(f, "gal0" if i == 0 else "gal1")
        elif v == "ueber-uns":
            inh["text"]["foto"]["img"] = self.foto_html(inh["text"]["foto"], "split")
        elif v == "recht":
            inh["recht_text"] = Sicher(s_["recht_text"])
        return inh

    @staticmethod
    def faq_offen(faq):
        for i, e in enumerate(faq["eintraege"]):
            e["offen"] = Sicher(" open") if i == 0 else Sicher("")

    # ---------------------------------------------------------- Rendern
    def rendere_seite(self, sid, s_):
        reg = s_["reg"]
        inh = self.bereite_seite(sid, s_)
        k = self.site["kontakt"]
        link = {r["id"]: BASIS + r["pfad"] for r in self.struktur["seiten"]}
        logo = self.bilder.logo()
        e = self.site["einsatzgebiet"]
        zusatz = inh.get("staedte", {}).get("zusaetzlich", []) if reg["vorlage"] == "einsatzgebiet" else []
        kontext = {
            "basis": BASIS, "link": link, "technik": self.struktur["technik"],
            "firma": self.site["firma"], "logo": logo,
            "tel": self.telefone[0], "telefone": self.telefone,
            "email": k["email"], "strasse": k["strasse"], "plz": k["plz"], "ort": k["ort"],
            "instagram": k["instagram"], "facebook": k["facebook"],
            "texte": self.site["texte"], "formular": self.site["formular"],
            "karte": dict(self.site["karte"], url=KARTEN_HOST + "/maps?q=%s&output=embed"
                          % quote_plus("%s, %s %s" % (k["strasse"], k["plz"], k["ort"]), safe=",")),
            "footer": self.site["footer"],
            "nav": self.navigation(sid),
            "orte": self.orte(reg["vorlage"] == "startseite", zusatz),
            "meta": self.meta(sid, s_),
        }
        kontext.update(inh)
        kontext["inhalt"] = Sicher(rendere_datei("seiten/%s.html" % reg["vorlage"], kontext).rstrip("\n"))
        seite = rendere_datei("basis.html", kontext)
        csp = csp_fuer_seite(seite, self.site["formular"]["aktion"], "Seite %s" % reg["pfad"])
        return seite.replace(CSP_PLATZHALTER, csp.replace("&", "&amp;").replace('"', "&quot;"))

    # ---------------------------------------------------------- Dateien
    def robots(self):
        # Die Verwaltungsseite wird immer gesperrt, auch wenn die Seite sonst indexiert werden darf
        admin = "Disallow: %sadmin/\n" % BASIS
        if self.noindex:
            return "User-agent: *\nDisallow: /\n" + admin
        return "User-agent: *\nAllow: /\n" + admin + "\nSitemap: %s%ssitemap.xml\n" % (self.domain, BASIS)

    def admin_aktiv(self):
        return bool((self.site.get("admin") or {}).get("aktiv"))

    def admin_konfig(self):
        """admin/konfig.json: sagt der Verwaltungsseite, in welches Projekt sie schreibt (keine Zugangsdaten)."""
        a = self.site["admin"]
        daten = {"version": 1, "repo": a["repo"], "branch": a["branch"], "seite": self.domain + BASIS}
        return json.dumps(daten, ensure_ascii=False, indent=2)

    def admin_dateien(self):
        """Dateien der Verwaltungsseite (admin/ ohne test/, Python-Dateien und Notizen)."""
        out = []
        wurzel = os.path.join(HIER, "admin")
        for w, dirs, fs in os.walk(wurzel):
            dirs[:] = sorted(d for d in dirs if d not in ("test", "__pycache__"))
            for f in sorted(fs):
                if f == ".DS_Store" or f.endswith((".py", ".pyc", ".md")):
                    continue
                q = os.path.join(w, f)
                out.append((q, os.path.relpath(q, HIER)))
        return out

    def sitemap(self):
        zeilen = ['<?xml version="1.0" encoding="UTF-8"?>',
                  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
        for r in self.struktur["seiten"]:
            zeilen.append("  <url><loc>%s%s%s</loc><priority>%.1f</priority></url>"
                          % (self.domain, BASIS, r["pfad"], r["prioritaet"]))
        zeilen.append("</urlset>")
        return "\n".join(zeilen) + "\n"

    def cname(self):
        """CNAME für GitHub Pages: nur im Live-Betrieb (Hauptseite, nicht gesperrt). Sonst None."""
        if self.noindex or BASIS != "/":
            return None
        return re.sub(r"^https?://", "", self.domain)

    def css(self):
        """style.css unverändert, nur die Schrift-URL bekommt den Basis-Pfad (url('/assets/...'))."""
        with open(os.path.join(HIER, "assets", "style.css"), encoding="utf-8") as f:
            text = f.read()
        return text.replace("url('/assets/", "url('" + BASIS + "assets/")

    def js(self):
        """main.js unverändert, nur die Notfall-Meldung des Formulars bekommt Telefon/E-Mail aus seite.json."""
        with open(os.path.join(HIER, "assets", "main.js"), encoding="utf-8") as f:
            text = f.read()
        muster = re.compile(r'<a href="tel:[^"]*">[^<]*</a> oder schreiben Sie an <a href="mailto:[^"]*">[^<]*</a>')
        if not muster.search(text):
            hinweis("assets/main.js", "Fehlermeldung des Formulars nicht gefunden; Telefon/E-Mail dort nicht ersetzt.")
            return text
        t = self.telefone[0]
        mail = self.site["kontakt"]["email"]
        # Die Werte kommen aus seite.json und landen in einem JS-String, der als HTML angezeigt wird: doppelt maskieren
        neu = ('<a href="tel:%s">%s</a> oder schreiben Sie an <a href="mailto:%s">%s</a>'
               % tuple(js_zeichenkette(x) for x in (t["tel"], t["anzeige"], mail, mail)))
        return muster.sub(lambda m: neu, text, count=1)

    def statische_dateien(self):
        """
        Liste (Quelle, Ziel-relativ) aller Dateien, die unverändert kopiert werden: nur bekannte Dateitypen (Allowlist),
        keine Verknüpfungen (Symlinks). Alles andere wird mit Warnung ausgelassen. favicon.svg nur am festen Ort.
        """
        out = [(os.path.join(HIER, "favicon.svg"), "favicon.svg")]
        for ordner in ("assets", "images"):
            erlaubt = STATISCH_ERLAUBT[ordner]
            for wurzel, dirs, dateien in os.walk(os.path.join(HIER, ordner)):
                dirs.sort()
                for d in sorted(dateien):
                    if d == ".DS_Store" or d.endswith(".webp.json") or d.endswith(".md"):
                        continue  # Notizen und Bild-Metadaten gehören nicht zur Seite (bekannt, keine Warnung)
                    quelle = os.path.join(wurzel, d)
                    rel = os.path.relpath(quelle, HIER)
                    if ordner == "assets" and d in ("style.css", "main.js") and wurzel == os.path.join(HIER, "assets"):
                        continue  # werden gesondert erzeugt
                    if os.path.islink(quelle) or not os.path.isfile(quelle):
                        hinweis(rel, "Verknüpfung oder keine normale Datei, wird nicht ausgeliefert.")
                        continue
                    if not d.lower().endswith(erlaubt):
                        hinweis(rel, "Dateityp nicht erlaubt in %s/ (erlaubt: %s), wird nicht ausgeliefert." % (ordner, ", ".join(erlaubt)))
                        continue
                    out.append((quelle, rel))
        if self.admin_aktiv():
            out.extend(self.admin_dateien())
        return out


# ======================================================================
# 8. Hauptprogramm
# ======================================================================
def zaehle_felder(spec):
    """Zählt Eingabefelder (Blätter) einer Feldbeschreibung; Gruppen und Listen zählen nicht selbst."""
    if spec["typ"] == "gruppe":
        return sum(zaehle_felder(f) for f in spec["felder"])
    if spec["typ"] == "liste":
        e = spec["eintrag"]
        return zaehle_felder(e) if e["typ"] in ("gruppe", "liste") else 1
    return 1


def zeige_felder():
    ordner = os.path.join(INHALT, "schema")
    gesamt = 0
    for datei in sorted(os.listdir(ordner)):
        if datei.endswith(".json"):
            with open(os.path.join(ordner, datei), encoding="utf-8") as f:
                s = json.load(f)
            n = zaehle_felder(s)
            gesamt += n
            print("%-22s %3d Felder   gilt für: %s" % (datei, n, ", ".join(os.path.basename(x)[:-5] for x in s["gilt_fuer"])))
    print("%-22s %3d" % ("Summe der Schema-Dateien", gesamt))
    return 0



def main():
    p = argparse.ArgumentParser(description="ZeCa-Alu-Seite aus inhalt/ und vorlagen/ nach _site/ bauen.")
    p.add_argument("--pruefen", action="store_true", help="nur prüfen, nichts schreiben")
    p.add_argument("--ziel", default="_site", help="Ausgabeordner (Standard: _site)")
    p.add_argument("--felder", action="store_true", help="Anzahl der Formularfelder je Schema-Datei anzeigen")
    args = p.parse_args()
    if args.felder:
        return zeige_felder()
    ziel = args.ziel if os.path.isabs(args.ziel) else os.path.join(HIER, args.ziel)

    bau = Bau()
    bau.lade_alles()
    ausgabe = {}   # relativer Pfad -> Text
    if not FEHLER:
        bau.pruefe_quer()
    if not FEHLER:
        for sid, s_ in bau.seiten.items():
            try:
                ausgabe[s_["reg"]["pfad"] + "index.html"] = bau.rendere_seite(sid, s_)
            except ValueError as e:
                fehler("vorlagen/", str(e))
        ausgabe["robots.txt"] = bau.robots()
        ausgabe["sitemap.xml"] = bau.sitemap()
        ausgabe["assets/style.css"] = bau.css()
        ausgabe["assets/main.js"] = bau.js()
        if bau.cname():
            ausgabe["CNAME"] = bau.cname()
        if bau.admin_aktiv():
            ausgabe["admin/konfig.json"] = bau.admin_konfig()
        statisch = bau.statische_dateien()   # vor der Ausgabe der Hinweise: auslassen von Dateien wird als Warnung gemeldet

    for h in HINWEISE:
        print(h)
    if FEHLER:
        print()
        for f in FEHLER:
            print(f)
        print("\n%d Fehler. Es wurde nichts gebaut." % len(FEHLER))
        return 1

    n_bilder = len(bau.bilder.eintraege)
    if args.pruefen:
        print("Prüfung ok: %d Seiten, %d Fotos in der Bildliste." % (len(bau.seiten), n_bilder))
        return 0

    # --- schreiben
    if os.path.exists(ziel):
        if os.path.basename(os.path.normpath(ziel)) != "_site" and os.listdir(ziel):
            print("FEHLER Ausgabeordner %s ist nicht leer und heißt nicht _site. Aus Sicherheitsgründen wird er nicht überschrieben." % ziel)
            return 1
        shutil.rmtree(ziel)
    os.makedirs(ziel)
    for rel, text in ausgabe.items():
        pfad = os.path.join(ziel, rel)
        os.makedirs(os.path.dirname(pfad), exist_ok=True)
        with open(pfad, "w", encoding="utf-8", newline="\n") as f:
            f.write(text if (text.endswith("\n") or rel == "CNAME") else text + "\n")
    kopiert = 0
    for quelle, rel in statisch:
        pfad = os.path.join(ziel, rel)
        os.makedirs(os.path.dirname(pfad), exist_ok=True)
        shutil.copyfile(quelle, pfad)
        kopiert += 1
    seiten = len([k for k in ausgabe if k.endswith("index.html")])
    print("Fertig: %d Seiten, %d statische Dateien -> %s" % (seiten, kopiert, os.path.relpath(ziel, HIER)))
    print("        Domain %s, Basis-Pfad %s, noindex=%s" % (bau.domain, BASIS, "ja" if bau.noindex else "nein"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
