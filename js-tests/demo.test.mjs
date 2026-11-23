// The browser demo's logic, headless: the story on any date (30 days in a row, across New Year, at night, in the
// morning and late evening), in order and out of order, the nudge once, the cap and the isbot, the certificate and
// its check, forged bot buttons, and the API stand-ins with the server's error codes.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { makeT } from '../shared/i18n.js';
import { apiFor } from '../demo/api.js';
import { BotSim } from '../demo/bot.js';
import { makeViews } from '../demo/bot-views.js';
import { createDemo, LEADER, MADINA, SARDOR } from '../demo/seed.js';
import { runStep, STEPS } from '../demo/story.js';

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const data = { people: read('../shared/data/people.json'), catalog: read('../shared/data/catalog.json') };
const t = makeT({ uz: read('../shared/locales/uz.json'), ru: read('../shared/locales/ru.json') });
const HOUR = 3_600_000;
const at = (iso, hh, mm = 0) => Date.parse(`${iso}T00:00:00Z`) + (hh - 5) * HOUR + mm * 60_000; // Tashkent time

function world(startMs, lang = 'uz') {
  const backend = createDemo({ data, now: () => startMs, lang });
  const views = makeViews(t);
  const alerts = [];
  const bots = {};
  for (const uid of [MADINA, SARDOR, LEADER]) bots[uid] = new BotSim(backend, uid, t, views, { onAlert: (x) => alerts.push(x) });
  backend.on((ev) => { if (ev.type === 'note') bots[ev.note.to]?.deliver(ev.note); });
  for (const b of Object.values(bots)) b.start();
  return { backend, bots, alerts };
}
const all = (bot) => bot.messages.map((m) => m.html).join('\n');

