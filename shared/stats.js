// JS port of kitobklubi/core/stats.py: pages per week, the calendar heatmap, favourite authors and totals.
import { weekday } from './clock.js';
import { goalOn } from './streak.js';

export const FREEZE = 4;

export function byDay(totals) {
  const out = new Map();
  for (const [d, p] of totals) out.set(d, (out.get(d) ?? 0) + p);
  return out;
}

export function weekly(totals, today, weeks = 8) {
  const days = byDay(totals);
  const monday = today - weekday(today);
  const out = [];
  for (let w = weeks - 1; w >= 0; w--) {
    const start = monday - 7 * w;
    let pages = 0;
    for (let i = 0; i < 7; i++) if (start + i <= today) pages += days.get(start + i) ?? 0;
    out.push({ start, pages });
  }
  return out;
}

export function heatmap(totals, goals, used, today, weeks = 15) {
  const days = byDay(totals);
  const spent = new Set(used);
  const first = today - weekday(today) - 7 * (weeks - 1);
  const out = [];
  for (let d = first; d <= today; d++) {
    const p = days.get(d) ?? 0;
    const goal = goalOn(goals, d);
    const level = spent.has(d) ? FREEZE : p >= 2 * goal ? 3 : p >= goal ? 2 : p > 0 ? 1 : 0;
    out.push({ day: d, pages: p, level });
  }
  return out;
}

export function authors(finished, top = 3) {
  const count = new Map();
  for (const b of finished) count.set(b.author, (count.get(b.author) ?? 0) + 1);
  return [...count.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)).slice(0, top);
}

export function summary(totals, finished) {
  const days = byDay(totals);
  let pages = 0;
  let read = 0;
  for (const p of days.values()) {
    pages += p;
    if (p > 0) read += 1;
  }
  return { pages, days: read, books: finished };
}
