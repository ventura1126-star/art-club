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

const LOOK_BACK_DAYS = 7;

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
        ) : route.past ? (
          <PastWeek
            kind={route.kind}
            onBack={() => setRoute({ kind: route.kind })}
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
      // No poster. Film posters are copyrighted, so the free sources hold
      // red-carpet and awards photography instead -- only 3 of 66 films had
      // anything poster-like. The critics' score stands in as the visual: it is
      // the one thing this category has that music and books do not.
      score: item.score,
      aspect: 3 / 2,
      title: item.title,
      subtitle: item.director || '',
      facts: [
        item.released ? item.released.slice(0, 4) : null,
        item.genres?.length ? item.genres.join(' \u00b7 ') : null,
        item.runtime ? `${item.runtime} min` : null,
      ],
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

function Tip({ kind, onBack, onOpenPast }) {
  // Recomputed only when the calendar day changes, so the pick is stable all day.
  const today = new Date().toDateString();
  const tip = useMemo(() => {
    const { items, seed } = sourceFor(kind);
    return toTip(kind, pickForToday(items, new Date(), seed));
  }, [kind, today]);

  return (
    <ScrollView
      style={styles.tipScroll}
      contentContainerStyle={styles.tip}
      showsVerticalScrollIndicator={false}
    >
      <BackLink label="← Art Club" onPress={onBack} />

      {tip ? <Card tip={tip} footnote="Back tomorrow for the next one." /> : <Empty />}

      {tip && (
        <Pressable
          onPress={onOpenPast}
          accessibilityRole="button"
          accessibilityLabel="See the past week"
          hitSlop={12}
          style={({ pressed }) => [styles.pastLink, pressed && styles.pastLinkPressed]}
        >
          <Text style={styles.pastLinkText}>The past week</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

function PastWeek({ kind, onBack }) {
  const today = new Date().toDateString();
  const entries = useMemo(() => {
    const { items, seed } = sourceFor(kind);
    return recentPicks(items, new Date(), seed, LOOK_BACK_DAYS)
      .map(({ date, item }) => ({
        key: date.toDateString(),
        tip: toTip(kind, item, dayLabel(date)),
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
        entries.map((entry, i) => (
          <View key={entry.key}>
            {i > 0 && <View style={styles.entryGap} />}
            <Card tip={entry.tip} />
          </View>
        ))
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

/** "Yesterday", then weekday names — unambiguous inside a seven-day window. */
function dayLabel(date) {
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const daysBack = Math.round(
    (startOfDay(new Date()) - startOfDay(date)) / 86400000
  );
  if (daysBack === 1) return 'Yesterday';
  return date.toLocaleDateString('en-GB', { weekday: 'long' });
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

  entryGap: {
    height: 1,
    backgroundColor: theme.rule,
    marginTop: 40,
    marginBottom: 40,
  },
});
