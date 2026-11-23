"""The service's foundation: the clock, the shared data, people and roles, and the few queries every rule needs (a
reader's daily totals, goals, streak and book cards). Reading, clubs, fair play, certificates and the scheduler's
tick live in their own modules and are mixed into ``Service`` (service.py)."""

from __future__ import annotations

import json
import secrets
import time
from collections.abc import Callable
from pathlib import Path

from .common import Refused
from .core import books as booklib
from .core import cert, streak
from .core.clock import local_day, local_minute
from .core.fair import DEFAULT_CAP
from .core.text import InputError, clean
from .db import Database

DATA = Path(__file__).resolve().parent.parent / "shared" / "data"


def load(name: str):
    with open(DATA / f"{name}.json", encoding="utf-8") as fh:
        return json.load(fh)


def checked(fn, *args):
    """Run a core validator; its InputError becomes a Refused with the same code."""
    try:
        return fn(*args)
    except InputError as err:
        raise Refused(err.code) from err


def is_id(value: object) -> bool:
    return isinstance(value, int) and not isinstance(value, bool) and 0 < value < 10**9


class Base:
    def __init__(self, db: Database, clock: Callable[[], int] | None = None, admins: frozenset[int] = frozenset(),
                 cert_secret: bytes = b"", cap: int = DEFAULT_CAP) -> None:
        self.db = db
        self.clock = clock or (lambda: int(time.time() * 1000))
        self.admins = set(admins)
        self.secret = cert_secret or secrets.token_bytes(32)
        self.cap = cap
        self.catalog, self.people = load("catalog"), load("people")

    def now(self) -> int:
        return self.clock()

    def today(self) -> int:
        return local_day(self.now())

    def minute(self) -> int:
        return local_minute(self.now())

    # ── people ──
    async def touch_user(self, uid: int, name: str, lang_code: str | None) -> dict:
        row = await self.db.one("SELECT * FROM users WHERE id = ?", (uid,))
        if row:
            return row
        lang = "ru" if (lang_code or "")[:2].lower() == "ru" else "uz"
        async with self.db.tx() as c:
            await c.execute("INSERT OR IGNORE INTO users (id, name, lang, created_day, created_at) VALUES (?, ?, ?, ?, ?)",
                            (uid, clean(name, 64) or "Kitobxon", lang, self.today(), self.now()))
        return await self.db.one("SELECT * FROM users WHERE id = ?", (uid,))

    async def user(self, uid: int) -> dict | None:
        return await self.db.one("SELECT * FROM users WHERE id = ?", (uid,))

    async def set_lang(self, uid: int, lang: object) -> str:
        if lang not in ("uz", "ru"):
            raise Refused("generic")
        async with self.db.tx() as c:
            await c.execute("UPDATE users SET lang = ? WHERE id = ?", (lang, uid))
        return lang

    async def roles(self, uid: int) -> dict:
        led = await self.db.all("SELECT id FROM clubs WHERE leader = ? AND blocked = 0 ORDER BY id", (uid,))
        return {"leader": [r["id"] for r in led], "admin": uid in self.admins}

    async def me(self, uid: int) -> dict:
        u = await self.user(uid)
        return {"id": uid, "name": u["name"], "lang": u["lang"], "goal": u["goal"], "nudge": u["nudge"], "roles": await self.roles(uid),
                "today": self.today(), "now": self.now(), "cap": self.cap}

    # ── shared queries ──
    @staticmethod
    async def q1(c, sql: str, args: tuple = ()) -> dict | None:
        async with c.execute(sql, args) as cur:
            row = await cur.fetchone()
        return dict(row) if row else None

    @staticmethod
    async def qa(c, sql: str, args: tuple = ()) -> list[dict]:
        async with c.execute(sql, args) as cur:
            return [dict(r) for r in await cur.fetchall()]

    async def totals(self, c, uid: int) -> list[list[int]]:
        rows = await self.qa(c, "SELECT day, SUM(pages) AS p FROM logs WHERE user_id = ? AND status <> 'rejected' "
                                "GROUP BY day ORDER BY day", (uid,))
        return [[r["day"], r["p"]] for r in rows]

    async def goals(self, c, uid: int) -> list[list[int]]:
        rows = await self.qa(c, "SELECT from_day, goal FROM goals WHERE user_id = ? ORDER BY from_day", (uid,))
        if rows:
            return [[r["from_day"], r["goal"]] for r in rows]
        u = await self.q1(c, "SELECT goal FROM users WHERE id = ?", (uid,))
        return [[0, u["goal"] if u else streak.DEFAULT_GOAL]]

    async def streak_of(self, c, uid: int) -> dict:
        return streak.compute(await self.totals(c, uid), await self.goals(c, uid), self.today())

    async def page_of(self, c, book: dict) -> int:
        row = await self.q1(c, "SELECT COALESCE(SUM(pages), 0) AS p FROM logs WHERE book_id = ? AND status <> 'rejected'", (book["id"],))
        return book["start"] + row["p"]

    async def card(self, c, book: dict) -> dict:
        """A book as every screen shows it: the page, progress and the pace forecast."""
        prog = booklib.progress(book["pages"], await self.page_of(c, book))
        rows = await self.qa(c, "SELECT day, SUM(pages) AS p FROM logs WHERE book_id = ? AND status <> 'rejected' AND day > ? GROUP BY day",
                             (book["id"], self.today() - booklib.WINDOW))
        pace = booklib.pace([[r["day"], r["p"]] for r in rows], book["added_day"], prog["left"], self.today())
        return {"id": book["id"], "title": book["title"], "author": book["author"], "catalog": book["catalog"], **prog,
                "added_day": book["added_day"], "finished_day": book["finished_day"], "review": book["review"], "pace": pace}

    async def own_book(self, c, uid: int, bid: object) -> dict:
        """The caller's own book, or "not_found" (the same answer for someone else's book and one that does not exist)."""
        if not is_id(bid):
            raise Refused("not_found")
        book = await self.q1(c, "SELECT * FROM books WHERE id = ? AND user_id = ?", (bid, uid))
        if not book:
            raise Refused("not_found")
        return book

    async def new_code(self, c) -> str:
        for _ in range(20):
            code = cert.code_from(secrets.randbits(40))
            if not await self.q1(c, "SELECT 1 FROM clubs WHERE code = ?", (code,)):
                return code
        raise Refused("generic")  # pragma: no cover - 2**40 codes

    def admin_only(self, uid: int) -> None:
        if uid not in self.admins:
            raise Refused("not_found")
