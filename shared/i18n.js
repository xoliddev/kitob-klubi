// JS port of kitobklubi/i18n.py: locale templates with escaped params and the sentences every screen needs. The Mini
// App and the browser demo's bot use it, so every sentence reads exactly like the real bot's.
import { civil } from './clock.js';

export class Raw {
  constructor(html) {
    this.html = String(html);
  }

  toString() {
    return this.html;
  }
}

export const escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function render(template, params = {}) {
  return template.replace(/\{(\w+)\}/g, (m, k) => {
    if (!(k in params)) return m;
    const v = params[k];
    return v instanceof Raw ? v.html : escapeHtml(v);
  });
}

export const normLang = (code) => (code && String(code).slice(0, 2).toLowerCase() === 'ru' ? 'ru' : 'uz');

export function makeT(catalogs) {
  return (lang, key, params) => {
    const l = normLang(lang);
    const template = catalogs[l]?.[key] || catalogs.uz?.[key] || key;
    return render(template, params);
  };
}

export function group(n) {
  let s = String(Math.abs(n));
  let out = '';
  while (s.length > 3) {
    out = ` ${s.slice(-3)}${out}`;
    s = s.slice(0, -3);
  }
  return (n < 0 ? '-' : '') + s + out;
}

export const pages = (t, lang, n) => t(lang, 'fmt.pages', { n: group(n) });

export function dateShort(t, lang, day) {
  const [, m, d] = civil(day);
  return t(lang, 'fmt.day', { d, month: t(lang, `month.${m}`) });
}

export function dateFull(day) {
  const [y, m, d] = civil(day);
  return `${String(d).padStart(2, '0')}.${String(m).padStart(2, '0')}.${y}`;
}

export const rate = (r) => Math.floor((r + 50) / 100);

export function paceLine(t, lang, card, today) {
  const p = card.pace;
  if (p.day === null) return t(lang, 'book.pace_none');
  const gap = p.day - today;
  const when = gap <= 0 ? t(lang, 'when.today') : gap === 1 ? t(lang, 'when.tomorrow')
    : t(lang, 'book.pace_on', { date: new Raw(dateShort(t, lang, p.day)) });
  return t(lang, 'book.pace', { title: card.title, when: new Raw(when) });
}

export function todayLine(t, lang, st) {
  if (st.met) return t(lang, 'today.met', { read: st.today, goal: st.goal });
  if (st.today > 0) return t(lang, 'today.left', { read: st.today, goal: st.goal, left: st.left });
  return t(lang, 'today.none', { goal: st.goal });
}

export const streakLine = (t, lang, st) => (st.streak === 0 ? t(lang, 'streak.out', { goal: st.goal }) : t(lang, 'streak.line', { n: st.streak }));

export function savedLine(t, lang, st) {
  if (!st.saved || st.streak === 0) return '';
  return st.saved === 1 ? t(lang, 'streak.saved_1') : t(lang, 'streak.saved_n', { n: st.saved });
}

export function freezeLine(t, lang, st) {
  const tail = st.freezes >= 2 ? t(lang, 'streak.full') : t(lang, 'streak.next', { n: st.next_freeze });
  return `${t(lang, 'streak.freezes', { n: st.freezes })} · ${tail}`;
}


export function progressBar(pct, width = 10) {
  const full = Math.floor((pct * width) / 100);
  return '▰'.repeat(full) + '▱'.repeat(width - full);
}

export function marState(t, lang, m) {
  if (m.state === 'soon') return t(lang, 'mar.soon', { n: m.in });
  if (m.state === 'live') return t(lang, 'mar.live', { day: m.elapsed, days: m.days });
  return t(lang, 'mar.over');
}

export const usualText = (t, lang, usual) => (usual === null || usual === undefined ? t(lang, 'flag.usual_none') : t(lang, 'fmt.rate', { n: usual }));
