// A certificate (drawn in SVG, saved as PNG, sent to the bot, its check link copied) and the check page: "✅ Haqiqiy
// sertifikat" with the details, or "❌ Bunday sertifikat yo'q" for anything else. The check page also works on its
// own, outside Telegram (?v=<code>).
import { dateShort, makeT } from '../shared/i18n.js';
import { certSvg, toPng } from './certsvg.js';
import { h, makeText, plain, toast } from './util.js';

function details(P, T, lang, c) {
  const rows = [[P('cert.given'), c.name], [P(c.kind === 'book' ? 'cert.book' : 'cert.marathon', { title: c.title }), ''],
    [P('cert.pages'), String(c.pages)], [P('cert.days'), String(c.days)], [P('cert.club'), c.club], [P('cert.date'), plain(dateShort(T, lang, c.issued_day))],
    [P('cert.code'), c.code]];
  return h('dl', { class: 'v-details' }, rows.map(([k, v]) => [h('dt', {}, k), h('dd', {}, v)]));
}

/** The check itself, shared by the in-app screen and the public page. */
function verifyBox({ verify, P, T, lang, code = '', auto = false }) {
  const input = h('input', { value: code, maxlength: 24, placeholder: 'XXXX-XXXX-XXXX-XXXX', autocapitalize: 'characters', spellcheck: 'false', 'data-testid': 'verify-input' });
  const out = h('div', { class: 'v-out', 'aria-live': 'polite' });
  async function check() {
    out.replaceChildren(h('p', { class: 'g-hint center' }, '…'));
    try {
      const res = await verify(input.value);
      out.replaceChildren(h('section', { class: 'v-ok', 'data-testid': 'verify-ok' }, h('h3', {}, P('verify.ok')), details(P, T, lang, res.cert)));
    } catch {
      out.replaceChildren(h('section', { class: 'v-bad', 'data-testid': 'verify-bad' }, h('h3', {}, P('verify.bad')), h('p', {}, P('verify.bad_lead'))));
    }
  }
  const form = h('form', { class: 'g-card g-form', onsubmit: (e) => { e.preventDefault(); check(); } }, h('b', {}, P('verify.title')),
    h('small', {}, P('verify.lead')), input, h('button', { class: 'g-btn primary', type: 'submit', 'data-testid': 'verify-go' }, P('verify.go')));
  if (auto && code) check();
  return { el: h('div', { class: 'verify' }, form, out), input, check };
}

export function verifyScreen(ctx, code = '') {
  return { name: 'verify', render: () => h('div', { class: 'g-screen', 'data-testid': 'verify' },
    verifyBox({ verify: (c) => ctx.api.verify(c), P: ctx.P, T: ctx.T, lang: ctx.lang, code, auto: Boolean(code) }).el) };
}

export function certScreen(ctx, nav, id) {
  let c = null;
  let svg = null;
  const link = () => ctx.links.verify?.(c.code) ?? '';
  async function png() {
    return toPng(svg);
  }
  return {
    name: 'cert', load: async () => { c = await ctx.api.cert(id); },
    title: () => ctx.P('cert.heading'),
    render: () => {
      svg = certSvg(c, { P: ctx.P, T: ctx.T, lang: ctx.lang, link: link() });
      return h('div', { class: 'g-screen', 'data-testid': 'cert-screen' }, h('div', { class: 'cert-frame' }, svg),
        h('div', { class: 'g-two' },
          h('button', { class: 'g-btn primary', type: 'button', 'data-testid': 'cert-png', onclick: () => nav.run(async () => {
            const a = h('a', { href: await png(), download: `sertifikat-${c.code}.png` });
            a.click();
            ctx.toast(ctx.P('app.saved'));
          }) }, ctx.P('app.png')),
          h('button', { class: 'g-btn', type: 'button', 'data-testid': 'cert-bot', onclick: () => nav.run(async () => {
            await ctx.api.certPng(c.id, (await png()).split(',')[1]);
            ctx.toast(ctx.P('app.sent_bot'));
          }) }, ctx.P('app.to_bot'))),
        h('section', { class: 'g-card' }, h('span', { class: 'g-label' }, ctx.P('cert.code')), h('b', { class: 'code', 'data-testid': 'cert-code-text' }, c.code),
          link() ? h('small', { class: 'link' }, link()) : null,
          h('button', { class: 'g-btn ghost', type: 'button', 'data-testid': 'cert-copy', onclick: async () => {
            try { await navigator.clipboard.writeText(link() || c.code); ctx.toast(ctx.P('app.copied')); } catch { ctx.toast(link() || c.code); }
          } }, ctx.P('app.copy'))));
    },
  };
}

/** The public check page (?v=<code>), in any browser. */
export function mountVerify(root, { verify, catalogs, lang: lang0, code = '', onLang }) {
  const T = makeT(catalogs);
  const text = makeText(catalogs);
  let lang = lang0 === 'ru' ? 'ru' : 'uz';
  let box = null;
  function paint(auto) {
    const P = (k, p) => text(lang, k, p);
    box = verifyBox({ verify, P, T, lang, code: box?.input.value ?? code, auto });
    root.replaceChildren(h('div', { class: 'g-app public', 'data-testid': 'verify-page' },
      h('header', { class: 'g-head' }, h('b', { class: 'g-title' }, '🔥 Kitob Klubi'), h('span', { class: 'g-grow' }),
        h('button', { class: 'g-lang', type: 'button', 'data-testid': 'verify-lang', onclick: () => { lang = lang === 'uz' ? 'ru' : 'uz'; onLang?.(lang); paint(true); } },
          P('app.lang'))),
      h('main', { class: 'g-screen' }, box.el)));
  }
  paint(true);
  return { check: (c) => { box.input.value = c; return box.check(); }, ready: Promise.resolve(), refresh: async () => {}, setLang: (l) => { lang = l; paint(true); },
    destroy: () => {}, toast: (m) => toast(root, m) };
}
