"""The leader's side of fair play: flagged logs (capped or a sudden jump), "isbot so'rash", the reader's 1–2 sentence
proof, and the decision. Rejected pages stop counting everywhere: the book's page, the streak, the marathon."""

from __future__ import annotations

from .base import checked, is_id
from .clubs import FLAG_STATES
from .common import Refused
from .core import fair
from .core.text import sentences


class FairPlay:
    async def flags(self, c, club: dict) -> list[dict]:
        rows = await self.qa(c, "SELECT l.id, l.user_id, l.day, l.pages, l.asked, l.status, l.proof, u.name, b.title FROM logs l "
                                "JOIN members m ON m.user_id = l.user_id AND m.club_id = ? JOIN users u ON u.id = l.user_id "
                                "JOIN books b ON b.id = l.book_id WHERE l.status IN ('flagged', 'asked', 'proof') AND l.day >= ? "
                                "ORDER BY l.id", (club["id"], self.today() - 30))
        for r in rows:
            r["usual"] = fair.usual(await self.totals(c, r["user_id"]), r["day"])
            r["capped"] = r["pages"] < r["asked"]
        return rows

    async def reviewable(self, c, leader: int, log_id: object) -> tuple[dict, dict]:
        """A log the caller may judge: its reader is a member of a club the caller leads."""
        if not is_id(log_id):
            raise Refused("not_found")
        log = await self.q1(c, "SELECT * FROM logs WHERE id = ?", (log_id,))
        club = log and await self.q1(c, "SELECT k.* FROM clubs k JOIN members m ON m.club_id = k.id WHERE k.leader = ? "
                                        "AND k.blocked = 0 AND m.user_id = ? ORDER BY k.id LIMIT 1", (leader, log["user_id"]))
        if not club:
            raise Refused("not_found")
        return log, club

    async def ask_proof(self, uid: int, log_id: object) -> tuple[dict, list[dict]]:
        async with self.db.tx() as c:
            log, club = await self.reviewable(c, uid, log_id)
            if log["status"] != "flagged":
                raise Refused("decided")
            await c.execute("UPDATE logs SET status = 'asked' WHERE id = ?", (log["id"],))
        notes = [{"type": "ask", "to": log["user_id"], "log_id": log["id"], "club_id": club["id"]}]
        return await self.club_view(uid, club["id"]), notes

    async def write_proof(self, uid: int, log_id: object, text: object) -> tuple[dict, list[dict]]:
        proof = checked(sentences, text, 10, 300, 2, "proof")
        async with self.db.tx() as c:
            log = await self.q1(c, "SELECT * FROM logs WHERE id = ? AND user_id = ?", (log_id, uid)) if is_id(log_id) else None
            if not log:
                raise Refused("not_found")
            if log["status"] != "asked":
                raise Refused("decided")
            await c.execute("UPDATE logs SET status = 'proof', proof = ? WHERE id = ?", (proof, log["id"]))
            leaders = await self.leaders_of(c, uid)
        notes = [{"type": "proof", "to": k["leader"], "log_id": log["id"], "club_id": k["id"]} for k in leaders]
        return {"id": log["id"], "status": "proof", "proof": proof}, notes

    async def decide(self, uid: int, log_id: object, accept: object) -> tuple[dict, list[dict]]:
        if not isinstance(accept, bool):
            raise Refused("generic")
        async with self.db.tx() as c:
            log, club = await self.reviewable(c, uid, log_id)
            if log["status"] not in FLAG_STATES:
                raise Refused("decided")
            await c.execute("UPDATE logs SET status = ?, decided_by = ? WHERE id = ?", ("ok" if accept else "rejected", uid, log["id"]))
            if not accept:
                book = await self.q1(c, "SELECT * FROM books WHERE id = ?", (log["book_id"],))
                if book["finished_day"] is not None and await self.page_of(c, book) < book["pages"]:
                    await c.execute("UPDATE books SET finished_day = NULL WHERE id = ?", (book["id"],))
        notes = [{"type": "decided", "to": log["user_id"], "log_id": log["id"], "yes": accept}]
        return await self.club_view(uid, club["id"]), notes

    async def log_info(self, uid: int, log_id: object) -> dict:
        """One log for a message about it: its reader, or a leader who may judge it."""
        async with self.db.tx() as c:
            log = await self.q1(c, "SELECT l.*, b.title, u.name FROM logs l JOIN books b ON b.id = l.book_id JOIN users u "
                                   "ON u.id = l.user_id WHERE l.id = ?", (log_id,)) if is_id(log_id) else None
            if not log:
                raise Refused("not_found")
            if log["user_id"] != uid:
                await self.reviewable(c, uid, log_id)
                log["usual"] = fair.usual(await self.totals(c, log["user_id"]), log["day"])
            return log
