"""Fair play for every log: only today or yesterday, a daily cap, and a sudden jump flagged for the leader.

The cap (300 pages a day unless configured) trims a claim instead of refusing it, and a trimmed claim is always
flagged. A jump is a day total above both 150 pages and three times the reader's usual day (the median of their
reading days over the previous two weeks, or their goal when they have fewer than three). Flagged pages still count
until the leader rejects them.
"""

from __future__ import annotations

from .text import InputError

DEFAULT_CAP = 300
JUMP_MIN = 150
JUMP_TIMES = 3
USUAL_DAYS = 14


def day_for(when: object, today: int) -> int:
    if when in (None, "today"):
        return today
    if when == "yesterday":
        return today - 1
    raise InputError("day")


def usual(totals: list[list[int]], day: int) -> int | None:
    """Median pages of the reader's reading days in the two weeks before ``day`` (None with fewer than three)."""
    by_day: dict[int, int] = {}
    for d, p in totals:
        if day - USUAL_DAYS <= d < day and p > 0:
            by_day[d] = by_day.get(d, 0) + p
    vals = sorted(by_day.values())
    if len(vals) < 3:
        return None
    return vals[len(vals) // 2]


def check(before: int, asked: int, cap: int, usual_day: int | None, goal: int) -> dict:
    """``before`` = pages already counted that day; ``asked`` = what this log claims (after the book's end)."""
    room = cap - before
    if room <= 0:
        raise InputError("cap")
    pages = min(asked, room)
    capped = pages < asked
    base = usual_day if usual_day is not None else goal
    jump = before + pages > max(JUMP_MIN, JUMP_TIMES * base)
    return {"pages": pages, "capped": capped, "flag": capped or jump}
