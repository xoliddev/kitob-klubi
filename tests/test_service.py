"""The service: the whole story (book → olov → freeze → marathon → cap and isbot → finished book → certificate →
verify), who may do what, rejected pages, yesterday's log, nudges exactly once, book certificates, and the olov over
30 days, across Tashkent midnight and New Year."""

from __future__ import annotations

import pytest

from kitobklubi.common import Refused
from kitobklubi.core import cert
from kitobklubi.core.clock import at_local, days_from_civil, local_day

from .helpers import LEADER, MADINA, OTKAN, SARDOR, STRANGER, Clock, club_code, read_days, service_env

PROOF = "Pyer va Andrey haqidagi boblarni o'qidim. Borodino jangi tasviri juda kuchli."


async def test_the_whole_story():
    async with service_env(marathon=False) as (svc, clock):
        await svc.touch_user(MADINA, "Madina Yusupova", "uz")
        book = await svc.add_book(MADINA, OTKAN)
        out, _ = await svc.log(MADINA, book["id"], {"add": 25})
        assert (out["streak"]["streak"], out["lit"], out["flame"]) == (1, True, 1)
        assert out["book"]["pace"] == {"rate": 2500, "days": 15, "day": svc.today() + 15}
        await read_days(svc, clock, MADINA, book["id"], [30, 42, 35, 28, 40, 33])
        home = await svc.home(MADINA)
        assert (home["streak"]["streak"], home["streak"]["freezes"], home["flame"]) == (7, 1, 3)
        await read_days(svc, clock, MADINA, book["id"], [0], hour=9)  # a day without reading
        clock.now = at_local(svc.today() + 1, 9 * 60)
        st = (await svc.home(MADINA))["streak"]
        assert (st["streak"], st["freezes"], st["saved"]) == (7, 0, 1), "the freeze saved the flame"

        view = await svc.join(MADINA, (await club_code(svc)).lower()[:4] + "-" + (await club_code(svc))[4:])
        assert view["club"]["name"] == "Ziyo kitobxonlari" and "code" not in view["club"], "members do not see the code"
        lview, notes = await svc.create_marathon(LEADER, 1, {"title": "30 kunda 1000 bet", "days": 30, "goal": 1000})
        assert lview["marathon"]["state"] == "live" and lview["club"]["code"]
        assert {n["to"] for n in notes} >= {MADINA, SARDOR}

        out, notes = await svc.log(SARDOR, 1, {"add": 900})
        assert out["log"] == {"id": out["log"]["id"], "day": svc.today(), "pages": 300, "asked": 900, "status": "flagged", "capped": True}
        assert notes == [{"type": "flag", "to": LEADER, "log_id": out["log"]["id"], "club_id": 1}]
        with pytest.raises(Refused, match="cap"):
            await svc.log(SARDOR, 1, {"add": 5})
        lid = out["log"]["id"]
        lview, notes = await svc.ask_proof(LEADER, lid)
        assert lview["flags"][0]["status"] == "asked" and notes[0]["to"] == SARDOR
        assert (await svc.home(SARDOR))["asks"][0]["id"] == lid
        _, notes = await svc.write_proof(SARDOR, lid, PROOF)
        assert notes == [{"type": "proof", "to": LEADER, "log_id": lid, "club_id": 1}]
        lview, notes = await svc.decide(LEADER, lid, True)
        assert lview["flags"] == [] and notes[0]["yes"] is True
        sardor = next(r for r in lview["board"] if r["id"] == SARDOR)
        assert (sardor["pages"], sardor["rank"], sardor["flags"]) == (300, 1, 0)

        await svc.log(MADINA, book["id"], {"add": 40})
        clock.now = at_local(svc.today() + 1, 19 * 60)
        out, _ = await svc.log(MADINA, book["id"], {"page": 384})
        assert out["finished"] and out["book"]["pct"] == 100 and out["log"]["status"] == "ok"
        card = await svc.review(MADINA, book["id"], "Juda ta'sirli roman. Otabek va Kumush taqdiri yig'latdi.")
        assert card["review"].startswith("Juda")
        with pytest.raises(Refused, match="review_long"):
            await svc.review(MADINA, book["id"], "Bir. Ikki. Uch. To'rt.")
        nxt = await svc.add_book(MADINA, {"catalog": "urush_va_tinchlik"})
        await read_days(svc, clock, MADINA, nxt["id"], [38] * 28)
        lview = await svc.club_view(LEADER, 1)
        assert lview["board"][0]["id"] == MADINA and lview["board"][0]["done"]
        assert next(r for r in lview["board"] if r["id"] == 105)["behind"], "the leader sees who is behind"
        assert "behind" not in (await svc.club_view(MADINA, 1))["me"], "members do not"
        clock.now = at_local(svc.today() + 1, 9 * 60)
        notes = await svc.tick()
        got = [n for n in notes if n["type"] == "cert"]
        assert [n["to"] for n in got] == [MADINA]
        c = await svc.cert(MADINA, got[0]["cert_id"])
        assert (c["kind"], c["title"], c["pages"]) == ("marathon", "30 kunda 1000 bet", 40 + 111 + 38 * 28)
        assert (await svc.verify(c["code"]))["cert"]["name"] == "Madina Yusupova"
        assert await svc.tick() == [], "closed once"


