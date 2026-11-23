"""Shared helpers: the seeded world in a database, a clock the tests can move, and the people of the story."""

from __future__ import annotations

import json
from contextlib import asynccontextmanager
from pathlib import Path

from kitobklubi.core import seedgen
from kitobklubi.db import Database
from kitobklubi.service import Service

ROOT = Path(__file__).resolve().parent.parent
NOW = 1_795_000_000_000  # Wednesday 2026-11-18, 16:06 in Tashkent (the same moment as the shared vectors)
DAY = 86_400_000
# Seeded people have negative ids (nobody can sign in as them); the tests make them positive so they can also use
# the Mini App API like real people.
MADINA, SARDOR, JASUR, LEADER, ADMIN = 101, 102, 103, 201, 900
STRANGER = 7777
OTKAN = {"catalog": "otkan_kunlar"}


def load(name: str):
    with open(ROOT / "shared" / "data" / f"{name}.json", encoding="utf-8") as fh:
        return json.load(fh)


def positive(world: dict) -> dict:
    out = json.loads(json.dumps(world))
    for key, fields in (("users", ("id",)), ("goals", ("user_id",)), ("books", ("user_id",)), ("logs", ("user_id",)),
                        ("clubs", ("leader",)), ("members", ("user_id",))):
        for row in out[key]:
            for f in fields:
                row[f] = abs(row[f])
    return out


class Clock:
    def __init__(self, start: int = NOW) -> None:
        self.now = start

    def __call__(self) -> int:
        return self.now

    def skip(self, minutes: float = 0, days: float = 0) -> None:
        self.now += int((minutes * 60 + days * 86_400) * 1000)


@asynccontextmanager
async def service_env(clock: Clock | None = None, path: str = ":memory:", seed: bool = True, marathon: bool = True, cap: int = 300):
    clock = clock or Clock()
    db = await Database.open(path)
    svc = Service(db, clock=clock, admins=frozenset({ADMIN}), cert_secret=b"test-only-secret", cap=cap)
    if seed:
        await svc.seed(positive(seedgen.world(load("people"), load("catalog"), svc.today(), marathon)))
    for uid in (STRANGER, 5555):
        await svc.touch_user(uid, "Test", "uz")
    try:
        yield svc, clock
    finally:
        await db.close()


async def club_code(svc: Service, cid: int = 1) -> str:
    return (await svc.db.one("SELECT code FROM clubs WHERE id = ?", (cid,)))["code"]


async def read_days(svc: Service, clock: Clock, uid: int, bid: int, amounts: list[int], hour: int = 20) -> None:
    """Read ``amounts[i]`` pages on each following day at ``hour``:00 (0 = skip the day)."""
    from kitobklubi.core.clock import at_local, local_day

    for n in amounts:
        clock.now = at_local(local_day(clock.now) + 1, hour * 60)
        if n:
            await svc.log(uid, bid, {"add": n})
