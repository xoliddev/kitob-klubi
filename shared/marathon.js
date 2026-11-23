// JS port of kitobklubi/core/marathon.py: marathons and the live leaderboard (shared ranks, "behind" from day 3).
import { InputError, whole, words } from './text.js';

export const PRESETS = [[30, 1000], [14, 400], [7, 150]];

export function validate(d, today) {
  if (!d || typeof d !== 'object' || Array.isArray(d)) throw new InputError('marathon');
  const start = today + whole(d.start_in ?? 0, 0, 14, 'start_in');
  const days = whole(d.days, 3, 120, 'days');
  return { title: words(d.title, 3, 60, 'title'), start, end: start + days - 1, days, goal: whole(d.goal, 50, 20_000, 'goal') };
}

export const state = (m, today) => (today < m.start ? 'soon' : today <= m.end ? 'live' : 'over');
export const elapsed = (m, today) => Math.max(0, Math.min(today, m.end) - m.start + 1);
export const expected = (m, today) => Math.floor((m.goal * elapsed(m, today)) / (m.end - m.start + 1));

export function board(rows, m, today) {
  const exp = expected(m, today);
  const late = state(m, today) === 'live' && elapsed(m, today) >= 3;
  const out = [...rows].sort((a, b) => b.pages - a.pages || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0) || a.id - b.id);
  let rank = 0;
  let prev = null;
  out.forEach((r, i) => {
    if (r.pages !== prev) {
      rank = i + 1;
      prev = r.pages;
    }
    r.rank = rank;
    r.pct = Math.min(100, Math.floor((r.pages * 100) / m.goal));
    r.done = r.pages >= m.goal;
    r.behind = late && !r.done && r.pages * 10 < exp * 7;
  });
  return out;
}
