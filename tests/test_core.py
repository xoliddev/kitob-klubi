"""The pure core: the shared vectors are up to date, the olov and its freezes, fair play, the leaderboard and the
certificate codes — including Tashkent midnight and New Year."""

from __future__ import annotations

import json
import subprocess
import sys

import pytest

from kitobklubi.core import books, cert, clock, fair, marathon, streak
from kitobklubi.core.text import InputError, sentences

from .helpers import NOW, ROOT


def test_vectors_are_up_to_date(tmp_path):
    before = (ROOT / "shared" / "test_vectors.json").read_bytes()
    subprocess.run([sys.executable, str(ROOT / "scripts" / "make_vectors.py")], check=True)
    assert (ROOT / "shared" / "test_vectors.json").read_bytes() == before, "run python scripts/make_vectors.py and commit"


def test_tashkent_midnight_decides_the_day():
    late = clock.at_local(clock.local_day(NOW), 23 * 60 + 59)
    assert clock.local_day(late + 60_000) == clock.local_day(late) + 1
    assert clock.local_minute(late + 60_000) == 0
    # 23:59 and 00:01 are different reading days, even though they are the same UTC day
    d = clock.local_day(late)
    st = streak.compute([[d, 10], [d + 1, 10]], [], d + 1)
    assert st["streak"] == 2
    nye = clock.days_from_civil(2026, 12, 31)
    assert clock.civil(nye + 1) == (2027, 1, 1)
    assert streak.compute([[nye - 1, 12], [nye, 12], [nye + 1, 12]], [], nye + 1)["streak"] == 3


def test_freezes_are_earned_every_seven_days_at_most_two_and_save_the_flame():
    d0 = 20_000
    st = streak.compute([[d0 + i, 10] for i in range(7)], [], d0 + 8)
    assert (st["streak"], st["freezes"], st["used"], st["saved"]) == (7, 0, [d0 + 7], 1), "the miss on day 8 spent the freeze"
    st = streak.compute([[d0 + i, 10] for i in range(7)], [], d0 + 9)
    assert (st["streak"], st["lost"]) == (0, [d0 + 8]), "a second miss with no freeze puts the flame out"
    st = streak.compute([[d0 + i, 10] for i in range(21)], [], d0 + 20)
    assert (st["freezes"], len(st["earned"])) == (2, 2), "at most two in stock"
    st = streak.compute([[d0 + i, 10] for i in range(7)], [], d0 + 7)
    assert (st["streak"], st["met"], st["left"]) == (7, False, 10), "today is never a miss"
    assert streak.compute([[d0, 9]], [], d0)["streak"] == 0, "below the goal is not a day"
    assert streak.compute([[d0, 9], [d0, 1]], [], d0)["streak"] == 1, "two logs add up"


def test_fair_play_caps_flags_and_dates():
    assert fair.check(30, 900, 300, 22, 10) == {"pages": 270, "capped": True, "flag": True}
    assert fair.check(0, 120, 300, 22, 10) == {"pages": 120, "capped": False, "flag": False}, "120 is under 150"
    assert fair.check(0, 151, 300, 22, 10)["flag"], "above 150 and 3x the usual 22"
    assert not fair.check(0, 151, 300, 60, 10)["flag"], "a fast reader's usual day is 60"
    with pytest.raises(InputError, match="cap"):
        fair.check(300, 1, 300, None, 10)
    with pytest.raises(InputError, match="day"):
        fair.day_for("2 days ago", 100)
    assert fair.usual([[9, 10], [8, 30], [7, 20], [-5, 999]], 10) == 20, "only the two weeks before"


def test_books_pages_and_pace():
    assert books.asked_pages({"page": 145}, 100, 384) == 45
    with pytest.raises(InputError, match="page_back"):
        books.asked_pages({"page": 90}, 100, 384)
    p = books.pace([[100, 25]], 100, 359, 100)
    assert p == {"rate": 2500, "days": 15, "day": 115}
    assert books.pace([], 100, 359, 100)["day"] is None
    with pytest.raises(InputError, match="review_long"):
        sentences("Bir. Ikki. Uch. To'rt.", 3, 400, 3, "review")


def test_leaderboard_ranks_and_behind():
    m = {"start": 100, "end": 129, "goal": 1000}
    rows = [{"id": i, "name": n, "pages": p, "streak": 0, "books": 0, "flags": 0} for i, n, p in
            ((1, "B", 300), (2, "A", 300), (3, "C", 50), (4, "D", 1000))]
    out = marathon.board(rows, m, 109)  # day 10: the calendar expects 333
    assert [(r["name"], r["rank"]) for r in out] == [("D", 1), ("A", 2), ("B", 2), ("C", 4)]
    assert [r["behind"] for r in out] == [False, False, False, True]
    assert all(not r["behind"] for r in marathon.board(json.loads(json.dumps(rows)), m, 101)), "not on the first days"


def test_certificate_codes_cannot_be_edited():
    secret = cert.secret_from("x")
    code = cert.make(secret, bytes.fromhex("0102030405"))
    assert cert.nonce_of(secret, cert.pretty(code).lower()) == "0102030405"
    for i in range(cert.LEN):
        for ch in "AZ29":
            if code[i] != ch:
                assert cert.nonce_of(secret, code[:i] + ch + code[i + 1:]) is None
    assert cert.nonce_of(cert.secret_from("y"), code) is None, "another server's key"
    assert cert.nonce_of(secret, "0" * 16) is None and cert.nonce_of(secret, None) is None
