"""Club marathons ("30 kunda 1000 bet") and the live leaderboard.

Pages count only inside the marathon's days and only if not rejected. Equal pages share a rank (1, 1, 3). A member
is "behind" from the third day on when they have less than 70 % of the pages the calendar expects by today.
"""

from __future__ import annotations

from .text import InputError, whole, words

PRESETS = [[30, 1000], [14, 400], [7, 150]]


def validate(d: object, today: int) -> dict:
    if not isinstance(d, dict):
        raise InputError("marathon")
    start = today + whole(d.get("start_in", 0), 0, 14, "start_in")
    days = whole(d.get("days"), 3, 120, "days")
    return {"title": words(d.get("title"), 3, 60, "title"), "start": start, "end": start + days - 1, "days": days,
            "goal": whole(d.get("goal"), 50, 20_000, "goal")}


def state(m: dict, today: int) -> str:
    if today < m["start"]:
        return "soon"
    return "live" if today <= m["end"] else "over"


def elapsed(m: dict, today: int) -> int:
    return max(0, min(today, m["end"]) - m["start"] + 1)


def expected(m: dict, today: int) -> int:
    days = m["end"] - m["start"] + 1
    return m["goal"] * elapsed(m, today) // days


def board(rows: list[dict], m: dict, today: int) -> list[dict]:
    """``rows``: {"id", "name", "pages", "streak", "books", "flags"} per member -> ranked, with "pct", "done", "behind"."""
    exp = expected(m, today)
    late = state(m, today) == "live" and elapsed(m, today) >= 3
    out = sorted(rows, key=lambda r: (-r["pages"], r["name"], r["id"]))
    rank, prev = 0, None
    for i, r in enumerate(out):
        if r["pages"] != prev:
            rank, prev = i + 1, r["pages"]
        r["rank"] = rank
        r["pct"] = min(100, r["pages"] * 100 // m["goal"])
        r["done"] = r["pages"] >= m["goal"]
        r["behind"] = late and not r["done"] and r["pages"] * 10 < exp * 7
    return out
