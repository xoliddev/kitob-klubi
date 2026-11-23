"""Certificates: issued once per achievement (a finished marathon goal, or a finished book when a club allows it),
carrying an HMAC-signed code. The public check answers the same for every failure — a malformed, forged, edited or
unknown code — and the signature is checked before the database is asked."""

from __future__ import annotations

import secrets

from .base import is_id
from .common import Refused
from .core import cert


class Certs:
    async def issue(self, c, uid: int, kind: str, ref: str, title: str, pages: int, days: int, club: str) -> int | None:
        """Insert a certificate unless this achievement already has one; returns the new id or None."""
        if await self.q1(c, "SELECT 1 FROM certs WHERE ref = ?", (ref,)):
            return None
        name = (await self.q1(c, "SELECT name FROM users WHERE id = ?", (uid,)))["name"]
        for _ in range(10):
            nonce = secrets.token_bytes(5).hex()
            if not await self.q1(c, "SELECT 1 FROM certs WHERE nonce = ?", (nonce,)):
                break
        cur = await c.execute("INSERT INTO certs (nonce, user_id, kind, ref, name, title, pages, days, club, issued_day, created_at) "
                              "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                              (nonce, uid, kind, ref, name, title, pages, days, club, self.today(), self.now()))
        return cur.lastrowid

    async def book_cert(self, c, uid: int, book: dict) -> list[dict]:
        club = await self.q1(c, "SELECT k.name FROM clubs k JOIN members m ON m.club_id = k.id WHERE m.user_id = ? AND k.book_certs = 1 "
                                "AND k.blocked = 0 ORDER BY k.id LIMIT 1", (uid,))
        if not club:
            return []
        title = f"{book['title']} — {book['author']}"
        read = await self.q1(c, "SELECT COUNT(DISTINCT day) AS d FROM logs WHERE book_id = ? AND status <> 'rejected'", (book["id"],))
        days = read["d"]
        cid = await self.issue(c, uid, "book", f"b:{book['id']}", title, book["pages"], days, club["name"])
        return [{"type": "cert", "to": uid, "cert_id": cid}] if cid else []

    async def close_marathons(self) -> list[dict]:
        """Marathons whose last day is over: everyone who reached the goal gets a certificate (once)."""
        notes: list[dict] = []
        async with self.db.tx() as c:
            for m in await self.qa(c, "SELECT * FROM marathons WHERE closed = 0 AND end_day < ?", (self.today(),)):
                club = await self.q1(c, "SELECT * FROM clubs WHERE id = ?", (m["club_id"],))
                winners = 0
                for r in await self.qa(c, "SELECT user_id FROM members WHERE club_id = ?", (m["club_id"],)):
                    got = await self.q1(c, "SELECT COALESCE(SUM(pages), 0) AS p, COUNT(DISTINCT day) AS d FROM logs WHERE user_id = ? "
                                           "AND day BETWEEN ? AND ? AND status <> 'rejected'", (r["user_id"], m["start_day"], m["end_day"]))
                    if got["p"] < m["goal"]:
                        continue
                    winners += 1
                    cid = await self.issue(c, r["user_id"], "marathon", f"m:{m['id']}:{r['user_id']}", m["title"], got["p"], got["d"],
                                           club["name"])
                    if cid:
                        notes.append({"type": "cert", "to": r["user_id"], "cert_id": cid})
                await c.execute("UPDATE marathons SET closed = 1 WHERE id = ?", (m["id"],))
                notes.append({"type": "closed", "to": club["leader"], "club_id": club["id"], "winners": winners})
        return notes

    def cert_view(self, row: dict, with_code: bool = True) -> dict:
        out = {"id": row["id"], "kind": row["kind"], "name": row["name"], "title": row["title"], "pages": row["pages"], "days": row["days"],
               "club": row["club"], "issued_day": row["issued_day"]}
        if with_code:
            out["code"] = cert.pretty(cert.make(self.secret, bytes.fromhex(row["nonce"])))
        return out

    async def certs(self, uid: int) -> list[dict]:
        rows = await self.db.all("SELECT * FROM certs WHERE user_id = ? ORDER BY id DESC", (uid,))
        return [self.cert_view(r) for r in rows]

    async def cert(self, uid: int, cid: object) -> dict:
        row = await self.db.one("SELECT * FROM certs WHERE id = ? AND user_id = ?", (cid, uid)) if is_id(cid) else None
        if not row:
            raise Refused("not_found")
        return self.cert_view(row)

    async def verify(self, code: object) -> dict:
        nonce = cert.nonce_of(self.secret, code)
        row = await self.db.one("SELECT * FROM certs WHERE nonce = ?", (nonce,)) if nonce else None
        if not row:
            raise Refused("cert_unknown")
        view = self.cert_view(row, with_code=False)
        view.pop("id")  # the public answer carries nothing that could be counted or guessed
        return {"ok": True, "cert": {**view, "code": cert.pretty(cert.norm(code))}}
