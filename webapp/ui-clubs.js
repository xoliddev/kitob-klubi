// The "Klublar" tab: my clubs, joining by code, opening a club; one club with its marathon and the live leaderboard;
// for the leader: the fair-play queue (ask for an isbot, accept, reject), a new marathon, members, the code.
import { dateShort, marState } from '../shared/i18n.js';
import { PRESETS } from '../shared/marathon.js';
import { barSvg } from './draw.js';
import { h, haptic, num, plain } from './util.js';

const field = (label, input) => h('label', { class: 'g-field' }, label, input);

export function clubScreens(ctx, nav) {
  const date = (d) => plain(dateShort(ctx.T, ctx.lang, d));
  const pretty = (code) => `${code.slice(0, 4)}-${code.slice(4)}`;

  const clubs = () => {
    let items = [];
    const load = async () => { items = (await ctx.api.clubs()).items; };
    const code = h('input', { maxlength: 12, placeholder: 'ZYKB-7M2Q', autocapitalize: 'characters', 'data-testid': 'join-code' });
    const name = h('input', { maxlength: 60, 'data-testid': 'club-name' });
    return {
      name: 'clubs', load, poll: async () => { const b = JSON.stringify(items); await load(); return b !== JSON.stringify(items); },
      render: () => h('div', { class: 'g-screen', 'data-testid': 'clubs' },
        items.map((k) => h('button', { class: 'k-card', type: 'button', 'data-testid': `club-${k.id}`, onclick: () => nav.show(club(k.id)) },
          h('b', {}, k.name), h('small', {}, `${k.leader_name} · ${k.members} · ${k.is_leader ? ctx.P('club.leader_badge') : ''}`),
          k.marathon && !k.marathon.closed ? h('span', { class: 'g-pill amber' }, `🏁 ${k.marathon.title} · ${plain(marState(ctx.T, ctx.lang, k.marathon))}`) : null)),
        items.length ? null : h('p', { class: 'g-empty' }, ctx.P('club.none')),
        h('form', { class: 'g-card g-form', onsubmit: async (e) => {
          e.preventDefault();
          const v = await nav.run(() => ctx.api.join(code.value));
          if (v) { haptic(ctx.tg, 'success'); ctx.toast(ctx.P('join.done', { name: v.club.name })); await nav.show(club(v.club.id)); }
        } }, field(ctx.P('app.join_code'), code), h('button', { class: 'g-btn primary', type: 'submit', 'data-testid': 'join-send' }, ctx.P('btn.join'))),
        h('form', { class: 'g-card g-form', onsubmit: async (e) => {
          e.preventDefault();
          const v = await nav.run(() => ctx.api.createClub(name.value));
          if (v) await nav.show(club(v.club.id));
        } }, field(ctx.P('app.club_name'), name), h('button', { class: 'g-btn', type: 'submit', 'data-testid': 'club-create' }, ctx.P('btn.create')))),
    };
  };

  const club = (cid) => {
    let v = null;
    const load = async () => { v = await ctx.api.club(cid); };
    const act = async (fn, msg) => { const out = await nav.run(fn); if (out) { if (msg) ctx.toast(msg); await load(); nav.rerender(); } };

    function marathon(m) {
      const me = v.me;
      const expPct = Math.min(100, Math.floor((m.expected * 100) / m.goal));
      return h('section', { class: 'g-card mar', 'data-testid': 'marathon' },
        h('div', { class: 'g-card-head' }, h('b', {}, `🏁 ${m.title}`), h('span', { class: 'g-pill' }, plain(marState(ctx.T, ctx.lang, m)))),
        h('small', {}, `${date(m.start)} — ${date(m.end)} · ${ctx.P('fmt.pages', { n: m.goal })}`),
        me ? [barSvg(me.pct, m.state === 'live' ? expPct : null), h('b', { 'data-testid': 'my-rank' }, ctx.P('board.me', { rank: me.rank, pages: me.pages, goal: m.goal, pct: me.pct }))] : null,
        m.state === 'live' ? h('small', { 'data-testid': 'expected' }, ctx.P('mar.expected', { n: m.expected })) : null,
        m.state === 'over' && !me?.done ? h('small', {}, ctx.P('app.pending_cert')) : null);
    }

    function board() {
      return h('ol', { class: 'board', 'data-testid': 'board' }, v.board.map((r) => h('li', { class: `${r.me ? 'me' : ''}`, 'data-testid': `row-${r.id}` },
        h('span', { class: 'rk' }, String(r.rank)),
        h('span', { class: 'who' }, h('b', {}, r.name), barSvg(r.pct)),
        h('span', { class: 'pg' }, h('b', {}, String(r.pages)), h('small', {}, `🔥${r.streak}`)),
        h('span', { class: 'mk' }, r.done ? '🏅' : '', r.flags ? h('span', { title: ctx.P('board.check') }, '🔎') : '',
          r.behind ? h('span', { class: 'behind', title: ctx.P('board.behind'), 'data-testid': `behind-${r.id}` }, '⚠️') : ''))));
    }

    function flags() {
      if (!v.flags.length) return h('p', { class: 'g-hint' }, ctx.P('flags.none'));
      return v.flags.map((f) => h('section', { class: 'g-card flag', 'data-testid': `flag-${f.id}` },
        h('b', {}, `${f.name} · ${date(f.day)}`), h('small', {}, `«${f.title}»`),
        h('p', {}, ctx.P('flag.line', { asked: f.asked, pages: f.pages, usual: f.usual === null ? ctx.P('flag.usual_none') : ctx.P('fmt.rate', { n: f.usual }) })),
        f.proof ? h('q', { 'data-testid': `proof-${f.id}` }, f.proof) : null,
        h('div', { class: 'g-row' }, f.status === 'flagged' ? h('button', { class: 'g-btn small', type: 'button', 'data-testid': `flag-ask-${f.id}`,
          onclick: () => act(() => ctx.api.askProof(f.id)) }, ctx.P('btn.ask_proof')) : h('span', { class: 'g-pill' }, ctx.P(`status.${f.status}`)),
        h('button', { class: 'g-btn small primary', type: 'button', 'data-testid': `flag-yes-${f.id}`, onclick: () => act(() => ctx.api.decide(f.id, true)) }, ctx.P('btn.accept')),
        h('button', { class: 'g-btn small danger', type: 'button', 'data-testid': `flag-no-${f.id}`, onclick: () => act(() => ctx.api.decide(f.id, false)) }, ctx.P('btn.reject')))));
    }

    function newMarathon() {
      const f = { title: h('input', { maxlength: 60, 'data-testid': 'm-title' }), days: h('input', { inputmode: 'numeric', maxlength: 3, 'data-testid': 'm-days' }),
        goal: h('input', { inputmode: 'numeric', maxlength: 5, 'data-testid': 'm-goal' }) };
      let startIn = 0;
      const fill = (d, g) => { f.title.value = ctx.P('mar.title', { days: d, goal: g }); f.days.value = String(d); f.goal.value = String(g); };
      return h('form', { class: 'g-card g-form', 'data-testid': 'm-form', onsubmit: (e) => {
        e.preventDefault();
        act(() => ctx.api.marathon(cid, { title: f.title.value, days: num(f.days.value), goal: num(f.goal.value), start_in: startIn }), ctx.P('mar.created'));
      } }, h('b', {}, ctx.P('btn.marathon')),
      h('div', { class: 'g-row' }, PRESETS.map(([d, g], i) => h('button', { class: 'g-btn small ghost', type: 'button', 'data-testid': `m-preset-${i}`, onclick: () => fill(d, g) },
        ctx.P('mar.title', { days: d, goal: g })))),
      field(ctx.P('app.f_mtitle'), f.title), h('div', { class: 'g-two' }, field(ctx.P('app.f_days'), f.days), field(ctx.P('app.f_goal'), f.goal)),
      h('div', { class: 'g-seg' }, [0, 1].map((n) => h('label', {}, h('input', { type: 'radio', name: 'mstart', checked: n === 0, onchange: () => { startIn = n; } }),
        h('span', {}, ctx.P(`app.start_${n}`))))),
      h('button', { class: 'g-btn primary', type: 'submit', 'data-testid': 'm-save' }, ctx.P('app.save')));
    }

    function leaderTools() {
      const k = v.club;
      const people = v.board.length ? v.board : v.members;
      const link = ctx.links.join?.(k.code) ?? '';
      return [h('h2', { class: 'g-h2' }, `${ctx.P('app.flags')} (${v.flags.length})`), flags(),
        !v.marathon || v.marathon.closed ? newMarathon() : null,
        h('h2', { class: 'g-h2' }, ctx.P('app.leader_tools')),
        h('section', { class: 'g-card', 'data-testid': 'club-code' }, h('span', { class: 'g-label' }, ctx.P('app.join_code')),
          h('b', { class: 'code', 'data-testid': 'code' }, pretty(k.code)), link ? h('small', { class: 'link' }, link) : null,
          h('div', { class: 'g-row' }, h('button', { class: 'g-btn small', type: 'button', onclick: () => act(() => ctx.api.clubSettings(cid, { code: true })) }, ctx.P('btn.code')),
            h('button', { class: 'g-btn small ghost', type: 'button', 'data-testid': 'book-certs', onclick: () => act(() => ctx.api.clubSettings(cid, { book_certs: !k.book_certs })) },
              ctx.P(k.book_certs ? 'btn.certs_on' : 'btn.certs_off')))),
        h('section', { class: 'g-card' }, h('b', {}, ctx.P('app.members')), people.map((p) => {
          let armed = false;
          return h('div', { class: 'member' }, h('span', {}, p.name), h('button', { class: 'g-link', type: 'button', 'data-testid': `remove-${p.id}`, onclick: (e) => {
            if (!armed) { armed = true; e.target.textContent = `${ctx.P('btn.remove')}?`; return; }
            act(() => ctx.api.removeMember(cid, p.id));
          } }, ctx.P('btn.remove')));
        }))];
    }

    return {
      name: 'club', load, poll: async () => { const b = JSON.stringify(v); await load(); return b !== JSON.stringify(v); },
      title: () => v?.club.name ?? '',
      render: () => {
        const k = v.club;
        return h('div', { class: 'g-screen', 'data-testid': 'club-screen' },
          h('section', { class: 'g-card' }, h('h2', { class: 'g-h2' }, k.name), h('small', {}, ctx.P('club.sub', { leader: k.leader_name, n: k.members }))),
          v.marathon ? marathon(v.marathon) : h('p', { class: 'g-empty' }, ctx.P('club.no_marathon')),
          v.marathon ? [h('h2', { class: 'g-h2' }, ctx.P('app.board')), board()] : null,
          k.is_leader ? leaderTools() : h('button', { class: 'g-btn ghost', type: 'button', 'data-testid': 'leave', onclick: async () => {
            if (await nav.run(() => ctx.api.leave(cid))) { ctx.toast(ctx.P('leave.done')); await nav.home(); }
          } }, ctx.P('btn.leave')));
      },
    };
  };

  return { clubs, club };
}
