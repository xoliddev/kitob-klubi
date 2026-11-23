// README media from the real demo: desktop + phone screenshots (JPEG), an 800x500 portfolio thumbnail and a GIF of
// the olov growing, the live leaderboard and the certificate. JPEG is encoded by the browser (canvas), the GIF by
// gifenc.
//   PW_CHANNEL=chrome node scripts/shots.mjs [outDir]       (needs playwright + gifenc)
import { mkdirSync, writeFileSync } from 'node:fs';
import gifenc from 'gifenc';
import { chromium } from 'playwright';
import { startServer } from './serve.mjs';

const { GIFEncoder, quantize, applyPalette } = gifenc;
const OUT = process.argv[2] ?? 'docs/media';
const PORT = Number(process.env.SHOTS_PORT ?? 4373);
mkdirSync(OUT, { recursive: true });
const server = await startServer(PORT);
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || undefined });
const b64 = (buf) => buf.toString('base64');
const ONLY = new Set((process.env.ONLY ?? 'desktop,thumb,mobile,gif').split(','));

async function open(width, height) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, timezoneId: 'Asia/Tashkent' });
  await ctx.route('https://telegram.org/**', (route) => route.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
  const page = await ctx.newPage();
  await page.goto(`http://127.0.0.1:${PORT}/`);
  await page.waitForSelector('body[data-ready="1"]');
  return page;
}
const done = (page, n) => page.waitForFunction((k) => document.querySelector(`[data-testid=story-${k}]`).classList.contains('done'), n, { timeout: 120_000 });
const step = async (page, n) => { await page.evaluate((k) => document.querySelector(`[data-testid=story-${k}]`).click(), n); await done(page, n); };
const toPhones = (page) => page.evaluate(() => {
  const top = document.querySelector('[data-testid=madina-phone]').getBoundingClientRect().top + window.scrollY;
  window.scrollTo(0, top - 46);
});
const scrollApp = (page, who, sel, gap = 60) => page.evaluate(([w, s, g]) => {
  const pane = document.querySelector(`[data-testid=${w}-app]`);
  const el = pane.querySelector(s);
  pane.scrollTop = el ? el.getBoundingClientRect().top - pane.getBoundingClientRect().top + pane.scrollTop - g : 0;
}, [who, sel, gap]);
const checkReal = async (page) => {
  const code = await page.evaluate(() => document.querySelector('[data-testid=madina-app] [data-testid=cert-code-text]')?.textContent ?? '');
  await page.locator('[data-testid=sardor-app] [data-testid=verify-input]').fill(code);
  await page.locator('[data-testid=sardor-app] [data-testid=verify-go]').click();
  await page.waitForSelector('[data-testid=sardor-app] [data-testid=verify-ok]');
};

async function canvasOut(page, fn, args) { return Buffer.from(await page.evaluate(fn, args), 'base64'); }
async function jpeg(page, png, name, w, h) {
  const out = await canvasOut(page, async ([src, W, H]) => {
    const img = new Image();
    img.src = `data:image/png;base64,${src}`;
    await img.decode();
    const cv = document.createElement('canvas');
    cv.width = W;
    cv.height = H;
    const g = cv.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(img, 0, 0, W, H);
    return cv.toDataURL('image/jpeg', 0.88).split(',')[1];
  }, [b64(png), w, h]);
  writeFileSync(`${OUT}/${name}`, out);
  console.log('wrote', name); // eslint-disable-line no-console
}

