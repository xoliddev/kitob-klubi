// JS port of kitobklubi/core/fair.py: today or yesterday only, the daily cap, and a sudden jump flagged.
import { InputError } from './text.js';

export const DEFAULT_CAP = 300;
export const JUMP_MIN = 150;
export const JUMP_TIMES = 3;
export const USUAL_DAYS = 14;

export function dayFor(when, today) {
  if (when === undefined || when === null || when === 'today') return today;
  if (when === 'yesterday') return today - 1;
  throw new InputError('day');
}

export function usual(totals, day) {
  const byDay = new Map();
  for (const [d, p] of totals) if (day - USUAL_DAYS <= d && d < day && p > 0) byDay.set(d, (byDay.get(d) ?? 0) + p);
  const vals = [...byDay.values()].sort((a, b) => a - b);
  if (vals.length < 3) return null;
  return vals[Math.floor(vals.length / 2)];
}

export function check(before, asked, cap, usualDay, goal) {
  const room = cap - before;
  if (room <= 0) throw new InputError('cap');
  const pages = Math.min(asked, room);
  const capped = pages < asked;
  const base = usualDay ?? goal;
  const jump = before + pages > Math.max(JUMP_MIN, JUMP_TIMES * base);
  return { pages, capped, flag: capped || jump };
}
