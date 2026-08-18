# Art Club — Product Spec (v2)

*One tip a day. Nothing else.*

---

## The idea in one sentence

Open the app in the morning, tap one button, and get **one** recommendation for
something new to listen to or read today. Come back tomorrow for the next one.

## Core principles (do not break these)

- **Radically simple.** A home screen with two buttons and a result screen. Nothing else.
- **One tip per day, per category.** No "give me another." The scarcity is the point.
- **Recent, not brand new.** Books reach back five years, music sixty days. *"Společnost
  se tak často nemění."* The app shows what culture has taken up, and being taken up
  takes time — a book published last month has not been accepted by anyone yet.
- **The app decides.** No searching, no browsing, no endless lists.
- **No links, no prose.** The app hands you a name and gets out of the way. You look
  it up yourself on whatever service you already use. *(Decided Aug 2026 — see below.)*

---

## Market & language

International, English-language. Aimed at US + Europe and beyond, not any single country.

## Platform

**Expo (React Native)** — one codebase for iPhone and Android. Chosen so the app can be
on a real phone the same day via Expo Go, with no Apple Developer account and no build
step. Ships to both stores later if it earns it.

---

## Screens

### 1. Home
Two buttons, stacked:

- **What to listen to** — a new album *(built)*
- **What to read** — a new book *(built)*
- **What to watch** — a well-reviewed film *(built)*

### 2. Result
Today's single pick:

- Cover image
- Album title + artist
- Release date · genre · track count

That is the whole screen. The same pick stays fixed all day; a new one arrives at
local midnight.

### 3. The past week
Below today's tip sits one quiet outlined button, **"The past week"**. It opens the
previous seven days' tips as full cards, scrolled vertically — same cover, same facts,
with the weekday ("Yesterday", "Monday") in place of "Today's album".

**No history is stored.** A pick is a pure function of its calendar day, so looking
back just means asking the same question about an earlier date. Yesterday's tip is
recomputed, not remembered — which is why this cost no storage, no network and no
new data.

This does not break the one-a-day rule: it shows what *was*, never a second pick for
today.

**Deliberately not included:**
- ❌ No "listen" / "buy" link — *"Člověk si to pak najde sám, podle toho, co používá."*
- ❌ No AI-written hook or description — just the facts.
- ❌ No save / heart, no history, no settings, no accounts.

---

## How a recommendation is chosen

The app makes **no API calls at runtime**. A pool of recent releases is generated
offline by `tools/build_pool.py` and shipped inside the app as `pool.json`. Each day
the app picks one item out of it.

The pick is **arithmetic, not stored**: the local calendar date seeds a fixed shuffle
of the pool, so the app needs no storage and no network, always agrees with itself,
and never repeats an album until the whole pool has been shown. Selection is otherwise
random — no personalization, no genre setup.

**Everyone gets the same tip on the same day, and that is deliberate.** There is no
user identity anywhere in the app. It is called Art Club: if the whole group has the
same album today, they have something to talk about. Per-user picks would need a
random seed stored on first launch, which would break the no-storage design and turn
a shared moment into one more personalised feed.

Timezones are the only variation — the tip turns over at each person's local midnight,
so a friend further east sees the next day's pick earlier. Same tip, shifted.

Consequence to remember: refreshing the pool changes everyone's tip at once, including
what the past-week screen shows, because that screen recomputes history from the
current pool rather than remembering it.

Re-run the pool builder roughly weekly to pull in newer releases.

---

## Data sources (tested against live APIs, Aug 2026)

Both are free and need **no API key**.

### Music — working, shipped
- **MusicBrainz** — what's new.
- **Deezer** — prominence filter, cover art, genre, track count.

The bar is **50,000 Deezer followers for the artist**. This is fame, not critical
acclaim — and that is the intent: *"tím, že jsou populární, tak to společnost přijala."*
The app shows what culture has embraced, which is what helps someone get their bearings.

Real critic scores were investigated and are not available: Metacritic and Album of the
Year have no public API, and taking their scores would mean lifting their editorial
work. MusicBrainz's own rating field is empty (null, zero votes).

Three findings that the v1 spec got wrong, all verified against the live APIs:

| v1 spec said | Reality |
|---|---|
| Query with `date:[...]` | Returns **1 result**. The correct field is `firstreleasedate:` |
| Filter by "resolves on Deezer" | Not enough — the pool stayed full of unknown artists |
| Deezer `editorial/0/releases` for new releases | Returns **empty**. Dead end. |

**The key insight:** filtering by an *album's* fan count cannot work, because fans
accumulate over time — a brand-new album always looks unpopular, which is exactly
backwards for an app about new releases. Gating on the **artist's** follower count is
what turned the pool from unknown demos into recognisable names.

Also required: exclude release-group secondary types (`live`, `compilation`, `remix`,
`soundtrack`, reissues…). These are new *releases* but not new *music* — archival live
sets and re-recordings were polluting the pool. Multi-word types must be quoted in the
query or Lucene splits them and silently wrecks the whole thing.

MusicBrainz wants ~1 request/second and a descriptive User-Agent.

### Books — working, shipped, **no API key needed**
- **Open Library** — everything: what's new, popularity, covers, page counts, subjects.

The v1 spec expected this to need two API keys. It does not. Two findings changed it:

| v1 spec said | Reality |
|---|---|
| Google Books, with a free key | Returns **429 on the very first request** without a key — unusable as planned |
| Open Library rejected outright | Rejected only its `sort=new`, which is indeed junk. `sort=want_to_read` is a different query and works well |

