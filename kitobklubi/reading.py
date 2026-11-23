"""The reader: books (from the catalog or typed), one-tap logs under the fair-play rules, the finished book's fikr,
the daily goal and the nudge time, the home screen and the numbers."""

from __future__ import annotations

from .base import checked
from .common import Refused
from .core import books as booklib
from .core import fair, nudge, stats, streak
from .core.text import sentences, whole

MAX_ACTIVE = 5
MAX_BOOKS = 500


class Reading:
    async def add_book(self, uid: int, data: object) -> dict:
        b = checked(booklib.validate, data, self.catalog)
        async with self.db.tx() as c:
            active = await self.qa(c, "SELECT title FROM books WHERE user_id = ? AND finished_day IS NULL", (uid,))
            if len(active) >= MAX_ACTIVE:
                raise Refused("books_many")
            if any(a["title"].lower() == b["title"].lower() for a in active):
                raise Refused("book_dup")
            if (await self.q1(c, "SELECT COUNT(*) AS n FROM books WHERE user_id = ?", (uid,)))["n"] >= MAX_BOOKS:
                raise Refused("limit")
            cur = await c.execute("INSERT INTO books (user_id, catalog, title, author, pages, start, added_day, created_at) "
                                  "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                                  (uid, b["catalog"], b["title"], b["author"], b["pages"], b["start"], self.today(), self.now()))
            book = await self.q1(c, "SELECT * FROM books WHERE id = ?", (cur.lastrowid,))
            return await self.card(c, book)

    async def active(self, c, uid: int) -> list[dict]:
        """Books being read, the one logged most recently first (the one the quick buttons log to)."""
        rows = await self.qa(c, "SELECT b.*, (SELECT MAX(id) FROM logs WHERE book_id = b.id) AS last FROM books b "
                                "WHERE b.user_id = ? AND b.finished_day IS NULL ORDER BY COALESCE(last, 0) DESC, b.id DESC", (uid,))
        return [await self.card(c, b) for b in rows]

    async def books(self, uid: int) -> dict:
        async with self.db.tx() as c:
            done = await self.qa(c, "SELECT * FROM books WHERE user_id = ? AND finished_day IS NOT NULL "
                                    "ORDER BY finished_day DESC, id DESC LIMIT 50", (uid,))
            return {"active": await self.active(c, uid), "done": [await self.card(c, b) for b in done]}

    async def book_view(self, uid: int, bid: object) -> dict:
        async with self.db.tx() as c:
            book = await self.own_book(c, uid, bid)
            logs = await self.qa(c, "SELECT id, day, pages, asked, status, proof FROM logs WHERE book_id = ? "
                                    "ORDER BY day DESC, id DESC LIMIT 20", (book["id"],))
            return {"book": await self.card(c, book), "logs": logs, "today": self.today()}

    async def log(self, uid: int, bid: object, data: object) -> tuple[dict, list[dict]]:
        """Add pages to a book ({"add": 20} or {"page": 145}, "day": "today" | "yesterday"): trimmed at the book's
        end, then at the daily cap; a trimmed claim or a sudden jump is flagged for the reader's leaders."""
        today = self.today()
        d = data if isinstance(data, dict) else {}
        async with self.db.tx() as c:
            book = await self.own_book(c, uid, bid)
            if book["finished_day"] is not None:
                raise Refused("book_done")
            day = checked(fair.day_for, d.get("day"), today)
            page = await self.page_of(c, book)
            asked = checked(booklib.asked_pages, d, page, book["pages"])
            totals = await self.totals(c, uid)
            goals = await self.goals(c, uid)
            before = sum(p for x, p in totals if x == day)
            res = checked(fair.check, before, min(asked, book["pages"] - page), self.cap, fair.usual(totals, day),
                          streak.goal_on(goals, day))
            old = streak.compute(totals, goals, today)
            status = "flagged" if res["flag"] else "ok"
            cur = await c.execute("INSERT INTO logs (user_id, book_id, day, pages, asked, status, at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                                  (uid, book["id"], day, res["pages"], asked, status, self.now()))
            log = {"id": cur.lastrowid, "day": day, "pages": res["pages"], "asked": asked, "status": status, "capped": res["capped"]}
            finished = page + res["pages"] >= book["pages"]
            notes: list[dict] = []
            if finished:
                await c.execute("UPDATE books SET finished_day = ? WHERE id = ?", (today, book["id"]))
                book = {**book, "finished_day": today}
                notes += await self.book_cert(c, uid, book)
            if res["flag"]:
                for lead in await self.leaders_of(c, uid):
                    notes.append({"type": "flag", "to": lead["leader"], "log_id": log["id"], "club_id": lead["id"]})
            st = await self.streak_of(c, uid)
            out = {"log": log, "book": await self.card(c, book), "streak": st, "flame": streak.flame(st["streak"]),
                   "finished": finished, "lit": old["streak"] == 0 and st["streak"] > 0, "met_now": not old["met"] and st["met"]}
        return out, notes

    async def leaders_of(self, c, uid: int) -> list[dict]:
        return await self.qa(c, "SELECT k.id, k.leader FROM clubs k JOIN members m ON m.club_id = k.id "
                                "WHERE m.user_id = ? AND k.blocked = 0 AND k.leader <> ? ORDER BY k.id", (uid, uid))

    async def review(self, uid: int, bid: object, text: object) -> dict:
        fikr = checked(sentences, text, 3, 400, 3, "review")
        async with self.db.tx() as c:
            book = await self.own_book(c, uid, bid)
            if book["finished_day"] is None:
                raise Refused("not_finished")
            await c.execute("UPDATE books SET review = ? WHERE id = ?", (fikr, book["id"]))
            return await self.card(c, {**book, "review": fikr})

    async def set_goal(self, uid: int, value: object) -> dict:
        goal = checked(whole, value, 1, 300, "goal")
        today = self.today()
        async with self.db.tx() as c:
            if not await self.q1(c, "SELECT 1 FROM goals WHERE user_id = ?", (uid,)):
                old = await self.q1(c, "SELECT goal FROM users WHERE id = ?", (uid,))
                await c.execute("INSERT INTO goals (user_id, from_day, goal) VALUES (?, 0, ?)", (uid, old["goal"]))
            await c.execute("INSERT INTO goals (user_id, from_day, goal) VALUES (?, ?, ?) "
                            "ON CONFLICT (user_id, from_day) DO UPDATE SET goal = excluded.goal", (uid, today, goal))
            await c.execute("UPDATE users SET goal = ? WHERE id = ?", (goal, uid))
        return await self.me(uid)

    async def set_nudge(self, uid: int, value: object) -> dict:
        at = checked(nudge.valid, value)
        async with self.db.tx() as c:
            await c.execute("UPDATE users SET nudge = ? WHERE id = ?", (at, uid))
        return await self.me(uid)

    async def home(self, uid: int) -> dict:
        async with self.db.tx() as c:
            st = await self.streak_of(c, uid)
            books = await self.active(c, uid)
            asks = await self.qa(c, "SELECT l.id, l.day, l.pages, b.title FROM logs l JOIN books b ON b.id = l.book_id "
                                    "WHERE l.user_id = ? AND l.status = 'asked' ORDER BY l.id", (uid,))
            done = await self.q1(c, "SELECT COUNT(*) AS n FROM books WHERE user_id = ? AND finished_day IS NOT NULL", (uid,))
            certs = await self.q1(c, "SELECT COUNT(*) AS n FROM certs WHERE user_id = ?", (uid,))
            clubs = await self.q1(c, "SELECT COUNT(*) AS n FROM members WHERE user_id = ?", (uid,))
        return {"me": await self.me(uid), "streak": st, "flame": streak.flame(st["streak"]), "books": books,
                "current": books[0]["id"] if books else None, "asks": asks, "done": done["n"], "certs": certs["n"], "clubs": clubs["n"]}

    async def stats(self, uid: int) -> dict:
        today = self.today()
        async with self.db.tx() as c:
            totals = await self.totals(c, uid)
            goals = await self.goals(c, uid)
            done = await self.qa(c, "SELECT id, title, author, finished_day, review FROM books WHERE user_id = ? "
                                    "AND finished_day IS NOT NULL ORDER BY finished_day DESC, id DESC", (uid,))
        st = streak.compute(totals, goals, today)
        return {"streak": st, "flame": streak.flame(st["streak"]), "weekly": stats.weekly(totals, today),
                "heatmap": stats.heatmap(totals, goals, st["used"], today), "authors": stats.authors(done),
                "summary": stats.summary(totals, len(done)), "finished": done[:20], "today": today}
