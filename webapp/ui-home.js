// The "Olov" tab: the flame that grows with the streak, freezes, the note when a freeze saved the flame, today's ring
// and one-tap logging for the current book (today or yesterday), an isbot the leader asked for, and books in progress.
import { freezeLine, paceLine, savedLine, todayLine } from '../shared/i18n.js';
import { barSvg, flameSvg, ringSvg } from './draw.js';
import { h, haptic, num, plain } from './util.js';

export function bookCard(ctx, b, onOpen) {
  return h('button', { class: 'b-card', type: 'button', 'data-testid': `book-${b.id}`, onclick: () => onOpen(b.id) },
    h('span', { class: 'b-spine', 'aria-hidden': 'true' }),
    h('span', { class: 'b-main' }, h('b', {}, b.title), h('small', {}, b.author), barSvg(b.pct),
      h('span', { class: 'b-meta' }, ctx.P('book.progress', { page: b.page, pages: b.pages, pct: b.pct })),
      b.finished_day === null ? h('span', { class: 'b-pace', 'data-testid': `pace-${b.id}` }, plain(paceLine(ctx.T, ctx.lang, b, ctx.me.today))) : null));
}

/** What a log answer says, in one toast. */
export function logMessage(ctx, out) {
  const parts = [ctx.P(out.log.day < ctx.me.today ? 'log.saved_y' : 'log.saved', { n: out.log.pages, title: out.book.title })];
  if (out.log.capped) parts.push(ctx.P('log.capped', { cap: ctx.me.cap, asked: out.log.asked, n: out.log.pages }));
  else if (out.log.status === 'flagged') parts.push(ctx.P('log.flagged'));
  if (out.lit) parts.push(ctx.P('log.lit'));
  else if (out.met_now) parts.push(ctx.P('log.met', { n: out.streak.streak }));
  return parts.join(' ');
}

export function homeScreens(ctx, nav) {
  let data = null;
  let day = 'today';
  let lit = false;
  const load = async () => { data = await ctx.api.home(); ctx.me = data.me; };

  async function logPages(bid, payload) {
    const out = await nav.run(() => ctx.api.log(bid, { ...payload, day }));
    if (!out) return null;
    day = 'today'; // "yesterday" is a one-off choice
    haptic(ctx.tg, out.lit || out.met_now ? 'success' : 'light');
    ctx.toast(logMessage(ctx, out), out.log.status === 'flagged' ? 'warn' : '');
    lit = out.lit || out.met_now;
    if (out.finished) await nav.show(nav.screens.book(bid, { review: true }));
    else {
      await load();
      nav.rerender();
    }
    return out;
  }

  function hero(st, size) {
    const saved = plain(savedLine(ctx.T, ctx.lang, st));
    const snow = Array.from({ length: 2 }, (_, i) => h('span', { class: `snow${i < st.freezes ? ' on' : ''}`, 'aria-hidden': 'true' }, '❄'));
    return h('section', { class: `hero${st.streak ? '' : ' cold'}${lit ? ' lit' : ''}`, 'data-testid': 'hero' },
      h('div', { class: 'hero-flame' }, flameSvg(size, { label: ctx.P('streak.days_label') })),
      h('div', { class: 'hero-n' }, h('b', { 'data-testid': 'streak-n' }, String(st.streak)), h('span', {}, ctx.P('streak.days_label'))),
      h('div', { class: 'hero-meta' }, h('span', { class: 'snows', 'data-testid': 'freezes', title: plain(freezeLine(ctx.T, ctx.lang, st)) }, snow,
        h('small', {}, st.freezes >= 2 ? ctx.P('streak.full') : ctx.P('streak.next', { n: st.next_freeze }))),
      h('small', {}, ctx.P('streak.best', { n: st.best }))),
      saved ? h('p', { class: 'saved', 'data-testid': 'saved-note' }, h('b', {}, saved), ' ', ctx.P('streak.saved_hint')) : null);
  }

  function quick(st, b) {
    const input = h('input', { inputmode: 'numeric', placeholder: ctx.P('app.f_add'), 'data-testid': 'quick-n', maxlength: 5, 'aria-label': ctx.P('app.f_add') });
    const seg = h('div', { class: 'g-seg', role: 'radiogroup' }, ['today', 'yesterday'].map((d) => h('label', {},
      h('input', { type: 'radio', name: `qday${ctx.me.id}`, value: d, checked: d === day, 'data-testid': `day-${d}`, onchange: () => { day = d; } }),
      h('span', {}, ctx.P(d === 'today' ? 'app.day_t' : 'app.day_y')))));
    return h('section', { class: 'g-card today', 'data-testid': 'today' },
      h('div', { class: 'today-top' }, ringSvg(st.today, st.goal),
        h('div', {}, h('b', { 'data-testid': 'today-line' }, plain(todayLine(ctx.T, ctx.lang, st))), h('small', {}, `«${b.title}» · ${b.page}/${b.pages}`))),
      h('p', { class: 'g-label' }, ctx.P('app.quick')),
      h('div', { class: 'quick' }, [10, 20, 50].map((n) => h('button', { class: 'g-btn chip', type: 'button', 'data-testid': `quick-${n}`,
        onclick: () => logPages(b.id, { add: n }) }, `+${n}`))),
      h('form', { class: 'g-km', onsubmit: async (e) => {
        e.preventDefault();
        if (await logPages(b.id, { add: num(input.value) })) input.value = '';
      } }, input, h('button', { class: 'g-btn primary', type: 'submit', 'data-testid': 'quick-send' }, ctx.P('app.send'))),
      h('div', { class: 'g-row' }, h('span', { class: 'g-label' }, ctx.P('app.for')), seg));
  }

  function asks() {
    return data.asks.map((a) => {
      const box = h('textarea', { rows: 2, maxlength: 300, placeholder: ctx.P('app.f_proof'), 'data-testid': `proof-text-${a.id}` });
      return h('section', { class: 'g-card ask', 'data-testid': `ask-${a.id}` }, h('b', {}, ctx.P('menu.asks', { n: 1 })),
        h('small', {}, `«${a.title}» · ${ctx.P('fmt.pages', { n: a.pages })}`), box,
        h('button', { class: 'g-btn primary', type: 'button', 'data-testid': `proof-send-${a.id}`, onclick: async () => {
          if (await nav.run(() => ctx.api.proof(a.id, box.value))) { ctx.toast(ctx.P('proof.sent')); await nav.home(); }
        } }, ctx.P('app.send')));
    });
  }

  const home = () => ({
    name: 'home', load, poll: async () => { const before = JSON.stringify(data); await load(); return before !== JSON.stringify(data); },
    mounted: () => { lit = false; },
    render: () => {
      const st = data.streak;
      const cur = data.books.find((b) => b.id === data.current);
      return h('div', { class: 'g-screen', 'data-testid': 'home' }, hero(st, data.flame), cur ? quick(st, cur) : null, asks(),
        data.books.length ? h('h2', { class: 'g-h2' }, ctx.P('app.reading')) : null,
        data.books.map((b) => bookCard(ctx, b, (id) => nav.show(nav.screens.book(id)))),
        data.books.length ? null : h('p', { class: 'g-empty' }, ctx.P('book.none')),
        h('button', { class: `g-btn ${data.books.length ? 'ghost' : 'primary'} wide`, type: 'button', 'data-testid': 'add-book',
          onclick: () => nav.show(nav.screens.addBook()) }, ctx.P('btn.add')));
    },
  });

  return { home };
}
