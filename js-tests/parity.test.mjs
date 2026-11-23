// The JS port of the core must give exactly what the Python core gives (shared/test_vectors.json).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import * as books from '../shared/books.js';
import * as cert from '../shared/cert.js';
import * as clock from '../shared/clock.js';
import * as fair from '../shared/fair.js';
import * as i18n from '../shared/i18n.js';
import * as marathon from '../shared/marathon.js';
import * as nudge from '../shared/nudge.js';
import * as seedgen from '../shared/seedgen.js';
import * as stats from '../shared/stats.js';
import * as streak from '../shared/streak.js';
import * as text from '../shared/text.js';

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const V = read('../shared/test_vectors.json');
const people = read('../shared/data/people.json');
const catalog = read('../shared/data/catalog.json');
const TODAY = V.today;
const t = i18n.makeT({ uz: read('../shared/locales/uz.json'), ru: read('../shared/locales/ru.json') });
const plain = (x) => JSON.parse(JSON.stringify(x));

function res(fn) {
  try {
    return { ok: fn() ?? null };
  } catch (e) {
    if (e instanceof text.InputError) return { error: e.code };
    throw e;
  }
}

test('Tashkent calendar and minutes, text cleaning, short texts, FNV-1a, number grouping', () => {
  for (const v of V.civil) {
    assert.deepEqual(clock.civil(v.day), v.out, String(v.day));
    assert.equal(clock.daysFromCivil(...v.out), v.back);
  }
  for (const v of V.minute) {
    assert.deepEqual([clock.localDay(v.ms), clock.localMinute(v.ms), clock.weekday(clock.localDay(v.ms))], [v.day, v.min, v.wd], String(v.ms));
  }
  for (const v of V.clean) assert.equal(text.clean(v.in, v.n), v.out, String(v.in));
  for (const v of V.whole) assert.deepEqual(res(() => text.whole(v.in, 1, 5, 'n')), v.out, JSON.stringify(v.in));
  for (const v of V.words) assert.deepEqual(res(() => text.words(v.in, 2, 12, 'w')), v.out, JSON.stringify(v.in));
  for (const v of V.sentences) assert.deepEqual(res(() => text.sentences(v.in, 3, 200, 2, 'proof')), v.out, v.in);
  for (const v of V.h32) assert.equal(text.h32(v.in), v.out, v.in);
  assert.deepEqual([0, 7, 999, 1000, 1280, 1234567, -4500].map(i18n.group), V.group);
});

test('books: catalog and typed books, progress, the pace forecast, pages from "+20" or "hozir qaysi betdasiz?"', () => {
  for (const v of V.book) assert.deepEqual(res(() => books.validate(v.in, catalog)), v.out, JSON.stringify(v.in));
  for (const v of V.progress) assert.deepEqual(books.progress(...v.in), v.out);
  for (const v of V.pace) assert.deepEqual(books.pace(v.in[0], v.in[1], v.in[2], TODAY), v.out, JSON.stringify(v.in));
  for (const v of V.asked) assert.deepEqual(res(() => books.askedPages(v.in[0], v.in[1], 384)), v.out, JSON.stringify(v.in));
});

test('the olov: streaks, freezes earned and spent, lost flames, goal changes, New Year; the flame size', () => {
  for (const v of V.streak) assert.deepEqual(streak.compute(...v.in), v.out, JSON.stringify(v.in));
  assert.deepEqual([-5, 0, 99, 100, 150, 200, 999].map((d) => streak.goalOn([[0, 10], [100, 20], [200, 5]], d)), V.goal_on);
  assert.deepEqual([0, 1, 2, 3, 6, 7, 13, 14, 29, 30, 400].map(streak.flame), V.flame);
});

test('fair play: today or yesterday, the usual day, the daily cap, jumps; marathons and the leaderboard', () => {
  assert.deepEqual([undefined, 'today', 'yesterday', 'tomorrow', 5].map((w) => res(() => fair.dayFor(w, TODAY))), V.day_for);
  for (const v of V.usual) assert.equal(fair.usual(...v.in), v.out, JSON.stringify(v.in));
  for (const v of V.check) assert.deepEqual(res(() => fair.check(...v.in)), v.out, JSON.stringify(v.in));
  for (const v of V.marathon) assert.deepEqual(res(() => marathon.validate(v.in, TODAY)), v.out, JSON.stringify(v.in));
  const m = { start: TODAY - 10, end: TODAY + 19, goal: 1000 };
  for (const v of V.mstate) {
    assert.deepEqual([marathon.state(m, v.day), marathon.elapsed(m, v.day), marathon.expected(m, v.day)], [v.state, v.elapsed, v.expected]);
  }
  const rows = V.board[0].out.map(({ id, name, pages, streak: s, books: b, flags }) => ({ id, name, pages, streak: s, books: b, flags }));
  for (const v of V.board) assert.deepEqual(marathon.board(plain(rows), m, v.day), v.out, String(v.day));
});

