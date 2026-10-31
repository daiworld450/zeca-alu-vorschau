#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
mock_github.py – Test-Server für die Verwaltungsseite (nur Python-Standardbibliothek).

Er spielt gleichzeitig zwei Rollen, auf EINEM Port (gleiche Herkunft, damit die echte
Content-Security-Policy der Verwaltungsseite unverändert gilt):

  1. Webserver für die gebaute Seite (_site/, danach admin/test/ unter /admin/test/)
  2. Nachbau der GitHub-REST-API unter /api/... (nur die Endpunkte, die die Verwaltung nutzt)

Die Repo-Dateien (inhalt/ und images/) stammen aus dem Arbeitsordner. Commits, Refs und
Bauaufträge (Actions-Runs) liegen nur im Speicher.

Bauaufträge: Nach jedem Ref-Update entsteht ein Run (queued -> in_progress -> completed), Pfad wie der echte Workflow
(.github/workflows/veroeffentlichen.yml). Ergebnis "failure", wenn eine Inhaltsdatei den Text BAUFEHLER enthält ODER wenn
"python3 bauen.py --pruefen" auf dem committeten Stand (inhalt/ UND images/, also auch neu hochgeladene Fotos) fehlschlägt;
sonst "success".

Testschalter (nur für Tests, POST/GET unter /__test/):
  POST /__test/zustand       {"queued_s":1,"laufend_s":2,"naechster_lauf":"erfolg|fehler|haengt|abgebrochen","ablaufen":true,"fremder_lauf":true}
                             (fremder_lauf: zu jedem Commit gibt es zusätzlich einen fehlgeschlagenen Lauf eines anderen Workflows)
                             (ablaufen: jeder Schlüssel wird mit 401 abgelehnt, simuliert einen abgelaufenen Schlüssel)
  POST /__test/fremder_commit {"datei":"inhalt/seiten/kontakt.json","ersetze":["alt","neu"]}
  POST /__test/zuruecksetzen  Repo auf den Ausgangszustand
  GET  /__test/stand          Zweigspitze, Commits, Dateiliste
  GET  /__test/datei?pfad=…   Dateiinhalt an der Zweigspitze
  GET  /__test/anfragen       Protokoll der API-Aufrufe (ohne Header, ohne Schlüssel)

Zugangsschlüssel (nur Testwerte): test-token (ok), abgelaufen (401), nur-lesen (kein Schreibrecht),
falsches-projekt (404), ohne-actions (Actions nicht lesbar), limit-token (403 Rate-Limit).

