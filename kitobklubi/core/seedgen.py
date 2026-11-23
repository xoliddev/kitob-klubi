"""The fictional world, relative to "today": a club led by Nilufar ustoz with five readers who have read for the
last two weeks (each at their own pace, some skipping days), and, for the server, a marathon already running.
Madina, the heroine of the browser demo, starts with nothing. shared/seedgen.js builds the very same world."""

from __future__ import annotations

from .books import find
from .text import h32

HISTORY = 14


def world(people: dict, catalog: list[dict], today: int, marathon: bool = True) -> dict:
    users = [{"id": people["madina"]["id"], "name": people["madina"]["name"], "goal": 10},
             {"id": people["leader"]["id"], "name": people["leader"]["name"], "goal": 10},
             {"id": people["admin"]["id"], "name": people["admin"]["name"], "goal": 10}]
    books, logs, goals, members = [], [], [], []
    start = today - HISTORY
    for i, m in enumerate(people["members"]):
        users.append({"id": m["id"], "name": m["name"], "goal": m["goal"]})
        goals.append({"user_id": m["id"], "from_day": start, "goal": m["goal"]})
        members.append({"club_id": 1, "user_id": m["id"], "joined_day": start})
        b = find(catalog, m["book"])
        bid = i + 1
        books.append({"id": bid, "user_id": m["id"], "catalog": b["id"], "title": b["title"], "author": b["author"],
                      "pages": b["pages"], "start": m["start"], "added_day": start})
        page = m["start"]
        for k in range(HISTORY, 0, -1):
            if m["skip"] and h32(f"{m['key']}:skip:{k}") % m["skip"] == 0:
                continue
            n = m["avg"] - m["avg"] // 4 + h32(f"{m['key']}:p:{k}") % (m["avg"] // 2 + 1)
            n = min(n, b["pages"] - 1 - page)
            if n <= 0:
                continue
            page += n
            logs.append({"user_id": m["id"], "book_id": bid, "day": today - k, "pages": n})
    club = {"id": 1, "leader": people["leader"]["id"], "name": people["club"]["name"], "code": people["club"]["code"],
            "created_day": start}
    marathons = [{"id": 1, "club_id": 1, "title": "30 kunda 1000 bet", "start": today - 10, "end": today + 19, "goal": 1000}]
    return {"users": users, "goals": goals, "books": books, "logs": logs, "clubs": [club], "members": members,
            "marathons": marathons if marathon else []}