test('certificate codes: signed, pretty, typed in any case and with dashes; edited and malformed codes fail', () => {
  const C = V.cert;
  const secret = cert.secretFrom('test-only-seed');
  assert.equal(cert.hex(secret), C.secret);
  const fromHex = (h) => new Uint8Array(h.match(/../g).map((x) => parseInt(x, 16)));
  assert.deepEqual(C.nonces.map((n) => cert.make(secret, fromHex(n))), C.codes);
  assert.deepEqual(C.codes.map(cert.pretty), C.pretty);
  for (const v of C.check) assert.deepEqual([cert.norm(v.in), cert.nonceOf(secret, v.in)], [v.norm, v.nonce], String(v.in));
  assert.deepEqual([0, 1, 2 ** 40 - 1, 123_456_789_012].map((n) => cert.codeFrom(n)), C.club);
});

test('numbers: weekly pages, the heatmap, favourite authors, totals; the nudge time and when it is due', () => {
  const S = V.stats;
  const st = streak.compute(S.in[0], S.in[1], TODAY);
  assert.deepEqual(stats.weekly(S.in[0], TODAY), S.weekly);
  assert.deepEqual(stats.heatmap(S.in[0], S.in[1], st.used, TODAY), S.heatmap);
  const names = ["Cho'lpon", 'Abdulla Qodiriy', "Cho'lpon", 'Lev Tolstoy', 'Abdulla Qodiriy', 'Ayn', "Cho'lpon"];
  assert.deepEqual(stats.authors(names.map((a) => ({ author: a }))), S.authors);
  assert.deepEqual(stats.summary(S.in[0], 3), S.summary);
  assert.deepEqual([undefined, 'off', 1200, '1230', 1215, 470, 1320, 1290].map((x) => res(() => nudge.valid(x))), V.nudge_valid);
  const due = [[1200, 1200, false], [1199, 1200, false], [1250, 1200, true], [1330, 1200, false], [1300, null, false], [479, 480, false]];
  assert.deepEqual(due.map((a) => nudge.due(...a)), V.nudge_due);
});

test('the same sentences in Uzbek and Russian: pace, today, the olov, freezes, dates, marathon days', () => {
  const card = { title: "O'tkan kunlar", pace: books.pace([[TODAY, 25]], TODAY, 359, TODAY) };
  const nye = clock.daysFromCivil(2027, 1, 2);
  for (const v of V.sentences_i18n) {
    const L = v.lang;
    assert.equal(i18n.paceLine(t, L, card, TODAY), v.pace);
    assert.equal(i18n.paceLine(t, L, { ...card, pace: { rate: 5000, days: 1, day: TODAY + 1 } }, TODAY), v.pace1);
    assert.equal(i18n.paceLine(t, L, { ...card, pace: { rate: 0, days: null, day: null } }, TODAY), v.pace0);
    assert.deepEqual(V.streak.map((c) => i18n.todayLine(t, L, c.out)), v.today);
    assert.deepEqual(V.streak.map((c) => i18n.streakLine(t, L, c.out)), v.streak);
    assert.deepEqual(V.streak.map((c) => i18n.savedLine(t, L, c.out)), v.saved);
    assert.deepEqual(V.streak.map((c) => i18n.freezeLine(t, L, c.out)), v.freeze);
    assert.deepEqual([TODAY, nye, TODAY + 24].map((d) => i18n.dateShort(t, L, d)), v.date);
    assert.equal(i18n.pages(t, L, 1280), v.pages);
    assert.deepEqual(['soon', 'live', 'over'].map((s) => i18n.marState(t, L, { state: s, in: 2, elapsed: 4, days: 30 })), v.mar);
    assert.deepEqual([null, 22].map((u) => i18n.usualText(t, L, u)), v.usual);
    assert.equal(i18n.progressBar(47), v.bar);
  }
});

test('the seeded world is the same in both languages of code', () => {
  assert.deepEqual(seedgen.world(people, catalog, TODAY), V.world);
  assert.deepEqual(seedgen.world(people, catalog, clock.daysFromCivil(2027, 1, 2), false), V.world_demo);
});
