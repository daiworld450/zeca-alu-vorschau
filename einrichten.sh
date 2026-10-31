#!/usr/bin/env bash
# =====================================================================================================================
# einrichten.sh – VORLAGE für die einmalige Einrichtung durch den Entwickler (GitHub-Kommandozeile "gh").
#
#   >>> NICHT AUTOMATISCH AUSFÜHREN. Erst lesen, Platzhalter ersetzen, gegen die aktuelle GitHub-Dokumentation prüfen. <<<
#   Die Befehle wurden nicht gegen GitHub ausgeführt (kein Netz beim Schreiben). Jeder Schritt einzeln, mit Blick auf das Ergebnis.
#
# Das Modell (siehe ADMIN-ANLEITUNG.md, Abschnitt "Grenzen" und Anhang "Einrichten"):
#   main    Code (Generator, Vorlagen, Verwaltungsseite, Workflow). Nur der Entwickler schreibt hier (Ruleset).
#   inhalt  Inhalte und Fotos. Die Verwaltungsseite schreibt hier mit dem Schlüssel des Inhabers.
#   Ein Schlüssel von GitHub gilt immer für das ganze Projekt. Der Schutz entsteht erst durch: eigener Zweig "inhalt", geschützter
#   "main" und ein Workflow, der den Code immer aus "main" nimmt (.github/workflows/veroeffentlichen.yml).
#
# Aufruf (nur wenn alles geprüft ist):
#   EINRICHTEN_BESTAETIGT=ja bash einrichten.sh <Schritt>     zum Beispiel:  EINRICHTEN_BESTAETIGT=ja bash einrichten.sh 2
#   Schritte: 1 Zweig anlegen | 2 main schützen | 3 inhalt schützen | 4 Pages-Quelle | 5 Umgebung github-pages | 6 Actions auf SHAs festlegen
#             7 Prüfung | 8 Verdacht (nur Hinweise)
# Voraussetzung: "gh auth status" zeigt das Konto des Entwicklers, das Administrator des Projekts ist (nicht das Konto des Inhabers).
# =====================================================================================================================
set -euo pipefail

# ---- Platzhalter: bitte ersetzen -------------------------------------------------------------------------------------
REPO="BESITZER/PROJEKT"        # zum Beispiel daiworld450/zeca-alu-de   (muss mit admin.repo in inhalt/seite.json übereinstimmen)
HAUPT_BRANCH="main"            # Code
INHALT_BRANCH="inhalt"         # Inhalte; muss mit admin.branch in inhalt/seite.json übereinstimmen
# ----------------------------------------------------------------------------------------------------------------------

if [ "${EINRICHTEN_BESTAETIGT:-}" != "ja" ] || [ "${1:-}" = "" ]; then
  echo "Das ist eine Vorlage und wird nicht einfach so ausgeführt." >&2
  echo "Erst lesen und die Platzhalter oben ersetzen, dann: EINRICHTEN_BESTAETIGT=ja bash einrichten.sh <Schritt 1-8>" >&2
  exit 1
fi
if [ "$REPO" = "BESITZER/PROJEKT" ]; then
  echo "Bitte zuerst REPO oben im Skript eintragen." >&2
  exit 1
fi

schritt1() {   # Zweig "inhalt" aus main anlegen
  local sha
  sha=$(gh api "repos/$REPO/git/ref/heads/$HAUPT_BRANCH" --jq .object.sha)
  gh api -X POST "repos/$REPO/git/refs" -f ref="refs/heads/$INHALT_BRANCH" -f sha="$sha"
  echo "Zweig $INHALT_BRANCH angelegt (Stand von $HAUPT_BRANCH: ${sha:0:10})."
  echo "Danach in inhalt/seite.json: admin.branch = \"$INHALT_BRANCH\" (auf $HAUPT_BRANCH ändern, bauen, pushen) und den Zweig $INHALT_BRANCH auf denselben Stand bringen (git merge $HAUPT_BRANCH)."
}

