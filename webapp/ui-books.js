// The "Kitoblar" tab: books being read and finished ones with their fikr, adding a book (the catalog or by hand), and
// one book: progress, the pace forecast, logging by pages or by "hozir qaysi betdasiz?", the log history with
// fair-play marks, and the fikr after the last page.
import { dateShort, paceLine, rate } from '../shared/i18n.js';
import { barSvg } from './draw.js';
import { bookCard, logMessage } from './ui-home.js';
import { h, haptic, num, plain } from './util.js';

const field = (label, input) => h('label', { class: 'g-field' }, label, input);

export function bookScreens(ctx, nav) {
  const date = (d) => plain(dateShort(ctx.T, ctx.lang, d));

  const books = () => {
    let data = null;
    const load = async () => { data = await ctx.api.books(); };
    return {
      name: 'books', load, poll: async () => { const b = JSON.stringify(data); await load(); return b !== JSON.stringify(data); },
      render: () => h('div', { class: 'g-screen', 'data-testid': 'books' },
        h('h2', { class: 'g-h2' }, ctx.P('app.reading')),
        data.active.length ? data.active.map((b) => bookCard(ctx, b, (id) => nav.show(book(id)))) : h('p', { class: 'g-empty' }, ctx.P('book.none')),
        h('button', { class: 'g-btn primary wide', type: 'button', 'data-testid': 'add-book', onclick: () => nav.show(addBook()) }, ctx.P('btn.add')),
        data.done.length ? h('h2', { class: 'g-h2' }, ctx.P('app.finished')) : null,
        data.done.map((b) => h('button', { class: 'b-done', type: 'button', 'data-testid': `done-${b.id}`, onclick: () => nav.show(book(b.id)) },
          h('b', {}, `✅ ${b.title}`), h('small', {}, `${b.author} · ${date(b.finished_day)}`), b.review ? h('q', {}, b.review) : null))),
    };
  };

  const addBook = () => {
    const inputs = { title: h('input', { maxlength: 120, 'data-testid': 'f-title' }), author: h('input', { maxlength: 80, 'data-testid': 'f-author' }),
      pages: h('input', { inputmode: 'numeric', maxlength: 4, 'data-testid': 'f-pages' }), start: h('input', { inputmode: 'numeric', maxlength: 4, 'data-testid': 'f-start' }) };
    async function save(payload) {
      const card = await nav.run(() => ctx.api.addBook(payload));
      if (!card) return;
      haptic(ctx.tg, 'success');
      ctx.toast(ctx.P('add.saved', { title: card.title, pages: card.pages }));
      await nav.show(book(card.id), true);
    }
    return {
      name: 'add-book',
      render: () => h('div', { class: 'g-screen', 'data-testid': 'add-form' },
        h('h2', { class: 'g-h2' }, ctx.P('app.catalog')),
        h('div', { class: 'catalog' }, ctx.catalog.map((b) => h('button', { class: 'cat', type: 'button', 'data-testid': `cat-${b.id}`, onclick: () => save({ catalog: b.id }) },
          h('b', {}, b.title), h('small', {}, b.author), h('span', {}, ctx.P('fmt.pages', { n: b.pages }))))),
        h('h2', { class: 'g-h2' }, ctx.P('btn.manual')),
        h('form', { class: 'g-card g-form', onsubmit: (e) => { e.preventDefault(); save({ title: inputs.title.value, author: inputs.author.value, pages: num(inputs.pages.value), start: num(inputs.start.value) }); } },
          field(ctx.P('app.f_title'), inputs.title), field(ctx.P('app.f_author'), inputs.author),
          h('div', { class: 'g-two' }, field(ctx.P('app.f_pages'), inputs.pages), field(ctx.P('app.f_start'), inputs.start)),
          h('button', { class: 'g-btn primary', type: 'submit', 'data-testid': 'f-save' }, ctx.P('app.save')))),
    };
  };

  const book = (bid, { review = false } = {}) => {
    let v = null;
    let day = 'today';
    const load = async () => { v = await ctx.api.book(bid); };
    async function send(payload) {
      const out = await nav.run(() => ctx.api.log(bid, { ...payload, day }));
      if (!out) return false;
      haptic(ctx.tg, out.lit || out.met_now ? 'success' : 'light');
      ctx.toast(logMessage(ctx, out), out.log.status === 'flagged' ? 'warn' : '');
      await load();
      review = out.finished;
      nav.rerender();
      return true;
    }
    function logForm(b) {
      const add = h('input', { inputmode: 'numeric', maxlength: 5, placeholder: ctx.P('app.f_add'), 'data-testid': 'b-add' });
      const page = h('input', { inputmode: 'numeric', maxlength: 4, placeholder: `${b.page + 1}…${b.pages}`, 'data-testid': 'b-page' });
      return h('section', { class: 'g-card', 'data-testid': 'log-form' }, h('b', {}, ctx.P('app.quick')),
        h('div', { class: 'quick' }, [10, 20, 50].map((n) => h('button', { class: 'g-btn chip', type: 'button', 'data-testid': `b-quick-${n}`, onclick: () => send({ add: n }) }, `+${n}`))),
        h('form', { class: 'g-km', onsubmit: async (e) => { e.preventDefault(); if (await send({ add: num(add.value) })) add.value = ''; } }, add,
          h('button', { class: 'g-btn', type: 'submit', 'data-testid': 'b-add-send' }, ctx.P('app.send'))),
        h('label', { class: 'g-label' }, ctx.P('app.f_page')),
        h('form', { class: 'g-km', onsubmit: async (e) => { e.preventDefault(); if (await send({ page: num(page.value) })) page.value = ''; } }, page,
          h('button', { class: 'g-btn primary', type: 'submit', 'data-testid': 'b-page-send' }, ctx.P('app.send'))),
        h('div', { class: 'g-seg' }, ['today', 'yesterday'].map((d) => h('label', {}, h('input', { type: 'radio', name: 'bday', checked: d === day,
          'data-testid': `b-day-${d}`, onchange: () => { day = d; } }), h('span', {}, ctx.P(d === 'today' ? 'app.start_0' : 'when.yesterday'))))));
    }
    function reviewForm(b) {
      const box = h('textarea', { rows: 3, maxlength: 400, placeholder: ctx.P('app.f_review'), 'data-testid': 'f-review' }, b.review);
      return h('section', { class: 'g-card', 'data-testid': 'review-form' }, h('b', {}, ctx.P('review.ask')), box,
        h('button', { class: 'g-btn primary', type: 'button', 'data-testid': 'review-save', onclick: async () => {
          if (await nav.run(() => ctx.api.review(bid, box.value))) { ctx.toast(ctx.P('review.saved')); review = false; await load(); nav.rerender(); }
        } }, ctx.P('app.save')));
    }
    return {
      name: 'book', load, poll: async () => { const b = JSON.stringify(v); await load(); return b !== JSON.stringify(v); },
      title: () => v?.book.title ?? '',
      render: () => {
        const b = v.book;
        const done = b.finished_day !== null;
        return h('div', { class: 'g-screen', 'data-testid': 'book-screen' },
          h('section', { class: 'g-card book-head' }, h('h2', { class: 'g-h2' }, b.title), h('small', {}, b.author), barSvg(b.pct),
            h('b', { 'data-testid': 'book-progress' }, ctx.P('book.progress', { page: b.page, pages: b.pages, pct: b.pct })),
            done ? h('p', { class: 'done-line', 'data-testid': 'book-done' }, `🎉 ${ctx.P('book.done', { date: date(b.finished_day) })}`)
              : h('p', { class: 'pace', 'data-testid': 'book-pace' }, plain(paceLine(ctx.T, ctx.lang, b, v.today)), b.pace.rate
                ? h('small', {}, `${ctx.P('book.rate', { n: rate(b.pace.rate) })}`) : null),
            done && b.review && !review ? h('q', { 'data-testid': 'book-review' }, b.review) : null),
          done ? (review || !b.review ? reviewForm(b) : h('button', { class: 'g-btn ghost', type: 'button', onclick: () => { review = true; nav.rerender(); } }, ctx.P('btn.review')))
            : logForm(b),
          v.logs.length ? h('h2', { class: 'g-h2' }, ctx.P('app.history')) : null,
          h('ul', { class: 'logs', 'data-testid': 'logs' }, v.logs.map((l) => h('li', { class: `st-${l.status}` }, h('span', {}, date(l.day)),
            h('b', {}, `+${l.pages}`), l.asked > l.pages ? h('small', {}, `(${l.asked})`) : null,
            ctx.P(`status.${l.status}`) ? h('em', {}, ctx.P(`status.${l.status}`)) : null))));
      },
    };
  };

  return { books, addBook, book };
}
