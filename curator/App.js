import { useCallback, useMemo, useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
// react-native's own SafeAreaView is deprecated; SDK 54 points here instead.
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import albums from './assets/pool.json';
import books from './assets/books.json';
import films from './assets/films.json';
import Mark from './src/Mark';
import Splash from './src/Splash';
import { pickForToday, recentPicks } from './src/pick';

const theme = {
  paper: '#FBF9F6',
  ink: '#1A1714',
  muted: '#8A8078',
  rule: '#E6E0D8',
  accent: '#B4603A',
};

// Distinct seeds so the album and the book of the day move independently.
const MUSIC_SEED = 0x5eed1e;
const BOOKS_SEED = 0xb00c5;
const FILMS_SEED = 0xf11c5;

const LOOK_BACK_DAYS = 30;
const GALLERY_COLUMNS = 3;

/** Pool and seed for a category, kept in one place. */
const SOURCES = {
  music: { items: albums.items, seed: MUSIC_SEED },
  books: { items: books.items, seed: BOOKS_SEED },
  films: { items: films.items, seed: FILMS_SEED },
};

function sourceFor(kind) {
  return SOURCES[kind];
}

export default function App() {
  // 'home' | { kind } for today's tip | { kind, past: true } for the week behind
  const [route, setRoute] = useState('home');
  const [opening, setOpening] = useState(true);

  const dismissSplash = useCallback(() => setOpening(false), []);

  if (opening) {
    return (
      <SafeAreaProvider>
        <StatusBar barStyle="dark-content" backgroundColor={theme.paper} />
        <Splash theme={theme} onDone={dismissSplash} />
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <StatusBar barStyle="dark-content" backgroundColor={theme.paper} />
        {route === 'home' ? (
          <Home onOpen={(kind) => setRoute({ kind })} />
        ) : route.daysBack != null ? (
          <Tip
            kind={route.kind}
            daysBack={route.daysBack}
            onBack={() => setRoute({ kind: route.kind, past: true })}
          />
        ) : route.past ? (
          <Gallery
            kind={route.kind}
            onBack={() => setRoute({ kind: route.kind })}
            onPick={(daysBack) => setRoute({ kind: route.kind, daysBack })}
          />
        ) : (
          <Tip
            kind={route.kind}
            onBack={() => setRoute('home')}
            onOpenPast={() => setRoute({ kind: route.kind, past: true })}
          />
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function Home({ onOpen }) {
  return (
    <View style={styles.home}>
      <View style={styles.homeMain}>
        <View style={styles.masthead}>
          <Mark size={38} ink={theme.ink} accent={theme.accent} />
          <Text style={styles.wordmark}>Art Club</Text>
          <Text style={styles.tagline}>One thing worth your time today.</Text>
        </View>

        <View style={styles.choices}>
          <Choice
            label="What to listen to"
            hint="A new album"
            onPress={() => onOpen('music')}
          />
          <Choice
            label="What to read"
            hint="A new book"
            onPress={() => onOpen('books')}
          />
          <Choice
            label="What to watch"
            hint="A well-reviewed film"
            onPress={() => onOpen('films')}
          />
        </View>
      </View>

      <Text style={styles.credit}>© junior_art_patron</Text>
    </View>
  );
}

function Choice({ label, hint, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.choice, pressed && styles.choicePressed]}
    >
      <Text style={styles.choiceLabel}>{label}</Text>
      <Text style={styles.choiceHint}>{hint}</Text>
    </Pressable>
  );
}

/** Turns a pool entry into the handful of facts the screen shows. */
function toTip(kind, item, eyebrow) {
  if (!item) return null;
  if (kind === 'music') {
    return {
      eyebrow: eyebrow ?? "Today's album",
      cover: item.cover,
      // Sleeves are square; book jackets are portrait. Cropping one to the
      // other's shape cuts the title straight off the artwork.
      aspect: 1,
      fit: 'cover',
      title: item.title,
      subtitle: item.artist,
      facts: [
        formatDate(item.released),
        item.genres?.length ? item.genres.join(' · ') : null,
        item.tracks ? `${item.tracks} tracks` : null,
      ],
    };
  }
  if (kind === 'films') {
    return {
      eyebrow: eyebrow ?? "Today's film",
      cover: item.cover,
      // With a poster the card matches the other two categories; without one the
      // critics' score is drawn large instead, which beats an empty grey box.
      score: item.cover ? null : item.score,
      aspect: item.cover ? 2 / 3 : 3 / 2,
      fit: 'cover',
      title: item.title,
      subtitle: item.director || '',
      facts: [
        item.released ? item.released.slice(0, 4) : null,
        item.genres?.length ? item.genres.join(' \u00b7 ') : null,
        item.runtime ? `${item.runtime} min` : null,
        // The one category with a real critical verdict rather than popularity.
        item.score ? `${item.score}% critics` : null,
      ],
      // Required by TMDB's terms whenever their artwork is shown.
      attribution: item.cover ? 'Posters via TMDB. Not endorsed or certified by TMDB.' : null,
    };
  }
  return {
    eyebrow: eyebrow ?? "Today's book",
    cover: item.cover,
    // Jacket proportions vary, so contain rather than crop.
    aspect: 2 / 3,
    fit: 'contain',
    title: item.title,
    subtitle: item.author,
    facts: [
      item.year ? String(item.year) : null,
      item.subjects?.length ? item.subjects.join(' · ') : null,
      item.pages ? `${item.pages} pages` : null,
    ],
  };
}

function Tip({ kind, daysBack, onBack, onOpenPast }) {
  // Recomputed only when the calendar day changes, so the pick is stable all day.
  const today = new Date().toDateString();
  const past = daysBack != null;
  const tip = useMemo(() => {
    const { items, seed } = sourceFor(kind);
    const when = past ? dayOffset(new Date(), daysBack) : new Date();
    return toTip(kind, pickForToday(items, when, seed), past ? dayLabel(when) : undefined);
  }, [kind, daysBack, past, today]);

  return (
    <ScrollView
      style={styles.tipScroll}
      contentContainerStyle={styles.tip}
      showsVerticalScrollIndicator={false}
    >
      <BackLink label={past ? '← Collection' : '← Art Club'} onPress={onBack} />

      {tip ? (
        <Card tip={tip} footnote={past ? null : 'Back tomorrow for the next one.'} />
      ) : (
        <Empty />
      )}

      {tip && !past && (
        <Pressable
          onPress={onOpenPast}
          accessibilityRole="button"
          accessibilityLabel="See your collection"
          hitSlop={12}
          style={({ pressed }) => [styles.pastLink, pressed && styles.pastLinkPressed]}
        >
          <Text style={styles.pastLinkText}>Your collection</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

/**
 * The collection: a month of past tips as a grid of covers.
 *
 * Nothing is stored to build this. A pick is a pure function of its calendar
 * day, so the past is recomputed rather than remembered -- which is why a month
 * of history costs no storage and no network.
 */
function Gallery({ kind, onBack, onPick }) {
  const today = new Date().toDateString();
  const entries = useMemo(() => {
    const { items, seed } = sourceFor(kind);
    return recentPicks(items, new Date(), seed, LOOK_BACK_DAYS)
      .map(({ date, item }, i) => ({
        key: date.toDateString(),
        daysBack: i + 1,
        day: date.getDate(),
        tip: toTip(kind, item),
      }))
      .filter((e) => e.tip);
  }, [kind, today]);

  return (
    <ScrollView
      style={styles.tipScroll}
      contentContainerStyle={styles.tip}
      showsVerticalScrollIndicator={false}
    >
      <BackLink label="← Today" onPress={onBack} />

      {entries.length === 0 ? (
        <Empty />
      ) : (
        <>
          <Text style={styles.galleryTitle}>Your collection</Text>
          <Text style={styles.gallerySubtitle}>The last 30 days. Tap to open one.</Text>

          <View style={styles.grid}>
            {entries.map((e) => (
              <Pressable
                key={e.key}
                onPress={() => onPick(e.daysBack)}
                accessibilityRole="button"
                accessibilityLabel={`${e.tip.title}, open`}
                style={({ pressed }) => [styles.cell, pressed && styles.cellPressed]}
              >
                {e.tip.cover ? (
                  <Image
                    source={{ uri: e.tip.cover }}
                    style={[styles.thumb, { aspectRatio: e.tip.aspect }]}
                    resizeMode="cover"
                    accessibilityIgnoresInvertColors
                  />
                ) : (
                  <View style={[styles.thumb, styles.thumbFallback,
                                { aspectRatio: e.tip.aspect }]}>
                    <Text style={styles.thumbScore}>
                      {e.tip.score != null ? `${e.tip.score}%` : '—'}
                    </Text>
                  </View>
                )}
                <Text style={styles.cellDay}>{e.day}</Text>
              </Pressable>
            ))}
          </View>
        </>
      )}
    </ScrollView>
  );
}

function BackLink({ label, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label.replace('← ', '')}
      hitSlop={16}
      style={styles.back}
    >
      <Text style={styles.backText}>{label}</Text>
    </Pressable>
  );
}

/** The same calendar date, n days earlier. */
function dayOffset(date, n) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() - n);
}

/** "Yesterday", then the date — weekday names repeat across a month. */
function dayLabel(date) {
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const daysBack = Math.round(
    (startOfDay(new Date()) - startOfDay(date)) / 86400000
  );
  if (daysBack === 1) return 'Yesterday';
  if (daysBack < 7) return date.toLocaleDateString('en-GB', { weekday: 'long' });
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
}

function Card({ tip, footnote }) {
  const facts = tip.facts.filter(Boolean);

  return (
    <View style={styles.card}>
      {tip.score != null ? (
        <View
          style={[styles.cover, styles.scorePanel, { aspectRatio: tip.aspect }]}
          accessibilityRole="image"
          accessibilityLabel={`${tip.score} percent on the critics' score`}
        >
          <Text style={styles.scoreValue}>{tip.score}%</Text>
          <Text style={styles.scoreLabel}>critics</Text>
        </View>
      ) : tip.cover ? (
        <Image
          source={{ uri: tip.cover }}
          style={[styles.cover, { aspectRatio: tip.aspect }]}
          resizeMode={tip.fit}
          accessibilityIgnoresInvertColors
          accessibilityLabel={`Cover of ${tip.title}`}
        />
      ) : (
        <View style={[styles.cover, styles.coverFallback, { aspectRatio: tip.aspect }]} />
      )}

      <Text style={styles.eyebrow}>{tip.eyebrow}</Text>
      <Text style={styles.cardTitle}>{tip.title}</Text>
      <Text style={styles.byline}>{tip.subtitle}</Text>

      <View style={styles.rule} />

      {facts.length > 0 && <Text style={styles.facts}>{facts.join('   ·   ')}</Text>}
      {footnote ? <Text style={styles.footnote}>{footnote}</Text> : null}
      {tip.attribution ? (
        <Text style={styles.attribution}>{tip.attribution}</Text>
      ) : null}
    </View>
  );
}

function Empty() {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Nothing here</Text>
      <Text style={styles.footnote}>The pool needs refreshing.</Text>
    </View>
  );
}

function formatDate(iso) {
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.paper },

  home: { flex: 1, paddingHorizontal: 28 },
  // The buttons stay optically centred; the credit sits out of their way.
  homeMain: { flex: 1, justifyContent: 'center' },
  credit: { paddingBottom: 8, fontSize: 12, color: theme.muted, letterSpacing: 0.3 },
  masthead: { marginBottom: 56, alignItems: 'flex-start' },
  wordmark: {
    marginTop: 22,
    fontSize: 44,
    letterSpacing: -1,
    color: theme.ink,
    fontWeight: '600',
  },
  tagline: { marginTop: 10, fontSize: 16, color: theme.muted, lineHeight: 22 },

  choices: { gap: 14 },
  choice: {
    borderWidth: 1,
    borderColor: theme.rule,
    borderRadius: 18,
    paddingVertical: 26,
    paddingHorizontal: 24,
    backgroundColor: '#FFFFFF',
  },
  choicePressed: { backgroundColor: '#F3EEE7', transform: [{ scale: 0.99 }] },
  choiceLabel: { fontSize: 21, color: theme.ink, fontWeight: '500' },
  choiceHint: { marginTop: 6, fontSize: 14, color: theme.muted },

  tipScroll: { flex: 1 },
  tip: { paddingHorizontal: 28, paddingTop: 8, paddingBottom: 48 },
  back: { paddingVertical: 12, alignSelf: 'flex-start' },
  backText: { fontSize: 16, color: theme.muted },

  card: { marginTop: 8 },
  cover: {
    width: '100%',
    borderRadius: 14,
    backgroundColor: theme.rule,
    marginBottom: 32,
  },
  coverFallback: { borderWidth: 1, borderColor: theme.rule },

  scorePanel: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: theme.rule,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreValue: {
    fontSize: 76,
    fontWeight: '600',
    letterSpacing: -3,
    color: theme.accent,
  },
  scoreLabel: {
    marginTop: 6,
    fontSize: 12,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: theme.muted,
  },

  eyebrow: {
    fontSize: 12,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: theme.accent,
    marginBottom: 10,
  },
  cardTitle: {
    fontSize: 32,
    lineHeight: 38,
    color: theme.ink,
    fontWeight: '600',
    letterSpacing: -0.5,
  },
  byline: { marginTop: 8, fontSize: 19, color: theme.muted },

  rule: { height: 1, backgroundColor: theme.rule, marginVertical: 26 },

  facts: { fontSize: 15, color: theme.muted, lineHeight: 22 },
  footnote: { marginTop: 28, fontSize: 14, color: theme.muted, fontStyle: 'italic' },
  attribution: { marginTop: 18, fontSize: 11, color: theme.rule, letterSpacing: 0.2 },

  // Quiet on purpose: available when wanted, never competing with today's tip.
  pastLink: {
    marginTop: 34,
    alignSelf: 'flex-start',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.rule,
  },
  pastLinkPressed: { backgroundColor: '#F3EEE7' },
  pastLinkText: { fontSize: 14, color: theme.muted, letterSpacing: 0.2 },

  galleryTitle: {
    marginTop: 8,
    fontSize: 30,
    fontWeight: '600',
    letterSpacing: -0.6,
    color: theme.ink,
  },
  gallerySubtitle: { marginTop: 8, marginBottom: 26, fontSize: 15, color: theme.muted },

  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -5 },
  cell: { width: `${100 / GALLERY_COLUMNS}%`, paddingHorizontal: 5, marginBottom: 18 },
  cellPressed: { opacity: 0.6 },
  thumb: {
    width: '100%',
    borderRadius: 8,
    backgroundColor: theme.rule,
  },
  thumbFallback: {
    borderWidth: 1,
    borderColor: theme.rule,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbScore: { fontSize: 18, fontWeight: '600', color: theme.accent },
  cellDay: { marginTop: 6, fontSize: 11, color: theme.muted, textAlign: 'center' },
});
