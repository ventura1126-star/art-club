/**
 * Checks the promises the pick logic makes: stable all day, changes at midnight,
 * and no repeat until the whole pool has been shown.
 *
 * Run:  node curator/src/pick.test.mjs
 */
import assert from 'node:assert/strict';
import { dayNumber, pickForToday, recentPicks, shuffledOrder } from './pick.js';

const items = Array.from({ length: 40 }, (_, i) => ({ id: String(i) }));
let passed = 0;

function test(name, fn) {
  fn();
  passed += 1;
  console.log('  ok  ' + name);
}

test('empty or invalid pool yields null', () => {
  assert.equal(pickForToday([], new Date()), null);
  assert.equal(pickForToday(undefined, new Date()), null);
});

test('same pick at every hour of one day', () => {
  const hours = [0, 6, 12, 18, 23].map(
    (h) => pickForToday(items, new Date(2026, 7, 7, h, 30)).id
  );
  assert.equal(new Set(hours).size, 1, 'tip must not change during the day');
});

test('pick changes at midnight', () => {
  const a = pickForToday(items, new Date(2026, 7, 7, 23, 59)).id;
  const b = pickForToday(items, new Date(2026, 7, 8, 0, 1)).id;
  assert.notEqual(a, b);
});

test('no repeat across a full cycle', () => {
  const seen = new Set();
  for (let d = 0; d < items.length; d += 1) {
    seen.add(pickForToday(items, new Date(2026, 7, 7 + d)).id);
  }
  assert.equal(seen.size, items.length, 'every album should appear exactly once');
});

test('shuffle is a true permutation and is stable', () => {
  const a = shuffledOrder(40);
  const b = shuffledOrder(40);
  assert.deepEqual(a, b, 'same seed must give the same order');
  assert.deepEqual([...a].sort((x, y) => x - y), [...Array(40).keys()]);
});

test('shuffle actually reorders', () => {
  const order = shuffledOrder(40);
  assert.notDeepEqual(order, [...Array(40).keys()]);
});

test('dayNumber is local-calendar based', () => {
  assert.equal(
    dayNumber(new Date(2026, 7, 7, 0, 0)),
    dayNumber(new Date(2026, 7, 7, 23, 59))
  );
  assert.equal(
    dayNumber(new Date(2026, 7, 8)) - dayNumber(new Date(2026, 7, 7)),
    1
  );
});

test('handles a single-item pool', () => {
  const one = [{ id: 'only' }];
  assert.equal(pickForToday(one, new Date(2026, 7, 7)).id, 'only');
  assert.equal(pickForToday(one, new Date(2026, 7, 8)).id, 'only');
});

test('recent picks are the previous days, newest first, excluding today', () => {
  const today = new Date(2026, 7, 13);
  const recent = recentPicks(items, today, undefined, 7);
  assert.equal(recent.length, 7);
  assert.equal(recent[0].date.getDate(), 12, 'first entry should be yesterday');
  assert.equal(recent[6].date.getDate(), 6, 'last entry should be 7 days back');
  const todayPick = pickForToday(items, today).id;
  assert.ok(
    !recent.slice(0, 1).some((r) => r.item.id === todayPick),
    "yesterday's pick must differ from today's"
  );
});

test('recent picks match what those days actually showed', () => {
  const today = new Date(2026, 7, 13);
  for (const { date, item } of recentPicks(items, today)) {
    assert.equal(item.id, pickForToday(items, date).id);
  }
});

test('a 7-day look-back never repeats while the pool is big enough', () => {
  const recent = recentPicks(items, new Date(2026, 7, 13));
  assert.equal(new Set(recent.map((r) => r.item.id)).size, 7);
});

test('recent picks handle an empty pool and a short pool', () => {
  assert.deepEqual(recentPicks([], new Date()), []);
  assert.equal(recentPicks([{ id: 'only' }], new Date()).length, 7);
});

test('look-back crosses a month boundary correctly', () => {
  // From 3 Aug: index 0 is 2 Aug, index 1 is 1 Aug, index 2 rolls into July.
  const recent = recentPicks(items, new Date(2026, 7, 3), undefined, 7);
  assert.equal(recent[0].date.getMonth(), 7, 'Aug 2');
  assert.equal(recent[2].date.getMonth(), 6, 'should roll back into July');
  assert.equal(recent[2].date.getDate(), 31);
});

console.log(`\n${passed} passed`);
