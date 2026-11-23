// The demo backend's clubs, marathons, fair play, certificates and tick: clubs.py, fairplay.py, certs.py and
// ticking.py on plain arrays, with the same core and the same answers.
import * as cert from '../shared/cert.js';
import * as fair from '../shared/fair.js';
import * as mlib from '../shared/marathon.js';
import * as nudge from '../shared/nudge.js';
import { sentences, words } from '../shared/text.js';
import { Backend, checked, isId, Refused } from './backend.js';

const FLAG_STATES = ['flagged', 'asked', 'proof'];
const rand5 = () => crypto.getRandomValues(new Uint8Array(5));

export function normCode(text) {
  if (typeof text !== 'string' || text.length > 24) return null;
  const s = text.trim().toUpperCase().replace(/[- ]/g, '');
  return s.length === 8 && [...s].every((c) => cert.ALPHABET.includes(c)) ? s : null;
}

function mview(m, today) {
  const core = { start: m.start_day, end: m.end_day, goal: m.goal };
  return { id: m.id, title: m.title, start: m.start_day, end: m.end_day, goal: m.goal, days: m.end_day - m.start_day + 1, state: mlib.state(core, today),
    elapsed: mlib.elapsed(core, today), expected: mlib.expected(core, today), closed: Boolean(m.closed), in: Math.max(0, m.start_day - today) };
}

