// The in-page backend of the browser demo: the same rules as kitobklubi/ (reading.py, base.py), on plain arrays
// instead of SQLite, with the very same core (shared/*.js) and the same view shapes and error codes, so the real Mini
// App code runs on it unchanged. Clubs, fair play, certificates and the tick are in backend-club.js.
import * as booklib from '../shared/books.js';
import { localDay, localMinute } from '../shared/clock.js';
import * as fair from '../shared/fair.js';
import * as nudge from '../shared/nudge.js';
import * as stats from '../shared/stats.js';
import * as streak from '../shared/streak.js';
import { clean, InputError, sentences, whole } from '../shared/text.js';

export class Refused extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

export function checked(fn) {
  try {
    return fn();
  } catch (e) {
    if (e instanceof InputError) throw new Refused(e.code);
    throw e;
  }
}

export const isId = (v) => Number.isInteger(v) && v > 0 && v < 1e9;
const sum = (xs) => xs.reduce((a, b) => a + b, 0);

export class Backend {
  constructor({ catalog, now = () => Date.now(), cap = fair.DEFAULT_CAP, secret }) {
    Object.assign(this, { catalog, clock: now, cap, secret, offset: 0, listeners: [] });
    Object.assign(this, { users: [], goalRows: [], books: [], logs: [], clubs: [], members: [], marathons: [], certRows: [], sent: new Set() });
    this.next = { book: 1, log: 1, club: 1, marathon: 1, cert: 1 };
  }

  // ── clock and events ──
  nowMs() { return this.clock() + this.offset; }
  advance(ms) { this.offset += ms; this.emit({ type: 'changed' }); }
  today() { return localDay(this.nowMs()); }
  minute() { return localMinute(this.nowMs()); }
  on(fn) { this.listeners.push(fn); }
  emit(ev) { for (const fn of this.listeners) fn(ev); }
  notify(notes) { for (const note of notes) this.emit({ type: 'note', note }); this.emit({ type: 'changed' }); }

  // ── people ──
  user(uid) { return this.users.find((u) => u.id === uid) ?? null; }
  touchUser(uid, name, lang = 'uz') {
    if (!this.user(uid)) this.users.push({ id: uid, name: clean(name, 64) || 'Kitobxon', lang, goal: 10, nudge: null, created_day: this.today() });
    return this.user(uid);
  }

  setLang(uid, lang) {
    if (lang !== 'uz' && lang !== 'ru') throw new Refused('generic');
    this.user(uid).lang = lang;
    return lang;
  }

  roles(uid) { return { leader: this.clubs.filter((k) => k.leader === uid && !k.blocked).map((k) => k.id), admin: false }; }
  me(uid) {
    const u = this.user(uid);
    return { id: uid, name: u.name, lang: u.lang, goal: u.goal, nudge: u.nudge, roles: this.roles(uid), today: this.today(), now: this.nowMs(), cap: this.cap };
  }

  // ── shared queries (base.py) ──
  counted(uid) { return this.logs.filter((l) => l.user_id === uid && l.status !== 'rejected'); }
  totals(uid) {
    const by = new Map();
    for (const l of this.counted(uid)) by.set(l.day, (by.get(l.day) ?? 0) + l.pages);
    return [...by.entries()].sort((a, b) => a[0] - b[0]);
  }

  goals(uid) {
    const rows = this.goalRows.filter((g) => g.user_id === uid).sort((a, b) => a.from_day - b.from_day);
    return rows.length ? rows.map((g) => [g.from_day, g.goal]) : [[0, this.user(uid)?.goal ?? streak.DEFAULT_GOAL]];
  }

  streakOf(uid) { return streak.compute(this.totals(uid), this.goals(uid), this.today()); }
  pageOf(book) { return book.start + sum(this.logs.filter((l) => l.book_id === book.id && l.status !== 'rejected').map((l) => l.pages)); }

  card(book) {
    const prog = booklib.progress(book.pages, this.pageOf(book));
    const today = this.today();
    const by = new Map();
    for (const l of this.logs) if (l.book_id === book.id && l.status !== 'rejected' && l.day > today - booklib.WINDOW) by.set(l.day, (by.get(l.day) ?? 0) + l.pages);
    const pace = booklib.pace([...by.entries()], book.added_day, prog.left, today);
    return { id: book.id, title: book.title, author: book.author, catalog: book.catalog, ...prog, added_day: book.added_day,
      finished_day: book.finished_day, review: book.review, pace };
  }

  ownBook(uid, bid) {
    const book = isId(bid) ? this.books.find((b) => b.id === bid && b.user_id === uid) : null;
    if (!book) throw new Refused('not_found');
    return book;
  }

  // ── reading.py ──
  addBook(uid, data) {
    const b = checked(() => booklib.validate(data, this.catalog));
    const active = this.books.filter((x) => x.user_id === uid && x.finished_day === null);
    if (active.length >= 5) throw new Refused('books_many');
    if (active.some((a) => a.title.toLowerCase() === b.title.toLowerCase())) throw new Refused('book_dup');
    const book = { id: this.next.book++, user_id: uid, catalog: b.catalog, title: b.title, author: b.author, pages: b.pages, start: b.start,
      added_day: this.today(), finished_day: null, review: '' };
    this.books.push(book);
    this.emit({ type: 'changed' });
    return this.card(book);
  }

