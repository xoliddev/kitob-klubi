"""The reader's numbers: pages per week, the calendar heatmap, favourite authors and totals."""

from __future__ import annotations

from .clock import weekday
from .streak import goal_on

FREEZE = 4  # heatmap level of a day a freeze kept the flame alive


def by_day(totals: list[list[int]]) -> dict[int, int]:
    out: dict[int, int] = {}
    for d, p in totals:
        out[d] = out.get(d, 0) + p
    return out


def weekly(totals: list[list[int]], today: int, weeks: int = 8) -> list[dict]:
    """Pages in each of the last ``weeks`` Monday-to-Sunday weeks, oldest first (this week so far is last)."""
    days = by_day(totals)
    monday = today - weekday(today)
    out = []
    for w in range(weeks - 1, -1, -1):
        start = monday - 7 * w
        out.append({"start": start, "pages": sum(days.get(start + i, 0) for i in range(7) if start + i <= today)})
    return out


def heatmap(totals: list[list[int]], goals: list[list[int]], used: list[int], today: int, weeks: int = 15) -> list[dict]:
    """Every day from the Monday ``weeks - 1`` weeks ago to today: level 0 = none, 1 = some, 2 = goal met,
    3 = twice the goal, 4 = kept by a freeze."""
    days = by_day(totals)
    spent = set(used)
    first = today - weekday(today) - 7 * (weeks - 1)
    out = []
    for d in range(first, today + 1):
        p, goal = days.get(d, 0), goal_on(goals, d)
        level = FREEZE if d in spent else 3 if p >= 2 * goal else 2 if p >= goal else 1 if p > 0 else 0
        out.append({"day": d, "pages": p, "level": level})
    return out


def authors(finished: list[dict], top: int = 3) -> list[list]:
    """Most finished authors: [[author, books], ...]."""
    count: dict[str, int] = {}
    for b in finished:
        count[b["author"]] = count.get(b["author"], 0) + 1
    return [[a, n] for a, n in sorted(count.items(), key=lambda x: (-x[1], x[0]))[:top]]


def summary(totals: list[list[int]], finished: int) -> dict:
    days = by_day(totals)
    return {"pages": sum(days.values()), "days": sum(1 for p in days.values() if p > 0), "books": finished}