async function thumb(page, shots) {
  const out = await canvasOut(page, async ([a, b, c]) => {
    const load = async (s) => { const i = new Image(); i.src = `data:image/png;base64,${s}`; await i.decode(); return i; };
    const [left, mid, right] = await Promise.all([a, b, c].map(load));
    const cv = document.createElement('canvas');
    cv.width = 1600;
    cv.height = 1000;
    const g = cv.getContext('2d');
    const bg = g.createLinearGradient(0, 0, 1600, 1000);
    bg.addColorStop(0, '#3a2a20');
    bg.addColorStop(0.55, '#231c1a');
    bg.addColorStop(1, '#16110f');
    g.fillStyle = bg;
    g.fillRect(0, 0, 1600, 1000);
    const glow = g.createRadialGradient(1150, 560, 30, 1150, 560, 620);
    glow.addColorStop(0, 'rgba(242,99,27,0.38)');
    glow.addColorStop(1, 'rgba(242,99,27,0)');
    g.fillStyle = glow;
    g.fillRect(0, 0, 1600, 1000);
    // a row of calendar squares, like the heatmap: cold, read, goal, twice the goal, a freeze
    const colours = ['#3b302a', '#7a4a2c', '#c4621f', '#f2631b', '#5fa8dc'];
    for (let i = 0; i < 21; i++) {
      g.fillStyle = colours[[2, 3, 2, 1, 3, 2, 2, 4, 2, 3, 3, 2, 1, 2, 3, 3, 2, 2, 3, 2, 3][i]];
      g.beginPath(); g.roundRect(82 + (i % 7) * 34, 790 + Math.floor(i / 7) * 34, 27, 27, 6); g.fill();
    }
    g.fillStyle = '#ffb48f';
    g.font = '700 22px -apple-system, Segoe UI, Roboto, sans-serif';
    g.fillText('T E L E G R A M   B O T   +   M I N I   A P P', 82, 150);
    g.fillStyle = '#ffffff';
    g.font = '800 104px Georgia, "Times New Roman", serif';
    g.fillText('Kitob', 76, 270);
    g.fillText('Klubi', 76, 378);
    ['Har kungi olov va muzlatish', 'Klub marafoni, adolatli reyting', 'Tekshiriladigan sertifikat'].forEach((s, i) => {
      g.fillStyle = ['#f2631b', '#ffb23a', '#5fa8dc'][i];
      g.beginPath(); g.arc(92, 466 + i * 60, 8, 0, 7); g.fill();
      g.fillStyle = '#efe6da';
      g.font = '500 33px -apple-system, Segoe UI, Roboto, sans-serif';
      g.fillText(s, 118, 478 + i * 60);
    });
    g.fillStyle = 'rgba(255,180,143,0.95)';
    g.font = '600 25px -apple-system, Segoe UI, Roboto, sans-serif';
    g.fillText('xoliddev', 82, 700);
    const H = 600;
    const draw = (img, cx, cy, rot) => {
      const w = (img.width * H) / img.height;
      g.save();
      g.translate(cx, cy);
      g.rotate(rot);
      g.shadowColor = 'rgba(0,0,0,0.55)';
      g.shadowBlur = 50;
      g.shadowOffsetY = 26;
      g.beginPath();
      g.roundRect(-w / 2, -H / 2, w, H, (56 * H) / img.height);
      g.fillStyle = '#000';
      g.fill();
      g.shadowColor = 'transparent';
      g.clip();
      g.drawImage(img, -w / 2, -H / 2, w, H);
      g.restore();
    };
    draw(right, 1395, 520, 0.035);
    draw(left, 905, 520, -0.035);
    draw(mid, 1150, 500, 0);
    const o = document.createElement('canvas');
    o.width = 800;
    o.height = 500;
    const og = o.getContext('2d');
    og.imageSmoothingQuality = 'high';
    og.drawImage(cv, 0, 0, 800, 500);
    return o.toDataURL('image/jpeg', 0.9).split(',')[1];
  }, shots.map(b64));
  writeFileSync(`${OUT}/thumb.jpg`, out);
  console.log('wrote thumb.jpg'); // eslint-disable-line no-console
}