**The key move:** don't ask Open Library "what is new" — ask it *"what published this
year are people adding to their reading lists"*. That single query returns new **and**
wanted in one shot, no key required.

Then the same author gate as music: keep only authors with a real back catalogue
(`/authors/{key}/works.json` → `size` ≥ 3). This removes self-published noise and exam
crammers, exactly as the artist-follower gate removed unknown demos.

Two extra filters books need and music did not:
- **Script check** — Open Library's `language:eng` still lets CJK titles through, so
  titles are checked character-by-character for Latin script.
- **Volume/serial noise** — manga and comics arrive as numbered volumes and swamp the
  pool; titles matching `Vol. 3`, `Chapters 134-193`, box sets etc. are dropped.

**The window spans five years.** Reading-list counts take years to build, so the current
year alone scores in single digits — noise, not signal. Five years turns that into
thousands and surfaces what people actually read: *It Starts with Us*, *Fourth Wing*,
*I'm Glad My Mom Died*, *The Housemaid*.

**Three balancing rules, each added after measuring the pool and finding it skewed:**

| Problem found | Rule |
|---|---|
| One query across all years let 2022 take **half** the pool and 2026 none — older books have had longer to gather readers | Query **each year separately**, cap **30 per year** |
| Ana Huang held **14** slots, Freida McFadden 11 — one author would recur fortnightly | Cap **2 books per author** |
| 5% of books had no genre and no page count, leaving a tip screen showing only a year | Require **at least one printable fact** |

Result: 114 books, 5 authors at most twice, years evenly weighted.

**Known limits, accepted:**
- Open Library's audience skews to India and self-published romance, so a couple of
  self-published titles out-rank genuine bestsellers at the very top of the pool, and
  roughly **a quarter of the pool is romance**. That is the source's readership showing
  through, not a bug that can be filtered away.
- **The current year is absent.** 2026 books have not gathered enough readers to clear
  the bar. This follows from the principle rather than contradicting it — but it does
  mean the app never shows anything published this year.
- Granularity is the publication *year*, not an exact date.
- Tested and rejected as quality signals, all requiring no key: Open Library's
  `/trending` (returns 1936 classics, not new books), its star ratings (1–3 votes per
  book — statistically meaningless), and filtering to Czech editions (only **four**
  books exist for 2026; Open Library has almost no Czech data).
- The NYT Books API remains the only real upgrade for editorial taste, and it needs a
  free key. Deliberately not taken — the app stays key-free.

### Film — working, shipped, **no API key needed**
- **Wikidata** — everything: title, director, first release date, genre, runtime,
  Rotten Tomatoes critics score, and notability.

**This is the only category with a real critical verdict.** Music and books had to
settle for popularity; Wikidata records review scores as structured data, so here the
app can say the critics liked it and mean it.

Three problems found by measuring, each one invisible until checked:

| Problem | Fix |
|---|---|
| *Gladiator* (2000), *Interstellar* (2014) and *City of God* (2002) appeared as recent films — Wikidata records 4K **re-release** dates as publication dates | A subquery takes each film's **first ever** release, and the recency filter applies to that |
| A 100%-rated Malayalam film nobody here has heard of is not orientation | Gate on **Wikipedia language count ≥ 15** — the same "is this actually known" test as artist followers and author back-catalogues |
| Asking for scores, notability and details in one query timed the endpoint out every time (500s, 504s) | **Two queries**: core first, then details for the survivors only |

**No poster is shown, on purpose.** Film posters are copyrighted, so free sources hold
red-carpet and awards photography instead — only **3 of 66** films had anything
poster-like, and one tip screen showed a photo of a film crew at the Goya Awards. The
critics' score is rendered large as the visual instead. Honest, and it looks deliberate.

### ⚠️ Not Spotify
As of Feb 2026 Spotify removed its new-releases endpoint for new apps and restricted
developer access. Do not build on it.

---

## Money — open question

Earlier thinking was *free app + affiliate buy links*. **That is now void**: the app
deliberately has no links at all, so there is nothing to earn a commission on.

No answer yet. Worth deciding only if the app proves itself in daily use. Options that
would not break the core principles: a one-off paid app (blocked for books by Google
Books' terms, but fine for a music-only app), or simply keeping it free as a personal tool.

---

## Look & feel

Minimal, calm, uncluttered. Warm paper background, one accent colour, system font,
generous whitespace. Reference: **DailyArt** — borrow its calm one-per-day feel.

---

## Build order

1. ✅ Finalize spec.
2. ✅ Prove the engine — music pipeline verified end to end against live APIs.
3. ✅ Build the music button — Expo app, pool builder, tested pick logic.
   Pool: **30 albums** over a 60-day window, artists above 50k followers.
4. ✅ Add the books button — Open Library, **no API keys after all**.
   Pool: **114 books** across five years, balanced by year and author.
5. ✅ Add the films button — Wikidata, no API key.
   Pool: **289 films** from the last three years, critics ≥ 70%, known in ≥ 15 languages.
6. ⬜ **Use it daily on your own phone for two weeks.** Fix what annoys you.
7. ⬜ Automate the weekly pool refresh (GitHub Action) so it never goes stale.
8. ⬜ Then consider a standalone install (EAS Build) so it runs without the Mac.

Note: the app runs on **Expo SDK 54**, not the latest. Richard's iPhone is on an older
iOS, so the App Store gives him an Expo Go capped at SDK 54. The device sets the
ceiling — scaffolding fresh with `create-expo-app@latest` will break on his phone.