schritt2() {   # main schützen: nur Administratoren (der Entwickler) dürfen schreiben
  # Wichtig: Der Schlüssel des Inhabers handelt mit den Rechten des Inhaber-Kontos. Darum:
  #  - das Projekt gehört dem Entwickler (oder einer Organisation), der Inhaber ist nur Mitarbeiter mit der Rolle "Write" (nicht Admin/Maintain),
  #  - das Ruleset hat als einzige Ausnahme die Rolle "Admin". Fein begrenzte Schlüssel beachten Rulesets (sie handeln als das Konto, das
  #    sie erzeugt hat); eine Rolle "Write" kommt an der Regel nicht vorbei. Der Schlüssel hat kein Recht "Administration" und kann das Ruleset nicht ändern.
  # Rulesets in privaten Projekten brauchen einen bezahlten GitHub-Tarif; sonst Klassisch: Settings > Branches > Branch protection rule
  # (Require a pull request before merging, "Do not allow bypassing the above settings").
  # actor_id 5 = Rolle "Admin" (laut GitHub-Dokumentation zu Rulesets: bitte prüfen).
  gh api -X POST "repos/$REPO/rulesets" --input - <<JSON
{
  "name": "$HAUPT_BRANCH schützen (nur Entwickler)",
  "target": "branch",
  "enforcement": "active",
  "conditions": { "ref_name": { "include": ["refs/heads/$HAUPT_BRANCH"], "exclude": [] } },
  "bypass_actors": [ { "actor_id": 5, "actor_type": "RepositoryRole", "bypass_mode": "always" } ],
  "rules": [ { "type": "update" }, { "type": "deletion" }, { "type": "non_fast_forward" } ]
}
JSON
  echo "Ruleset für $HAUPT_BRANCH angelegt. Prüfen: Settings > Rules > Rulesets, und mit einem Test-Schlüssel des Inhabers versuchen,"
  echo "auf $HAUPT_BRANCH zu schreiben (muss abgelehnt werden)."
}

schritt3() {   # inhalt: kein Löschen, kein Überschreiben des Verlaufs (die Verwaltung schreibt nur vorwärts, ohne force)
  gh api -X POST "repos/$REPO/rulesets" --input - <<JSON
{
  "name": "$INHALT_BRANCH nur vorwärts",
  "target": "branch",
  "enforcement": "active",
  "conditions": { "ref_name": { "include": ["refs/heads/$INHALT_BRANCH"], "exclude": [] } },
  "bypass_actors": [ { "actor_id": 5, "actor_type": "RepositoryRole", "bypass_mode": "always" } ],
  "rules": [ { "type": "deletion" }, { "type": "non_fast_forward" } ]
}
JSON
  echo "Optional (nur mit passendem Tarif): ein Push-Ruleset 'file_path_restriction', das Pfade außerhalb von inhalt/ und images/ auf $INHALT_BRANCH sperrt."
  echo "Der Workflow prüft das ohnehin (.github/skripte/pruefe_inhalt_branch.py); das Ruleset wäre eine zweite Schicht."
}

schritt4() {   # GitHub Pages: Quelle "GitHub Actions"
  if gh api "repos/$REPO/pages" >/dev/null 2>&1; then
    gh api -X PUT "repos/$REPO/pages" -f build_type=workflow
  else
    gh api -X POST "repos/$REPO/pages" -f build_type=workflow
  fi
  echo "Pages-Quelle: GitHub Actions. Eigene Domain und HTTPS: Settings > Pages (siehe ADMIN-ANLEITUNG.md, Anhang Go-live)."
}

schritt5() {   # Umgebung github-pages: Veröffentlichen aus main UND inhalt erlauben (sonst lehnt GitHub den Zweig inhalt ab)
  gh api -X PUT "repos/$REPO/environments/github-pages" --input - <<'JSON'
{ "deployment_branch_policy": { "protected_branches": false, "custom_branch_policies": true } }
JSON
  gh api -X POST "repos/$REPO/environments/github-pages/deployment-branch-policies" -f name="$HAUPT_BRANCH" -f type=branch || true
  gh api -X POST "repos/$REPO/environments/github-pages/deployment-branch-policies" -f name="$INHALT_BRANCH" -f type=branch || true
  gh api "repos/$REPO/environments/github-pages/deployment-branch-policies" --jq '.branch_policies[].name'
}

