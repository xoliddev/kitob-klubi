"""Clubs and marathons: a leader opens a club, readers join by its code (or the ``k_<code>`` deep link), the leader
starts a marathon ("30 kunda 1000 bet"), everyone sees the live leaderboard and the leader also sees who is falling
behind. Members may leave; the leader may remove a member or change the code."""

from __future__ import annotations

from .base import checked, is_id
from .common import Refused
from .core import marathon as mlib
from .core.text import words

MAX_LED = 3
MAX_MEMBERS = 200
FLAG_STATES = ("flagged", "asked", "proof")


def norm_code(text: object) -> str | None:
    from .core.cert import ALPHABET

    if not isinstance(text, str) or len(text) > 24:
        return None
    s = text.strip().upper().replace("-", "").replace(" ", "")
    return s if len(s) == 8 and all(ch in ALPHABET for ch in s) else None


def mview(m: dict, today: int) -> dict:
    out = {"id": m["id"], "title": m["title"], "start": m["start_day"], "end": m["end_day"], "goal": m["goal"]}
    core = {"start": m["start_day"], "end": m["end_day"], "goal": m["goal"]}
    return {**out, "days": m["end_day"] - m["start_day"] + 1, "state": mlib.state(core, today), "elapsed": mlib.elapsed(core, today),
            "expected": mlib.expected(core, today), "closed": bool(m["closed"]),
            "in": max(0, m["start_day"] - today)}


