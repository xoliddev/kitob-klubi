// The Mini App shell: four tabs at the bottom (Olov, Kitoblar, Klublar, Men), a back stack with "⬅️ Orqaga" on every
// inner screen (and Telegram's BackButton), the language switch and polling. Screens live in their own modules. The
// same code runs inside Telegram and in the browser demo's phones.
import { makeT } from '../shared/i18n.js';
import { bookScreens } from './ui-books.js';
import { clubScreens } from './ui-clubs.js';
import { homeScreens } from './ui-home.js';
import { meScreens } from './ui-me.js';
import { errText, h, makeText, toast } from './util.js';

const TABS = ['home', 'books', 'clubs', 'more'];
const ICONS = {
  home: 'M12 3c1.5 3.6 6 5.6 6 11a6 6 0 0 1-12 0c0-3 1.6-4.6 2.7-6.4.6 2 1.6 3 3.3 3.6C12 8.6 11 5.6 12 3z',
  books: 'M5 4h4v16H5zM10 4h4v16h-4zM15.2 5.2l3.8-1 3.6 14.6-3.8 1z',
  clubs: 'M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2 20c0-3.3 2.7-6 6-6s6 2.7 6 6M12.5 14.3A6 6 0 0 1 22 20',
  more: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-8 9c0-4.4 3.6-7 8-7s8 2.6 8 7',
};

export function mountApp(root, { api, catalogs, catalog, lang: lang0, tg = null, start = 'home', poll = 2500, onLang, now = () => Date.now(), links = {} }) {
  const t = makeT(catalogs);
  const text = makeText(catalogs);
  const head = h('header', { class: 'g-head' });
  const body = h('main', { class: 'g-body', oninput: (e) => { if (e.target.matches('input:not([type=checkbox]):not([type=radio]), textarea')) body.dataset.dirty = '1'; } });
  const tabbar = h('nav', { class: 'g-tabbar' });
  const app = h('div', { class: 'g-app' }, head, body, tabbar);
  root.replaceChildren(app);
  const ctx = {
    api, catalog, tg, root: app, now, links, lang: lang0 === 'ru' ? 'ru' : 'uz',
    t: (key, params) => t(ctx.lang, key, params),
    P: (key, params) => text(ctx.lang, key, params),
    T: t,
    toast: (msg, kind) => toast(app, msg, kind),
    fail: (e) => toast(app, errText(t, ctx.lang, e), 'bad'),
    me: null,
  };
  let tab = TABS.includes(start) ? start : 'home';
  let screens = null;
  const stack = [];
  let timer = 0;
  let alive = true;

  async function run(fn) {
    try {
      return await fn();
    } catch (e) {
      ctx.fail(e);
      return null;
    }
  }

  function paintHead() {
    const top = stack.at(-1);
    const back = stack.length > 1 ? h('button', { class: 'g-back', type: 'button', 'data-testid': 'back', onclick: () => pop() }, ctx.P('app.back')) : null;
    head.replaceChildren(back ?? h('b', { class: 'g-title', text: top?.title?.() ?? ctx.P(`app.tab_${tab}`) }), h('span', { class: 'g-grow' }),
      h('button', { class: 'g-lang', type: 'button', 'data-testid': 'app-lang', onclick: () => setLang(ctx.lang === 'uz' ? 'ru' : 'uz') }, ctx.P('app.lang')));
    tabbar.replaceChildren(...TABS.map((k) => h('button', { class: k === tab ? 'on' : '', type: 'button', 'data-testid': `tab-${k}`, onclick: () => switchTab(k) },
      h('span', { class: 'g-ico', html: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${ICONS[k]}"/></svg>` }), h('span', {}, ctx.P(`app.tab_${k}`)))));
    if (tg?.BackButton) {
      if (stack.length > 1) tg.BackButton.show();
      else tg.BackButton.hide();
    }
  }

  /** Show a screen: {name, title?(), load?(), render(): Node, poll?(): Promise<bool>, mounted?(), leave?()} */
  async function show(screen, replace = false) {
    stack.at(-1)?.leave?.();
    if (replace && stack.length) stack.pop();
    stack.push(screen);
    await paint();
  }

  async function pop() {
    if (stack.length < 2) return;
    stack.pop().leave?.();
    await paint();
  }

  async function home() {
    while (stack.length) stack.pop().leave?.();
    stack.push(screens[tab]());
    await paint();
  }

  async function paint() {
    paintHead();
    const top = stack.at(-1);
    if (!top) return;
    await run(() => top.load?.());
    if (top !== stack.at(-1)) return;
    paintHead();
    body.replaceChildren(top.render());
    body.dataset.screen = top.name;
    body.dataset.dirty = '';
    top.mounted?.();
    root.scrollTop = 0;
    if (tg) window.scrollTo(0, 0);
  }

  /** Re-fetch the visible screen (polling and the demo's live events); re-render only when something changed. */
  async function refresh() {
    const top = stack.at(-1);
    if (!top?.poll) return;
    const changed = await run(() => top.poll());
    if (changed && top === stack.at(-1)) {
      const y = root.scrollTop;
      if (body.dataset.dirty === '1') return; // never wipe what a person has typed
      body.replaceChildren(top.render());
      top.mounted?.(true);
      root.scrollTop = y;
    }
  }

  /** Draw the visible screen again from what it already loaded (after an action on it), keeping the scroll. */
  function rerender() {
    const top = stack.at(-1);
    if (!top) return;
    const y = root.scrollTop;
    paintHead();
    body.replaceChildren(top.render());
    body.dataset.dirty = '';
    top.mounted?.(true);
    root.scrollTop = y;
  }

  async function switchTab(k) {
    tab = k;
    await home();
  }

  async function setLang(next) {
    if (next === ctx.lang) return;
    ctx.lang = next;
    await run(() => api.setLang(next));
    onLang?.(next);
    await paint();
  }

  const loop = () => {
    if (!alive) return;
    refresh().finally(() => { timer = setTimeout(loop, poll); });
  };

  const nav = { show, pop, home, refresh, rerender, run, switchTab };
  const ready = (async () => {
    ctx.me = await run(() => api.me());
    if (ctx.me?.lang && !lang0) ctx.lang = ctx.me.lang;
    screens = { ...homeScreens(ctx, nav), ...bookScreens(ctx, nav), ...clubScreens(ctx, nav), ...meScreens(ctx, nav) };
    nav.screens = screens;
    await home();
    if (tg?.BackButton) tg.BackButton.onClick(() => pop());
    if (poll > 0) timer = setTimeout(loop, poll);
  })();

  return {
    ready, refresh, ctx,
    open: async (fn) => { await ready; await fn({ show, home, screens, ctx, switchTab }); },
    setLang: async (l) => { ctx.lang = l; await paint(); },
    get screen() { return stack.at(-1)?.name; },
    get top() { return stack.at(-1); },
    get tab() { return tab; },
    get screens() { return screens; },
    show, home, switchTab,
    destroy: () => { alive = false; clearTimeout(timer); while (stack.length) stack.pop().leave?.(); },
  };
}
