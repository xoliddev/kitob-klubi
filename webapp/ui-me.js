// The "Men" tab: my numbers (the calendar heatmap, pages per week, totals, favourite authors, finished books with my
// fikr), my certificates, the daily goal and the evening nudge, and a way to check anyone's certificate.
import { hhmm } from '../shared/clock.js';
import { dateShort, freezeLine } from '../shared/i18n.js';
import { CHOICES } from '../shared/nudge.js';
import { certScreen, verifyScreen } from './ui-cert.js';
import { flameSvg, heatmapSvg, weeklySvg } from './draw.js';
import { h, plain } from './util.js';

export function meScreens(ctx, nav) {
  const more = () => {
    let st = null;
    let certs = [];
    const load = async () => {
      [st, certs] = await Promise.all([ctx.api.stats(), ctx.api.certs().then((r) => r.items)]);
      ctx.me = await ctx.api.me();
    };
    function settings() {
      const goal = h('select', { 'data-testid': 'set-goal', onchange: (e) => nav.run(async () => { ctx.me = await ctx.api.setGoal(Number(e.target.value)); ctx.toast(ctx.P('app.saved')); }) },
        [5, 10, 15, 20, 30, 50, 100].map((n) => h('option', { value: String(n), selected: n === ctx.me.goal }, ctx.P('fmt.pages', { n }))));
      if (![5, 10, 15, 20, 30, 50, 100].includes(ctx.me.goal)) goal.prepend(h('option', { value: String(ctx.me.goal), selected: true }, ctx.P('fmt.pages', { n: ctx.me.goal })));
      const nudge = h('select', { 'data-testid': 'set-nudge', onchange: (e) => nav.run(async () => {
        ctx.me = await ctx.api.setNudge(e.target.value === 'off' ? 'off' : Number(e.target.value));
        ctx.toast(ctx.P('app.saved'));
      }) }, h('option', { value: 'off', selected: ctx.me.nudge === null }, ctx.P('set.off')),
      CHOICES.map((m) => h('option', { value: String(m), selected: m === ctx.me.nudge }, hhmm(m))));
      return h('section', { class: 'g-card g-form', 'data-testid': 'settings' }, h('b', {}, ctx.P('btn.settings')),
        h('label', { class: 'g-field' }, ctx.P('app.goal_label'), goal), h('label', { class: 'g-field' }, ctx.P('app.nudge_label'), nudge,
          h('small', {}, ctx.P('set.nudge_ask'))));
    }
    return {
      name: 'more', load, poll: async () => { const b = JSON.stringify([st, certs]); await load(); return b !== JSON.stringify([st, certs]); },
      render: () => {
        const sum = st.summary;
        const legend = ['l1', 'l2', 'l3', 'l4'].map((l, i) => h('span', { class: 'lg' }, h('i', { class: `hm ${l}` }), ctx.P('app.legend').split(' · ')[i]));
        return h('div', { class: 'g-screen', 'data-testid': 'me' },
          h('section', { class: 'g-card me-top' }, h('div', { class: 'me-flame' }, flameSvg(st.flame)),
            h('div', {}, h('b', {}, ctx.me.name), h('small', { 'data-testid': 'summary' }, ctx.P('app.summary', sum)),
              h('small', {}, plain(freezeLine(ctx.T, ctx.lang, st.streak))))),
          h('section', { class: 'g-card' }, h('b', {}, ctx.P('app.heatmap')), heatmapSvg(st.heatmap, ctx), h('div', { class: 'legend' }, legend)),
          h('section', { class: 'g-card' }, h('b', {}, ctx.P('app.weekly')), weeklySvg(st.weekly, ctx)),
          h('section', { class: 'g-card' }, h('b', {}, ctx.P('app.authors')),
            st.authors.length ? h('ol', { class: 'authors', 'data-testid': 'authors' }, st.authors.map(([a, n]) => h('li', {}, h('span', {}, a), h('b', {}, String(n)))))
              : h('small', {}, ctx.P('app.authors_none'))),
          h('h2', { class: 'g-h2' }, ctx.P('btn.certs')),
          certs.length ? certs.map((c) => h('button', { class: 'c-card', type: 'button', 'data-testid': `cert-${c.id}`, onclick: () => nav.show(certScreen(ctx, nav, c.id)) },
            h('span', { class: 'c-medal', 'aria-hidden': 'true' }, '🏅'), h('span', {}, h('b', {}, c.title), h('small', {}, `${c.club} · ${plain(dateShort(ctx.T, ctx.lang, c.issued_day))}`))))
            : h('p', { class: 'g-empty' }, ctx.P('cert.none')),
          h('button', { class: 'g-btn ghost wide', type: 'button', 'data-testid': 'open-verify', onclick: () => nav.show(verifyScreen(ctx)) }, ctx.P('app.verify_open')),
          st.finished.length ? h('h2', { class: 'g-h2' }, ctx.P('app.finished')) : null,
          st.finished.map((b) => h('div', { class: 'b-done' }, h('b', {}, `✅ ${b.title}`), h('small', {}, b.author), b.review ? h('q', {}, b.review) : null)),
          settings());
      },
    };
  };
  return { more, cert: (id) => certScreen(ctx, nav, id), verify: (code) => verifyScreen(ctx, code) };
}
