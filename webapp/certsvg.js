// The certificate, drawn in SVG: paper, a double frame with an eight-point star in each corner, the flame seal, the
// name, the achievement, pages and days, the club, the date and the verification code with where to check it. It is
// turned into a PNG in the browser (canvas), so it can be saved or sent to the bot. All text goes in as text nodes.
import { dateShort, group } from '../shared/i18n.js';
import { s } from './util.js';

const W = 1600;
const H = 1131;
const INK = '#2b211c';
const GOLD = '#b98a2c';

function star(cx, cy, r) {
  const pts = [];
  for (let i = 0; i < 16; i++) {
    const a = (Math.PI / 8) * i - Math.PI / 2;
    const rr = i % 2 ? r * 0.46 : r;
    pts.push(`${(cx + rr * Math.cos(a)).toFixed(1)},${(cy + rr * Math.sin(a)).toFixed(1)}`);
  }
  return s('g', {}, s('polygon', { points: pts.join(' '), fill: 'none', stroke: GOLD, 'stroke-width': '3' }),
    s('circle', { cx: String(cx), cy: String(cy), r: String(r * 0.22), fill: GOLD }));
}

function seal(cx, cy) {
  const flame = 'M50 4C58 26 84 40 84 72c0 27-16 42-34 42S16 99 16 72c0-18 12-28 18-42 4 14 9 20 16 24C50 36 45 20 50 4z';
  return s('g', {}, s('circle', { cx: String(cx), cy: String(cy), r: '86', fill: '#fff8ea', stroke: GOLD, 'stroke-width': '4' }),
    s('circle', { cx: String(cx), cy: String(cy), r: '72', fill: 'none', stroke: GOLD, 'stroke-width': '1.5', 'stroke-dasharray': '4 6' }),
    s('g', { transform: `translate(${cx - 34} ${cy - 46}) scale(0.68)` },
      s('path', { d: flame, fill: '#e8591c' }),
      s('path', { d: 'M50 34c6 16 21 27 21 47 0 18-10 28-21 28s-21-10-21-28c0-12 8-19 12-29 2 10 6 14 9 16 0-12-3-22 0-34z', fill: '#ffb23a' }),
      s('path', { d: 'M50 62c4 10 13 16 13 28 0 11-6 17-13 17s-13-6-13-17c0-8 6-12 8-18 1 5 3 7 5 8 0-6-1-12 0-18z', fill: '#fff1b8' })));
}

const text = (x, y, value, attrs = {}) => s('text', { x: String(x), y: String(y), 'text-anchor': 'middle', ...attrs }, value);

/** cert = {kind, name, title, pages, days, club, issued_day, code}; link = where anyone can check it. */
export function certSvg(cert, { P, T, lang, link = '' }) {
  const nameSize = cert.name.length > 26 ? 62 : cert.name.length > 18 ? 76 : 88;
  const achieved = P(cert.kind === 'book' ? 'cert.book' : 'cert.marathon', { title: cert.title });
  const achSize = achieved.length > 60 ? 30 : 36;
  const serif = 'Georgia, "Times New Roman", serif';
  const sans = '-apple-system, "Segoe UI", Roboto, Arial, sans-serif';
  const stat = (x, n, label) => s('g', {}, text(x, 742, n, { 'font-family': serif, 'font-size': '64', 'font-weight': '700', fill: INK }),
    text(x, 782, label, { 'font-family': sans, 'font-size': '22', fill: '#7a6a5c', 'letter-spacing': '2' }));
  return s('svg', { xmlns: 'http://www.w3.org/2000/svg', viewBox: `0 0 ${W} ${H}`, width: String(W), height: String(H), class: 'cert-svg',
    'data-testid': 'cert-svg', role: 'img', 'aria-label': `${P('cert.heading')}: ${cert.name}` },
  s('defs', {}, s('radialGradient', { id: 'paper', cx: '0.5', cy: '0.4', r: '0.8' }, s('stop', { offset: '0', 'stop-color': '#fffaf0' }),
    s('stop', { offset: '1', 'stop-color': '#f3e8d2' }))),
  s('rect', { width: String(W), height: String(H), fill: 'url(#paper)' }),
  s('rect', { x: '36', y: '36', width: String(W - 72), height: String(H - 72), fill: 'none', stroke: INK, 'stroke-width': '6' }),
  s('rect', { x: '58', y: '58', width: String(W - 116), height: String(H - 116), fill: 'none', stroke: GOLD, 'stroke-width': '2.5' }),
  star(110, 110, 34), star(W - 110, 110, 34), star(110, H - 110, 34), star(W - 110, H - 110, 34),
  text(W / 2, 168, 'KITOB KLUBI', { 'font-family': sans, 'font-size': '26', 'font-weight': '700', 'letter-spacing': '10', fill: GOLD }),
  text(W / 2, 270, P('cert.heading'), { 'font-family': serif, 'font-size': '104', 'font-weight': '700', 'letter-spacing': '14', fill: INK }),
  s('line', { x1: String(W / 2 - 240), y1: '308', x2: String(W / 2 + 240), y2: '308', stroke: GOLD, 'stroke-width': '2' }),
  text(W / 2, 372, P('cert.given'), { 'font-family': sans, 'font-size': '28', fill: '#7a6a5c' }),
  text(W / 2, 470, cert.name, { 'font-family': serif, 'font-size': String(nameSize), 'font-style': 'italic', fill: INK, 'data-testid': 'cert-name' }),
  text(W / 2, 556, achieved, { 'font-family': serif, 'font-size': String(achSize), fill: '#3d2f27' }),
  stat(W / 2 - 230, group(cert.pages), P('cert.pages').toUpperCase()),
  stat(W / 2 + 230, String(cert.days), P('cert.days').toUpperCase()),
  seal(W / 2, 720),
  s('line', { x1: '170', y1: '900', x2: '620', y2: '900', stroke: INK, 'stroke-width': '1.5' }),
  s('line', { x1: String(W - 620), y1: '900', x2: String(W - 170), y2: '900', stroke: INK, 'stroke-width': '1.5' }),
  text(395, 885, cert.club || 'Kitob Klubi', { 'font-family': serif, 'font-size': '32', fill: INK }),
  text(395, 932, P('cert.club').toUpperCase(), { 'font-family': sans, 'font-size': '20', 'letter-spacing': '3', fill: '#7a6a5c' }),
  text(W - 395, 885, dateShort(T, lang, cert.issued_day), { 'font-family': serif, 'font-size': '32', fill: INK }),
  text(W - 395, 932, P('cert.date').toUpperCase(), { 'font-family': sans, 'font-size': '20', 'letter-spacing': '3', fill: '#7a6a5c' }),
  text(W / 2, 1000, `${P('cert.code')}: ${cert.code}`, { 'font-family': 'ui-monospace, Consolas, monospace', 'font-size': '30', 'font-weight': '700',
    fill: INK, 'letter-spacing': '2', 'data-testid': 'cert-code' }),
  link ? text(W / 2, 1040, `${P('cert.verify_at')} ${link}`, { 'font-family': sans, 'font-size': '20', fill: '#7a6a5c' }) : null);
}

/** The SVG as a PNG data URL (1600×1131), drawn by the browser. */
export async function toPng(svg) {
  const xml = new XMLSerializer().serializeToString(svg);
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  canvas.getContext('2d').drawImage(img, 0, 0, W, H);
  return canvas.toDataURL('image/png');
}