test('the whole story works on 30 consecutive days, across New Year, at night, in the morning and late evening', async () => {
  for (let d = 0; d < 30; d++) {
    const day = new Date(Date.parse('2026-12-10T00:00:00Z') + d * 86_400_000).toISOString().slice(0, 10);
    for (const hour of [0, 9, 23]) {
      const w = world(at(day, hour, 30));
      const b = w.backend;
      const seen = {};
      for (let n = 1; n <= STEPS.length; n++) {
        await runStep(n, w);
        if (n === 2) seen.lit = b.streakOf(MADINA).streak;
        if (n === 3) seen.week = [b.streakOf(MADINA).streak, b.streakOf(MADINA).freezes];
        if (n === 4) seen.saved = [b.streakOf(MADINA).streak, b.streakOf(MADINA).saved, b.streakOf(MADINA).freezes];
        if (n === 7) seen.capped = b.logs.find((l) => l.id === w.big);
      }
      const label = `${day} ${hour}`;
      assert.equal(seen.lit, 1, label);
      assert.deepEqual(seen.week, [7, 1], label);
      assert.deepEqual(seen.saved, [7, 1, 0], label);
      assert.deepEqual([seen.capped.pages, seen.capped.asked], [300, 900], label);
      assert.equal(b.logs.find((l) => l.id === w.big).status, 'ok', 'accepted after the isbot');
      const madina = all(w.bots[MADINA]);
      assert.match(madina, /Bugungi maqsad: yana <b>10 bet<\/b>|Olovingiz o'chmasin: bugun yana <b>10 bet<\/b>/, `${label}: the nudge`);
      assert.equal((madina.match(/Olovingiz o'chmasin/g) ?? []).length, 1, `${label}: one nudge`);
      assert.match(madina, /Sizga sertifikat berildi: «30 kunda 1000 bet»/);
      assert.match(all(w.bots[LEADER]), /<b>Sardor Aliyev<\/b> .* uchun 300 bet yozdi \(900 deb yozgan\)/);
      assert.match(all(w.bots[SARDOR]), /Ustoz isbot so'radi/);
      assert.match(all(w.bots[LEADER]), /Sardor Aliyev<\/b> isbot yozdi/);
      assert.match(all(w.bots[SARDOR]), /300 betni qabul qildi/);
      assert.ok(w.verified && w.refused === 'cert_unknown', label);
      const otkan = b.books.find((x) => x.user_id === MADINA && x.catalog === 'otkan_kunlar');
      assert.ok(otkan.finished_day !== null && otkan.review.startsWith('Juda'));
      const c = b.certs(MADINA)[0];
      assert.ok(c.pages >= 1000 && c.title === '30 kunda 1000 bet' && c.club === 'Ziyo kitobxonlari', label);
      const board = b.clubView(LEADER, 1).board;
      assert.equal(board.find((r) => r.id === MADINA).pages, c.pages, 'the certificate and the leaderboard count the same pages');
      assert.ok(b.clubView(LEADER, 1).marathon.closed);
    }
  }
});

test('steps clicked out of order quietly do what they need, and twice changes nothing', async () => {
  const w = world(at('2026-11-23', 14));
  await runStep(11, w);
  assert.deepEqual([...w.done].sort((a, c) => a - c), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  const before = JSON.stringify([w.backend.logs.length, w.backend.certRows.length, w.backend.marathons.length]);
  for (const n of [11, 4, 8, 5, 10, 2]) await runStep(n, w);
  assert.equal(JSON.stringify([w.backend.logs.length, w.backend.certRows.length, w.backend.marathons.length]), before);
  assert.equal(w.bots[MADINA].messages.filter((m) => m.html.includes("Olovingiz o'chmasin")).length, 1, 'one nudge');
});

test('the bot: one-tap logs, yesterday, typed numbers, isbot, and forged or stale buttons', async () => {
  const w = world(at('2026-11-23', 18));
  const { backend: b, bots, alerts } = w;
  await runStep(1, w);
  const bot = bots[MADINA];
  bot.press(bot.messages.at(-1).id, 'r');
  assert.match(bot.messages.at(-1).html, /Bugun necha bet o'qidingiz\?/);
  bot.press(bot.messages.at(-1).id, `la:${b.home(MADINA).current}:20:t`);
  assert.match(bot.messages.at(-1).html, /✅ \+20 bet: «O'tkan kunlar»\n🔥 Olov yondi!/);
  assert.match(bot.messages.at(-1).html, /taxminan .*dekabrda tugatasiz|taxminan .*da tugatasiz/);
  bot.press(bot.messages.at(-1).id, `lo:${b.home(MADINA).current}:y`);
  bot.type("o'n besh");
  bot.type('15');
  assert.match(bot.messages.at(-1).html, /Kecha uchun \+15 bet/);
  assert.deepEqual(alerts.splice(0), ['Betlar sonini raqam bilan yozing (1 dan 5000 gacha).']);
  for (const data of ['la:1:20:t', 'fy:1', 'k:1', 'c:1', 'la:6:11:t', 'pw:999', 'x:1']) bot.press(1, data);
  assert.deepEqual(alerts, ['Topilmadi yoki sizga tegishli emas.', 'Topilmadi yoki sizga tegishli emas.', 'Topilmadi yoki sizga tegishli emas.',
    'Topilmadi yoki sizga tegishli emas.', 'Bu tugma eskirgan. Menyudan qayta oching.', 'Topilmadi yoki sizga tegishli emas.',
    'Bu tugma eskirgan. Menyudan qayta oching.']);
});

test('the API stand-ins answer like the server: shapes, error codes, and nobody else\'s data', async () => {
  const w = world(at('2026-11-23', 10));
  const madina = apiFor(w.backend, MADINA);
  const sardor = apiFor(w.backend, SARDOR);
  const card = await madina.addBook({ catalog: 'otkan_kunlar' });
  await assert.rejects(sardor.book(card.id), { code: 'not_found' });
  await assert.rejects(sardor.log(card.id, { add: 5 }), { code: 'not_found' });
  await assert.rejects(madina.log(card.id, { add: 5, day: 'last week' }), { code: 'day' });
  await assert.rejects(madina.club(1), { code: 'not_found' });
  await assert.rejects(madina.marathon(1, { title: 'Men', days: 7, goal: 100 }), { code: 'not_found' });
  await assert.rejects(madina.verify('AAAA-AAAA-AAAA-AAAA'), { code: 'cert_unknown' });
  const out = await madina.log(card.id, { add: 25 });
  assert.deepEqual([out.streak.streak, out.lit, out.book.page], [1, true, 25]);
  const home = await madina.home();
  assert.deepEqual(Object.keys(home).sort(), ['asks', 'books', 'certs', 'clubs', 'current', 'done', 'flame', 'me', 'streak']);
  const stats = await madina.stats();
  assert.equal(stats.heatmap.at(-1).pages, 25);
  const ru = world(at('2026-11-23', 10), 'ru');
  await runStep(4, ru);
  assert.match(ru.bots[MADINA].messages.map((m) => m.html).join('\n'), /Не дайте огню погаснуть|Цель на сегодня/);
});
