// The Mini App's API, answered by the in-browser backend instead of HTTP (same method names as webapp/api.js and the
// same shapes and error codes as the server), so the Mini App code is identical in Telegram and in the demo.
export function run(fn) {
  return Promise.resolve().then(() => {
    try {
      return structuredClone(fn());
    } catch (e) {
      if (!e.code) throw e;
      throw Object.assign(new Error(e.code), { code: e.code });
    }
  });
}

export function apiFor(b, uid, { onPng = () => {} } = {}) {
  const n = Number;
  return {
    me: () => run(() => b.me(uid)),
    setLang: (lang) => run(() => ({ lang: b.setLang(uid, lang) })),
    home: () => run(() => b.home(uid)),
    books: () => run(() => b.bookList(uid)),
    addBook: (book) => run(() => b.addBook(uid, book)),
    book: (bid) => run(() => b.bookView(uid, n(bid))),
    log: (bid, data) => run(() => b.log(uid, n(bid), data)[0]),
    review: (bid, text) => run(() => b.review(uid, n(bid), text)),
    setGoal: (goal) => run(() => b.setGoal(uid, goal)),
    setNudge: (nudge) => run(() => b.setNudge(uid, nudge)),
    stats: () => run(() => b.stats(uid)),
    clubs: () => run(() => ({ items: b.myClubs(uid) })),
    createClub: (name) => run(() => b.createClub(uid, name)),
    join: (code) => run(() => b.join(uid, code)),
    club: (cid) => run(() => b.clubView(uid, n(cid))),
    leave: (cid) => run(() => { b.leave(uid, n(cid)); return { items: b.myClubs(uid) }; }),
    marathon: (cid, marathon) => run(() => b.createMarathon(uid, n(cid), marathon)[0]),
    clubSettings: (cid, data) => run(() => b.clubSettings(uid, n(cid), data)),
    removeMember: (cid, member) => run(() => b.removeMember(uid, n(cid), n(member))),
    askProof: (lid) => run(() => b.askProof(uid, n(lid))[0]),
    proof: (lid, text) => run(() => b.writeProof(uid, n(lid), text)[0]),
    decide: (lid, accept) => run(() => b.decide(uid, n(lid), accept)[0]),
    certs: () => run(() => ({ items: b.certs(uid) })),
    cert: (cid) => run(() => b.cert(uid, n(cid))),
    certPng: (cid, png) => run(() => { const c = b.cert(uid, n(cid)); onPng(c, png); return { sent: true }; }),
    verify: (code) => run(() => b.verify(code)),
  };
}
