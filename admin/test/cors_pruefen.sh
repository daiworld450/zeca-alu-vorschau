#!/usr/bin/env bash
# cors_pruefen.sh – prüft gegen die ECHTE GitHub-API (ohne Schlüssel), ob ein Browser die Verwaltungsseite
# die benutzten Anfragen überhaupt senden lässt (CORS-Preflight, "OPTIONS") und die Antworten lesen darf.
#
# Aufruf:  bash admin/test/cors_pruefen.sh [owner/repo]        (Standard: daiworld450/zeca-alu-vorschau)
# Es wird nur OPTIONS gesendet (ändert nichts) und je Herkunft eine GET-Anfrage ohne Schlüssel (ergibt 401/404).
# Gesendet wird nie ein Zugangsschlüssel. Ausgabe: eine Zeile je Endpunkt, Methode und Herkunft, am Ende die Summe.
set -u
REPO="${1:-daiworld450/zeca-alu-vorschau}"
API="https://api.github.com/repos/${REPO}"
ORIGINS=("https://daiworld450.github.io" "https://zeca-alu.de")
# Header, die die Verwaltungsseite sendet (api.js). "accept" ist laut Fetch-Standard immer erlaubt (CORS-safelisted).
HEADER="authorization,content-type,x-github-api-version,accept"
ENDPOINTS=(
  "contents/inhalt/seite.json"
  "git/blobs"
  "git/trees"
  "git/commits"
  "git/refs/heads/main"
  "actions/runs"
  "commits"
)
METHODEN=(GET POST PATCH PUT DELETE)

klein() { printf '%s' "$1" | tr '[:upper:]' '[:lower:]'; }
holen() { # Header-Wert aus der Antwort ($1 = Name)
  printf '%s\n' "$ANTWORT" | tr -d '\r' | awk -v n="$1" 'BEGIN{n=tolower(n)":"} tolower($1)==n{sub(/^[^:]*:[ ]*/,""); print; exit}'
}

ok=0; schlecht=0
printf '%-30s %-7s %-30s %-5s %s\n' "Endpunkt" "Methode" "Herkunft" "Code" "Ergebnis"
for o in "${ORIGINS[@]}"; do
  for e in "${ENDPOINTS[@]}"; do
    for m in "${METHODEN[@]}"; do
      ANTWORT=$(curl -sS -m 20 -D - -o /dev/null -X OPTIONS "${API}/${e}" \
        -H "Origin: ${o}" -H "Access-Control-Request-Method: ${m}" -H "Access-Control-Request-Headers: ${HEADER}")
      code=$(printf '%s\n' "$ANTWORT" | head -1 | awk '{print $2}')
      acao=$(holen access-control-allow-origin)
      acam=$(klein "$(holen access-control-allow-methods)")
      acah=$(klein "$(holen access-control-allow-headers)")
      gut=1
      case "$code" in 200|204) ;; *) gut=0 ;; esac
      [ "$acao" = "*" ] || [ "$acao" = "$o" ] || gut=0
      case ",${acam// /}," in *",$(klein "$m"),"*) ;; *) gut=0 ;; esac
      fehlt=""
      for h in authorization content-type x-github-api-version; do
        case ",${acah// /}," in *",$h,"*) ;; *) gut=0; fehlt="$fehlt $h" ;; esac
      done
      if [ $gut = 1 ]; then ok=$((ok+1)); erg="erlaubt"; else schlecht=$((schlecht+1)); erg="NICHT erlaubt (fehlt:${fehlt:- Herkunft/Methode})"; fi
      printf '%-30s %-7s %-30s %-5s %s\n' "$e" "$m" "$o" "$code" "$erg"
    done
  done
done

echo
echo "Echte Anfragen ohne Schlüssel (Antwort muss für die Seite lesbar sein, auch bei Fehlern):"
for o in "${ORIGINS[@]}"; do
  ANTWORT=$(curl -sS -m 20 -D - -o /dev/null "${API}" -H "Origin: ${o}" -H "Accept: application/vnd.github+json" -H "X-GitHub-Api-Version: 2022-11-28")
  code=$(printf '%s\n' "$ANTWORT" | head -1 | awk '{print $2}')
  acao=$(holen access-control-allow-origin)
  expose=$(klein "$(holen access-control-expose-headers)")
  gut=1
  [ "$acao" = "*" ] || [ "$acao" = "$o" ] || gut=0
  for h in x-ratelimit-remaining x-ratelimit-reset retry-after; do
    case ",${expose// /}," in *",$h,"*) ;; *) gut=0 ;; esac
  done
  if [ $gut = 1 ]; then ok=$((ok+1)); erg="lesbar, Rate-Limit-Header freigegeben"; else schlecht=$((schlecht+1)); erg="NICHT lesbar oder Header nicht freigegeben"; fi
  printf '%-30s %-7s %-30s %-5s %s\n' "(Projekt)" "GET" "$o" "$code" "$erg"
done

echo
echo "Zusammen: ${ok} erlaubt, ${schlecht} nicht erlaubt."
[ $schlecht = 0 ]
