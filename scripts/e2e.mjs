// Browser test of the demo at 1440 px and 375 px. Fails on any console error, page error or failed request.
//   PW_CHANNEL=chrome node scripts/e2e.mjs        (needs `playwright`: npm i --no-save playwright)
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { startServer } from './serve.mjs';

const PORT = Number(process.env.E2E_PORT ?? 4372);
const BASE = process.env.E2E_URL ?? `http://127.0.0.1:${PORT}/`;
const server = process.env.E2E_URL ? null : await startServer(PORT);
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || undefined });
const errors = [];
let checks = 0;
const ok = (cond, msg) => {
  assert.ok(cond, msg);
  checks += 1;
};

async function open(width, height, { lang = 'uz', path = '', ready = true } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, locale: 'uz-UZ', timezoneId: 'Asia/Tashkent', acceptDownloads: true });
  await ctx.route('https://telegram.org/**', (route) => route.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
  await ctx.addInitScript((l) => { try { localStorage.setItem('kitobklubi.lang', l); } catch { /* */ } }, lang);
  const page = await ctx.newPage();
  page.on('console', (m) => m.type() === 'error' && errors.push(`[${width}] ${m.text()}`));
  page.on('pageerror', (e) => errors.push(`[${width}] ${e.message}`));
  page.on('requestfailed', (r) => errors.push(`[${width}] request failed ${r.url()} ${r.failure()?.errorText}`));
  await page.goto(BASE + path);
  if (ready) await page.waitForSelector('body[data-ready="1"]', { timeout: 60_000 });
  return page;
}

const text = (page, sel) => page.evaluate((s) => document.querySelector(s)?.textContent ?? '', sel);
const has = (page, sel, s) => page.waitForFunction(([q, v]) => document.querySelector(q)?.textContent.includes(v), [sel, s], { timeout: 30_000 });
const noScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const done = (page, n) => page.waitForFunction((k) => document.querySelector(`[data-testid=story-${k}]`).classList.contains('done'), n, { timeout: 120_000 });
async function step(page, n) {
  await page.getByTestId(`story-${n}`).click();
  await done(page, n);
}
const M = '[data-testid=madina-app]';
const L = '[data-testid=leader-app]';
const S = '[data-testid=sardor-app]';
const chat = (who) => `[data-testid=${who}-chat]`;