Aufruf:  python3 admin/test/mock_github.py [--port 8791]
"""
import argparse
import base64
import hashlib
import json
import mimetypes
import os
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import urllib.parse
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HIER = os.path.dirname(os.path.abspath(__file__))
QUELLE = os.path.dirname(os.path.dirname(HIER))        # Arbeitsordner (enthält bauen.py)
REPO = "daiworld450/zeca-alu-vorschau"
def _zweig_aus_konfig():
    """Der Zweig, auf den die Verwaltung schreibt: admin.branch aus inhalt/seite.json (Inhalte liegen auf "inhalt", Code auf "main")."""
    with open(os.path.join(QUELLE, "inhalt", "seite.json"), encoding="utf-8") as f:
        return json.load(f)["admin"]["branch"]


BRANCH = _zweig_aus_konfig()
STANDARD_ZWEIG = "main"                                 # Standardzweig des Projekts (Code), nicht der Zweig der Verwaltung
MODI = {".json": "application/json; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
        ".css": "text/css; charset=utf-8", ".html": "text/html; charset=utf-8", ".webp": "image/webp", ".woff2": "font/woff2",
        ".svg": "image/svg+xml", ".txt": "text/plain; charset=utf-8", ".xml": "application/xml", ".jpg": "image/jpeg"}


def git_sha(art, daten):
    return hashlib.sha1(("%s %d\0" % (art, len(daten))).encode() + daten).hexdigest()


def jetzt(delta_s=0):
    return (datetime.now(timezone.utc) + timedelta(seconds=delta_s)).strftime("%Y-%m-%dT%H:%M:%SZ")


class Projekt:
    """Git-Modell im Speicher: Blobs, flache Bäume (Pfad -> (Modus, Blob)), Commits, Refs, Runs."""

    def __init__(self):
        self.sperre = threading.RLock()
        self.zustand = {"queued_s": 1.0, "laufend_s": 2.0, "naechster_lauf": None}
        self.anfragen = []
        self.laufnr = 1000
        self.neu()

    # ----------------------------------------------------------- Aufbau
    def neu(self):
        with self.sperre:
            self.blobs, self.baeume, self.commits, self.refs, self.runs = {}, {}, {}, {}, []
            dateien = {}
            for ordner in ("inhalt", "images"):
                for wurzel, dirs, fs in os.walk(os.path.join(QUELLE, ordner)):
                    dirs.sort()
                    for f in sorted(fs):
                        if f == ".DS_Store":
                            continue
                        p = os.path.join(wurzel, f)
                        with open(p, "rb") as fh:
                            dateien[os.path.relpath(p, QUELLE)] = fh.read()
            # Verlauf: ältere Wortlaute, damit die Seite schon Einträge hat; die Zweigspitze entspricht dem Arbeitsordner
            alt = dict(dateien)
            k = "inhalt/seiten/kontakt.json"
            r = "inhalt/seiten/referenzen.json"
            alt[k] = dateien[k].replace("innerhalb eines Werktags".encode(), "innerhalb von zwei Werktagen".encode())
            alt[r] = dateien[r].replace("Terrassenüberdachung".encode(), "Terrassendach".encode(), 1)
            c0 = self.commit_aus(alt, "Ausgangsstand (Import aus der Handversion)", [], -86400 * 9)
            z1 = dict(alt); z1[k] = dateien[k]
            c1 = self.commit_aus(z1, "Admin: Kontakt", [c0], -86400 * 5)
            z2 = dict(z1); z2[r] = dateien[r]
            c2 = self.commit_aus(z2, "Admin: Referenzen", [c1], -86400 * 2 - 3600)
            z3 = dict(z2); z3["inhalt/README-technik.txt"] = b"Technische Notiz (kein Admin-Commit)\n"
            c3 = self.commit_aus(z3, "Technik: Notiz abgelegt", [c2], -3600 * 20)
            self.refs[BRANCH] = c3

    def blob(self, daten):
        sha = git_sha("blob", daten)
        self.blobs[sha] = daten
        return sha

    def baum(self, eintraege):
        """eintraege: Pfad -> (Modus, Blob-SHA)"""
        text = "".join("%s %s %s\n" % (m, s, p) for p, (m, s) in sorted(eintraege.items()))
        sha = git_sha("tree", text.encode())
        self.baeume[sha] = dict(eintraege)
        return sha

    def commit_aus(self, dateien, nachricht, eltern, delta_s=0):
        baum = self.baum({p: ("100644", self.blob(d)) for p, d in dateien.items()})
        return self.neuer_commit(baum, nachricht, eltern, delta_s)

    def neuer_commit(self, baum, nachricht, eltern, delta_s=0):
        datum = jetzt(delta_s)
        inhalt = "%s\n%s\n%s\n%s" % (baum, ",".join(eltern), nachricht, datum + str(len(self.commits)))
        sha = git_sha("commit", inhalt.encode())
        self.commits[sha] = {"sha": sha, "message": nachricht, "tree": baum, "parents": list(eltern), "date": datum}
        return sha

    def datei(self, sha_commit, pfad):
        _m, b = self.baeume[self.commits[sha_commit]["tree"]][pfad]
        return self.blobs[b]

    def ist_vorfahr(self, alt, neu):
        stapel, gesehen = [neu], set()
        while stapel:
            c = stapel.pop()
            if c == alt:
                return True
            if c in gesehen or c not in self.commits:
                continue
            gesehen.add(c)
            stapel.extend(self.commits[c]["parents"])
        return False

    # ----------------------------------------------------------- Bauaufträge
    def starte_lauf(self, commit):
        self.laufnr += 1
        lauf = {"id": self.laufnr, "head_sha": commit, "status": "queued", "conclusion": None, "created_at": jetzt(),
                "html_url": "https://github.com/%s/actions/runs/%d" % (REPO, self.laufnr), "name": "Bauen und veröffentlichen",
                "path": ".github/workflows/veroeffentlichen.yml"}
        self.runs.append(lauf)
        wunsch, self.zustand["naechster_lauf"] = self.zustand["naechster_lauf"], None
        if self.zustand.get("fremder_lauf"):
            # zweiter Lauf zum selben Commit von einem anderen Workflow (wie "pages-build-deployment"): muss ignoriert werden
            self.runs.append({"id": self.laufnr + 500, "head_sha": commit, "status": "completed", "conclusion": "failure",
                              "created_at": jetzt(1), "html_url": "https://github.com/%s/actions/runs/%d" % (REPO, self.laufnr + 500),
                              "name": "pages build and deployment", "path": "dynamic/pages/pages-build-deployment"})
        threading.Thread(target=self.lauf_ablauf, args=(lauf, wunsch), daemon=True).start()

    def lauf_ablauf(self, lauf, wunsch):
        time.sleep(self.zustand["queued_s"])
        lauf["status"] = "in_progress"
        time.sleep(self.zustand["laufend_s"])
        if wunsch == "haengt":
            return
        if wunsch == "abgebrochen":
            lauf["conclusion"] = "cancelled"
            lauf["status"] = "completed"
            return
        if wunsch in ("erfolg", "fehler"):
            ok = wunsch == "erfolg"
        else:
            ok = self.baut(lauf["head_sha"])
        lauf["conclusion"] = "success" if ok else "failure"
        lauf["status"] = "completed"

    def baut(self, commit):
        """Echter Bauversuch (bauen.py --pruefen) auf dem committeten Inhalt; BAUFEHLER im Text = absichtlicher Fehler."""
        with self.sperre:
            baum = self.baeume[self.commits[commit]["tree"]]
            inhalt = {p: self.blobs[s] for p, (m, s) in baum.items() if p.startswith(("inhalt/", "images/"))}
        if any(b"BAUFEHLER" in d for p, d in inhalt.items() if p.startswith("inhalt/")):
            return False
        tmp = tempfile.mkdtemp(prefix="zeca-mock-")
        try:
            shutil.copy(os.path.join(QUELLE, "bauen.py"), tmp)
            shutil.copy(os.path.join(QUELLE, "favicon.svg"), tmp)
            for d in ("assets", "vorlagen", "admin"):
                os.symlink(os.path.join(QUELLE, d), os.path.join(tmp, d))
            # inhalt/ UND images/ kommen aus dem committeten Stand (neu hochgeladene Fotos müssen vorhanden sein)
            for p, d in inhalt.items():
                ziel = os.path.join(tmp, p)
                os.makedirs(os.path.dirname(ziel), exist_ok=True)
                with open(ziel, "wb") as fh:
                    fh.write(d)
            r = subprocess.run([sys.executable, "bauen.py", "--pruefen"], cwd=tmp, capture_output=True, text=True, timeout=60)
            return r.returncode == 0
        finally:
            shutil.rmtree(tmp, ignore_errors=True)


P = Projekt()


class Antwort(Exception):
    def __init__(self, status, daten=None, kopf=None, roh=None):
        self.status, self.daten, self.kopf, self.roh = status, daten, kopf or {}, roh


def lies_json(handler):
    n = int(handler.headers.get("Content-Length") or 0)
    if not n:
        return {}
    try:
        return json.loads(handler.rfile.read(n).decode("utf-8"))
    except ValueError:
        raise Antwort(400, {"message": "Problems parsing JSON"})


def commit_json(c):
    return {"sha": c["sha"], "message": c["message"], "tree": {"sha": c["tree"]},
            "parents": [{"sha": s} for s in c["parents"]],
            "author": {"name": "Test", "date": c["date"]}, "committer": {"name": "Test", "date": c["date"]}}


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "MockGitHub/1"

    def log_message(self, fmt, *args):
        pass

    # ------------------------------------------------------------ Hilfen
    def sende(self, status, daten=None, kopf=None, roh=None, typ=None):
        if roh is None:
            roh = json.dumps(daten if daten is not None else {}).encode("utf-8")
            typ = typ or "application/json; charset=utf-8"
        self.send_response(status)
        self.send_header("Content-Type", typ or "application/octet-stream")
        self.send_header("Content-Length", str(len(roh)))
        self.send_header("Cache-Control", "no-store")
        for k, v in (kopf or {}).items():
            self.send_header(k, v)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(roh)

    def do_HEAD(self):
        self.do_GET()

    def do_GET(self):
        self.bearbeite("GET")

    def do_POST(self):
        self.bearbeite("POST")

    def do_PATCH(self):
        self.bearbeite("PATCH")

    def bearbeite(self, methode):
        url = urllib.parse.urlsplit(self.path)
        pfad = urllib.parse.unquote(url.path)
        abfrage = dict(urllib.parse.parse_qsl(url.query))
        try:
            if pfad.startswith("/api/"):
                self.api(methode, pfad[4:], abfrage)
            elif pfad.startswith("/__test/"):
                self.testschalter(methode, pfad[8:], abfrage)
            elif methode in ("GET", "HEAD"):
                self.statisch(pfad)
            else:
                self.sende(405, {"message": "Method Not Allowed"})
        except Antwort as a:
            self.sende(a.status, a.daten, a.kopf, a.roh)
        except BrokenPipeError:
            pass
        except Exception as e:  # noqa: BLE001 – Test-Server: Fehler sichtbar machen
            self.sende(500, {"message": "Mock-Fehler: %r" % (e,)})

    # ------------------------------------------------------------ statische Dateien
    def statisch(self, pfad):
        if pfad.startswith("/admin/test/"):
            wurzel, rel = os.path.join(QUELLE, "admin", "test"), pfad[len("/admin/test/"):]
        else:
            wurzel, rel = os.path.join(QUELLE, "_site"), pfad.lstrip("/")
        ziel = os.path.normpath(os.path.join(wurzel, rel))
        if not (ziel == wurzel or ziel.startswith(wurzel + os.sep)):
            raise Antwort(403, {"message": "verboten"})
        if os.path.isdir(ziel):
            if not pfad.endswith("/"):
                raise Antwort(301, kopf={"Location": pfad + "/"}, roh=b"")
            ziel = os.path.join(ziel, "index.html")
        if not os.path.isfile(ziel):
            raise Antwort(404, roh=b"nicht gefunden", kopf={"Content-Type": "text/plain"})
        with open(ziel, "rb") as fh:
            daten = fh.read()
        self.sende(200, roh=daten, typ=MODI.get(os.path.splitext(ziel)[1].lower()) or mimetypes.guess_type(ziel)[0])

    # ------------------------------------------------------------ Testschalter
    def testschalter(self, methode, name, abfrage):
        with P.sperre:
            if name == "zustand" and methode == "POST":
                P.zustand.update(lies_json(self))
                raise Antwort(200, P.zustand)
            if name == "zuruecksetzen" and methode == "POST":
                lies_json(self)   # Anfragekörper lesen (sonst stört er die nächste Anfrage auf derselben Verbindung)
                P.neu()
                P.anfragen.clear()
                raise Antwort(200, {"ok": True})
            if name == "stand":
                kopf = P.refs[BRANCH]
                verlauf, c = [], kopf
                while c:
                    verlauf.append({"sha": c, "message": P.commits[c]["message"], "parents": P.commits[c]["parents"]})
                    c = P.commits[c]["parents"][0] if P.commits[c]["parents"] else None
                raise Antwort(200, {"kopf": kopf, "verlauf": verlauf, "dateien": sorted(P.baeume[P.commits[kopf]["tree"]]),
                                    "laeufe": P.runs[-5:]})
            if name == "datei":
                try:
                    daten = P.datei(abfrage.get("commit") or P.refs[BRANCH], abfrage["pfad"])
                except KeyError:
                    raise Antwort(404, {"message": "Datei nicht im Repo"})
                raise Antwort(200, roh=daten, kopf={"Content-Type": "text/plain; charset=utf-8"})
            if name == "anfragen":
                raise Antwort(200, P.anfragen)
            if name == "fremder_commit" and methode == "POST":
                ein = lies_json(self)
                datei = ein.get("datei", "inhalt/seiten/kontakt.json")
                ersetze = ein.get("ersetze", ["Rufen Sie an", "Rufen Sie gern an"])
                kopf = P.refs[BRANCH]
                alt = P.datei(kopf, datei)
                neu = alt.replace(ersetze[0].encode(), ersetze[1].encode(), 1)
                if neu == alt:
                    raise Antwort(400, {"message": "Text %r in %s nicht gefunden" % (ersetze[0], datei)})
                baum = dict(P.baeume[P.commits[kopf]["tree"]])
                baum[datei] = ("100644", P.blob(neu))
                neu_commit = P.neuer_commit(P.baum(baum), "Fremder Commit (Test)", [kopf])
                P.refs[BRANCH] = neu_commit
                raise Antwort(200, {"sha": neu_commit})
        raise Antwort(404, {"message": "unbekannter Testschalter"})

    # ------------------------------------------------------------ GitHub-API
    def api(self, methode, pfad, abfrage):
        with P.sperre:
            P.anfragen.append("%s %s%s" % (methode, pfad, ("?" + urllib.parse.urlencode(abfrage)) if abfrage else ""))
        kopf = self.headers.get("Authorization", "")
        m = re.match(r"^(?:Bearer|token) (.+)$", kopf)
        token = m.group(1) if m else ""
        if not token or token == "abgelaufen" or P.zustand.get("ablaufen"):
            raise Antwort(401, {"message": "Bad credentials"})
        if token == "limit-token":
            raise Antwort(403, {"message": "API rate limit exceeded"},
                          {"X-RateLimit-Remaining": "0", "X-RateLimit-Reset": str(int(time.time()) + 900)})
        if token not in ("test-token", "nur-lesen", "falsches-projekt", "ohne-actions"):
            raise Antwort(401, {"message": "Bad credentials"})
        mm = re.match(r"^/repos/([^/]+/[^/]+)(/.*)?$", pfad)
        if not mm:
            raise Antwort(404, {"message": "Not Found"})
        if mm.group(1) != REPO or token == "falsches-projekt":
            raise Antwort(404, {"message": "Not Found"})
        rest = mm.group(2) or ""
        with P.sperre:
            self.repo_api(methode, rest, abfrage, token)

    def repo_api(self, methode, rest, abfrage, token):
        if rest == "" and methode == "GET":
            raise Antwort(200, {"full_name": REPO, "private": True, "default_branch": STANDARD_ZWEIG,
                                "permissions": {"admin": False, "push": token != "nur-lesen", "pull": True}})
        m = re.match(r"^/branches/(.+)$", rest)
        if m and methode == "GET":
            if m.group(1) != BRANCH:
                raise Antwort(404, {"message": "Branch not found"})
            c = P.commits[P.refs[BRANCH]]
            raise Antwort(200, {"name": BRANCH, "commit": {"sha": c["sha"], "commit": {"message": c["message"], "tree": {"sha": c["tree"]}}}})
        m = re.match(r"^/git/ref/heads/(.+)$", rest)
        if m and methode == "GET":
            if m.group(1) not in P.refs:
                raise Antwort(404, {"message": "Not Found"})
            raise Antwort(200, {"ref": "refs/heads/" + m.group(1), "object": {"sha": P.refs[m.group(1)], "type": "commit"}})
        m = re.match(r"^/git/commits/([0-9a-f]{40})$", rest)
        if m and methode == "GET":
            if m.group(1) not in P.commits:
                raise Antwort(404, {"message": "Not Found"})
            raise Antwort(200, commit_json(P.commits[m.group(1)]))
        m = re.match(r"^/git/trees/([0-9a-f]{40})$", rest)
        if m and methode == "GET":
            if m.group(1) not in P.baeume:
                raise Antwort(404, {"message": "Not Found"})
            baum = P.baeume[m.group(1)]
            raise Antwort(200, {"sha": m.group(1), "truncated": False, "tree": [
                {"path": p, "mode": mo, "type": "blob", "sha": s, "size": len(P.blobs[s])} for p, (mo, s) in sorted(baum.items())]})
        m = re.match(r"^/git/blobs/([0-9a-f]{40})$", rest)
        if m and methode == "GET":
            if m.group(1) not in P.blobs:
                raise Antwort(404, {"message": "Not Found"})
            daten = P.blobs[m.group(1)]
            if "raw" in self.headers.get("Accept", ""):
                raise Antwort(200, roh=daten, kopf={"Content-Type": "application/vnd.github.raw+json"})
            raise Antwort(200, {"sha": m.group(1), "encoding": "base64", "content": base64.b64encode(daten).decode()})
        if rest == "/git/blobs" and methode == "POST":
            self.schreibrecht(token)
            ein = lies_json(self)
            roh = ein.get("content", "")
            daten = base64.b64decode(roh) if ein.get("encoding") == "base64" else roh.encode("utf-8")
            raise Antwort(201, {"sha": P.blob(daten)})
        if rest == "/git/trees" and methode == "POST":
            self.schreibrecht(token)
            ein = lies_json(self)
            if ein.get("base_tree") not in P.baeume:
                raise Antwort(422, {"message": "base_tree not found"})
            baum = dict(P.baeume[ein["base_tree"]])
            for e in ein.get("tree", []):
                if e.get("sha") is None:
                    baum.pop(e["path"], None)
                elif e["sha"] in P.blobs:
                    baum[e["path"]] = (e.get("mode", "100644"), e["sha"])
                else:
                    raise Antwort(422, {"message": "tree.sha %s not found" % e["sha"]})
            raise Antwort(201, {"sha": P.baum(baum)})
        if rest == "/git/commits" and methode == "POST":
            self.schreibrecht(token)
            ein = lies_json(self)
            if ein.get("tree") not in P.baeume or any(e not in P.commits for e in ein.get("parents", [])):
                raise Antwort(422, {"message": "tree or parent not found"})
            sha = P.neuer_commit(ein["tree"], ein.get("message", ""), ein.get("parents", []))
            raise Antwort(201, commit_json(P.commits[sha]))
        m = re.match(r"^/git/refs/heads/(.+)$", rest)
        if m and methode == "PATCH":
            self.schreibrecht(token)
            ein = lies_json(self)
            if m.group(1) not in P.refs:
                raise Antwort(404, {"message": "Not Found"})
            neu = ein.get("sha")
            if neu not in P.commits:
                raise Antwort(422, {"message": "Object does not exist"})
            if not ein.get("force") and not P.ist_vorfahr(P.refs[m.group(1)], neu):
                raise Antwort(422, {"message": "Update is not a fast forward"})
            P.refs[m.group(1)] = neu
            P.starte_lauf(neu)
            raise Antwort(200, {"ref": "refs/heads/" + m.group(1), "object": {"sha": neu, "type": "commit"}})
        if rest == "/commits" and methode == "GET":
            c, liste = P.refs.get(abfrage.get("sha", BRANCH)), []
            if c is None:
                raise Antwort(404, {"message": "No commit found for the ref"})
            n = int(abfrage.get("per_page", 30))
            while c and len(liste) < n:
                j = commit_json(P.commits[c])
                liste.append({"sha": c, "commit": {"message": j["message"], "author": j["author"], "committer": j["committer"]},
                              "parents": j["parents"]})
                c = P.commits[c]["parents"][0] if P.commits[c]["parents"] else None
            raise Antwort(200, liste)
        if rest == "/actions/runs" and methode == "GET":
            if token == "ohne-actions":
                raise Antwort(403, {"message": "Resource not accessible by personal access token"})
            laeufe = [r for r in P.runs if not abfrage.get("head_sha") or r["head_sha"] == abfrage["head_sha"]]
            laeufe = list(reversed(laeufe))[:int(abfrage.get("per_page", 30))]
            raise Antwort(200, {"total_count": len(laeufe), "workflow_runs": [dict(r) for r in laeufe]})
        raise Antwort(404, {"message": "Not Found"})

    def schreibrecht(self, token):
        if token in ("nur-lesen",):
            raise Antwort(403, {"message": "Resource not accessible by personal access token"})


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--port", type=int, default=8791)
    args = ap.parse_args()
    if not os.path.isfile(os.path.join(QUELLE, "_site", "admin", "index.html")):
        print("Erst 'python3 bauen.py' ausführen: _site/admin/ fehlt.")
        return 1
    srv = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    srv.daemon_threads = True
    print("Mock läuft auf http://127.0.0.1:%d/admin/  (Schlüssel zum Testen: test-token)" % args.port, flush=True)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
