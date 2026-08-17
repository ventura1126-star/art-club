/**
 * Picking today's tip.
 *
 * Rules from the spec: one tip per day, the same tip all day, and no repeats
 * until the pool has been worked through. There is no "give me another".
 *
 * This is done arithmetically rather than with stored state -- the calendar day
 * itself is the seed, so the app needs no storage and no network, and it always
 * agrees with itself.
 */

const SHUFFLE_SEED = 0x5eed1e;

/** Small deterministic PRNG (mulberry32). Same seed, same sequence, always. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Whole days since the epoch for a *local* calendar date.
 *
 * Built from the local Y/M/D rather than the raw timestamp, so the tip flips at
 * the user's own midnight and never twice in a day because of a timezone shift.
 */
export function dayNumber(date) {
  return Math.floor(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000
  );
}

/** A fixed shuffle of 0..n-1, so consecutive days give unrelated picks. */
export function shuffledOrder(n, seed = SHUFFLE_SEED) {
  const order = Array.from({ length: n }, (_, i) => i);
  const rand = mulberry32(seed);
  for (let i = n - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

/** Today's single pick, or null if the pool is empty. */
export function pickForToday(items, date = new Date(), seed = SHUFFLE_SEED) {
  if (!Array.isArray(items) || items.length === 0) return null;
  const order = shuffledOrder(items.length, seed);
  // Modulo keeps it in range; the shuffle means one full cycle covers the whole
  // pool before anything repeats.
  const slot = ((dayNumber(date) % order.length) + order.length) % order.length;
  return items[order[slot]];
}

/**
 * The picks from the `days` days before `date`, most recent first.
 *
 * Nothing is stored to make this work: because a pick is a pure function of its
 * calendar day, looking back is just asking the same question about an earlier
 * date. Yesterday's tip is recomputed, not remembered.
 */
export function recentPicks(items, date = new Date(), seed = SHUFFLE_SEED, days = 7) {
  if (!Array.isArray(items) || items.length === 0) return [];
  const out = [];
  for (let back = 1; back <= days; back += 1) {
    const day = new Date(date.getFullYear(), date.getMonth(), date.getDate() - back);
    out.push({ date: day, item: pickForToday(items, day, seed) });
  }
  return out;
}
