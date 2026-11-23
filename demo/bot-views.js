// The bot's screens for the demo, built like kitobklubi/bot/views.py and views_club.py from the same locale files:
// the menu with the olov, logging, the answer to a log, a club with its leaderboard, the fair-play queue, a
// certificate, and the messages the bot sends on its own. Screens are {html, kb: [[{text, data} | {text, app}]]}.
import { hhmm } from '../shared/clock.js';
import { dateShort, escapeHtml, freezeLine, marState, paceLine, progressBar, Raw, savedLine, streakLine, todayLine, usualText } from '../shared/i18n.js';

export function makeViews(t) {
  const btn = (label, data) => (data.startsWith('@app') ? { text: label, app: data.slice(4) } : { text: label, data });
  const screen = (lines, rows) => ({ html: Array.isArray(lines) ? lines.join('\n') : lines, kb: rows.map((r) => r.map(([l, d]) => btn(l, d))) });
  const back = (lang, data = 'n:menu') => [[t(lang, 'btn.back'), data]];
  const d = (lang, day) => new Raw(dateShort(t, lang, day));
  const bookLine = (lang, c) => `📖 «${escapeHtml(c.title)}» ${progressBar(c.pct)} ${t(lang, 'book.progress', { page: c.page, pages: c.pages, pct: c.pct })}`;

  function statusLines(lang, st) {
    const lines = [streakLine(t, lang, st), todayLine(t, lang, st)];
    const saved = savedLine(t, lang, st);
    if (saved) lines.push(`${saved} ${t(lang, 'streak.saved_hint')}`);
    if (st.streak > 0) lines.push(freezeLine(t, lang, st));
    return lines;
  }

  function menu(lang, home, hello = false) {
    const lines = hello ? [t(lang, 'menu.hello', { name: home.me.name })] : [];
    lines.push(...statusLines(lang, home.streak));
    const books = home.books.slice(0, 3).map((b) => bookLine(lang, b));
    lines.push(...(books.length ? books : [t(lang, 'book.none')]));
    if (home.asks.length) lines.push(t(lang, 'menu.asks', { n: home.asks.length }));
    const rows = [[[t(lang, 'btn.read'), 'r']]];
    if (home.asks.length) rows.push([[t(lang, 'btn.write_proof'), `pw:${home.asks[0].id}`]]);
    rows.push([[t(lang, 'btn.books'), '@app#books'], [t(lang, 'btn.add'), '@app#new']], [[t(lang, 'btn.clubs'), '@app#clubs'], [t(lang, 'btn.certs'), '@app#more']],
      [[t(lang, 'btn.settings'), '@app#more'], [t(lang, 'btn.lang'), 'n:lang']], [[t(lang, 'btn.app'), '@app']]);
    return screen(lines, rows);
  }

  function chooseBook(lang, books) {
    return screen(t(lang, 'log.which'), [...books.map((b) => [[`📖 ${b.title} · ${b.page}/${b.pages}`, `l:${b.id}:t`]]), back(lang)]);
  }

  function logScreen(lang, c, flag = 't') {
    const other = flag === 'y' ? ['btn.today', `l:${c.id}:t`] : ['btn.yesterday', `l:${c.id}:y`];
    return screen(t(lang, flag === 'y' ? 'log.ask_y' : 'log.ask', { title: c.title, page: c.page, pages: c.pages }),
      [[10, 20, 50].map((n) => [`+${n}`, `la:${c.id}:${n}:${flag}`]), [[t(lang, 'btn.other'), `lo:${c.id}:${flag}`], [t(lang, 'btn.page'), `lp:${c.id}:${flag}`]],
        [[t(lang, other[0]), other[1]]], back(lang)]);
  }

  function logged(lang, out, cap, today) {
    const { log, streak: st, book: c } = out;
    const lines = [t(lang, log.day < today ? 'log.saved_y' : 'log.saved', { n: log.pages, title: c.title })];
    if (log.capped) lines.push(t(lang, 'log.capped', { cap, asked: log.asked, n: log.pages }));
    else if (log.status === 'flagged') lines.push(t(lang, 'log.flagged'));
    if (out.lit) lines.push(t(lang, 'log.lit'));
    else if (out.met_now) lines.push(t(lang, 'log.met', { n: st.streak }));
    if (out.met_now && st.earned.length && st.earned.at(-1) === today) lines.push(t(lang, 'log.earned', { n: st.freezes }));
    lines.push(todayLine(t, lang, st));
    if (out.finished) {
      lines.push('', t(lang, 'book.finished', { title: c.title }), t(lang, 'review.ask'));
      return screen(lines, [[[t(lang, 'btn.review'), `@app#b=${c.id}`]], [[t(lang, 'btn.skip'), 'n:menu']]]);
    }
    lines.push(bookLine(lang, c), paceLine(t, lang, c, today));
    return screen(lines, [[[t(lang, 'btn.read'), `l:${c.id}:t`]], [[t(lang, 'btn.menu'), 'n:menu']]]);
  }

  function boardLines(lang, v) {
    const out = v.board.slice(0, 10).map((r) => {
      const marks = [['board.done', r.done], ['board.check', r.flags > 0], ['board.behind', r.behind]].filter(([, on]) => on).map(([k]) => ` ${t(lang, k)}`).join('');
      const line = t(lang, 'board.row', { rank: r.rank, name: r.name, pages: r.pages, streak: r.streak }) + marks;
      return r.me ? `<b>${line}</b>` : line;
    });
    return out.length ? out : [t(lang, 'board.empty')];
  }

  function club(lang, v) {
    const k = v.club;
    const m = v.marathon;
    const lines = [t(lang, 'club.head', { name: k.name, leader: k.leader_name, n: k.members })];
    if (m) {
      lines.push('', t(lang, 'mar.head', { title: m.title, start: d(lang, m.start), end: d(lang, m.end) }), marState(t, lang, m));
      if (m.state === 'live') lines.push(t(lang, 'mar.expected', { n: m.expected }));
      if (v.me) lines.push(t(lang, 'board.me', { rank: v.me.rank, pages: v.me.pages, goal: m.goal, pct: v.me.pct }));
      lines.push('', ...boardLines(lang, v));
    } else lines.push(t(lang, 'club.no_marathon'));
    const rows = k.is_leader ? [[[t(lang, 'btn.flags', { n: v.flags.length }), `kf:${k.id}`]]] : [];
    return screen(lines, [...rows, [[t(lang, 'btn.app'), `@app#k=${k.id}`]], back(lang)]);
  }

  const judgeRows = (lang, id, ask) => [[...(ask ? [[t(lang, 'btn.ask_proof'), `fa:${id}`]] : []), [t(lang, 'btn.accept'), `fy:${id}`], [t(lang, 'btn.reject'), `fn:${id}`]]];

  function flags(lang, v) {
    const lines = [t(lang, 'flags.head')];
    const rows = [];
    for (const f of v.flags.slice(0, 5)) {
      lines.push('', t(lang, 'flag.row', { name: f.name, date: d(lang, f.day), title: f.title, asked: f.asked, pages: f.pages, usual: new Raw(usualText(t, lang, f.usual)) }));
      if (f.proof) lines.push(t(lang, 'flag.proof', { proof: f.proof }));
      rows.push(...judgeRows(lang, f.id, f.status === 'flagged'));
    }
    if (!v.flags.length) lines.push(t(lang, 'flags.none'));
    return screen(lines, [...rows, back(lang, `k:${v.club.id}`)]);
  }

  const certText = (lang, c) => t(lang, 'cert.text', { title: c.title, name: c.name, pages: c.pages, days: c.days, club: c.club, date: d(lang, c.issued_day), code: c.code });

  return {
    menu, chooseBook, logScreen, logged, club, flags,
    text: (lang, key, params) => screen(t(lang, key, params), []),
    cert: (lang, c, link) => screen([certText(lang, c), ...(link ? [t(lang, 'cert.link', { link })] : [])], [[[t(lang, 'btn.app'), `@app#c=${c.id}`]], back(lang)]),
    nudge: (lang, n) => screen(t(lang, n.streak > 0 ? 'nudge.streak' : 'nudge.start', { left: n.left }), [[[t(lang, 'btn.read'), 'r']]]),
    flagNote: (lang, l) => screen(t(lang, 'note.flag', { name: l.name, date: d(lang, l.day), pages: l.pages, asked: l.asked, usual: new Raw(usualText(t, lang, l.usual)) }),
      judgeRows(lang, l.id, l.status === 'flagged')),
    askNote: (lang, l) => screen(t(lang, 'note.ask', { date: d(lang, l.day), title: l.title, pages: l.pages }), [[[t(lang, 'btn.write_proof'), `pw:${l.id}`]]]),
    proofNote: (lang, l) => screen(t(lang, 'note.proof', { name: l.name, date: d(lang, l.day), pages: l.pages, proof: l.proof }), judgeRows(lang, l.id, false)),
    decidedNote: (lang, l, yes) => screen(t(lang, yes ? 'note.decided_yes' : 'note.decided_no', { date: d(lang, l.day), pages: l.pages }), [[[t(lang, 'btn.menu'), 'n:menu']]]),
    marathonNote: (lang, v) => screen(t(lang, 'note.marathon', { club: v.club.name, title: v.marathon.title, start: d(lang, v.marathon.start), end: d(lang, v.marathon.end),
      goal: v.marathon.goal }), [[[t(lang, 'btn.club'), `k:${v.club.id}`]]]),
    certNote: (lang, c) => screen(t(lang, 'note.cert', { title: c.title }), [[[t(lang, 'btn.cert'), `c:${c.id}`]]]),
    closedNote: (lang, v, n) => screen(t(lang, 'note.closed', { title: v.marathon.title, n }), [[[t(lang, 'btn.club'), `k:${v.club.id}`]]]),
    time: hhmm,
  };
}
