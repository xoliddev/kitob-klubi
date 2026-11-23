// The guided story. Each step does what a person would do, through the three phones' Mini Apps and bots. Steps run
// in order (with pauses), all at once ("Hammasini ko'rsatish"), or clicked out of order: a step first quietly does
// whatever it needs from earlier steps. Days the story skips are lived day by day through the same rules (each
// reader logs in the evening). js-tests/demo.test.mjs runs the same steps headless.
import { atLocal, localDay } from '../shared/clock.js';
import { h32 } from '../shared/text.js';
import { LEADER, MADINA, OTKAN, PROOF, REVIEW, SARDOR } from './seed.js';

export const STEPS = ['step1', 'step2', 'step3', 'step4', 'step5', 'step6', 'step7', 'step8', 'step9', 'step10', 'step11'];
const WEEK = [30, 42, 35, 28, 40, 33];
const NEXT = ['kecha_va_kunduz', 'shum_bola', 'sariq_devni_minib', 'dunyoning_ishlari', 'alkimyogar'];
const PACE = { 101: 34, 102: 22, 103: 30, 104: 36, 105: 12, 106: 18 };
const CLUB = [103, 104, 105, 106]; // the club's other readers

const book = (env) => env.backend.books.find((b) => b.user_id === MADINA && b.catalog === OTKAN) ?? null;
const marathon = (env) => env.backend.marathons[0] ?? null;

/** Move the demo clock to `days` after Madina's first day, at `minute` Tashkent time (never backwards). */
function jumpTo(env, days, minute) {
  const b = env.backend;
  const target = atLocal(env.day0 + days, minute);
  if (target > b.nowMs()) b.advance(target - b.nowMs());
}

/** One reader's evening: log about their usual pages on the book they are reading (a new one when the last is done). */
function readEvening(b, uid, day) {
  const base = PACE[uid];
  let left = base - Math.floor(base / 5) + (h32(`${uid}:${day}`) % (Math.floor(base / 2.5) + 1));
  for (let i = 0; i < 2 && left > 0; i++) { // a book that ends tonight: the rest of the evening goes to the next one
    let cur = b.home(uid).books[0];
    if (!cur) {
      const have = new Set(b.books.filter((x) => x.user_id === uid).map((x) => x.catalog));
      cur = b.addBook(uid, { catalog: [...NEXT, ...b.catalog.map((x) => x.id)].find((id) => !have.has(id)) });
    }
    try {
      left -= b.log(uid, cur.id, { add: left })[0].log.pages;
    } catch {
      return; // the daily cap: nothing more tonight
    }
  }
}

/** Live the days `from`..`to` (offsets from day 0), every member reading at 20:00. */
function liveDays(env, from, to, readers) {
  for (let k = from; k <= to; k++) {
    jumpTo(env, k, 20 * 60);
    for (const uid of readers) readEvening(env.backend, uid, env.day0 + k);
    env.backend.tick();
  }
}

