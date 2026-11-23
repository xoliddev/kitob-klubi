// The demo backend's certificates and tick: certs.py and ticking.py on plain arrays, with the same core and answers.
import * as cert from '../shared/cert.js';
import * as nudge from '../shared/nudge.js';
import { Backend, isId, Refused } from './backend.js';

Object.assign(Backend.prototype, {
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
    const days = new Set(this.logs.filter((l) => l.book_id === book.id && l.status !== 'rejected').map((l) => l.day)).size;
    const id = this.issue(uid, 'book', `b:${book.id}`, `${book.title} — ${book.author}`, book.pages, days, club.name);
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
