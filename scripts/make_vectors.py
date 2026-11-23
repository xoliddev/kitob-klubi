"""Regenerate shared/test_vectors.json from the Python core.

pytest checks that the file is up to date (so the Python core and the vectors never drift apart), and
``node --test`` checks the JS port against the very same vectors.

    python scripts/make_vectors.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from kitobklubi import i18n  # noqa: E402
from kitobklubi.core import books, cert, clock, fair, marathon, nudge, seedgen, stats, streak, text  # noqa: E402

OUT = ROOT / "shared" / "test_vectors.json"
NOW = 1_795_000_000_000  # 2026-11-18 16:06 in Tashkent, a Wednesday
TODAY = clock.local_day(NOW)
NYE = clock.days_from_civil(2027, 1, 2)


def load(name: str):
    with open(ROOT / "shared" / "data" / f"{name}.json", encoding="utf-8") as fh:
        return json.load(fh)


def res(fn, *args):
    try:
        return {"ok": fn(*args)}
    except text.InputError as e:
        return {"error": e.code}


def basics(v: dict) -> None:
    v["civil"] = [{"day": d, "out": list(clock.civil(d)), "back": clock.days_from_civil(*clock.civil(d))}
                  for d in (0, 59, 365, 11_016, 20_775, 20_818, 20_819, 21_184, -1)]
    v["minute"] = [{"ms": ms, "day": clock.local_day(ms), "min": clock.local_minute(ms), "wd": clock.weekday(clock.local_day(ms))}
                   for ms in (NOW, NOW + 7 * 3_600_000 + 54 * 60_000, NOW + 8 * 3_600_000, 1_798_743_599_000, 1_798_743_600_000)]
    v["clean"] = [{"in": s, "n": n, "out": text.clean(s, n)} for s, n in (("  a \t b\n", 10), ("abc" + chr(0x202E) + "def", 20),
                                                                           ("x" * 20, 5), (None, 5), ("😀😀😀", 2))]
    v["whole"] = [{"in": x, "out": res(text.whole, x, 1, 5, "n")} for x in (1, 5, 0, 6, "3", "", "x", True, 2.5, None)]
    v["words"] = [{"in": x, "out": res(text.words, x, 2, 12, "w")} for x in ("ab", " a ", "O'tkan kunlar", "x" * 13, "!!", 5, "Шум бола")]
    v["sentences"] = [{"in": x, "out": res(text.sentences, x, 3, 200, 2, "proof")} for x in
                      ("Bir. Ikki.", "Bir. Ikki. Uch.", "Juda yoqdi!!! Rahmat...", "ok", "Savol? Javob! Yana.")]
    v["h32"] = [{"in": s, "out": text.h32(s)} for s in ("", "a", "sardor:p:3", "Madina Yusupova", "китоб")]
    v["group"] = [i18n.group(n) for n in (0, 7, 999, 1000, 1280, 1234567, -4500)]


def book_rules(v: dict) -> None:
    cat = load("catalog")
    tries = [{"catalog": "otkan_kunlar"}, {"catalog": "nope"}, {"title": "Mening kitobim", "author": "Muallif", "pages": "250"},
             {"title": "A", "author": "Muallif", "pages": 250}, {"title": "Kitob", "author": "M", "pages": 250},
             {"title": "Kitob", "author": "Muallif", "pages": 9}, {"catalog": "shum_bola", "start": 40}, {"catalog": "shum_bola", "start": 176},
             {"catalog": "shum_bola", "start": ""}, "x"]
    v["book"] = [{"in": d, "out": res(books.validate, d, cat)} for d in tries]
    v["progress"] = [{"in": [p, g], "out": books.progress(p, g)} for p, g in ((384, 0), (384, 25), (384, 384), (384, 500), (96, 95))]
    v["pace"] = [{"in": [pd, added, left], "out": books.pace(pd, added, left, TODAY)} for pd, added, left in
                 (([[TODAY, 25]], TODAY, 359), ([], TODAY, 384), ([[TODAY - 1, 30], [TODAY, 0]], TODAY - 1, 300),
                  ([[TODAY - 20, 99], [TODAY - 5, 40], [TODAY, 30]], TODAY - 30, 200), ([[TODAY, 50]], TODAY, 0), ([[TODAY - 3, 1]], TODAY - 30, 5))]
    v["asked"] = [{"in": [d, p], "out": res(books.asked_pages, d, p, 384)} for d, p in
                  (({"add": 20}, 10), ({"add": "35"}, 10), ({"add": 0}, 10), ({"page": 145}, 100), ({"page": 100}, 100), ({"page": 385}, 0),
                   ({"add": 5001}, 0), ("x", 0))]


def streak_rules(v: dict) -> None:
    week = [[TODAY - 13 + i, 12] for i in range(7)]
    cases = [([], [[0, 10]], TODAY), ([[TODAY, 25]], [[0, 10]], TODAY), ([[TODAY, 5]], [[0, 10]], TODAY),
             (week, [[0, 10]], TODAY - 7), ([*week, [TODAY - 5, 15]], [[0, 10]], TODAY - 5),
             ([*week, [TODAY - 5, 15], [TODAY - 4, 20]], [[0, 10]], TODAY - 3),
             ([[TODAY - 20 + i, 11] for i in range(20) if i not in (8, 15, 16, 17)], [[0, 10]], TODAY),
             ([[TODAY - 9 + i, 20] for i in range(9)], [[0, 10], [TODAY - 4, 25]], TODAY),
             ([[NYE - 9 + i, 30] for i in range(9) if i != 7], [[0, 10]], NYE),
             ([[TODAY - 30 + i, 15] for i in range(31)], [[0, 10]], TODAY), ([[TODAY - 2, 40], [TODAY - 2, 5]], [], TODAY - 1)]
    v["streak"] = [{"in": [tt, g, d], "out": streak.compute(tt, g, d)} for tt, g, d in cases]
    v["goal_on"] = [streak.goal_on([[0, 10], [100, 20], [200, 5]], d) for d in (-5, 0, 99, 100, 150, 200, 999)]
    v["flame"] = [streak.flame(n) for n in (0, 1, 2, 3, 6, 7, 13, 14, 29, 30, 400)]


def fair_rules(v: dict) -> None:
    hist = [[TODAY - k, 20 + k] for k in range(1, 15)]
    v["day_for"] = [res(fair.day_for, w, TODAY) for w in (None, "today", "yesterday", "tomorrow", 5)]
    v["usual"] = [{"in": [tt, d], "out": fair.usual(tt, d)} for tt, d in
                  ((hist, TODAY), ([[TODAY - 1, 10], [TODAY - 2, 30]], TODAY), ([[TODAY - 1, 10], [TODAY - 1, 30], [TODAY - 3, 5], [TODAY - 20, 900]],
                                                                                  TODAY), (hist, TODAY - 10))]
    v["check"] = [{"in": a, "out": res(fair.check, *a)} for a in
                  ((0, 25, 300, None, 10), (30, 900, 300, 22, 10), (0, 120, 300, 22, 10), (0, 151, 300, 60, 10), (0, 181, 300, 60, 10),
                   (300, 5, 300, 22, 10), (290, 20, 300, None, 10), (0, 40, 300, None, 30))]


def marathon_rules(v: dict) -> None:
    tries = [{"title": "30 kunda 1000 bet", "days": 30, "goal": 1000}, {"title": "Qish", "days": "14", "goal": "400", "start_in": 1},
             {"title": "X", "days": 30, "goal": 1000}, {"title": "Yoz", "days": 2, "goal": 1000}, {"title": "Yoz", "days": 30, "goal": 40},
             {"title": "Yoz", "days": 30, "goal": 1000, "start_in": 15}, []]
    v["marathon"] = [{"in": d, "out": res(marathon.validate, d, TODAY)} for d in tries]
    m = {"start": TODAY - 10, "end": TODAY + 19, "goal": 1000}
    v["mstate"] = [{"day": d, "state": marathon.state(m, d), "elapsed": marathon.elapsed(m, d), "expected": marathon.expected(m, d)}
                   for d in (TODAY - 11, TODAY - 10, TODAY - 8, TODAY, TODAY + 19, TODAY + 20)]
    rows = [{"id": 1, "name": "Madina", "pages": 420, "streak": 9, "books": 1, "flags": 0},
            {"id": 2, "name": "Sardor", "pages": 300, "streak": 3, "books": 0, "flags": 1},
            {"id": 3, "name": "Aziza", "pages": 300, "streak": 0, "books": 0, "flags": 0},
            {"id": 4, "name": "Bekzod", "pages": 120, "streak": 1, "books": 0, "flags": 0},
            {"id": 5, "name": "Dilnoza", "pages": 1100, "streak": 20, "books": 2, "flags": 0}]
    v["board"] = [{"day": d, "out": marathon.board(json.loads(json.dumps(rows)), m, d)} for d in (TODAY - 9, TODAY, TODAY + 25)]


def cert_rules(v: dict) -> None:
    secret = cert.secret_from("test-only-seed")
    nonces = ["0000000000", "a1b2c3d4e5", "ffffffffff"]
    codes = [cert.make(secret, bytes.fromhex(n)) for n in nonces]
    edited = codes[1][:7] + ("A" if codes[1][7] != "A" else "B") + codes[1][8:]
    v["cert"] = {"secret": secret.hex(), "nonces": nonces, "codes": codes, "pretty": [cert.pretty(c) for c in codes],
                 "check": [{"in": s, "norm": cert.norm(s), "nonce": cert.nonce_of(secret, s)} for s in
                           (codes[1], cert.pretty(codes[1]).lower(), f"  {cert.pretty(codes[2])} ", edited, codes[0][:15], "0" * 16, 12, "x" * 41)],
                 "club": [cert.code_from(n) for n in (0, 1, 2**40 - 1, 123_456_789_012)]}


def numbers(v: dict) -> None:
    tt = [[TODAY - k, (k * 7) % 31] for k in range(0, 60) if k % 5] + [[TODAY - 2, 40]]
    goals = [[0, 10], [TODAY - 20, 15]]
    st = streak.compute(tt, goals, TODAY)
    v["stats"] = {"in": [tt, goals], "weekly": stats.weekly(tt, TODAY), "heatmap": stats.heatmap(tt, goals, st["used"], TODAY),
                  "authors": stats.authors([{"author": a} for a in ("Cho'lpon", "Abdulla Qodiriy", "Cho'lpon", "Lev Tolstoy", "Abdulla Qodiriy",
                                                                     "Ayn", "Cho'lpon")]), "summary": stats.summary(tt, 3)}
    v["nudge_valid"] = [res(nudge.valid, x) for x in (None, "off", 1200, "1230", 1215, 470, 1320, 1290)]
    v["nudge_due"] = [nudge.due(m, at, met) for m, at, met in ((1200, 1200, False), (1199, 1200, False), (1250, 1200, True), (1330, 1200, False),
                                                                (1300, None, False), (479, 480, False))]


def sentences_(v: dict) -> None:
    card = {"title": "O'tkan kunlar", "pace": books.pace([[TODAY, 25]], TODAY, 359, TODAY)}
    out = []
    for lang in ("uz", "ru"):
        out.append({"lang": lang, "pace": i18n.pace_line(lang, card, TODAY),
                    "pace1": i18n.pace_line(lang, {**card, "pace": {"rate": 5000, "days": 1, "day": TODAY + 1}}, TODAY),
                    "pace0": i18n.pace_line(lang, {**card, "pace": {"rate": 0, "days": None, "day": None}}, TODAY),
                    "today": [i18n.today_line(lang, c["out"]) for c in v["streak"]],
                    "streak": [i18n.streak_line(lang, c["out"]) for c in v["streak"]],
                    "saved": [i18n.saved_line(lang, c["out"]) for c in v["streak"]],
                    "freeze": [i18n.freeze_line(lang, c["out"]) for c in v["streak"]],
                    "date": [i18n.date_short(lang, d) for d in (TODAY, NYE, TODAY + 24)], "pages": i18n.pages(lang, 1280),
                    "mar": [i18n.mar_state(lang, {"state": s, "in": 2, "elapsed": 4, "days": 30}) for s in ("soon", "live", "over")],
                    "usual": [i18n.usual_text(lang, u) for u in (None, 22)], "bar": i18n.progress_bar(47)})
    v["sentences_i18n"] = out


def main() -> None:
    v: dict = {"now": NOW, "today": TODAY}
    for fn in (basics, book_rules, streak_rules, fair_rules, marathon_rules, cert_rules, numbers, sentences_):
        fn(v)
    v["world"] = seedgen.world(load("people"), load("catalog"), TODAY)
    v["world_demo"] = seedgen.world(load("people"), load("catalog"), NYE, marathon=False)
    OUT.write_bytes((json.dumps(v, ensure_ascii=False, indent=1) + "\n").encode("utf-8"))


if __name__ == "__main__":
    main()
