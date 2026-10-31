#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
pruefe_inhalt_branch.py – Schutz im Workflow "Bauen und veröffentlichen".

Das Verwaltungs-Panel schreibt mit dem Schlüssel des Inhabers auf den Branch "inhalt". Dieser Schlüssel gilt bei GitHub für das
ganze Projekt; damit er trotzdem nur Inhalte ändern kann, baut der Workflow den Code immer aus "main" und übernimmt aus
"inhalt" nur Inhalte. Dieses Skript prüft vorher, was der Branch "inhalt" gegenüber seinem Ausgangspunkt in "main" geändert hat
(git diff merge-base..inhalt). Es bricht mit Fehler ab (Ende-Code 1), wenn

  - eine Datei geändert, angelegt oder entfernt wurde, die nicht unter inhalt/ oder images/ liegt (zum Beispiel admin/,
    assets/, vorlagen/, bauen.py, .github/),
  - unter inhalt/ eine Entwickler-Datei geändert wurde: inhalt/schema/ (Feldbeschreibung) oder inhalt/struktur.json (Seitenregister);
    der Workflow übernimmt beides ohnehin nur aus "main",
  - unter images/ eine neue oder geänderte Datei keine Bilddatei ist (erlaubt: .webp, .jpg, .jpeg, .png; Löschen ist immer erlaubt),
  - eine neue oder geänderte Datei kein normaler Dateityp ist (Symlink, ausführbar, Submodul).

Aufruf (im Arbeitsordner des Projekts, beide Branches müssen als Referenz vorhanden sein):
    python3 -I .github/skripte/pruefe_inhalt_branch.py --basis origin/main --inhalt origin/inhalt [--repo ORDNER]

Nur Python-Standardbibliothek und git. Zum Testen: python3 pruefen_aenderung.py (Test 9).
"""
import argparse
import subprocess
import sys

ERLAUBTE_WURZELN = ("inhalt/", "images/")
NUR_MAIN = ("inhalt/schema", "inhalt/struktur.json")      # Ordner/Datei samt allem darunter (auch eine Datei, die den Ordner ersetzen soll)
BILD_ENDUNGEN = (".webp", ".jpg", ".jpeg", ".png")
NORMALE_DATEI = "100644"


def git(repo, *args):
    r = subprocess.run(["git", "-C", repo] + list(args), capture_output=True)
    if r.returncode != 0:
        raise RuntimeError("git %s: %s" % (" ".join(args[:2]), r.stderr.decode("utf-8", "replace").strip()))
    return r.stdout


def aenderungen(repo, basis, inhalt):
    """Gibt (Merge-Base, [(Status, neuer Modus, Pfad), ...]) zurück: alles, was 'inhalt' gegenüber 'main' selbst geändert hat."""
    # Namen zuerst in Commit-IDs auflösen: "inhalt" ist zugleich Zweigname und Ordnername, git würde sonst "mehrdeutig" melden
    shas = []
    for name in (basis, inhalt):
        try:
            shas.append(git(repo, "rev-parse", "--verify", "--quiet", name + "^{commit}").decode().strip())
        except RuntimeError:
            raise RuntimeError("Der Zweig %r gibt es nicht. Ohne ihn kann die Seite nicht gebaut werden." % name)
    try:
        mb = git(repo, "merge-base", shas[0], shas[1]).decode().strip()
    except RuntimeError:
        raise RuntimeError("%r und %r haben keine gemeinsame Vorgeschichte. Der Zweig für Inhalte muss aus main entstanden sein." % (basis, inhalt))
    roh = git(repo, "diff-tree", "-r", "--raw", "-z", "--no-renames", "--no-abbrev", mb, shas[1]).split(b"\0")
    liste = []
    i = 0
    while i + 1 < len(roh):
        kopf, pfad = roh[i].decode("utf-8", "replace"), roh[i + 1].decode("utf-8", "replace")
        i += 2
        teile = kopf.lstrip(":").split()          # alter Modus, neuer Modus, alte SHA, neue SHA, Status
        liste.append((teile[4][0], teile[1], pfad))
    return mb, liste


def pruefe(liste):
    """Liefert die Liste der Verstöße (Texte). Leer = in Ordnung."""
    probleme = []
    for status, modus, pfad in liste:
        teile = pfad.split("/")
        if "" in teile or ".." in teile or "." in teile or "\\" in pfad or any(ord(z) < 32 for z in pfad):
            probleme.append("%r: ungültiger Pfad." % pfad)
            continue
        if not pfad.startswith(ERLAUBTE_WURZELN):
            probleme.append("%r (%s): Der Zweig 'inhalt' darf nur Dateien unter inhalt/ und images/ ändern." % (pfad, status))
            continue
        if any(pfad == e or pfad.startswith(e + "/") for e in NUR_MAIN):
            probleme.append("%r (%s): Feldbeschreibung und Seitenregister gehören nach 'main' (Entwickler), nicht in den Zweig 'inhalt'." % (pfad, status))
            continue
        if status == "D":
            continue                                   # Löschen ist erlaubt (Foto entfernen, Rückgängig)
        if status not in "AM" or modus != NORMALE_DATEI:
            probleme.append("%r: unerlaubter Dateityp (Modus %s, Status %s). Erlaubt sind nur normale Dateien." % (pfad, modus, status))
            continue
        if pfad.startswith("images/") and not pfad.lower().endswith(BILD_ENDUNGEN):
            probleme.append("%r: In images/ sind nur %s erlaubt." % (pfad, ", ".join(BILD_ENDUNGEN)))
    return probleme


def main():
    p = argparse.ArgumentParser(description="Prüft, dass der Zweig 'inhalt' nur Inhalte und Bilder geändert hat.")
    p.add_argument("--basis", default="origin/main", help="Referenz des Code-Zweigs (Standard: origin/main)")
    p.add_argument("--inhalt", default="origin/inhalt", help="Referenz des Inhalts-Zweigs (Standard: origin/inhalt)")
    p.add_argument("--repo", default=".", help="Ordner des Git-Projekts (Standard: .)")
    a = p.parse_args()
    try:
        mb, liste = aenderungen(a.repo, a.basis, a.inhalt)
    except RuntimeError as e:
        print("FEHLER %s" % e)
        return 1
    probleme = pruefe(liste)
    if probleme:
        print("FEHLER Der Zweig %s enthält Änderungen, die dort nicht erlaubt sind (verglichen mit %s):" % (a.inhalt, mb[:10]))
        for t in probleme:
            print("  - " + t)
        print("%d Verstöße. Es wird nichts gebaut und nichts veröffentlicht." % len(probleme))
        return 1
    print("ok: %d Änderungen des Zweigs %s gegenüber %s geprüft, alle unter inhalt/ und images/ (Bilder)." % (len(liste), a.inhalt, mb[:10]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