const ACTIONS = {
  // 1. Madina adds "O'tkan kunlar" from the catalog.
  async 1(env) {
    const { backend: b, ui, focus, pause } = env;
    if (book(env)) return;
    env.day0 = localDay(b.nowMs());
    focus(MADINA, 'app');
    if (ui) await ui.addBook(OTKAN);
    else b.addBook(MADINA, { catalog: OTKAN });
    await pause(800);
  },
  // 2. She reads 25 pages: the flame lights — 1 day.
  async 2(env) {
    const { backend: b, ui, focus, pause } = env;
    if (b.logs.some((l) => l.book_id === book(env).id)) return;
    focus(MADINA, 'app');
    if (ui) await ui.quickLog(MADINA, 25);
    else b.log(MADINA, book(env).id, { add: 25 });
    await pause(1600);
  },
  // 3. A week goes by, a little every evening: 7 days, the flame is bigger and the first freeze is earned.
  async 3(env) {
    const { backend: b, ui, focus, pause } = env;
    if (b.streakOf(MADINA).streak < 7) {
      for (let k = 1; k <= WEEK.length; k++) {
        jumpTo(env, k, 20 * 60 + 15);
        b.log(MADINA, book(env).id, { add: WEEK[k - 1] });
        for (const uid of [SARDOR, ...CLUB]) readEvening(b, uid, env.day0 + k);
        await pause(160);
      }
    }
    focus(MADINA, 'app');
    await ui?.home(MADINA);
    await pause(1800);
  },
  // 4. A busy day: the evening nudge arrives, she does not read; next morning the freeze has saved the flame.
  async 4(env) {
    const { backend: b, ui, focus, pause } = env;
    if (!env.missed) {
      jumpTo(env, 7, 19 * 60);
      for (const uid of [SARDOR, ...CLUB]) readEvening(b, uid, env.day0 + 7);
      jumpTo(env, 7, 20 * 60 + 1);
      b.tick();
      env.missed = true;
      focus(MADINA, 'chat');
      await pause(2200);
      jumpTo(env, 8, 9 * 60);
    }
    focus(MADINA, 'app');
    await ui?.home(MADINA);
    await pause(1800);
  },
  // 5. Nilufar ustoz starts "30 kunda 1000 bet"; Madina and Sardor join with the club code.
  async 5(env) {
    const { backend: b, ui, focus, pause } = env;
    if (!marathon(env)) {
      jumpTo(env, 8, 10 * 60);
      focus(LEADER, 'app');
      if (ui) await ui.startMarathon();
      else b.createMarathon(LEADER, 1, { title: '30 kunda 1000 bet', days: 30, goal: 1000 });
      for (const uid of CLUB) readEvening(b, uid, env.day0 + 8); // the others read this morning
      await pause(900);
    }
    const code = b.clubs[0].code;
    for (const uid of [MADINA, SARDOR]) {
      if (b.isMember(1, uid)) continue;
      focus(uid, 'app');
      if (ui) await ui.join(uid, code);
      else b.join(uid, code);
      await pause(700);
    }
  },
  // 6. The leaderboard is live: Madina reads 40, Sardor 35 — the ustoz sees the places change.
  async 6(env) {
    const { backend: b, ui, focus, pause } = env;
    focus(LEADER, 'app');
    await ui?.club(LEADER);
    for (const [uid, n] of [[MADINA, 40], [SARDOR, 35]]) {
      if (b.logs.some((l) => l.user_id === uid && l.day === env.day0 + 8)) continue;
      jumpTo(env, 8, uid === MADINA ? 18 * 60 : 19 * 60);
      focus(uid, 'app');
      if (ui) await ui.quickLog(uid, n);
      else b.log(uid, b.home(uid).current, { add: n });
      await pause(1100);
    }
    focus(LEADER, 'app');
    await pause(1200);
  },
  // 7. Next day Sardor writes 900 pages at once: only 300 count (the daily cap), and the ustoz gets a flag.
  async 7(env) {
    const { backend: b, ui, focus, pause } = env;
    if (!env.big) {
      jumpTo(env, 9, 18 * 60);
      for (const uid of CLUB) readEvening(b, uid, env.day0 + 9);
      focus(SARDOR, 'app');
      if (ui) await ui.quickLog(SARDOR, 900);
      else b.log(SARDOR, b.home(SARDOR).current, { add: 900 });
      env.big = b.logs.filter((l) => l.user_id === SARDOR).at(-1).id;
      await pause(1600);
    }
    focus(LEADER, 'chat');
    await pause(1600);
  },
  // 8. The ustoz asks for an isbot; Sardor writes two sentences; the ustoz accepts the 300 pages.
  async 8(env) {
    const { backend: b, ui, focus, pause } = env;
    const log = b.logs.find((l) => l.id === env.big);
    if (log.status === 'flagged') {
      focus(LEADER, 'app');
      if (ui) await ui.judge('ask', log.id);
      else b.askProof(LEADER, log.id);
      await pause(900);
    }
    if (log.status === 'asked') {
      focus(SARDOR, 'app');
      if (ui) await ui.writeProof(log.id, PROOF);
      else b.writeProof(SARDOR, log.id, PROOF);
      await pause(900);
    }
    if (log.status === 'proof') {
      focus(LEADER, 'app');
      if (ui) await ui.judge('yes', log.id);
      else b.decide(LEADER, log.id, true);
      await pause(1400);
    }
  },
  // 9. Madina reaches the last page of "O'tkan kunlar" and writes her fikr; the forecast and her numbers update.
  async 9(env) {
    const { backend: b, ui, focus, pause } = env;
    const bk = book(env);
    if (bk.finished_day === null) {
      jumpTo(env, 9, 20 * 60);
      focus(MADINA, 'app');
      if (ui) await ui.finishBook(bk.id, bk.pages, REVIEW);
      else {
        b.log(MADINA, bk.id, { page: bk.pages });
        b.review(MADINA, bk.id, REVIEW);
      }
      await pause(1000);
    }
    await ui?.stats(MADINA);
    await pause(1600);
  },
  // 10. The marathon days go by, everyone reads in the evenings; on the 31st morning Madina gets her certificate.
  async 10(env) {
    const { backend: b, ui, focus, pause } = env;
    if (!b.certRows.some((c) => c.user_id === MADINA)) {
      const m = marathon(env);
      liveDays(env, Math.max(10, b.today() - env.day0 + 1), m.end_day - env.day0, [MADINA, SARDOR, ...CLUB]);
      jumpTo(env, m.end_day - env.day0 + 1, 9 * 60);
      b.tick();
      focus(MADINA, 'chat');
      await pause(1800);
    }
    focus(MADINA, 'app');
    await ui?.certificate(MADINA);
    await pause(2000);
  },
  // 11. Sardor checks a copy with one letter changed: ❌ no such certificate. Then the real code: ✅ (the story ends on it).
  async 11(env) {
    const { backend: b, ui, focus, pause } = env;
    const c = b.certs(MADINA)[0];
    env.code = c.code;
    const raw = c.code.replace(/-/g, '');
    const swap = raw[9] === 'A' ? 'B' : 'A';
    env.forged = `${raw.slice(0, 9)}${swap}${raw.slice(10)}`.match(/.{4}/g).join('-');
    focus(SARDOR, 'app');
    if (ui) {
      await ui.verify(env.forged);
      await pause(1800);
      await ui.verify(c.code);
    } else {
      env.verified = b.verify(c.code).ok;
      try { b.verify(env.forged); } catch (e) { env.refused = e.code; }
    }
    await pause(1600);
  },
};

export async function runStep(n, env, quick = false, done = env.done ?? (env.done = new Set())) {
  for (let k = 1; k < n; k++) if (!done.has(k)) await runStep(k, env, true, done);
  const wait = quick ? async () => {} : env.wait ?? (async () => {});
  const ctx = new Proxy(env, { get: (target, key) => {
    if (key === 'ui') return quick ? null : target.ui;
    if (key === 'focus') return quick ? () => {} : target.focus ?? (() => {});
    if (key === 'pause') return (ms = 650) => wait(ms);
    return target[key];
  }, set: (target, key, value) => { target[key] = value; return true; } });
  await ACTIONS[n](ctx);
  done.add(n);
}
