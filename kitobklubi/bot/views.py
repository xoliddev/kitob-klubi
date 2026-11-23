"""The reader's screens as (text, rows): the menu with the olov, logging pages, the result of a log, books, the
catalog and settings. Rows are [(label, callback data)]; "@app#..." opens the Mini App. demo/bot-views.js builds the
same screens from the same locale files."""

from __future__ import annotations

import html

from ..core.clock import hhmm
from ..core.nudge import CHOICES
from ..i18n import Raw, date_short, freeze_line, pace_line, progress_bar, saved_line, streak_line, t, today_line

Rows = list[list[tuple[str, str]]]
PER_PAGE = 8


def back(lang: str, data: str = "n:menu") -> list[tuple[str, str]]:
    return [(t(lang, "btn.back"), data)]


def _esc(s: str) -> str:
    return html.escape(s, quote=False)


def book_line(lang: str, card: dict) -> str:
    progress = t(lang, "book.progress", page=card["page"], pages=card["pages"], pct=card["pct"])
    return f"📖 «{_esc(card['title'])}» {progress_bar(card['pct'])} {progress}"


def status_lines(lang: str, st: dict) -> list[str]:
    lines = [streak_line(lang, st), today_line(lang, st)]
    saved = saved_line(lang, st)
    if saved:
        lines.append(saved + " " + t(lang, "streak.saved_hint"))
    if st["streak"] > 0:
        lines.append(freeze_line(lang, st))
    return lines


def menu(lang: str, home: dict, hello: bool = False) -> tuple[str, Rows]:
    st = home["streak"]
    lines = [t(lang, "menu.hello", name=home["me"]["name"])] if hello else []
    lines += status_lines(lang, st)
    lines += [book_line(lang, b) for b in home["books"][:3]] or [t(lang, "book.none")]
    if home["asks"]:
        lines.append(t(lang, "menu.asks", n=len(home["asks"])))
    rows: Rows = [[(t(lang, "btn.read"), "r")]]
    if home["asks"]:
        rows.append([(t(lang, "btn.write_proof"), f"pw:{home['asks'][0]['id']}")])
    rows += [[(t(lang, "btn.books"), "n:books"), (t(lang, "btn.add"), "n:add")],
             [(t(lang, "btn.clubs"), "n:clubs"), (t(lang, "btn.certs"), "n:certs")],
             [(t(lang, "btn.settings"), "n:set"), (t(lang, "btn.lang"), "n:lang")],
             [(t(lang, "btn.app"), "@app")]]
    if home["me"]["roles"]["admin"]:
        rows.append([(t(lang, "btn.admin"), "n:admin")])
    return "\n".join(lines), rows


def choose_book(lang: str, books: list[dict], flag: str = "t") -> tuple[str, Rows]:
    rows = [[(f"📖 {b['title']} · {b['page']}/{b['pages']}", f"l:{b['id']}:{flag}")] for b in books]
    return t(lang, "log.which"), [*rows, back(lang)]


def log_screen(lang: str, card: dict, flag: str = "t") -> tuple[str, Rows]:
    key = "log.ask_y" if flag == "y" else "log.ask"
    bid = card["id"]
    other = ("btn.today", f"l:{bid}:t") if flag == "y" else ("btn.yesterday", f"l:{bid}:y")
    rows: Rows = [[(f"+{n}", f"la:{bid}:{n}:{flag}") for n in (10, 20, 50)],
                  [(t(lang, "btn.other"), f"lo:{bid}:{flag}"), (t(lang, "btn.page"), f"lp:{bid}:{flag}")],
                  [(t(lang, other[0]), other[1])], back(lang)]
    return t(lang, key, title=card["title"], page=card["page"], pages=card["pages"]), rows


def logged(lang: str, out: dict, cap: int, today: int) -> tuple[str, Rows]:
    """What the reader sees right after a log: what counted, the olov, the book and its forecast."""
    log, st, card = out["log"], out["streak"], out["book"]
    key = "log.saved_y" if log["day"] < today else "log.saved"
    lines = [t(lang, key, n=log["pages"], title=card["title"])]
    if log["capped"]:
        lines.append(t(lang, "log.capped", cap=cap, asked=log["asked"], n=log["pages"]))
    elif log["status"] == "flagged":
        lines.append(t(lang, "log.flagged"))
    if out["lit"]:
        lines.append(t(lang, "log.lit"))
    elif out["met_now"]:
        lines.append(t(lang, "log.met", n=st["streak"]))
    if out["met_now"] and st["earned"] and st["earned"][-1] == today:
        lines.append(t(lang, "log.earned", n=st["freezes"]))
    lines.append(today_line(lang, st))
    rows: Rows
    if out["finished"]:
        lines += ["", t(lang, "book.finished", title=card["title"]), t(lang, "review.ask")]
        rows = [[(t(lang, "btn.review"), f"rv:{card['id']}")], [(t(lang, "btn.skip"), "n:menu")]]
    else:
        lines += [book_line(lang, card), pace_line(lang, card, today)]
        rows = [[(t(lang, "btn.read"), f"l:{card['id']}:t")], [(t(lang, "btn.menu"), "n:menu")]]
    return "\n".join(lines), rows


