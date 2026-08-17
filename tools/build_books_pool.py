#!/usr/bin/env python3
"""Build Art Club's book pool.

Open Library only, no API key. Takes recently published books, ranks them by how
many people have added them to their reading list, and keeps only those by authors
with a real back catalogue -- the same "does this creator have a track record" gate
that rescued the music pool from unknown demos.

The window spans *two* years on purpose. Reading-list counts take months to build,
so books from the current year alone score in single digits -- far too noisy to
tell a hit from a nobody. Reaching back one more year turns the signal from
single digits into thousands, which is what makes "what the world actually read"
measurable at all.

Usage:  python3 tools/build_books_pool.py [--years 2] [--min-want 60]

Re-run this weekly; the pool grows as recent titles gather readers.
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

HDRS = {"User-Agent": "ArtClubApp/0.1 ( https://github.com/ventura1126-star/art-club )"}
FIELDS = ("key,title,author_name,author_key,first_publish_year,cover_i,"
          "want_to_read_count,readinglog_count,ratings_count,"
          "number_of_pages_median,subject")

OUT_PATH = os.path.join(os.path.dirname(__file__), "..", "curator", "assets", "books.json")

# Serialised comics and manga arrive as numbered volumes and swamp the pool.
VOLUME_NOISE = re.compile(
    r"(vol\.?\s*\d|volume\s+\d|,?\s*book\s+\d|chapters?\s+\d|"
    r"\bomnibus\b|\bbox set\b|\bboxed set\b|\bdeluxe edition\b|\bgn\b)", re.I)

# Study guides, workbooks and exam crammers are "new books" but not reading.
NON_READING = re.compile(
    r"(question bank|solved papers|sample paper|exam|syllabus|workbook|"
    r"study guide|textbook|for dummies|cbse|ncert|test prep)", re.I)


def get(url, attempts=3):
    for i in range(attempts):
        try:
            req = urllib.request.Request(url, headers=HDRS)
            with urllib.request.urlopen(req, timeout=45) as r:
                return json.load(r)
        except Exception:
            time.sleep(2 * (i + 1))
    return None


def log(msg):
    print(msg, flush=True)


def mostly_latin(text):
    """Keep titles a European English reader can actually read.

    Open Library's language filter still lets CJK titles through, so this checks
    the characters themselves rather than trusting the metadata.
    """
    letters = [c for c in (text or "") if c.isalpha()]
    if not letters:
        return False
    latin = sum(1 for c in letters if ord(c) < 0x250)
    return latin / len(letters) > 0.8


def candidates(year_from, year_to, pages):
    """Fetch each year separately.

    Querying the whole range at once and sorting by popularity buries recent
    books: reading-list counts grow for years, so the oldest year swamps the
    results. One query per year keeps every year in the running.
    """
    out = []
    for year in range(year_from, year_to + 1):
        got = 0
        for page in range(1, pages + 1):
            d = get("https://openlibrary.org/search.json?" + urllib.parse.urlencode({
                "q": "first_publish_year:%d AND language:eng" % year,
                "sort": "want_to_read", "limit": 100, "page": page,
                "fields": FIELDS}))
            docs = (d or {}).get("docs", [])
            if not docs:
                break
            out.extend(docs)
            got += len(docs)
            time.sleep(1.2)
        log("  %d -> %d candidates" % (year, got))
    return out


def build(year_from, year_to, min_want, min_works, pages,
          max_per_author, per_year):
    log("Years: %d-%d | min want_to_read: %d | min author works: %d\n"
        % (year_from, year_to, min_want, min_works))

    docs = candidates(year_from, year_to, pages)
    log("\n%d candidates from Open Library\n" % len(docs))

    author_cache, seen, pool = {}, set(), []
    for doc in docs:
        title = (doc.get("title") or "").strip()
        names = doc.get("author_name") or []
        akeys = doc.get("author_key") or []
        want = doc.get("want_to_read_count") or 0

        if want < min_want or not doc.get("cover_i") or not names or not akeys:
            continue
        if not mostly_latin(title) or not mostly_latin(names[0]):
            continue
        if VOLUME_NOISE.search(title) or NON_READING.search(title):
            continue
        key = (title.lower(), names[0].lower())
        if key in seen:
            continue
        seen.add(key)

        akey = akeys[0]
        if akey not in author_cache:
            d = get("https://openlibrary.org/authors/%s/works.json?limit=1" % akey)
            author_cache[akey] = (d or {}).get("size", 0)
            time.sleep(0.25)
        works = author_cache[akey]
        if works < min_works:
            continue

        subjects = [s for s in (doc.get("subject") or [])
                    if len(s) < 26 and mostly_latin(s)][:2]
        # A tip screen showing nothing but a year says nothing at all, so a book
        # has to carry at least one fact worth printing.
        if not subjects and not doc.get("number_of_pages_median"):
            continue
        pool.append({
            "id": (doc.get("key") or "").rsplit("/", 1)[-1],
            "title": title,
            "author": names[0],
            "year": doc.get("first_publish_year"),
            "pages": doc.get("number_of_pages_median"),
            "subjects": subjects,
            "cover": "https://covers.openlibrary.org/b/id/%s-L.jpg" % doc["cover_i"],
            "want": want,
            "authorWorks": works,
        })

    # Balance the pool before shipping it. Without this a single prolific
    # romance author takes a dozen slots and the oldest year takes half of them.
    pool.sort(key=lambda p: -p["want"])
    by_author, by_year, balanced = {}, {}, []
    for p in pool:
        a, y = p["author"].lower(), p["year"]
        if by_author.get(a, 0) >= max_per_author or by_year.get(y, 0) >= per_year:
            continue
        by_author[a] = by_author.get(a, 0) + 1
        by_year[y] = by_year.get(y, 0) + 1
        balanced.append(p)
    log("\n  balanced: %d -> %d (max %d per author, %d per year)"
        % (len(pool), len(balanced), max_per_author, per_year))
    pool = balanced

    out = {"generated": date.today().isoformat(),
           "years": [year_from, year_to],
           "count": len(pool), "items": pool}
    os.makedirs(os.path.dirname(os.path.abspath(OUT_PATH)), exist_ok=True)
    with open(OUT_PATH, "w") as f:
        json.dump(out, f, indent=1, ensure_ascii=False)

    log("\n%d books in pool -> %s\n" % (len(pool), os.path.abspath(OUT_PATH)))
    for p in pool[:25]:
        log("  want=%-4s works=%-4s %-38s %s" % (
            p["want"], p["authorWorks"], p["title"][:38], p["author"][:22]))
    return len(pool)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--years", type=int, default=2,
                    help="how many years back to include, current year included")
    ap.add_argument("--min-want", type=int, default=60)
    ap.add_argument("--min-works", type=int, default=3)
    ap.add_argument("--pages", type=int, default=3)
    ap.add_argument("--max-per-author", type=int, default=2)
    ap.add_argument("--per-year", type=int, default=30)
    a = ap.parse_args()
    this_year = date.today().year
    sys.exit(0 if build(this_year - a.years + 1, this_year,
                        a.min_want, a.min_works, a.pages,
                        a.max_per_author, a.per_year) else 1)
