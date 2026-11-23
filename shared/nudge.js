// JS port of kitobklubi/core/nudge.py: the evening nudge (once a day, never 22:00-08:00).
import { InputError, whole } from './text.js';

export const QUIET_FROM = 22 * 60;
export const QUIET_TO = 8 * 60;
export const CHOICES = Array.from({ length: 8 }, (_, i) => 18 * 60 + 30 * i);

export function valid(value) {
  if (value === undefined || value === null || value === 'off') return null;
  const m = whole(value, QUIET_TO, QUIET_FROM - 30, 'nudge');
  if (m % 30) throw new InputError('nudge');
  return m;
}

export const quiet = (minute) => minute >= QUIET_FROM || minute < QUIET_TO;
export const due = (minute, at, met) => at !== null && at !== undefined && !met && !quiet(minute) && minute >= at;
export const key = (day) => `nudge:${day}`;
