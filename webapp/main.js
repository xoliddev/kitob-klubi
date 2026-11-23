// Mini App entry. Inside Telegram it passes the signed initData along (the server checks it). "#b=5" opens that book,
// "#k=1" that club, "#c=3" that certificate. "?v=<code>" is the public certificate check: it opens in any browser,
// without Telegram.
import { normLang } from '../shared/i18n.js';
import { httpApi, publicVerify } from './api.js';
import { mountVerify } from './ui-cert.js';
import { mountApp } from './ui.js';
import { h, loadShared } from './util.js';

const tg = window.Telegram?.WebApp;
const root = document.getElementById('app');
const shared = await loadShared();
const hash = window.location.hash;
const code = new URLSearchParams(window.location.search).get('v');
const base = `${window.location.origin}${window.location.pathname}`;

if (code !== null) {
  tg?.ready?.();
  const lang = normLang(tg?.initDataUnsafe?.user?.language_code ?? navigator.language);
  mountVerify(root, { verify: publicVerify, catalogs: shared.catalogs, lang, code: code.slice(0, 24) });
  document.documentElement.lang = lang;
} else if (!tg?.initData) {
  root.replaceChildren(h('p', { class: 'g-outside' }, shared.catalogs.uz['app.open_in_telegram']),
    h('p', { class: 'g-outside' }, shared.catalogs.ru['app.open_in_telegram']));
} else {
  tg.ready();
  tg.expand();
  const api = httpApi(tg.initData);
  const bot = tg.initDataUnsafe?.receiver?.username ?? '';
  const links = { verify: (c) => `${base}?v=${c.replace(/-/g, '')}`, join: (k) => (bot ? `https://t.me/${bot}?start=k_${k}` : k) };
  const m = /^#([bkc])=(\d{1,9})$/.exec(hash);
  const start = m?.[1] === 'k' ? 'clubs' : 'home';
  const app = mountApp(root, { ...shared, api, tg, lang: null, start, poll: 4000, links });
  await app.ready;
  if (m) {
    await app.open(async ({ show, screens }) => {
      const screen = { b: screens.book, k: screens.club, c: screens.cert }[m[1]];
      await show(screen(Number(m[2])));
    });
  }
  document.documentElement.lang = normLang(tg.initDataUnsafe?.user?.language_code);
}
