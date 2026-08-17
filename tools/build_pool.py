#!/usr/bin/env python3
"""Build Art Club's music pool.

Pulls recent album releases from MusicBrainz, keeps only the ones by artists
with a real following on Deezer, and writes a self-contained pool.json that the
app ships with. The app makes no network calls of its own -- it just picks one
item per day out of this file.

Usage:  python3 tools/build_pool.py [--days 60] [--min-fans 5000]

Re-run this weekly to refresh the pool.
"""
import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, timedelta

MB_UA = "ArtClubApp/0.1 ( https://github.com/ventura1126-star/art-club )"
DZ_HDRS = {"User-Agent": "ArtClubApp/0.1", "Accept-Language": "en-US,en;q=0.9"}
FULL_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")

# Deezer allows ~50 requests per 5 seconds. Pacing at exactly 10/s sits on that
# line and gets throttled constantly, and every throttle costs a backoff -- which
# is far more expensive than just going slightly slower in the first place.
DZ_DELAY = 0.13

# Release-group secondary types that are new *releases* but not new *music*:
# archival live sets, reissues, compilations, soundtracks and so on.
EXCLUDED_TYPES = [
    "live", "compilation", "remix", "dj-mix", "soundtrack", "demo",
    "mixtape/street", "interview", "spokenword", "audiobook", "audio drama",
    "field recording",
]

OUT_PATH = os.path.join(os.path.dirname(__file__), "..", "curator", "assets", "pool.json")


def fetch(url, headers, attempts=3, throttle_wait=2.5):
    for i in range(attempts):
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            # 503 from MusicBrainz and 429 from Deezer both mean "slow down",
            # not "broken".
            if e.code in (429, 503) and i < attempts - 1:
                time.sleep(throttle_wait * (i + 1))
                continue
            return None
        except Exception:
            if i < attempts - 1:
                time.sleep(1.5)
                continue
            return None
    return None


def log(msg):
    # Unbuffered, so progress is visible when the output is piped or redirected.
    print(msg, flush=True)


def musicbrainz_candidates(start, end, max_records):
    """Recent official studio albums, deduped on (artist, title)."""
    query = ("firstreleasedate:[%s TO %s] AND primarytype:Album AND status:official"
             % (start, end))
    # Multi-word types must be quoted or Lucene splits them and wrecks the query.
    query += "".join(' AND NOT secondarytype:"%s"' % t for t in EXCLUDED_TYPES)

    seen, out = set(), []
    for offset in range(0, max_records, 100):
        url = "https://musicbrainz.org/ws/2/release-group/?" + urllib.parse.urlencode(
            {"query": query, "fmt": "json", "limit": 100, "offset": offset})
        data = fetch(url, {"User-Agent": MB_UA})
        groups = (data or {}).get("release-groups", [])
        if not groups:
            break
        for rg in groups:
            released = rg.get("first-release-date") or ""
            # A bare "2026" passes a Lucene range check but isn't a real date.
            if not FULL_DATE.match(released) or not (start <= released <= end):
                continue
            artist = ", ".join(a["name"] for a in rg.get("artist-credit", []))
            title = (rg.get("title") or "").strip()
            key = (artist.lower(), title.lower())
            if not artist or not title or key in seen:
                continue
            seen.add(key)
            out.append({"artist": artist, "title": title, "released": released})
        log("  MusicBrainz offset %-5d -> %d unique so far" % (offset, len(out)))
        time.sleep(1.1)          # MusicBrainz asks for ~1 request/second
    return out


def deezer_search(kind, term):
    url = "https://api.deezer.com/search/%s?" % kind + urllib.parse.urlencode(
        {"q": term, "limit": 1})
    # A throttled Deezer call clears once its 5-second window rolls over.
    data = fetch(url, DZ_HDRS, throttle_wait=5)
    hits = (data or {}).get("data") or []
    time.sleep(DZ_DELAY)
    return hits[0] if hits else None


def same_name(a, b):
    """Loose match to reject Deezer returning an unrelated fuzzy hit."""
    norm = lambda s: re.sub(r"[^a-z0-9]", "", (s or "").lower())
    x, y = norm(a), norm(b)
    return bool(x) and bool(y) and (x.startswith(y[:6]) or y.startswith(x[:6]))


def build(days, min_fans, max_records):
    today = date.today()
    start = (today - timedelta(days=days)).isoformat()
    end = today.isoformat()
    log("Window: %s -> %s (last %d days)\n" % (start, end, days))

    candidates = musicbrainz_candidates(start, end, max_records)
    log("\n%d unique recent albums from MusicBrainz\n" % len(candidates))

    artist_cache, pool = {}, []
    for i, c in enumerate(candidates, 1):
        if i % 100 == 0:
            log("  screening %d/%d ... kept %d" % (i, len(candidates), len(pool)))

        name = c["artist"]
        if name not in artist_cache:
            hit = deezer_search("artist", name)
            artist_cache[name] = hit or {}
        artist = artist_cache[name]
        fans = artist.get("nb_fan", 0)

        # Album fan counts grow over time, so they always punish new releases.
        # The artist's following is the signal that actually means "notable".
        if fans < min_fans or not same_name(artist.get("name"), name):
            continue

        hit = deezer_search("album", "%s %s" % (name, c["title"]))
        if not hit:
            continue
        album = fetch("https://api.deezer.com/album/%s" % hit["id"], DZ_HDRS,
                      throttle_wait=5)
        if not album or album.get("error"):
            continue
        if not same_name(album.get("title"), c["title"]):
            continue
        released = album.get("release_date") or c["released"]
        if not (start <= released <= end):
            continue

        pool.append({
            "id": str(album["id"]),
            "artist": album.get("artist", {}).get("name") or name,
            "title": album.get("title") or c["title"],
            "released": released,
            "genres": [g["name"] for g in album.get("genres", {}).get("data", [])],
            "tracks": album.get("nb_tracks"),
            "cover": album.get("cover_big"),
            "artistFans": fans,
        })
        time.sleep(DZ_DELAY)

    # Dedupe again on the Deezer id -- different MusicBrainz entries can
    # resolve to the same album.
    unique = {p["id"]: p for p in pool}
    pool = sorted(unique.values(), key=lambda p: -p["artistFans"])

    out = {"generated": today.isoformat(), "window": {"from": start, "to": end},
           "count": len(pool), "items": pool}
    os.makedirs(os.path.dirname(os.path.abspath(OUT_PATH)), exist_ok=True)
    with open(OUT_PATH, "w") as f:
        json.dump(out, f, indent=1, ensure_ascii=False)

    log("\n%d albums in pool -> %s\n" % (len(pool), os.path.abspath(OUT_PATH)))
    for p in pool[:20]:
        log("  %-8d %s  %s - %s" % (p["artistFans"], p["released"],
                                      p["artist"][:24], p["title"][:34]))
    return len(pool)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=60)
    ap.add_argument("--min-fans", type=int, default=50000)
    ap.add_argument("--max-records", type=int, default=2000)
    a = ap.parse_args()
    sys.exit(0 if build(a.days, a.min_fans, a.max_records) else 1)
