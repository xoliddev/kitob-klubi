// JS port of kitobklubi/core/streak.py: the daily reading "olov" with freezes (7 counted days earn one, at most 2;
// a missed day spends one while the flame burns). Recomputed from the daily totals every time.
export const DEFAULT_GOAL = 10;
export const EVERY = 7;
export const MAX_FREEZES = 2;

export function goalOn(goals, day) {
  let out = goals.length ? goals[0][1] : DEFAULT_GOAL;
  for (const [start, goal] of goals) if (start <= day) out = goal;
  return out;
}

export function compute(totals, goals, today) {
  const byDay = new Map();
  for (const [d, p] of totals) if (d <= today && p > 0) byDay.set(d, (byDay.get(d) ?? 0) + p);
  let streak = 0;
  let best = 0;
  let freezes = 0;
  let since = 0;
  const used = [];
  const earned = [];
  const lost = [];
  const first = byDay.size ? Math.min(...byDay.keys()) : today;
  for (let d = first; d <= today; d++) {
    if ((byDay.get(d) ?? 0) >= goalOn(goals, d)) {
      streak += 1;
      since += 1;
      if (since === EVERY) {
        since = 0;
        if (freezes < MAX_FREEZES) {
          freezes += 1;
          earned.push(d);
        }
      }
      best = Math.max(best, streak);
    } else if (d === today) {
      break;
    } else if (streak > 0 && freezes > 0) {
      freezes -= 1;
      used.push(d);
    } else {
      if (streak > 0) lost.push(d);
      streak = 0;
      since = 0;
    }
  }
  const goal = goalOn(goals, today);
  const read = byDay.get(today) ?? 0;
  let saved = 0;
  for (let k = today - 1; used.includes(k); k--) saved += 1;
  return { streak, best, freezes, next_freeze: EVERY - since, today: read, goal, left: Math.max(0, goal - read), met: read >= goal,
    used, earned, lost, saved };
}

export function flame(streak) {
  for (const [size, lo] of [[5, 30], [4, 14], [3, 7], [2, 3], [1, 1]]) if (streak >= lo) return size;
  return 0;
}