async def test_marathon_certificate_and_verify():
    async with service_env() as (svc, clock):
        # the seeded marathon started 10 days ago; Dilnoza (36 a day) starts a long book and reads 50 a day
        big = await svc.add_book(104, {"catalog": "urush_va_tinchlik"})
        await read_days(svc, clock, 104, big["id"], [50] * 20)
        clock.now = at_local(svc.today() + 1, 9 * 60)
        notes = await svc.tick()
        certs = [n for n in notes if n["type"] == "cert"]
        assert [n["to"] for n in certs] == [104]
        closed = next(n for n in notes if n["type"] == "closed")
        assert (closed["to"], closed["winners"]) == (LEADER, 1)
        c = await svc.cert(104, certs[0]["cert_id"])
        assert c["pages"] >= 1000 and c["club"] == "Ziyo kitobxonlari" and c["title"] == "30 kunda 1000 bet"
        ok = await svc.verify(c["code"].lower().replace("-", " "))
        assert ok["ok"] and ok["cert"]["name"] == "Dilnoza Ergasheva" and "id" not in ok["cert"]
        raw = cert.norm(c["code"])
        edited = raw[:5] + ("B" if raw[5] != "B" else "C") + raw[6:]
        forged = cert.make(cert.secret_from("another server"), bytes.fromhex("0102030405"))
        unknown = cert.make(svc.secret, bytes.fromhex("0102030405"))
        for bad in (edited, forged, unknown, "nonsense", None, "A" * 16):
            with pytest.raises(Refused, match=r"^cert_unknown$"):
                await svc.verify(bad)
        with pytest.raises(Refused, match="not_found"):
            await svc.cert(SARDOR, certs[0]["cert_id"])


async def test_who_may_do_what():
    async with service_env() as (svc, _):
        mine = await svc.add_book(MADINA, OTKAN)
        for call in (svc.book_view(STRANGER, mine["id"]), svc.log(STRANGER, mine["id"], {"add": 5}),
                     svc.review(STRANGER, mine["id"], "Zo'r kitob."), svc.club_view(STRANGER, 1), svc.leave(STRANGER, 1),
                     svc.create_marathon(SARDOR, 1, {"title": "Mening marafonim", "days": 7, "goal": 100}),
                     svc.club_settings(SARDOR, 1, {"code": True}), svc.remove_member(SARDOR, 1, 103), svc.ask_proof(SARDOR, 1),
                     svc.decide(SARDOR, 1, False), svc.write_proof(STRANGER, 1, PROOF), svc.admin_home(LEADER),
                     svc.book_view(MADINA, True)):
            with pytest.raises(Refused, match="not_found"):
                await call
        other = await svc.create_club(STRANGER, "Boshqa klub")
        assert other["club"]["is_leader"]
        out, _ = await svc.log(SARDOR, 1, {"add": 900})
        with pytest.raises(Refused, match="not_found"):
            await svc.decide(STRANGER, out["log"]["id"], False)  # a leader, but not of Sardor's club
        with pytest.raises(Refused, match="not_found"):
            await svc.log_info(STRANGER, out["log"]["id"])
        assert (await svc.log_info(LEADER, out["log"]["id"]))["usual"] is not None
        with pytest.raises(Refused, match="club_code"):
            await svc.join(STRANGER, "AAAAAAAA")
        with pytest.raises(Refused, match="marathon_live"):
            await svc.create_marathon(LEADER, 1, {"title": "Ikkinchi", "days": 7, "goal": 100})
        await svc.leave(SARDOR, 1)
        with pytest.raises(Refused, match="not_found"):
            await svc.club_view(SARDOR, 1)
        view = await svc.remove_member(LEADER, 1, 103)
        assert view["club"]["members"] == 3


async def test_rejected_pages_stop_counting_everywhere():
    async with service_env(marathon=False) as (svc, clock):
        book = await svc.add_book(MADINA, {"catalog": "alkimyogar", "start": 0})
        await svc.join(MADINA, await club_code(svc))
        await read_days(svc, clock, MADINA, book["id"], [12, 12, 12])
        clock.now = at_local(svc.today() + 1, 12 * 60)
        out, notes = await svc.log(MADINA, book["id"], {"add": 200})
        assert out["log"]["pages"] == 156 and out["finished"] and out["log"]["status"] == "flagged", "trimmed at the book's end, a jump"
        assert notes[-1]["type"] == "flag"
        assert (await svc.home(MADINA))["streak"]["streak"] == 4
        await svc.decide(LEADER, out["log"]["id"], False)
        v = await svc.book_view(MADINA, book["id"])
        assert (v["book"]["page"], v["book"]["finished_day"], v["logs"][0]["status"]) == (36, None, "rejected")
        assert (await svc.home(MADINA))["streak"]["streak"] == 3, "today does not count any more, yet is not a miss"
        with pytest.raises(Refused, match="decided"):
            await svc.decide(LEADER, out["log"]["id"], True)