schritt6() {   # GitHub-Aktionen im Workflow auf Commit-SHAs festlegen (ein Tag lässt sich verschieben, eine SHA nicht)
  # Gibt nur aus. Die Zeilen von Hand in .github/workflows/veroeffentlichen.yml eintragen:
  #   uses: actions/checkout@<SHA>  # v4.x.y
  # Tipp: statt des beweglichen Tags v4 den genauen Versions-Tag aus den Releases der Aktion nehmen (zum Beispiel v4.2.2) und erst
  # NACH Prüfung festlegen. Die Liste unten mit den Tags des Workflows abgleichen.
  local a repo tag typ sha
  for a in actions/checkout:v4 actions/setup-python:v5 actions/upload-pages-artifact:v3 actions/deploy-pages:v4; do
    repo="${a%%:*}"; tag="${a##*:}"
    read -r typ sha < <(gh api "repos/$repo/git/ref/tags/$tag" --jq '.object.type + " " + .object.sha')
    if [ "$typ" = "tag" ]; then                       # annotierter Tag: auf den Commit zeigen lassen
      sha=$(gh api "repos/$repo/git/tags/$sha" --jq .object.sha)
    fi
    echo "uses: $repo@$sha  # $tag"
  done
}

schritt7() {   # Prüfung des Zustands (nur Lesen)
  echo "--- Zweige"; gh api "repos/$REPO/branches" --jq '.[] | .name + (if .protected then "  (geschützt)" else "" end)'
  echo "--- Rulesets"; gh api "repos/$REPO/rulesets" --jq '.[] | .name + "  " + .enforcement'
  echo "--- Pages"; gh api "repos/$REPO/pages" --jq '"Quelle: " + .build_type + "  Adresse: " + (.html_url // "-")'
  echo "--- Umgebung"; gh api "repos/$REPO/environments/github-pages" --jq '.deployment_branch_policy'
  echo "Prüfskript lokal: python3 -I .github/skripte/pruefe_inhalt_branch.py --basis origin/$HAUPT_BRANCH --inhalt origin/$INHALT_BRANCH"
}

schritt8() {   # Verhalten bei Verdacht (nur Hinweise, ändert nichts)
  cat <<TEXT
Bei Verdacht (Schlüssel verloren, verschickt, seltsame Änderungen):
 1. Schlüssel SOFORT bei GitHub widerrufen: GitHub > Profilbild > Settings > Developer settings > Personal access tokens >
    Fine-grained tokens > "ZeCa-Alu Verwaltung" > Delete. ("Abmelden" in der Verwaltung widerruft den Schlüssel NICHT, es löscht ihn nur im Browser.)
 2. Prüfen, was auf $INHALT_BRANCH geändert wurde:
      git fetch origin && git log --stat origin/$HAUPT_BRANCH..origin/$INHALT_BRANCH
      python3 -I .github/skripte/pruefe_inhalt_branch.py --basis origin/$HAUPT_BRANCH --inhalt origin/$INHALT_BRANCH
 3. Code in der Geschichte von $HAUPT_BRANCH prüfen (dort darf nur der Entwickler schreiben):
      git log --since="3 months ago" --stat origin/$HAUPT_BRANCH -- admin assets bauen.py vorlagen .github
 4. Verdächtige Änderungen auf $INHALT_BRANCH zurücksetzen (neuer Commit, kein force) oder den Zweig aus $HAUPT_BRANCH neu aufsetzen.
 5. Neue Veröffentlichung auslösen: Actions > "Bauen und veröffentlichen" > Run workflow. Neuen Schlüssel erzeugen (30 bis 90 Tage Laufzeit).
TEXT
}

case "$1" in
  1) schritt1 ;;
  2) schritt2 ;;
  3) schritt3 ;;
  4) schritt4 ;;
  5) schritt5 ;;
  6) schritt6 ;;
  7) schritt7 ;;
  8) schritt8 ;;
  *) echo "Unbekannter Schritt: $1 (erlaubt: 1 bis 8)" >&2; exit 1 ;;
esac
