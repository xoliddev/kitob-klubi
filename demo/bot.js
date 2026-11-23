// The bot, simulated in the page: the menu with the olov, "Bugun o'qidim" with +10 / +20 / +50, another number or the
// current page (today or yesterday), the club with its leaderboard, the leader's queue, the isbot, and every message
// the real bot sends on its own. The same callback data and texts as kitobklubi/bot; the menu's list screens open the
// Mini App instead. Messages are {id, from: 'bot' | 'me', html, kb, at}.
import { escapeHtml } from '../shared/i18n.js';
import { Refused } from './backend.js';

const strip = (html) => html.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

export class BotSim {
  constructor(backend, uid, t, views, { onChange = () => {}, onAlert = () => {}, onApp = () => {}, verifyLink = () => '' } = {}) {
    Object.assign(this, { b: backend, uid, t, v: views, onChange, onAlert, onApp, verifyLink });
    this.messages = [];
    this.ids = 1;
    this.wait = null; // what typed text means now: {kind: 'add' | 'page' | 'proof', id, day}
  }

  get lang() { return this.b.user(this.uid).lang; }

  push(screen, from = 'bot') {
    const msg = { id: this.ids++, from, html: screen.html, kb: screen.kb ?? [], at: this.b.nowMs() };
    this.messages.push(msg);
    this.onChange();
    return msg;
  }

  show(id, screen) {
    const msg = id && this.messages.find((m) => m.id === id);
    if (!msg) return this.push(screen);
    Object.assign(msg, { html: screen.html, kb: screen.kb ?? [] });
    this.onChange();
    return msg;
  }

  guard(fn) {
    try {
      return fn();
    } catch (e) {
      if (!(e instanceof Refused)) throw e;
      const key = this.t(this.lang, `err.${e.code}`) === `err.${e.code}` ? 'err.generic' : `err.${e.code}`;
      this.onAlert(strip(this.t(this.lang, key)));
      return null;
    }
  }

  menu(id, hello = false) { this.wait = null; return this.show(id, this.v.menu(this.lang, this.b.home(this.uid), hello)); }

  start() {
    this.push({ html: '/start' }, 'me');
    return this.menu(null, true);
  }

  type(text) {
    this.push({ html: escapeHtml(text) }, 'me');
    const w = this.wait;
    if (!w) return this.menu(null);
    return this.guard(() => {
      if (w.kind === 'proof') {
        this.b.writeProof(this.uid, w.id, text);
        this.wait = null;
        return this.push({ html: this.t(this.lang, 'proof.sent'), kb: [] });
      }
      const s = text.replace(/[\s']/g, '');
      const value = /^[0-9]{1,6}$/.test(s) ? Number(s) : text;
      const [out] = this.b.log(this.uid, w.id, { [w.kind]: value, day: w.day });
      this.wait = null;
      return this.push(this.v.logged(this.lang, out, this.b.cap, this.b.today()));
    });
  }

  press(id, data) {
    const r = this.guard(() => this.route(id, String(data)));
    if (r === false) this.onAlert(strip(this.t(this.lang, 'err.stale')));
  }

  route(id, data) {
    let m;
    const lang = this.lang;
    if (data === 'n:menu') return this.menu(id);
    if (data === 'n:lang') { this.b.setLang(this.uid, lang === 'uz' ? 'ru' : 'uz'); return this.menu(id); }
    if (data === 'r') {
      const books = this.b.home(this.uid).books;
      if (!books.length) { this.onApp('#new'); return true; }
      return this.show(id, books.length === 1 ? this.v.logScreen(lang, books[0]) : this.v.chooseBook(lang, books));
    }
    if ((m = /^l:(\d{1,9}):([ty])$/.exec(data))) return this.show(id, this.v.logScreen(lang, this.b.bookView(this.uid, Number(m[1])).book, m[2]));
    if ((m = /^la:(\d{1,9}):(10|20|50):([ty])$/.exec(data))) {
      const [out] = this.b.log(this.uid, Number(m[1]), { add: Number(m[2]), day: m[3] === 'y' ? 'yesterday' : 'today' });
      return this.show(id, this.v.logged(lang, out, this.b.cap, this.b.today()));
    }
    if ((m = /^l([op]):(\d{1,9}):([ty])$/.exec(data))) {
      const book = this.b.bookView(this.uid, Number(m[2])).book;
      this.wait = { kind: m[1] === 'o' ? 'add' : 'page', id: book.id, day: m[3] === 'y' ? 'yesterday' : 'today' };
      return this.push(this.v.text(lang, m[1] === 'o' ? 'log.type_n' : 'log.type_page', { page: book.page, pages: book.pages }));
    }
    if ((m = /^pw:(\d{1,9})$/.exec(data))) {
      const info = this.b.logInfo(this.uid, Number(m[1]));
      if (info.user_id !== this.uid || info.status !== 'asked') return false;
      this.wait = { kind: 'proof', id: info.id };
      return this.push(this.v.text(lang, 'proof.ask'));
    }
    if ((m = /^f([ayn]):(\d{1,9})$/.exec(data))) {
      const lid = Number(m[2]);
      const [view] = m[1] === 'a' ? this.b.askProof(this.uid, lid) : this.b.decide(this.uid, lid, m[1] === 'y');
      return this.show(id, this.v.flags(lang, view));
    }
    if ((m = /^k:(\d{1,9})$/.exec(data))) return this.show(id, this.v.club(lang, this.b.clubView(this.uid, Number(m[1]))));
    if ((m = /^kf:(\d{1,9})$/.exec(data))) return this.show(id, this.v.flags(lang, this.b.clubView(this.uid, Number(m[1]))));
    if ((m = /^c:(\d{1,9})$/.exec(data))) {
      const c = this.b.cert(this.uid, Number(m[1]));
      return this.show(id, this.v.cert(lang, c, this.verifyLink(c.code)));
    }
    return false;
  }

  /** A note the service produced (what the real bot would send on its own). Returns the new message, or null. */
  deliver(n) {
    if (n.to !== this.uid) return null;
    const lang = this.lang;
    const info = () => this.b.logInfo(this.uid, n.log_id);
    const make = {
      nudge: () => this.v.nudge(lang, n),
      flag: () => this.v.flagNote(lang, info()),
      ask: () => this.v.askNote(lang, info()),
      proof: () => this.v.proofNote(lang, info()),
      decided: () => this.v.decidedNote(lang, info(), n.yes),
      marathon: () => this.v.marathonNote(lang, this.b.clubView(this.uid, n.club_id)),
      cert: () => this.v.certNote(lang, this.b.cert(this.uid, n.cert_id)),
      closed: () => this.v.closedNote(lang, this.b.clubView(this.uid, n.club_id), n.winners),
    }[n.type];
    return make ? this.push(make()) : null;
  }
}