Object.assign(Backend.prototype, {
  isMember(cid, uid) { return this.members.some((m) => m.club_id === cid && m.user_id === uid); },
  membersOf(cid) { return this.members.filter((m) => m.club_id === cid); },
  latest(cid) { return this.marathons.filter((m) => m.club_id === cid).sort((a, b) => b.id - a.id)[0] ?? null; },

  clubOf(uid, cid) {
    const club = isId(cid) ? this.clubs.find((k) => k.id === cid && !k.blocked) : null;
    if (club && club.leader === uid) return [club, true];
    if (club && this.isMember(cid, uid)) return [club, false];
    throw new Refused('not_found');
  },

  led(uid, cid) {
    const [club, lead] = this.clubOf(uid, cid);
    if (!lead) throw new Refused('not_found');
    return club;
  },

  newCode() {
    for (;;) {
      const code = cert.codeFrom(rand5().reduce((n, b) => n * 256 + b, 0));
      if (!this.clubs.some((k) => k.code === code)) return code;
    }
  },

  createClub(uid, name) {
    const title = checked(() => words(name, 3, 60, 'club_name'));
    if (this.clubs.filter((k) => k.leader === uid).length >= 3) throw new Refused('limit');
    const club = { id: this.next.club++, leader: uid, name: title, code: this.newCode(), book_certs: false, blocked: false, created_day: this.today() };
    this.clubs.push(club);
    this.emit({ type: 'changed' });
    return this.clubView(uid, club.id);
  },

  myClubs(uid) {
    return this.clubs.filter((k) => !k.blocked && (k.leader === uid || this.isMember(k.id, uid))).sort((a, b) => a.id - b.id).map((k) => {
      const m = this.latest(k.id);
      return { id: k.id, name: k.name, leader_name: this.user(k.leader).name, is_leader: k.leader === uid, members: this.membersOf(k.id).length,
        marathon: m ? mview(m, this.today()) : null };
    });
  },

  join(uid, text) {
    const code = normCode(text);
    const club = code ? this.clubs.find((k) => k.code === code && !k.blocked) : null;
    if (!club) throw new Refused('club_code');
    if (club.leader !== uid && !this.isMember(club.id, uid)) {
      this.members.push({ club_id: club.id, user_id: uid, joined_day: this.today() });
      this.emit({ type: 'changed' });
    }
    return this.clubView(uid, club.id);
  },

  leave(uid, cid) {
    const [, lead] = this.clubOf(uid, cid);
    if (lead) throw new Refused('generic');
    this.members = this.members.filter((m) => !(m.club_id === cid && m.user_id === uid));
    this.emit({ type: 'changed' });
  },

  removeMember(uid, cid, member) {
    this.led(uid, cid);
    if (!this.isMember(cid, member)) throw new Refused('not_found');
    this.members = this.members.filter((m) => !(m.club_id === cid && m.user_id === member));
    this.emit({ type: 'changed' });
    return this.clubView(uid, cid);
  },

  clubSettings(uid, cid, data) {
    const club = this.led(uid, cid);
    const d = data && typeof data === 'object' ? data : {};
    if (d.code === true) club.code = this.newCode();
    if (typeof d.book_certs === 'boolean') club.book_certs = d.book_certs;
    this.emit({ type: 'changed' });
    return this.clubView(uid, cid);
  },

  createMarathon(uid, cid, data) {
    const m = checked(() => mlib.validate(data, this.today()));
    this.led(uid, cid);
    if (this.marathons.some((x) => x.club_id === cid && !x.closed)) throw new Refused('marathon_live');
    this.marathons.push({ id: this.next.marathon++, club_id: cid, title: m.title, start_day: m.start, end_day: m.end, goal: m.goal, closed: false });
    const notes = this.membersOf(cid).map((r) => ({ type: 'marathon', to: r.user_id, club_id: cid }));
    const view = this.clubView(uid, cid);
    this.notify(notes);
    return [view, notes];
  },

  boardRows(club, m) {
    const last = Math.min(m.end_day, this.today());
    const rows = this.membersOf(club.id).map(({ user_id: id }) => {
      const mine = this.counted(id).filter((l) => l.day >= m.start_day && l.day <= last);
      return { id, name: this.user(id).name, pages: mine.reduce((s, l) => s + l.pages, 0), flags: mine.filter((l) => FLAG_STATES.includes(l.status)).length,
        books: this.books.filter((b) => b.user_id === id && b.finished_day !== null && b.finished_day >= m.start_day && b.finished_day <= last).length,
        streak: this.streakOf(id).streak };
    });
    return mlib.board(rows, { start: m.start_day, end: m.end_day, goal: m.goal }, this.today());
  },

  clubView(uid, cid) {
    const today = this.today();
    const [club, lead] = this.clubOf(uid, cid);
    const m = this.latest(club.id);
    const board = m ? this.boardRows(club, m) : [];
    const members = m ? [] : this.membersOf(club.id).map((r) => ({ id: r.user_id, name: this.user(r.user_id).name, streak: this.streakOf(r.user_id).streak }))
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const r of board) {
      r.me = r.id === uid;
      if (!lead) delete r.behind;
    }
    const info = { id: club.id, name: club.name, leader_name: this.user(club.leader).name, is_leader: lead, members: this.membersOf(club.id).length,
      book_certs: club.book_certs };
    if (lead) info.code = club.code;
    return { club: info, marathon: m ? mview(m, today) : null, board, members, me: board.find((r) => r.me) ?? null, flags: lead ? this.flags(club) : [],
      presets: mlib.PRESETS, today };
  },

  // ── fairplay.py ──
  flags(club) {
    return this.logs.filter((l) => FLAG_STATES.includes(l.status) && l.day >= this.today() - 30 && this.isMember(club.id, l.user_id)).sort((a, b) => a.id - b.id)
      .map((l) => ({ id: l.id, user_id: l.user_id, day: l.day, pages: l.pages, asked: l.asked, status: l.status, proof: l.proof, name: this.user(l.user_id).name,
        title: this.books.find((b) => b.id === l.book_id).title, usual: fair.usual(this.totals(l.user_id), l.day), capped: l.pages < l.asked }));
  },

  reviewable(leader, logId) {
    const log = isId(logId) ? this.logs.find((l) => l.id === logId) : null;
    const club = log && this.clubs.filter((k) => k.leader === leader && !k.blocked && this.isMember(k.id, log.user_id)).sort((a, b) => a.id - b.id)[0];
    if (!club) throw new Refused('not_found');
    return [log, club];
  },

  askProof(uid, logId) {
    const [log, club] = this.reviewable(uid, logId);
    if (log.status !== 'flagged') throw new Refused('decided');
    log.status = 'asked';
    const notes = [{ type: 'ask', to: log.user_id, log_id: log.id, club_id: club.id }];
    const view = this.clubView(uid, club.id);
    this.notify(notes);
    return [view, notes];
  },

  writeProof(uid, logId, text) {
    const proof = checked(() => sentences(text, 10, 300, 2, 'proof'));
    const log = isId(logId) ? this.logs.find((l) => l.id === logId && l.user_id === uid) : null;
    if (!log) throw new Refused('not_found');
    if (log.status !== 'asked') throw new Refused('decided');
    Object.assign(log, { status: 'proof', proof });
    const notes = this.leadersOf(uid).map((k) => ({ type: 'proof', to: k.leader, log_id: log.id, club_id: k.id }));
    this.notify(notes);
    return [{ id: log.id, status: 'proof', proof }, notes];
  },

  decide(uid, logId, accept) {
    if (typeof accept !== 'boolean') throw new Refused('generic');
    const [log, club] = this.reviewable(uid, logId);
    if (!FLAG_STATES.includes(log.status)) throw new Refused('decided');
    Object.assign(log, { status: accept ? 'ok' : 'rejected', decided_by: uid });
    const book = this.books.find((b) => b.id === log.book_id);
    if (!accept && book.finished_day !== null && this.pageOf(book) < book.pages) book.finished_day = null;
    const notes = [{ type: 'decided', to: log.user_id, log_id: log.id, yes: accept }];
    const view = this.clubView(uid, club.id);
    this.notify(notes);
    return [view, notes];
  },

  logInfo(uid, logId) {
    const log = isId(logId) ? this.logs.find((l) => l.id === logId) : null;
    if (!log) throw new Refused('not_found');
    const out = { ...log, title: this.books.find((b) => b.id === log.book_id).title, name: this.user(log.user_id).name };
    if (log.user_id !== uid) {
      this.reviewable(uid, logId);
      out.usual = fair.usual(this.totals(log.user_id), log.day);
    }
    return out;
  },

  // ── certs.py ──
  issue(uid, kind, ref, title, pages, days, club) {
    if (this.certRows.some((c) => c.ref === ref)) return null;
    // The server draws 5 random bytes; the demo derives them from the achievement, so the same story always gives the
    // same code and a "?v=" link to this page can replay the story and check it.
    let nonce = cert.hex(cert.sha256(`demo:${ref}`).slice(0, 5));
    while (this.certRows.some((c) => c.nonce === nonce)) nonce = cert.hex(cert.sha256(`demo:${nonce}`).slice(0, 5));
    const row = { id: this.next.cert++, nonce, user_id: uid, kind, ref, name: this.user(uid).name, title, pages, days, club, issued_day: this.today() };
    this.certRows.push(row);
    return row.id;
  },

  bookCert(uid, book) {
    const mine = new Set(this.members.filter((m) => m.user_id === uid).map((m) => m.club_id));
    const club = this.clubs.filter((k) => mine.has(k.id) && k.book_certs && !k.blocked).sort((a, b) => a.id - b.id)[0];
    if (!club) return [];
    const id = this.issue(uid, 'book', `b:${book.id}`, `${book.title} — ${book.author}`, book.pages, book.finished_day - book.added_day + 1, club.name);
    return id ? [{ type: 'cert', to: uid, cert_id: id }] : [];
  },

  closeMarathons() {
    const notes = [];
    for (const m of this.marathons.filter((x) => !x.closed && x.end_day < this.today())) {
      const club = this.clubs.find((k) => k.id === m.club_id);
      let winners = 0;
      for (const { user_id: uid } of this.membersOf(m.club_id)) {
        const mine = this.counted(uid).filter((l) => l.day >= m.start_day && l.day <= m.end_day);
        const pages = mine.reduce((s, l) => s + l.pages, 0);
        if (pages < m.goal) continue;
        winners += 1;
        const id = this.issue(uid, 'marathon', `m:${m.id}:${uid}`, m.title, pages, new Set(mine.map((l) => l.day)).size, club.name);
        if (id) notes.push({ type: 'cert', to: uid, cert_id: id });
      }
      m.closed = true;
      notes.push({ type: 'closed', to: club.leader, club_id: club.id, winners });
    }
    return notes;
  },

  certView(row, withCode = true) {
    const out = { id: row.id, kind: row.kind, name: row.name, title: row.title, pages: row.pages, days: row.days, club: row.club, issued_day: row.issued_day };
    if (withCode) {
      const nonce = new Uint8Array(row.nonce.match(/../g).map((x) => parseInt(x, 16)));
      out.code = cert.pretty(cert.make(this.secret, nonce));
    }
    return out;
  },

  certs(uid) { return this.certRows.filter((c) => c.user_id === uid).sort((a, b) => b.id - a.id).map((c) => this.certView(c)); },
  cert(uid, cid) {
    const row = isId(cid) ? this.certRows.find((c) => c.id === cid && c.user_id === uid) : null;
    if (!row) throw new Refused('not_found');
    return this.certView(row);
  },

  verify(code) {
    const nonce = cert.nonceOf(this.secret, code);
    const row = nonce ? this.certRows.find((c) => c.nonce === nonce) : null;
    if (!row) throw new Refused('cert_unknown');
    const { id, ...view } = this.certView(row, false); // eslint-disable-line no-unused-vars
    return { ok: true, cert: { ...view, code: cert.pretty(cert.norm(code)) } };
  },

  // ── ticking.py ──
  tick() {
    const notes = [];
    const minute = this.minute();
    const today = this.today();
    if (!nudge.quiet(minute)) {
      for (const u of this.users.filter((x) => x.id > 0 && x.nudge !== null && x.nudge <= minute)) {
        const st = this.streakOf(u.id);
        const key = `${u.id}:${nudge.key(today)}`;
        if (!nudge.due(minute, minute, st.met) || this.sent.has(key)) continue;
        this.sent.add(key);
        notes.push({ type: 'nudge', to: u.id, left: st.left, streak: st.streak });
      }
    }
    notes.push(...this.closeMarathons());
    if (notes.length) this.notify(notes);
    return notes;
  },
});

export { Backend, Refused };
