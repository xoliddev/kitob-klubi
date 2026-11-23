"""Books: the catalog or a hand-typed book, the reader's page, progress and the pace forecast.

A book's page is never stored: it is ``start`` plus the pages of every log on it that was not rejected, so a
leader's "rad etildi" takes the pages back everywhere at once (the book, the streak, the marathon).
"""

from __future__ import annotations

from .text import InputError, whole, words

PAGES_MIN, PAGES_MAX = 10, 5000
WINDOW = 14  # the pace is measured over the last two weeks


def find(catalog: list[dict], key: object) -> dict | None:
    return next((b for b in catalog if b["id"] == key), None) if isinstance(key, str) else None


def validate(d: object, catalog: list[dict]) -> dict:
    """{"catalog": "otkan_kunlar"} or {"title", "author", "pages"}, plus an optional "start" page already read."""
    if not isinstance(d, dict):
        raise InputError("book")
    if d.get("catalog") is not None:
        b = find(catalog, d["catalog"])
        if b is None:
            raise InputError("book")
        out = {"title": b["title"], "author": b["author"], "pages": b["pages"], "catalog": b["id"]}
    else:
        out = {"title": words(d.get("title"), 2, 120, "title"), "author": words(d.get("author"), 2, 80, "author"),
               "pages": whole(d.get("pages"), PAGES_MIN, PAGES_MAX, "pages"), "catalog": None}
    start = d.get("start", 0)
    out["start"] = 0 if start in (None, "") else whole(start, 0, out["pages"] - 1, "start")
    return out


def progress(pages: int, page: int) -> dict:
    page = max(0, min(page, pages))
    return {"page": page, "pages": pages, "left": pages - page, "pct": page * 100 // pages}


def pace(per_day: list[list[int]], added_day: int, left: int, today: int) -> dict:
    """Pages a day on this book over the last two weeks (×100, whole numbers) and the day it would be finished.

    ``per_day`` is [[day, pages], ...] for this book. The span is two weeks, or fewer days if the book is newer, so
    a book added today with 25 pages read reads as 25 a day."""
    span = max(1, min(WINDOW, today - added_day + 1))
    read = sum(p for d, p in per_day if today - span < d <= today)
    rate = read * 100 // span
    if left <= 0:
        return {"rate": rate, "days": 0, "day": today}
    if rate <= 0:
        return {"rate": 0, "days": None, "day": None}
    days = -(-left * 100 // rate)
    return {"rate": rate, "days": days, "day": today + days}


def asked_pages(d: object, page: int, pages: int) -> int:
    """How many pages a log adds: {"add": n} ("+20") or {"page": p} ("hozir qaysi betdasiz?")."""
    if not isinstance(d, dict):
        raise InputError("pages")
    if d.get("page") is not None:
        p = whole(d["page"], 1, pages, "page")
        if p <= page:
            raise InputError("page_back")
        return p - page
    return whole(d.get("add"), 1, PAGES_MAX, "pages")