if (ONLY.has('desktop') || ONLY.has('thumb')) {
  const page = await open(1440, 900);
  for (const n of [1, 2, 3]) await step(page, n);
  await scrollApp(page, 'madina', '[data-testid=hero]', 10);
  const flame = await page.getByTestId('madina-phone').screenshot();
  for (const n of [4, 5, 6, 7, 8]) await step(page, n);
  await page.getByTestId('leader-tab-app').click();
  await page.waitForTimeout(400);
  await scrollApp(page, 'leader', '[data-testid=marathon]', 10);
  const board = await page.getByTestId('leader-phone').screenshot();
  for (const n of [9, 10, 11]) await step(page, n);
  await checkReal(page);
  await scrollApp(page, 'madina', '[data-testid=cert-screen]', 0);
  await page.waitForTimeout(300);
  const certificate = await page.getByTestId('madina-phone').screenshot();
  if (ONLY.has('thumb')) await thumb(page, [board, flame, certificate]);
  if (ONLY.has('desktop')) {
    await scrollApp(page, 'leader', '[data-testid=marathon]', 10);
    await toPhones(page);
    await page.waitForTimeout(300);
    await jpeg(page, await page.screenshot(), 'demo-desktop.jpg', 1440, 900);
  }
  await page.context().close();
}

if (ONLY.has('mobile')) {
  const page = await open(390, 844);
  for (const n of [1, 2, 3, 4]) await step(page, n);
  await page.evaluate(() => window.scrollTo(0, document.querySelector('[data-testid=madina-phone]').getBoundingClientRect().top + window.scrollY - 6));
  await scrollApp(page, 'madina', '[data-testid=nothing]', 0);
  await page.waitForTimeout(400);
  await jpeg(page, await page.screenshot(), 'demo-mobile.jpg', 390, 844);
  await page.context().close();
}

if (ONLY.has('gif')) {
  const page = await open(1280, 860);
  await toPhones(page);
  const clip = await page.evaluate(() => {
    const a = document.querySelector('[data-testid=madina-phone]').getBoundingClientRect();
    const c = document.querySelector('[data-testid=sardor-phone]').getBoundingClientRect();
    return { x: Math.max(0, a.left - 8), y: Math.max(0, a.top - 4), width: c.right - a.left + 16, height: Math.min(window.innerHeight - a.top, a.height * 0.86) };
  });
  const W = 720;
  const H = Math.round((W * clip.height) / clip.width / 2) * 2;
  const gif = GIFEncoder();
  async function frame(delay) {
    const png = await page.screenshot({ clip });
    const rgba = await page.evaluate(async ([src, w, h]) => {
      const img = new Image();
      img.src = `data:image/png;base64,${src}`;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const g = c.getContext('2d');
      g.imageSmoothingQuality = 'high';
      g.drawImage(img, 0, 0, w, h);
      const bytes = g.getImageData(0, 0, w, h).data;
      let bin = '';
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return btoa(bin);
    }, [b64(png), W, H]);
    const data = new Uint8Array(Buffer.from(rgba, 'base64'));
    const palette = quantize(data, 128);
    gif.writeFrame(applyPalette(data, palette), W, H, { palette, delay });
  }
  async function film(n, every = 500, max = 30) {
    await page.evaluate((k) => document.querySelector(`[data-testid=story-${k}]`).click(), n);
    await toPhones(page);
    for (let k = 0; k < max; k++) {
      await frame(every);
      if (await page.evaluate((s) => document.querySelector(`[data-testid=story-${s}]`).classList.contains('done'), n)) break;
      await page.waitForTimeout(every - 150);
    }
  }
  await step(page, 1);
  await toPhones(page);
  for (const n of [2, 3, 4, 5, 6, 7, 8, 10, 11]) await film(n);
  await checkReal(page);
  await frame(2600);
  gif.finish();
  writeFileSync(`${OUT}/olov-reyting-sertifikat.gif`, gif.bytes());
  console.log('wrote olov-reyting-sertifikat.gif'); // eslint-disable-line no-console
  await page.context().close();
}
await browser.close();
server.close();
