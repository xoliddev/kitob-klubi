// Demo page: three phones (Madina the reader, Nilufar ustoz the club leader, Sardor another reader), each with the
// simulated bot and the real Mini App code on the in-page backend; the guided story (in order, all at once, or out of
// order), the demo clock, the language switch, and the certificate check page (opened from a "?v=" link too).
import { dateFull, makeT } from '../shared/i18n.js';
import { localDay } from '../shared/clock.js';
import { mountVerify } from '../webapp/ui-cert.js';
import { mountApp } from '../webapp/ui.js';
import { h, loadShared, makeText, store } from '../webapp/util.js';
import { apiFor } from './api.js';
import { BotSim } from './bot.js';
import { makeViews } from './bot-views.js';
import { createPhone } from './phone.js';
import { createDemo, LEADER, MADINA, SARDOR } from './seed.js';
import { runStep, STEPS } from './story.js';
import { makeUi } from './story-ui.js';

const shared = await loadShared(new URL('../shared/', import.meta.url), true);
const t = makeT(shared.catalogs);
const text = makeText(shared.catalogs);
let lang = store.get('kitobklubi.lang') === 'ru' ? 'ru' : 'uz';
const P = (key, params) => text(lang, key, params);
const backend = createDemo({ data: shared, lang });
const views = makeViews(t);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const UIDS = [MADINA, LEADER, SARDOR];
const people = { [MADINA]: { who: 'madina', label: 'demo.madina', role: 'demo.role_reader', start: 'home' },
  [LEADER]: { who: 'leader', label: 'demo.leader', role: 'demo.role_leader', start: 'clubs' },
  [SARDOR]: { who: 'sardor', label: 'demo.sardor', role: 'demo.role_other', start: 'home' } };
const phones = {};
const bots = {};
const apps = {};
let shown = MADINA;
const page = `${window.location.origin}${window.location.pathname.replace(/index\.html$/, '')}`;
const links = { verify: (code) => `${page}?v=${code.replace(/-/g, '')}` }; // a ?v= link to this page replays the story and checks the code

function focus(uid, pane) {
  phones[uid].show(pane);
  if (window.matchMedia('(max-width: 760px)').matches) pick(uid);
}

/** A picture the Mini App sent to the bot appears in that person's chat (our own canvas output, checked). */
function pngToChat(uid) {
  return (c, png) => {
    if (!/^[A-Za-z0-9+/=]+$/.test(png)) return;
    bots[uid].push({ html: `${P('demo.png')}\n<img class="chat-img" src="data:image/png;base64,${png}" alt="">`, kb: [] });
    phones[uid].ping(P('demo.png'));
  };
}

function mountOne(uid) {
  apps[uid]?.destroy();
  apps[uid] = mountApp(phones[uid].appRoot, { api: apiFor(backend, uid, { onPng: pngToChat(uid) }), ...shared, lang, start: people[uid].start, poll: 1000,
    now: () => backend.nowMs(), onLang: (l) => setLang(l), links });
  apps[uid].verifying = false;
  return apps[uid];
}

/** Sardor's phone can show the public check page instead of the Mini App (as if a link was opened in a browser). */
const checker = {
  open(code = '') {
    focus(SARDOR, 'app');
    apps[SARDOR]?.destroy();
    apps[SARDOR] = mountVerify(phones[SARDOR].appRoot, { verify: (c) => apiFor(backend, SARDOR).verify(c), catalogs: shared.catalogs, lang, code,
      onLang: (l) => setLang(l) });
    apps[SARDOR].verifying = true;
    return apps[SARDOR];
  },
  async close() { await mountOne(SARDOR).ready; },
};

async function openApp(uid, hash) {
  focus(uid, 'app');
  if (apps[uid].verifying) await checker.close();
  const m = /^#([bkc])=(\d{1,9})$/.exec(hash);
  await apps[uid].open(async ({ show, screens, switchTab }) => {
    if (m) await show({ b: screens.book, k: screens.club, c: screens.cert }[m[1]](Number(m[2])));
    else if (hash === '#new') { await switchTab('books'); await show(screens.addBook()); }
    else if (['#books', '#clubs', '#more'].includes(hash)) await switchTab(hash.slice(1));
    else await switchTab('home');
  });
}

for (const uid of UIDS) {
  bots[uid] = new BotSim(backend, uid, t, views, { onChange: () => phones[uid]?.renderChat(), onAlert: (x) => phones[uid].alert(x), onApp: (hash) => openApp(uid, hash),
    verifyLink: links.verify });
  phones[uid] = createPhone({ who: people[uid].who, label: '', role: people[uid].role, bot: bots[uid], texts: { P }, now: () => backend.nowMs(),
    onOpenApp: (hash) => openApp(uid, hash), onShowApp: () => apps[uid]?.refresh() });
}

let pending = false;
backend.on((ev) => {
  if (ev.type === 'note') {
    const msg = bots[ev.note.to]?.deliver(ev.note);
    if (msg) phones[ev.note.to].ping(msg.html);
  }
  if (ev.type === 'changed' && !pending) {
    pending = true;
    queueMicrotask(() => {
      pending = false;
      for (const uid of UIDS) apps[uid]?.refresh();
      paintClock();
    });
  }
});
setInterval(() => backend.tick(), 5000);