async function story(page, mobile) {
  ok((await text(page, '[data-testid=demo-badge]')).includes('brauzeringizda'), 'demo badge');
  if (mobile) ok(await page.getByTestId('madina-phone').isVisible() && !(await page.getByTestId('leader-phone').isVisible()), 'one phone at a time');
  else ok(await page.getByTestId('leader-phone').isVisible() && await page.getByTestId('sardor-phone').isVisible(), 'three phones at 1440 px');
  ok(await noScroll(page), 'no horizontal scroll');
  ok((await page.locator(`${M} [data-testid=flame]`).getAttribute('data-size')) === '0', 'a cold ember before the first page');
  await step(page, 1);
  ok((await text(page, `${M} [data-testid=home]`)).includes("O'tkan kunlar"), 'the book is on the home screen');
  await step(page, 2);
  await has(page, `${M} [data-testid=streak-n]`, '1');
  ok((await page.locator(`${M} [data-testid=flame]`).getAttribute('data-size')) === '1', 'the flame is lit');
  ok((await text(page, `${M} [data-testid^=pace-]`)).includes('taxminan'), 'the pace forecast');
  await step(page, 3);
  await has(page, `${M} [data-testid=streak-n]`, '7');
  ok((await page.locator(`${M} .snow.on`).count()) === 1, 'one freeze earned');
  await step(page, 4);
  await has(page, chat('madina'), "Olovingiz o'chmasin");
  await has(page, `${M} [data-testid=saved-note]`, '1 ta muzlatish ishlatildi');
  ok((await text(page, `${M} [data-testid=streak-n]`)) === '7', 'the freeze kept the streak');
  await step(page, 5);
  await has(page, `${L} [data-testid=marathon]`, '30 kunda 1000 bet');
  ok((await page.locator(`${L} [data-testid=row-101]`).count()) === 1 && (await page.locator(`${L} [data-testid=row-102]`).count()) === 1, 'both joined');
  await step(page, 6);
  await has(page, `${L} [data-testid=row-101]`, '40');
  ok((await text(page, `${L} [data-testid=row-102]`)).includes('35'), 'the leaderboard updates live');
  await step(page, 7);
  await has(page, chat('leader'), '900 deb yozgan');
  ok((await text(page, `${L} [data-testid=row-102]`)).includes('335'), 'only 300 of 900 counted');
  await step(page, 8);
  await has(page, chat('sardor'), '300 betni qabul qildi');
  ok((await text(page, chat('leader'))).includes('isbot yozdi'), 'the isbot reached the leader');
  await step(page, 9);
  await has(page, `${M} [data-testid=me]`, 'Abdulla Qodiriy');
  ok(await page.locator(`${M} [data-testid=heatmap] rect.hm`).count() >= 99, 'the heatmap');
  ok(await page.locator(`${M} [data-testid=weekly] rect.wk-bar`).count() === 8, 'eight weekly bars');
  await step(page, 10);
  await has(page, chat('madina'), 'Sizga sertifikat berildi');
  ok((await text(page, `${M} [data-testid=cert-name]`)) === 'Madina Yusupova', 'the certificate in SVG');
  const code = await text(page, `${M} [data-testid=cert-code-text]`);
  ok(/^[A-Z2-9]{4}(-[A-Z2-9]{4}){3}$/.test(code), 'a 16-letter code');
  await step(page, 11);
  await has(page, `${S} [data-testid=verify-bad]`, "Bunday sertifikat yo'q");
  ok((await page.locator(`${S} [data-testid=verify-input]`).inputValue()) !== code, 'the edited code is refused');
  await page.locator(`${S} [data-testid=verify-input]`).fill(code);
  await page.locator(`${S} [data-testid=verify-go]`).click();
  await has(page, `${S} [data-testid=verify-ok]`, 'Haqiqiy sertifikat');
  ok((await text(page, `${S} [data-testid=verify-ok]`)).includes('Madina Yusupova'), 'the real code is confirmed');
  ok(await noScroll(page), 'still no horizontal scroll');
  return code;
}

async function more(page) {
  await page.getByTestId('demo-lang').click();
  await has(page, '[data-testid=demo-badge]', 'браузере');
  await has(page, M, 'Код проверки');
  ok(true, 'Russian switch');
  const png = page.waitForEvent('download');
  await page.locator(`${M} [data-testid=cert-png]`).click();
  ok((await png).suggestedFilename().startsWith('sertifikat-'), 'the certificate saves as PNG');
  await page.locator(`${M} [data-testid=cert-bot]`).click();
  await page.waitForSelector(`${chat('madina')} img.chat-img`, { state: 'attached', timeout: 20_000 });
  ok(true, 'the PNG goes to the bot');
}

try {
  let code = '';
  for (const [w, h] of [[1440, 900], [375, 812]]) {
    const page = await open(w, h);
    code = await story(page, w < 760);
    if (w > 760) await more(page);
    await page.context().close();
  }
  const link = await open(375, 812, { path: `?v=${code.replace(/-/g, '')}` });
  await has(link, `${S} [data-testid=verify-ok]`, 'Haqiqiy sertifikat');
  ok(true, 'a ?v= link replays the story and confirms the code');
  await link.context().close();
  const outside = await open(375, 700, { path: 'webapp/index.html', ready: false });
  await has(outside, '#app', 'Telegram ichida');
  ok(true, 'the Mini App outside Telegram asks to open it in Telegram');
  await outside.context().close();
  assert.deepEqual(errors, [], `console errors:\n${errors.join('\n')}`);
  console.log(`e2e: ${checks} checks passed at 1440 px and 375 px, 0 console errors`); // eslint-disable-line no-console
} finally {
  await browser.close();
  server?.close();
}
