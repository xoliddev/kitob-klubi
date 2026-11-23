"""All the rules in one object: the bot handlers, the Mini App API and the scheduler call the same ``Service``.
Every method takes the caller's Telegram id first and checks it: readers change only their own books and logs,
leaders act only in their own clubs. Methods that make the bot speak return "notes" (``{"type", "to", ...}``) that
the notifier turns into messages."""

from __future__ import annotations

from .base import Base, is_id
from .certs import Certs
from .clubs import Clubs
from .common import Refused
from .fairplay import FairPlay
from .reading import Reading
from .security import RateLimiter
from .ticking import Ticking


class Service(Reading, Clubs, FairPlay, Certs, Ticking, Base):
    def __init__(self, *args, **kwargs) -> None:
        super().__init__(*args, **kwargs)
        self.join_tries = RateLimiter(10)  # club codes a person may try per minute

    async def seed(self, world: dict) -> bool:
        """Fill an empty database with the fictional world. Returns False when there is data already. The club code
        gets a fresh random value here (the shared seed has a placeholder), so nobody joins by guessing it."""
        if await self.db.one("SELECT id FROM users LIMIT 1"):
            return False
        now, today = self.now(), self.today()
        async with self.db.tx() as c:
            for u in world["users"]:
                await c.execute("INSERT INTO users (id, name, goal, created_day, created_at) VALUES (?, ?, ?, ?, ?)",
                                (u["id"], u["name"], u["goal"], today - 30, now))
            for g in world["goals"]:
                await c.execute("INSERT INTO goals (user_id, from_day, goal) VALUES (?, ?, ?)", (g["user_id"], g["from_day"], g["goal"]))
            for b in world["books"]:
                await c.execute("INSERT INTO books (id, user_id, catalog, title, author, pages, start, added_day, created_at) "
                                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", (b["id"], b["user_id"], b["catalog"], b["title"], b["author"],
                                                                       b["pages"], b["start"], b["added_day"], now))
            for x in world["logs"]:
                await c.execute("INSERT INTO logs (user_id, book_id, day, pages, asked, at) VALUES (?, ?, ?, ?, ?, ?)",
                                (x["user_id"], x["book_id"], x["day"], x["pages"], x["pages"], now))
            for k in world["clubs"]:
                await c.execute("INSERT INTO clubs (id, leader, name, code, created_day, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                                (k["id"], k["leader"], k["name"], await self.new_code(c), k["created_day"], now))
            for m in world["members"]:
                await c.execute("INSERT INTO members (club_id, user_id, joined_day, at) VALUES (?, ?, ?, ?)",
                                (m["club_id"], m["user_id"], m["joined_day"], now))
            for m in world["marathons"]:
                await c.execute("INSERT INTO marathons (id, club_id, title, start_day, end_day, goal, created_at) "
                                "VALUES (?, ?, ?, ?, ?, ?, ?)",
                                (m["id"], m["club_id"], m["title"], m["start"], m["end"], m["goal"], now))
        return True

    # ── admin ──
    async def admin_home(self, uid: int) -> dict:
        self.admin_only(uid)
        today = self.today()
        one = self.db.one
        return {"users": (await one("SELECT COUNT(*) AS n FROM users WHERE id > 0"))["n"],
                "readers_today": (await one("SELECT COUNT(DISTINCT user_id) AS n FROM logs WHERE day = ?", (today,)))["n"],
                "pages_today": (await one("SELECT COALESCE(SUM(pages), 0) AS n FROM logs WHERE day = ? AND status <> 'rejected'",
                                          (today,)))["n"],
                "certs": (await one("SELECT COUNT(*) AS n FROM certs"))["n"],
                "clubs": await self.db.all("SELECT k.id, k.name, k.blocked, (SELECT COUNT(*) FROM members WHERE club_id = k.id) AS members "
                                           "FROM clubs k ORDER BY k.id DESC LIMIT 20")}

    async def admin_block(self, uid: int, cid: object, blocked: object) -> dict:
        self.admin_only(uid)
        if not is_id(cid) or not isinstance(blocked, bool):
            raise Refused("not_found")
        async with self.db.tx() as c:
            await c.execute("UPDATE clubs SET blocked = ? WHERE id = ?", (int(blocked), cid))
        return await self.admin_home(uid)
