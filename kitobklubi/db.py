"""SQLite storage (aiosqlite, WAL). Parameterised SQL only. Times are UTC milliseconds, days Tashkent day numbers.

The rules that must never break are in the schema too, so even a bug in the service cannot break them: pages stay in
range and a log never counts more than it claimed, a book's start page is inside the book, a log's status is one of
five, a club code and a certificate nonce are unique, a certificate is issued once per achievement, and a nudge key
exists once.
"""

from __future__ import annotations

import asyncio
import sqlite3
from contextlib import asynccontextmanager
from pathlib import Path

import aiosqlite

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, lang TEXT NOT NULL DEFAULT 'uz' CHECK (lang IN ('uz', 'ru')),
  goal INTEGER NOT NULL DEFAULT 10 CHECK (goal BETWEEN 1 AND 300),
  nudge INTEGER CHECK (nudge IS NULL OR (nudge BETWEEN 480 AND 1290 AND nudge % 30 = 0)),
  created_day INTEGER NOT NULL, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS goals (
  user_id INTEGER NOT NULL REFERENCES users(id), from_day INTEGER NOT NULL, goal INTEGER NOT NULL CHECK (goal BETWEEN 1 AND 300),
  PRIMARY KEY (user_id, from_day)
);
CREATE TABLE IF NOT EXISTS books (
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id), catalog TEXT, title TEXT NOT NULL,
  author TEXT NOT NULL, pages INTEGER NOT NULL CHECK (pages BETWEEN 10 AND 5000),
  start INTEGER NOT NULL DEFAULT 0 CHECK (start >= 0 AND start < pages), added_day INTEGER NOT NULL, finished_day INTEGER,
  review TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS books_user ON books(user_id, finished_day);
CREATE TABLE IF NOT EXISTS logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id), book_id INTEGER NOT NULL REFERENCES books(id),
  day INTEGER NOT NULL, pages INTEGER NOT NULL CHECK (pages BETWEEN 1 AND 1000), asked INTEGER NOT NULL CHECK (asked BETWEEN 1 AND 5000),
  status TEXT NOT NULL DEFAULT 'ok' CHECK (status IN ('ok', 'flagged', 'asked', 'proof', 'rejected')),
  proof TEXT NOT NULL DEFAULT '', at INTEGER NOT NULL, decided_by INTEGER, CHECK (pages <= asked)
);
CREATE INDEX IF NOT EXISTS logs_user ON logs(user_id, day);
CREATE INDEX IF NOT EXISTS logs_book ON logs(book_id);
CREATE TABLE IF NOT EXISTS clubs (
  id INTEGER PRIMARY KEY AUTOINCREMENT, leader INTEGER NOT NULL REFERENCES users(id), name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE CHECK (length(code) = 8), book_certs INTEGER NOT NULL DEFAULT 0 CHECK (book_certs IN (0, 1)),
  blocked INTEGER NOT NULL DEFAULT 0 CHECK (blocked IN (0, 1)), created_day INTEGER NOT NULL, created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS clubs_leader ON clubs(leader);
CREATE TABLE IF NOT EXISTS members (
  club_id INTEGER NOT NULL REFERENCES clubs(id), user_id INTEGER NOT NULL REFERENCES users(id), joined_day INTEGER NOT NULL,
  at INTEGER NOT NULL, PRIMARY KEY (club_id, user_id)
);
CREATE INDEX IF NOT EXISTS members_user ON members(user_id);
CREATE TABLE IF NOT EXISTS marathons (
  id INTEGER PRIMARY KEY AUTOINCREMENT, club_id INTEGER NOT NULL REFERENCES clubs(id), title TEXT NOT NULL,
  start_day INTEGER NOT NULL, end_day INTEGER NOT NULL, goal INTEGER NOT NULL CHECK (goal BETWEEN 50 AND 20000),
  closed INTEGER NOT NULL DEFAULT 0 CHECK (closed IN (0, 1)), created_at INTEGER NOT NULL,
  CHECK (end_day - start_day BETWEEN 2 AND 119)
);
CREATE INDEX IF NOT EXISTS marathons_club ON marathons(club_id, end_day);
CREATE TABLE IF NOT EXISTS certs (
  id INTEGER PRIMARY KEY AUTOINCREMENT, nonce TEXT NOT NULL UNIQUE CHECK (length(nonce) = 10), user_id INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('marathon', 'book')), ref TEXT NOT NULL UNIQUE, name TEXT NOT NULL, title TEXT NOT NULL,
  pages INTEGER NOT NULL, days INTEGER NOT NULL, club TEXT NOT NULL DEFAULT '', issued_day INTEGER NOT NULL, created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS certs_user ON certs(user_id);
CREATE TABLE IF NOT EXISTS sent (user_id INTEGER NOT NULL, key TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (user_id, key));
"""


class Database:
    def __init__(self, conn: aiosqlite.Connection) -> None:
        self.conn = conn
        self.lock = asyncio.Lock()  # one transaction at a time on this connection

    @classmethod
    async def open(cls, path: str) -> Database:
        if path != ":memory:":
            Path(path).parent.mkdir(parents=True, exist_ok=True)
        conn = await aiosqlite.connect(path, isolation_level=None)  # we issue BEGIN/COMMIT ourselves
        conn.row_factory = aiosqlite.Row
        await conn.execute("PRAGMA journal_mode=WAL")
        await conn.execute("PRAGMA synchronous=NORMAL")
        await conn.execute("PRAGMA busy_timeout=5000")
        await conn.execute("PRAGMA foreign_keys=ON")
        await conn.executescript(SCHEMA)
        return cls(conn)

    async def close(self) -> None:
        await self.conn.close()

    @asynccontextmanager
    async def tx(self):
        """``BEGIN IMMEDIATE`` takes the write lock up front, so check-then-write sequences (the daily cap, a
        certificate issued once) cannot interleave, neither between coroutines nor between processes."""
        async with self.lock:
            for attempt in range(6):
                try:
                    await self.conn.execute("BEGIN IMMEDIATE")
                    break
                except sqlite3.OperationalError as err:
                    if "locked" not in str(err) or attempt == 5:
                        raise
                    await asyncio.sleep(0.05 * (attempt + 1))
            try:
                yield self.conn
            except BaseException:
                await self.conn.execute("ROLLBACK")
                raise
            await self.conn.execute("COMMIT")

    async def one(self, sql: str, args: tuple = ()) -> dict | None:
        async with self.conn.execute(sql, args) as cur:
            row = await cur.fetchone()
        return dict(row) if row else None

    async def all(self, sql: str, args: tuple = ()) -> list[dict]:
        async with self.conn.execute(sql, args) as cur:
            return [dict(r) for r in await cur.fetchall()]