async def test_yesterday_and_the_daily_cap():
    async with service_env(seed=False, cap=100) as (svc, clock):
        await svc.touch_user(MADINA, "Madina", "uz")
        b = await svc.add_book(MADINA, {"catalog": "urush_va_tinchlik"})
        clock.now = at_local(svc.today() + 1, 10 * 60)
        await svc.log(MADINA, b["id"], {"add": 10})
        out, _ = await svc.log(MADINA, b["id"], {"add": 15, "day": "yesterday"})
        assert out["streak"]["streak"] == 2 and out["log"]["day"] == svc.today() - 1
        for bad, code in (({"add": 5, "day": "2026-11-01"}, "day"), ({"add": 0}, "pages"), ({"page": 3}, "page_back"),
                          ({"page": 99999}, "page"), ({"add": "ko'p"}, "pages")):
            with pytest.raises(Refused, match=code):
                await svc.log(MADINA, b["id"], bad)
        out, _ = await svc.log(MADINA, b["id"], {"add": 120})
        assert (out["log"]["pages"], out["log"]["capped"]) == (90, True)
        with pytest.raises(Refused, match="cap"):
            await svc.log(MADINA, b["id"], {"add": 1})
        for bad in ({"title": "x", "author": "y", "pages": 5}, {"catalog": "yoq"}, "x"):
            with pytest.raises(Refused):
                await svc.add_book(MADINA, bad)
        with pytest.raises(Refused, match="book_dup"):
            await svc.add_book(MADINA, {"title": "urush va tinchlik", "author": "Lev Tolstoy", "pages": 900})


async def test_nudge_once_never_at_night_not_when_met():
    clock = Clock(at_local(days_from_civil(2026, 11, 20), 19 * 60 + 59))
    async with service_env(clock, seed=False) as (svc, _):
        await svc.touch_user(MADINA, "Madina", "uz")
        await svc.set_nudge(MADINA, 1200)
        b = await svc.add_book(MADINA, OTKAN)
        assert await svc.tick() == []
        clock.skip(minutes=1)
        notes = await svc.tick()
        assert notes == [{"type": "nudge", "to": MADINA, "left": 10, "streak": 0}]
        clock.skip(minutes=30)
        assert await svc.tick() == [], "once a day"
        clock.now = at_local(svc.today() + 1, 20 * 60)
        await svc.log(MADINA, b["id"], {"add": 12})
        assert await svc.tick() == [], "goal met"
        await svc.set_nudge(MADINA, 1290)
        clock.now = at_local(svc.today() + 1, 22 * 60 + 5)
        assert await svc.tick() == [], "quiet after 22:00"
        with pytest.raises(Refused, match="nudge"):
            await svc.set_nudge(MADINA, 1320)
        assert (await svc.set_nudge(MADINA, "off"))["nudge"] is None


async def test_book_certificate_when_the_leader_allows_it():
    async with service_env() as (svc, _):
        await svc.club_settings(LEADER, 1, {"book_certs": True})
        b = await svc.add_book(SARDOR, {"catalog": "kichkina_shahzoda"})
        _out, notes = await svc.log(SARDOR, b["id"], {"page": 96})
        cert_note = next(n for n in notes if n["type"] == "cert")
        c = await svc.cert(SARDOR, cert_note["cert_id"])
        assert c["kind"] == "book" and c["title"] == "Kichkina shahzoda — Antuan de Sent-Ekzyuperi" and c["pages"] == 96


@pytest.mark.parametrize("start", ["2026-12-10", "2026-12-28"])
async def test_the_olov_over_30_days_across_midnight_and_new_year(start):
    y, m, d = (int(x) for x in start.split("-"))
    clock = Clock(at_local(days_from_civil(y, m, d), 23 * 60 + 58))
    async with service_env(clock, seed=False) as (svc, _):
        await svc.touch_user(MADINA, "Madina", "uz")
        b = await svc.add_book(MADINA, {"catalog": "urush_va_tinchlik"})
        first = svc.today()
        for i in range(30):
            clock.now = at_local(first + i, 23 * 60 + 59)
            if i != 12:  # one missed day, saved by the freeze earned on day 7
                await svc.log(MADINA, b["id"], {"add": 11})
            clock.now += 2 * 60_000  # 00:01 the next day
            assert local_day(clock.now) == first + i + 1
        st = (await svc.home(MADINA))["streak"]
        assert (st["streak"], st["best"], st["used"], st["met"]) == (29, 29, [first + 12], False)
        assert st["freezes"] == 2, "29 counted days earn four, but the stock is two (one was spent)"
