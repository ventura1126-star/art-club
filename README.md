# Art Club

One tip a day. Nothing else.

Open the app, tap a button, get one thing worth your time today. Come back tomorrow
for the next one. No feed, no search, no "give me another", no links — you look it
up yourself on whatever service you already use.

- **Spec:** [curator-spec.md](curator-spec.md)
- **App:** `curator/` — Expo SDK 54 (React Native), runs on iPhone and Android
- **Pool builders:** `tools/build_pool.py` (albums), `tools/build_books_pool.py` (books),
  `tools/build_films_pool.py` (films)

---

## Running it on your phone

```bash
cd curator && npm start
```

Install **Expo Go** from the App Store, then scan the QR code that appears in the
terminal. Your phone and Mac need to be on the same Wi-Fi.

## Running it on your Mac

```bash
cd curator && npm run ios
```

## Tests

```bash
node curator/src/pick.test.mjs
```

Covers the rules that matter: the tip is stable all day, it changes at local
midnight, and nothing repeats until the whole pool has been shown.

---

## Refreshing the pool

The app makes no API calls. It ships with `curator/assets/pool.json` and picks one
album per day out of it, so it is instant and works offline (bar the cover image).

Re-run these roughly weekly to pull in newer releases:

```bash
python3 tools/build_pool.py --days 60 --min-fans 5000
```

```bash
python3 tools/build_books_pool.py
```

```bash
python3 tools/build_films_pool.py
```

### How the album pool is built

1. **MusicBrainz** — recent official studio albums.
   The date field is `firstreleasedate:`, *not* `date:` (that one returns almost
   nothing). Live sets, compilations, reissues and soundtracks are excluded by
   secondary type — they are new *releases* but not new *music*.
2. **Deezer** — prominence filter and artwork.
   Filtering on an album's fan count does not work: fans accumulate over time, so
   a brand-new album always looks unpopular. The **artist's** follower count is
   the signal that actually means "notable", so that is what gates the pool.

Both APIs are free and need no key. MusicBrainz is rate-limited to ~1 request per
second and wants a descriptive User-Agent — the script handles both.

### How the book pool is built

**Open Library** alone, also with no key. The trick is the question asked: not "what
is new" (that sort returns catalog junk) but *"what published this year are people
adding to their reading lists"* — `sort=want_to_read`, which gives new and wanted at
once.

Then the same author gate as music: keep only authors with at least three works to
their name. Plus two filters books need and music did not — a Latin-script check
(Open Library's language filter leaks CJK titles) and a volume-noise filter (manga and
comics arrive as numbered volumes and would swamp the pool).
