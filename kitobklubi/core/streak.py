"""The daily reading "olov" (streak) with freezes.

A day counts when the reader met *their own* daily goal (default 10 pages) that Tashkent day. Every 7 counted days
earn one "muzlatish" (freeze), at most 2 in stock. A missed day, while the flame burns, quietly spends a freeze and
the streak survives (it does not grow that day); with no freeze left the streak goes out. Today is never a miss: it
is still going. Everything is recomputed from the daily totals, so a page logged for yesterday (allowed until
midnight) or a leader's rejection simply gives a different, still consistent answer.
"""

from __future__ import annotations

DEFAULT_GOAL = 10
EVERY = 7
MAX_FREEZES = 2


def goal_on(goals: list[list[int]], day: int) -> int:
    """``goals`` is [[from_day, goal], ...] in order; the goal that applied on ``day``."""
    out = goals[0][1] if goals else DEFAULT_GOAL
    for start, goal in goals:
        if start <= day:
            out = goal
    return out


def compute(totals: list[list[int]], goals: list[list[int]], today: int) -> dict:
    """``totals`` is [[day, pages], ...] (counted pages per day, any order)."""
    by_day: dict[int, int] = {}
    for d, p in totals:
        if d <= today and p > 0:
            by_day[d] = by_day.get(d, 0) + p
    streak = best = freezes = since = 0
    used: list[int] = []
    earned: list[int] = []
    lost: list[int] = []
    first = min(by_day) if by_day else today
    for d in range(first, today + 1):
        if by_day.get(d, 0) >= goal_on(goals, d):
            streak += 1
            since += 1
            if since == EVERY:
                since = 0
                if freezes < MAX_FREEZES:
                    freezes += 1
                    earned.append(d)
            best = max(best, streak)
        elif d == today:
            break
        elif streak > 0 and freezes > 0:
            freezes -= 1
            used.append(d)
        else:
            if streak > 0:
                lost.append(d)
            streak = since = 0
    goal = goal_on(goals, today)
    read = by_day.get(today, 0)
    saved, k = 0, today - 1
    while k in used:  # the freezes that kept the flame alive since the reader last read
        saved += 1
        k -= 1
    return {"streak": streak, "best": best, "freezes": freezes, "next_freeze": EVERY - since, "today": read, "goal": goal,
            "left": max(0, goal - read), "met": read >= goal, "used": used, "earned": earned, "lost": lost,
            "saved": saved}


def flame(streak: int) -> int:
    """How big the flame is drawn: 0 = an ember, then 1..5 as the streak grows."""
    for size, lo in ((5, 30), (4, 14), (3, 7), (2, 3), (1, 1)):
        if streak >= lo:
            return size
    return 0