// ── page ──
const timeEl = h('span', { class: 'demo-date', 'data-testid': 'demo-time' });
const badgeText = h('span');
const langBtn = h('button', { class: 'demo-btn', type: 'button', 'data-testid': 'demo-lang', onclick: () => setLang(lang === 'uz' ? 'ru' : 'uz') });
const resetBtn = h('button', { class: 'demo-btn', type: 'button', onclick: () => window.location.assign(page) });
const playBtn = h('button', { class: 'demo-btn solid', type: 'button', 'data-testid': 'play', onclick: () => play() });
const checkBtn = h('button', { class: 'demo-btn', type: 'button', 'data-testid': 'demo-verify', onclick: () => (apps[SARDOR].verifying ? checker.close() : checker.open()) });
const MARK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5c1.6 3.9 6.5 6.1 6.5 11.9a6.5 6.5 0 0 1-13 0c0-3.3 1.8-5 3-7 .6 2.2 1.7 3.3 3.5 3.9-.1-3.6-1-6.2 0-8.8z" fill="currentColor"/></svg>';
const bar = h('header', { class: 'demo-bar' },
  h('a', { class: 'demo-logo', href: page }, h('span', { class: 'demo-mark', html: MARK }), 'Kitob Klubi'),
  h('span', { class: 'demo-badge', 'data-testid': 'demo-badge' }, h('span', { class: 'dot' }), badgeText),
  h('span', { class: 'demo-time' }, timeEl),
  h('div', { class: 'demo-tools' }, playBtn, checkBtn, langBtn, resetBtn,
    h('a', { class: 'demo-btn gh', href: 'https://github.com/xoliddev/kitob-klubi', target: '_blank', rel: 'noopener' }, 'GitHub')));
const title = h('h1');
const lead = h('p');
const foot = h('p', { class: 'demo-foot' });
const env = { backend, bots, wait, focus, done: new Set() };
env.ui = makeUi({ apps, phones, env, wait, uids: { MADINA, LEADER, SARDOR }, checker });
let running = false;
async function step(i) {
  if (running) return;
  running = true;
  paintStory();
  try {
    await runStep(i + 1, env);
  } catch (err) {
    console.warn(err); // eslint-disable-line no-console
    phones[shown].alert(P('err.generic'));
  }
  running = false;
  paintStory();
}
async function play() {
  for (let i = 0; i < STEPS.length; i++) if (!env.done.has(i + 1)) await step(i);
}
const storyBtns = STEPS.map((_, i) => h('button', { class: 'story-btn', type: 'button', 'data-testid': `story-${i + 1}`, onclick: () => step(i) },
  h('b', {}, String(i + 1)), h('span')));
function paintStory() {
  const next = STEPS.findIndex((_, i) => !env.done.has(i + 1));
  storyBtns.forEach((b, i) => {
    b.lastChild.textContent = P(`demo.${STEPS[i]}`);
    b.classList.toggle('done', env.done.has(i + 1));
    b.classList.toggle('next', i === next && !running);
    b.disabled = running;
  });
  playBtn.disabled = running || next < 0;
}
const whoBtns = UIDS.map((uid) => h('button', { type: 'button', 'data-testid': `switch-${people[uid].who}`, onclick: () => pick(uid) }));
function pick(uid) {
  shown = uid;
  whoBtns.forEach((b, i) => b.classList.toggle('on', UIDS[i] === uid));
  for (const id of UIDS) phones[id].side.classList.toggle('show', id === uid);
}
const paintClock = () => { timeEl.textContent = P('demo.time', { time: dateFull(localDay(backend.nowMs())) }); };
function paintTexts() {
  document.documentElement.lang = lang;
  badgeText.textContent = P('demo.badge');
  langBtn.textContent = lang === 'uz' ? 'RU' : 'UZ';
  resetBtn.textContent = P('demo.reset');
  playBtn.textContent = P('demo.play');
  checkBtn.textContent = P('demo.verify');
  title.textContent = P('demo.title');
  lead.textContent = P('demo.lead');
  foot.textContent = P('demo.foot');
  whoBtns.forEach((b, i) => { b.textContent = P(people[UIDS[i]].label); });
  paintStory();
  paintClock();
  for (const uid of UIDS) {
    phones[uid].renderLabels();
    phones[uid].side.querySelector('.side-label b').textContent = P(people[uid].label);
  }
}
function setLang(next) {
  if (next === lang) return;
  lang = next;
  store.set('kitobklubi.lang', lang);
  for (const uid of UIDS) {
    backend.setLang(uid, lang);
    apps[uid].setLang(lang);
  }
  paintTexts();
}
setInterval(() => { paintClock(); for (const uid of UIDS) phones[uid].tick(); }, 15_000);

document.body.append(bar, h('section', { class: 'demo-intro' }, title, lead), h('nav', { class: 'story', 'aria-label': 'story' }, storyBtns),
  h('div', { class: 'who-switch', role: 'tablist' }, whoBtns), h('main', { class: 'demo-stage' }, UIDS.map((uid) => phones[uid].side)), foot);
for (const uid of UIDS) {
  mountOne(uid);
  bots[uid].start();
  phones[uid].show('app');
}
pick(MADINA);
paintTexts();
await Promise.all(UIDS.map((uid) => apps[uid].ready));
const asked = new URLSearchParams(window.location.search).get('v');
if (asked) {
  await runStep(10, env, true); // the story, quietly, up to the certificate; then the check this link asked for
  paintStory();
  checker.open(asked.slice(0, 24));
  pick(SARDOR);
}
document.body.dataset.ready = '1';
