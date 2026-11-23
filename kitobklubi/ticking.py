"""What the scheduler does every minute: evening nudges (each claimed once in the database before it is sent, never
in the quiet hours) and closing finished marathons with their certificates."""

from __future__ import annotations

from .core import nudge


class Ticking:
    async def tick(self) -> list[dict]:
        notes: list[dict] = []
        minute, today = self.minute(), self.today()
        if not nudge.quiet(minute):
            for u in await self.db.all("SELECT id FROM users WHERE id > 0 AND nudge IS NOT NULL AND nudge <= ?", (minute,)):
                async with self.db.tx() as c:
                    st = await self.streak_of(c, u["id"])
                    if not nudge.due(minute, minute, st["met"]):
                        continue
                    cur = await c.execute("INSERT OR IGNORE INTO sent (user_id, key, at) VALUES (?, ?, ?)",
                                          (u["id"], nudge.key(today), self.now()))
                    if cur.rowcount:
                        notes.append({"type": "nudge", "to": u["id"], "left": st["left"], "streak": st["streak"]})
        return notes + await self.close_marathons()