  active(uid) {
    const last = (b) => Math.max(0, ...this.logs.filter((l) => l.book_id === b.id).map((l) => l.id));
    return this.books.filter((b) => b.user_id === uid && b.finished_day === null).sort((a, b) => last(b) - last(a) || b.id - a.id).map((b) => this.card(b));
  }

  bookList(uid) {
    const done = this.books.filter((b) => b.user_id === uid && b.finished_day !== null).sort((a, b) => b.finished_day - a.finished_day || b.id - a.id);
    return { active: this.active(uid), done: done.slice(0, 50).map((b) => this.card(b)) };
  }

  bookView(uid, bid) {
    const book = this.ownBook(uid, bid);
    const logs = this.logs.filter((l) => l.book_id === book.id).sort((a, b) => b.day - a.day || b.id - a.id).slice(0, 20)
      .map(({ id, day, pages, asked, status, proof }) => ({ id, day, pages, asked, status, proof }));
    return { book: this.card(book), logs, today: this.today() };
  }

  log(uid, bid, data) {
    const today = this.today();
    const d = data && typeof data === 'object' ? data : {};
    let book = this.ownBook(uid, bid);
    if (book.finished_day !== null) throw new Refused('book_done');
    const day = checked(() => fair.dayFor(d.day, today));
    const page = this.pageOf(book);
    const asked = checked(() => booklib.askedPages(d, page, book.pages));
    const totals = this.totals(uid);
    const goals = this.goals(uid);
    const before = sum(totals.filter(([x]) => x === day).map(([, p]) => p));
    const res = checked(() => fair.check(before, Math.min(asked, book.pages - page), this.cap, fair.usual(totals, day), streak.goalOn(goals, day)));
    const old = streak.compute(totals, goals, today);
    const status = res.flag ? 'flagged' : 'ok';
    const row = { id: this.next.log++, user_id: uid, book_id: book.id, day, pages: res.pages, asked, status, proof: '', at: this.nowMs(), decided_by: null };
    this.logs.push(row);
    const log = { id: row.id, day, pages: res.pages, asked, status, capped: res.capped };
    const finished = page + res.pages >= book.pages;
    const notes = [];
    if (finished) {
      book.finished_day = today;
      notes.push(...this.bookCert(uid, book));
    }
    if (res.flag) for (const lead of this.leadersOf(uid)) notes.push({ type: 'flag', to: lead.leader, log_id: log.id, club_id: lead.id });
    const st = this.streakOf(uid);
    book = this.books.find((b) => b.id === book.id);
    const out = { log, book: this.card(book), streak: st, flame: streak.flame(st.streak), finished, lit: old.streak === 0 && st.streak > 0, met_now: !old.met && st.met };
    this.notify(notes);
    return [out, notes];
  }

  leadersOf(uid) {
    const mine = new Set(this.members.filter((m) => m.user_id === uid).map((m) => m.club_id));
    return this.clubs.filter((k) => mine.has(k.id) && !k.blocked && k.leader !== uid).sort((a, b) => a.id - b.id).map((k) => ({ id: k.id, leader: k.leader }));
  }

  review(uid, bid, text) {
    const fikr = checked(() => sentences(text, 3, 400, 3, 'review'));
    const book = this.ownBook(uid, bid);
    if (book.finished_day === null) throw new Refused('not_finished');
    book.review = fikr;
    this.emit({ type: 'changed' });
    return this.card(book);
  }

  setGoal(uid, value) {
    const goal = checked(() => whole(value, 1, 300, 'goal'));
    const u = this.user(uid);
    if (!this.goalRows.some((g) => g.user_id === uid)) this.goalRows.push({ user_id: uid, from_day: 0, goal: u.goal });
    const today = this.today();
    const row = this.goalRows.find((g) => g.user_id === uid && g.from_day === today);
    if (row) row.goal = goal;
    else this.goalRows.push({ user_id: uid, from_day: today, goal });
    u.goal = goal;
    this.emit({ type: 'changed' });
    return this.me(uid);
  }

  setNudge(uid, value) {
    this.user(uid).nudge = checked(() => nudge.valid(value));
    return this.me(uid);
  }

  home(uid) {
    const st = this.streakOf(uid);
    const books = this.active(uid);
    const asks = this.logs.filter((l) => l.user_id === uid && l.status === 'asked').sort((a, b) => a.id - b.id)
      .map((l) => ({ id: l.id, day: l.day, pages: l.pages, title: this.books.find((b) => b.id === l.book_id).title }));
    return { me: this.me(uid), streak: st, flame: streak.flame(st.streak), books, current: books.length ? books[0].id : null, asks,
      done: this.books.filter((b) => b.user_id === uid && b.finished_day !== null).length, certs: this.certRows.filter((c) => c.user_id === uid).length,
      clubs: this.members.filter((m) => m.user_id === uid).length };
  }

  stats(uid) {
    const today = this.today();
    const totals = this.totals(uid);
    const goals = this.goals(uid);
    const done = this.books.filter((b) => b.user_id === uid && b.finished_day !== null).sort((a, b) => b.finished_day - a.finished_day || b.id - a.id)
      .map(({ id, title, author, finished_day: f, review }) => ({ id, title, author, finished_day: f, review }));
    const st = streak.compute(totals, goals, today);
    return { streak: st, flame: streak.flame(st.streak), weekly: stats.weekly(totals, today), heatmap: stats.heatmap(totals, goals, st.used, today),
      authors: stats.authors(done), summary: stats.summary(totals, done.length), finished: done.slice(0, 20), today };
  }
}
