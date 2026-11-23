// Pictures drawn in code (SVG): the olov that grows with the streak, today's ring, the calendar heatmap and the
// weekly pages bars. No library: plain SVG elements, colours from the CSS palette, all text via textContent.
import { civil, weekday } from '../shared/clock.js';
import { group } from '../shared/i18n.js';
import { s } from './util.js';

const OUTER = 'M50 4C58 26 84 40 84 72c0 27-16 42-34 42S16 99 16 72c0-18 12-28 18-42 4 14 9 20 16 24C50 36 45 20 50 4z';
const MIDDLE = 'M50 34c6 16 21 27 21 47 0 18-10 28-21 28s-21-10-21-28c0-12 8-19 12-29 2 10 6 14 9 16 0-12-3-22 0-34z';
const INNER = 'M50 62c4 10 13 16 13 28 0 11-6 17-13 17s-13-6-13-17c0-8 6-12 8-18 1 5 3 7 5 8 0-6-1-12 0-18z';
let uid = 0;

/** The flame for a streak size 0..5 (0 = a cold ember). */
export function flameSvg(size, { label = '' } = {}) {
  const id = `fl${++uid}`;
  const scale = size === 0 ? 0.5 : 0.62 + size * 0.076;
  const grad = (name, a, b) => s('linearGradient', { id: `${id}${name}`, x1: '0', y1: '1', x2: '0', y2: '0' },
    s('stop', { offset: '0', 'stop-color': a }), s('stop', { offset: '1', 'stop-color': b }));
  const defs = s('defs', {}, grad('o', '#e8401c', '#ff9a2e'), grad('m', '#ff8a1f', '#ffd23f'), grad('i', '#fff6c4', '#ffe066'),
    grad('c', '#8f877d', '#c9c1b5'),
    s('radialGradient', { id: `${id}g`, cx: '0.5', cy: '0.75', r: '0.5' }, s('stop', { offset: '0', 'stop-color': '#ff8a1f', 'stop-opacity': '0.55' }),
      s('stop', { offset: '1', 'stop-color': '#ff8a1f', 'stop-opacity': '0' })));
  const body = size === 0
    ? s('g', { class: 'ember' }, s('path', { d: OUTER, fill: `url(#${id}c)`, opacity: '0.55' }), s('path', { d: INNER, fill: '#efe8dd', opacity: '0.7' }))
    : s('g', { class: 'flame' }, s('path', { d: OUTER, fill: `url(#${id}o)` }), s('path', { class: 'mid', d: MIDDLE, fill: `url(#${id}m)` }),
      s('path', { class: 'core', d: INNER, fill: `url(#${id}i)` }));
  return s('svg', { viewBox: '0 0 100 120', class: `olov s${size}`, role: 'img', 'aria-label': label, 'data-testid': 'flame', 'data-size': String(size) }, defs,
    size > 0 ? s('ellipse', { cx: '50', cy: '92', rx: '46', ry: '30', fill: `url(#${id}g)` }) : null,
    s('g', { transform: `translate(${50 - 50 * scale} ${118 - 116 * scale}) scale(${scale})` }, body));
}

/** Today's pages against the goal, as a ring with the number inside. */
export function ringSvg(read, goal) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const part = Math.min(1, goal ? read / goal : 0);
  return s('svg', { viewBox: '0 0 64 64', class: 'ring', 'aria-hidden': 'true' },
    s('circle', { cx: '32', cy: '32', r: String(r), class: 'ring-bg' }),
    s('circle', { cx: '32', cy: '32', r: String(r), class: `ring-fg${part >= 1 ? ' full' : ''}`, 'stroke-dasharray': `${(c * part).toFixed(1)} ${c.toFixed(1)}`,
      transform: 'rotate(-90 32 32)' }),
    s('text', { x: '32', y: '37', 'text-anchor': 'middle', class: 'ring-n' }, String(read)));
}

/** Calendar heatmap: columns are weeks (Monday on top), the last column ends today. */
export function heatmapSvg(cells, { P, T, lang }) {
  const size = 15;
  const gap = 3;
  const left = 22;
  const top = 16;
  const weeks = Math.ceil(cells.length / 7);
  const w = left + weeks * (size + gap);
  const h = top + 7 * (size + gap);
  const kids = [];
  let lastMonth = 0;
  cells.forEach((c, i) => {
    const col = Math.floor(i / 7);
    const row = weekday(c.day);
    const [, m, d] = civil(c.day);
    if (row === 0 && m !== lastMonth && d <= 7) {
      kids.push(s('text', { x: String(left + col * (size + gap)), y: '10', class: 'hm-month' }, T(lang, `mon.${m}`)));
      lastMonth = m;
    }
    const tip = `${d} ${T(lang, `mon.${m}`)}: ${P('fmt.pages', { n: group(c.pages) })}`;
    kids.push(s('rect', { x: String(left + col * (size + gap)), y: String(top + row * (size + gap)), width: String(size), height: String(size), rx: '3.5',
      class: `hm l${c.level}`, 'data-day': String(c.day) }, s('title', {}, tip)));
  });
  for (const row of [0, 2, 4]) kids.push(s('text', { x: '0', y: String(top + row * (size + gap) + 11), class: 'hm-wd' }, P(`wd.${row}`)));
  return s('svg', { viewBox: `0 0 ${w} ${h}`, class: 'heatmap', 'data-testid': 'heatmap', role: 'img' }, kids);
}

/** Pages per week, the current week last (it is still going). */
export function weeklySvg(weeks, { P, T, lang }) {
  const W = 320;
  const H = 150;
  const base = 120;
  const max = Math.max(1, ...weeks.map((x) => x.pages));
  const bw = W / weeks.length;
  const kids = [s('line', { x1: '0', y1: String(base), x2: String(W), y2: String(base), class: 'wk-axis' })];
  weeks.forEach((wk, i) => {
    const hgt = Math.round((wk.pages / max) * 92);
    const x = i * bw + bw * 0.18;
    const [, m, d] = civil(wk.start);
    const now = i === weeks.length - 1;
    kids.push(s('rect', { x: x.toFixed(1), y: String(base - hgt), width: (bw * 0.64).toFixed(1), height: String(Math.max(hgt, wk.pages ? 2 : 0)), rx: '5',
      class: `wk-bar${now ? ' now' : ''}` }, s('title', {}, P('fmt.pages', { n: group(wk.pages) }))));
    if (wk.pages) kids.push(s('text', { x: (i * bw + bw / 2).toFixed(1), y: String(base - hgt - 6), 'text-anchor': 'middle', class: 'wk-n' }, group(wk.pages)));
    kids.push(s('text', { x: (i * bw + bw / 2).toFixed(1), y: String(base + 18), 'text-anchor': 'middle', class: 'wk-d' }, `${d} ${T(lang, `mon.${m}`)}`));
  });
  return s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'weekly', 'data-testid': 'weekly', role: 'img' }, kids);
}

/** A thin progress bar with an optional "expected by today" marker (marathons). */
export function barSvg(pct, marker = null) {
  return s('svg', { viewBox: '0 0 100 8', preserveAspectRatio: 'none', class: 'pbar', 'aria-hidden': 'true' },
    s('rect', { x: '0', y: '0', width: '100', height: '8', rx: '4', class: 'pbar-bg' }),
    s('rect', { x: '0', y: '0', width: String(Math.max(0, Math.min(100, pct))), height: '8', rx: '4', class: 'pbar-fg' }),
    marker === null ? null : s('rect', { x: String(Math.max(0, Math.min(99, marker))), y: '0', width: '1.2', height: '8', class: 'pbar-mark' }));
}
