#!/usr/bin/env python3
"""Build Art Club's film pool.

Wikidata only, no API key. Takes films released in the last few years that carry
a Rotten Tomatoes critics score, and keeps the well-reviewed ones.

This is the one category where a real critical verdict is available for free.
Music and books had to settle for popularity -- "what the crowd took up" -- but
Wikidata records review scores as structured data, so here the app can say
"the critics liked this" and mean it.

Usage:  python3 tools/build_films_pool.py [--years 3] [--min-score 70]

Re-run weekly alongside the other two builders.
"""
import argparse
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
from datetime import date

UA = "ArtClubApp/0.1 ( https://github.com/ventura1126-star/art-club )"
ENDPOINT = "https://query.wikidata.org/sparql"
OUT_PATH = os.path.join(os.path.dirname(__file__), "..", "curator", "assets", "films.json")

# Two queries rather than one. Asking for scores, notability and all the optional
# details at once times the public endpoint out (500s and 504s every time); split
# in half, both halves return comfortably.
CORE = """
SELECT ?film ?filmLabel ?score ?sl ?first WHERE {
  # Inner query takes each film's FIRST ever release date. Filtering dates
  # directly instead lets 4K re-releases of old classics through as new films --
  # Gladiator, Interstellar and City of God all showed up as recent releases.
  { SELECT ?film (MIN(?dd) AS ?first) WHERE {
      ?film wdt:P31 wd:Q11424 ; wdt:P577 ?dd ; p:P444/pq:P447 wd:Q105584 .
    } GROUP BY ?film }
  FILTER(?first >= "%s"^^xsd:dateTime)
  ?film p:P444 ?rs ; wikibase:sitelinks ?sl .
  ?rs pq:P447 wd:Q105584 ; ps:P444 ?score .
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
LIMIT 3000
"""

DETAILS = """
SELECT ?film (SAMPLE(?dur) AS ?runtime) (SAMPLE(?dirl) AS ?director)
       (GROUP_CONCAT(DISTINCT ?gl; separator=" \u00b7 ") AS ?genres)
WHERE {
  VALUES ?film { %s }
  OPTIONAL { ?film wdt:P2047 ?dur }
  OPTIONAL { ?film wdt:P136 ?g . ?g rdfs:label ?gl . FILTER(lang(?gl) = "en") }
  OPTIONAL { ?film wdt:P57 ?dir . ?dir rdfs:label ?dirl . FILTER(lang(?dirl) = "en") }
}
GROUP BY ?film
"""

def log(m):
    print(m, flush=True)


def ask(query, attempts=5):
    url = ENDPOINT + "?" + urllib.parse.urlencode({"query": query, "format": "json"})
    for i in range(attempts):
        try:
            req = urllib.request.Request(url, headers={
                "User-Agent": UA, "Accept": "application/sparql-results+json"})
            with urllib.request.urlopen(req, timeout=180) as r:
                return json.loads(r.read().decode("utf-8"),
                                  strict=False)["results"]["bindings"]
        except Exception as e:
            # The public endpoint throttles hard; waiting is the only fix.
            log("  pokus %d selhal (%s), cekam..." % (i + 1, e))
            time.sleep(20 * (i + 1))
    return []


# No image is fetched on purpose. Wikidata's picture for a film is almost never
# the poster -- posters are copyrighted, so Commons cannot host them, and what is
# there instead is red-carpet and awards-ceremony photography. Only 3 of 66 films
# had anything poster-like. The app shows the critics' score as the visual rather
# than dressing a recommendation up with a photo of a film crew.


def build(years, min_score, min_langs):
    since = "%d-01-01" % (date.today().year - years)
    log("Filmy od %s | skore kritiku >= %d %% | jazyku na Wikipedii >= %d\n"
        % (since, min_score, min_langs))

    rows = ask(CORE % since)
    log("  jadro: %d radku" % len(rows))

    best = {}
    for r in rows:
        raw = r.get("score", {}).get("value", "")
        m = re.match(r"^(\d{1,3})\s*%$", raw.strip())
        if not m:                                   # 7.6/10 style scores, skip
            continue
        pct = int(m.group(1))
        if pct < min_score or pct > 100:
            continue
        # How many Wikipedia languages cover the film. Critical acclaim says
        # nothing about whether anyone has heard of it, and a 100%-rated film
        # nobody knows does not help you find your bearings.
        try:
            langs = int(r.get("sl", {}).get("value", 0))
        except (TypeError, ValueError):
            langs = 0
        if langs < min_langs:
            continue
        title = r.get("filmLabel", {}).get("value", "").strip()
        # Unlabelled items come through as bare Q-ids; they are useless as a tip.
        if not title or re.match(r"^Q\d+$", title):
            continue
        item = {
            "qid": r["film"]["value"].rsplit("/", 1)[-1],
            "id": re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")[:60],
            "title": title,
            "released": r.get("first", {}).get("value", "")[:10],
            "langs": langs,
            "score": pct,
        }
        if title not in best or best[title]["score"] < pct:
            best[title] = item

    pool = sorted(best.values(), key=lambda p: -p["score"])

    # Second pass: fetch the printable details only for the films that survived.
    qids = [p.pop("qid") for p in pool]
    detail = {}
    for i in range(0, len(qids), 150):
        chunk = " ".join("wd:%s" % q for q in qids[i:i + 150])
        for r in ask(DETAILS % chunk, attempts=3):
            q = r["film"]["value"].rsplit("/", 1)[-1]
            detail[q] = r
        log("  detaily: %d/%d" % (min(i + 150, len(qids)), len(qids)))
        time.sleep(2)
    for p, q in zip(pool, qids):
        d = detail.get(q, {})
        dur = d.get("runtime", {}).get("value")
        p["runtime"] = int(float(dur)) if dur else None
        p["director"] = d.get("director", {}).get("value") or None
        p["genres"] = [g for g in (d.get("genres", {}).get("value") or "").split(" \u00b7 ") if g][:2]
    out = {"generated": date.today().isoformat(), "since": since,
           "count": len(pool), "items": pool}
    os.makedirs(os.path.dirname(os.path.abspath(OUT_PATH)), exist_ok=True)
    with open(OUT_PATH, "w") as f:
        json.dump(out, f, indent=1, ensure_ascii=False)

    log("\n%d filmu -> %s\n" % (len(pool), os.path.abspath(OUT_PATH)))
    for p in pool[:20]:
        log("  %3d%%  %2d jaz.  %s  %-36s %s"
            % (p["score"], p["langs"], p["released"], p["title"][:36],
               (p["director"] or "")[:18]))
    return len(pool)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--years", type=int, default=3)
    ap.add_argument("--min-score", type=int, default=70)
    ap.add_argument("--min-langs", type=int, default=15)
    a = ap.parse_args()
    sys.exit(0 if build(a.years, a.min_score, a.min_langs) else 1)
