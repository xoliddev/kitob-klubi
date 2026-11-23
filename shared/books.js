// JS port of kitobklubi/core/books.py: the catalog or a typed book, progress and the pace forecast.
import { InputError, whole, words } from './text.js';

export const PAGES_MIN = 10;
export const PAGES_MAX = 5000;
export const WINDOW = 14;

export const find = (catalog, key) => (typeof key === 'string' ? catalog.find((b) => b.id === key) ?? null : null);

export function validate(d, catalog) {
  if (!d || typeof d !== 'object' || Array.isArray(d)) throw new InputError('book');
  let out;
  if (d.catalog !== undefined && d.catalog !== null) {
    const b = find(catalog, d.catalog);
    if (!b) throw new InputError('book');
    out = { title: b.title, author: b.author, pages: b.pages, catalog: b.id };
  } else {
    out = { title: words(d.title, 2, 120, 'title'), author: words(d.author, 2, 80, 'author'),
      pages: whole(d.pages, PAGES_MIN, PAGES_MAX, 'pages'), catalog: null };
  }
  const start = d.start ?? 0;
  out.start = start === '' ? 0 : whole(start, 0, out.pages - 1, 'start');
  return out;
}

export function progress(pages, page0) {
  const page = Math.max(0, Math.min(page0, pages));
  return { page, pages, left: pages - page, pct: Math.floor((page * 100) / pages) };
}

export function pace(perDay, addedDay, left, today) {
  const span = Math.max(1, Math.min(WINDOW, today - addedDay + 1));
  const read = perDay.reduce((s, [d, p]) => (today - span < d && d <= today ? s + p : s), 0);
  const rate = Math.floor((read * 100) / span);
  if (left <= 0) return { rate, days: 0, day: today };
  if (rate <= 0) return { rate: 0, days: null, day: null };
  const days = Math.floor((left * 100 + rate - 1) / rate);
  return { rate, days, day: today + days };
}

export function askedPages(d, page, pages) {
  if (!d || typeof d !== 'object') throw new InputError('pages');
  if (d.page !== undefined && d.page !== null) {
    const p = whole(d.page, 1, pages, 'page');
    if (p <= page) throw new InputError('page_back');
    return p - page;
  }
  return whole(d.add, 1, PAGES_MAX, 'pages');
}