class Clubs:
    async def club_of(self, c, uid: int, cid: object) -> tuple[dict, bool]:
        """The club if the caller leads it or is a member; anything else is "not_found"."""
        if not is_id(cid):
            raise Refused("not_found")
        club = await self.q1(c, "SELECT * FROM clubs WHERE id = ? AND blocked = 0", (cid,))
        if club and club["leader"] == uid:
            return club, True
        if club and await self.q1(c, "SELECT 1 FROM members WHERE club_id = ? AND user_id = ?", (cid, uid)):
            return club, False
        raise Refused("not_found")

    async def led(self, c, uid: int, cid: object) -> dict:
        club, lead = await self.club_of(c, uid, cid)
        if not lead:
            raise Refused("not_found")
        return club

    async def create_club(self, uid: int, name: object) -> dict:
        title = checked(words, name, 3, 60, "club_name")
        async with self.db.tx() as c:
            if (await self.q1(c, "SELECT COUNT(*) AS n FROM clubs WHERE leader = ?", (uid,)))["n"] >= MAX_LED:
                raise Refused("limit")
            cur = await c.execute("INSERT INTO clubs (leader, name, code, created_day, created_at) VALUES (?, ?, ?, ?, ?)",
                                  (uid, title, await self.new_code(c), self.today(), self.now()))
            cid = cur.lastrowid
        return await self.club_view(uid, cid)

    async def my_clubs(self, uid: int) -> list[dict]:
        rows = await self.db.all("SELECT k.*, u.name AS leader_name, (SELECT COUNT(*) FROM members WHERE club_id = k.id) AS n "
                                 "FROM clubs k JOIN users u ON u.id = k.leader WHERE k.blocked = 0 AND (k.leader = ? OR k.id IN "
                                 "(SELECT club_id FROM members WHERE user_id = ?)) ORDER BY k.id", (uid, uid))
        out = []
        for k in rows:
            m = await self.db.one("SELECT * FROM marathons WHERE club_id = ? ORDER BY id DESC LIMIT 1", (k["id"],))
            out.append({"id": k["id"], "name": k["name"], "leader_name": k["leader_name"], "is_leader": k["leader"] == uid,
                        "members": k["n"], "marathon": mview(m, self.today()) if m else None})
        return out

    async def join(self, uid: int, text: object) -> dict:
        code = norm_code(text)
        if not self.join_tries.allow(uid):
            raise Refused("rate")
        async with self.db.tx() as c:
            club = await self.q1(c, "SELECT * FROM clubs WHERE code = ? AND blocked = 0", (code,)) if code else None
            if not club:
                raise Refused("club_code")
            if club["leader"] != uid and not await self.q1(c, "SELECT 1 FROM members WHERE club_id = ? AND user_id = ?",
                                                           (club["id"], uid)):
                if (await self.q1(c, "SELECT COUNT(*) AS n FROM members WHERE club_id = ?", (club["id"],)))["n"] >= MAX_MEMBERS:
                    raise Refused("limit")
                await c.execute("INSERT INTO members (club_id, user_id, joined_day, at) VALUES (?, ?, ?, ?)",
                                (club["id"], uid, self.today(), self.now()))
        return await self.club_view(uid, club["id"])

    async def leave(self, uid: int, cid: object) -> None:
        async with self.db.tx() as c:
            _club, lead = await self.club_of(c, uid, cid)
            if lead:
                raise Refused("generic")
            await c.execute("DELETE FROM members WHERE club_id = ? AND user_id = ?", (cid, uid))

    async def remove_member(self, uid: int, cid: object, member: object) -> dict:
        async with self.db.tx() as c:
            await self.led(c, uid, cid)
            if not isinstance(member, int) or isinstance(member, bool):
                raise Refused("not_found")
            cur = await c.execute("DELETE FROM members WHERE club_id = ? AND user_id = ?", (cid, member))
            if cur.rowcount == 0:
                raise Refused("not_found")
        return await self.club_view(uid, cid)

    async def club_settings(self, uid: int, cid: object, data: object) -> dict:
        d = data if isinstance(data, dict) else {}
        async with self.db.tx() as c:
            await self.led(c, uid, cid)
            if d.get("code") is True:
                await c.execute("UPDATE clubs SET code = ? WHERE id = ?", (await self.new_code(c), cid))
            if isinstance(d.get("book_certs"), bool):
                await c.execute("UPDATE clubs SET book_certs = ? WHERE id = ?", (int(d["book_certs"]), cid))
        return await self.club_view(uid, cid)

    async def create_marathon(self, uid: int, cid: object, data: object) -> tuple[dict, list[dict]]:
        m = checked(mlib.validate, data, self.today())
        async with self.db.tx() as c:
            await self.led(c, uid, cid)
            if await self.q1(c, "SELECT 1 FROM marathons WHERE club_id = ? AND closed = 0", (cid,)):
                raise Refused("marathon_live")
            await c.execute("INSERT INTO marathons (club_id, title, start_day, end_day, goal, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                            (cid, m["title"], m["start"], m["end"], m["goal"], self.now()))
            members = await self.qa(c, "SELECT user_id FROM members WHERE club_id = ?", (cid,))
        notes = [{"type": "marathon", "to": r["user_id"], "club_id": cid} for r in members]
        return await self.club_view(uid, cid), notes

    async def board_rows(self, c, club: dict, m: dict) -> list[dict]:
        last = min(m["end_day"], self.today())
        rows = []
        for r in await self.qa(c, "SELECT u.id, u.name FROM members x JOIN users u ON u.id = x.user_id WHERE x.club_id = ?", (club["id"],)):
            got = await self.q1(c, "SELECT COALESCE(SUM(pages), 0) AS p, SUM(status IN ('flagged', 'asked', 'proof')) AS f FROM logs "
                                   "WHERE user_id = ? AND day BETWEEN ? AND ? AND status <> 'rejected'", (r["id"], m["start_day"], last))
            books = await self.q1(c, "SELECT COUNT(*) AS n FROM books WHERE user_id = ? AND finished_day BETWEEN ? AND ?",
                                  (r["id"], m["start_day"], last))
            rows.append({"id": r["id"], "name": r["name"], "pages": got["p"], "flags": got["f"] or 0, "books": books["n"],
                         "streak": (await self.streak_of(c, r["id"]))["streak"]})
        return mlib.board(rows, {"start": m["start_day"], "end": m["end_day"], "goal": m["goal"]}, self.today())

    async def club_view(self, uid: int, cid: object) -> dict:
        today = self.today()
        async with self.db.tx() as c:
            club, lead = await self.club_of(c, uid, cid)
            leader = await self.q1(c, "SELECT name FROM users WHERE id = ?", (club["leader"],))
            n = (await self.q1(c, "SELECT COUNT(*) AS n FROM members WHERE club_id = ?", (club["id"],)))["n"]
            m = await self.q1(c, "SELECT * FROM marathons WHERE club_id = ? ORDER BY id DESC LIMIT 1", (club["id"],))
            board = await self.board_rows(c, club, m) if m else []
            members = [] if m else [{"id": r["id"], "name": r["name"], "streak": (await self.streak_of(c, r["id"]))["streak"]}
                                    for r in await self.qa(c, "SELECT u.id, u.name FROM members x JOIN users u ON u.id = x.user_id "
                                                              "WHERE x.club_id = ? ORDER BY u.name", (club["id"],))]
            flags = await self.flags(c, club) if lead else []
        for r in board:
            r["me"] = r["id"] == uid
            if not lead:
                r.pop("behind")
        info = {"id": club["id"], "name": club["name"], "leader_name": leader["name"], "is_leader": lead, "members": n,
                "book_certs": bool(club["book_certs"])}
        if lead:
            info["code"] = club["code"]
        return {"club": info, "marathon": mview(m, today) if m else None, "board": board, "members": members,
                "me": next((r for r in board if r["me"]), None), "flags": flags, "presets": mlib.PRESETS, "today": today}