def books(lang: str, data: dict, today: int) -> tuple[str, Rows]:
    lines = [t(lang, "book.list")]
    for b in data["active"]:
        lines += ["", book_line(lang, b), pace_line(lang, b, today)]
    if not data["active"]:
        lines.append(t(lang, "book.none"))
    if data["done"]:
        lines += ["", t(lang, "book.done_list", n=len(data["done"]))]
        lines += [f"✅ {_esc(b['title'])} — {_esc(b['author'])}" for b in data["done"][:5]]
    rows = [[(f"📖 {b['title']}", f"b:{b['id']}")] for b in data["active"]]
    rows += [[(f"✅ {b['title']}", f"b:{b['id']}")] for b in data["done"][:5]]
    return "\n".join(lines), [*rows, [(t(lang, "btn.add"), "n:add")], back(lang)]


def book(lang: str, v: dict) -> tuple[str, Rows]:
    card = v["book"]
    lines = [f"<b>{_esc(card['title'])}</b> — {_esc(card['author'])}", book_line(lang, card)]
    if card["finished_day"] is not None:
        lines.append(t(lang, "book.done", date=Raw(date_short(lang, card["finished_day"]))))
        if card["review"]:
            lines.append(t(lang, "book.review", text=card["review"]))
        rows: Rows = [[(t(lang, "btn.review"), f"rv:{card['id']}")]]
    else:
        lines.append(pace_line(lang, card, v["today"]))
        rows = [[(t(lang, "btn.read"), f"l:{card['id']}:t")]]
    for log in v["logs"][:5]:
        mark = t(lang, f"status.{log['status']}")
        lines.append(f"· {date_short(lang, log['day'])}: +{log['pages']}" + (f" ({mark})" if mark else ""))
    return "\n".join(lines), [*rows, [(t(lang, "btn.app"), f"@app#b={card['id']}")], back(lang, "n:books")]


def catalog(lang: str, items: list[dict], page: int) -> tuple[str, Rows]:
    pages = (len(items) + PER_PAGE - 1) // PER_PAGE
    page = max(0, min(page, pages - 1))
    chunk = items[page * PER_PAGE:(page + 1) * PER_PAGE]
    rows: Rows = [[(f"{b['title']} — {b['author']}", f"bk:{b['id']}")] for b in chunk]
    nav = []
    if page > 0:
        nav.append((t(lang, "btn.prev"), f"bc:{page - 1}"))
    if page < pages - 1:
        nav.append((t(lang, "btn.next"), f"bc:{page + 1}"))
    if nav:
        rows.append(nav)
    return t(lang, "add.title"), [*rows, [(t(lang, "btn.manual"), "bm")], back(lang)]


def settings(lang: str, me: dict) -> tuple[str, Rows]:
    nudge = hhmm(me["nudge"]) if me["nudge"] is not None else t(lang, "set.off")
    return t(lang, "set.head", goal=me["goal"], nudge=nudge), [[(t(lang, "btn.goal"), "g")], [(t(lang, "btn.nudge"), "tm")], back(lang)]


def goals(lang: str, current: int) -> tuple[str, Rows]:
    mark = lambda n: f"✓ {n}" if n == current else str(n)  # noqa: E731
    rows = [[(mark(n), f"g:{n}") for n in (5, 10, 20)], [(mark(n), f"g:{n}") for n in (30, 50, 100)]]
    return t(lang, "set.goal_ask"), [*rows, back(lang, "n:set")]


def nudges(lang: str, current: int | None) -> tuple[str, Rows]:
    mark = lambda m: f"✓ {hhmm(m)}" if m == current else hhmm(m)  # noqa: E731
    rows = [[(mark(m), f"tm:{m}") for m in CHOICES[:4]], [(mark(m), f"tm:{m}") for m in CHOICES[4:]],
            [(t(lang, "btn.off"), "tm:off")]]
    return t(lang, "set.nudge_ask"), [*rows, back(lang, "n:set")]
