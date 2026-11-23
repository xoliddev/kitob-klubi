"""Texts for the bot, read from shared/locales/*.json (the Mini App and the browser demo read the same files), plus
the sentences every screen needs. shared/i18n.js is the same code for the browser, and shared/test_vectors.json
checks that both write the same sentence ("Shu tezlikda «O'tkan kunlar»ni taxminan 12-dekabrda tugatasiz")."""

from __future__ import annotations

import html
import json
import re
from functools import cache
from pathlib import Path

from .core.clock import civil

LOCALE_DIR = Path(__file__).resolve().parent.parent / "shared" / "locales"
_PLACEHOLDER = re.compile(r"\{(\w+)\}")


def norm_lang(code: str | None) -> str:
    return "ru" if code and str(code)[:2].lower() == "ru" else "uz"


class Raw(str):
    """A parameter that is already safe HTML (for example a nested, already-rendered text)."""


@cache
def catalog(lang: str) -> dict[str, str]:
    with open(LOCALE_DIR / f"{lang}.json", encoding="utf-8") as fh:
        return json.load(fh)


def render(template: str, params: dict) -> str:
    def sub(m: re.Match) -> str:
        if m.group(1) not in params:
            return m.group(0)
        value = params[m.group(1)]
        return value if isinstance(value, Raw) else html.escape(str(value), quote=False)

    return _PLACEHOLDER.sub(sub, template)


def t(lang: str, key: str, **params: object) -> str:
    """Localized text; parameters are HTML-escaped unless wrapped in ``Raw``."""
    lang = norm_lang(lang)
    template = catalog(lang).get(key) or catalog("uz").get(key) or key
    return render(template, params)


def plain(text: str) -> str:
    """For callback alerts, which show plain text."""
    return html.unescape(re.sub(r"<[^>]+>", "", text))


def group(n: int) -> str:
    """1280 -> "1 280"."""
    s = str(abs(n))
    out = ""
    while len(s) > 3:
        out = " " + s[-3:] + out
        s = s[:-3]
    return ("-" if n < 0 else "") + s + out


def pages(lang: str, n: int) -> str:
    return t(lang, "fmt.pages", n=group(n))


def date_short(lang: str, day: int) -> str:
    _y, m, d = civil(day)
    return t(lang, "fmt.day", d=d, month=t(lang, f"month.{m}"))


def date_full(day: int) -> str:
    y, m, d = civil(day)
    return f"{d:02d}.{m:02d}.{y}"


def rate(r: int) -> int:
    """Pages a day ×100 -> whole pages, rounded."""
    return (r + 50) // 100


def pace_line(lang: str, card: dict, today: int) -> str:
    """The forecast sentence for a book being read (the Mini App and the bot show exactly this)."""
    p = card["pace"]
    if p["day"] is None:
        return t(lang, "book.pace_none")
    gap = p["day"] - today
    when = t(lang, "when.today") if gap <= 0 else t(lang, "when.tomorrow") if gap == 1 else \
        t(lang, "book.pace_on", date=Raw(date_short(lang, p["day"])))
    return t(lang, "book.pace", title=card["title"], when=Raw(when))


def today_line(lang: str, st: dict) -> str:
    if st["met"]:
        return t(lang, "today.met", read=st["today"], goal=st["goal"])
    if st["today"] > 0:
        return t(lang, "today.left", read=st["today"], goal=st["goal"], left=st["left"])
    return t(lang, "today.none", goal=st["goal"])


def streak_line(lang: str, st: dict) -> str:
    if st["streak"] == 0:
        return t(lang, "streak.out", goal=st["goal"])
    return t(lang, "streak.line", n=st["streak"])


def saved_line(lang: str, st: dict) -> str:
    """ "Kecha o'qilmadi — 1 ta muzlatish ishlatildi, olov saqlab qolindi." (empty when nothing was saved)"""
    if not st["saved"] or st["streak"] == 0:
        return ""
    return t(lang, "streak.saved_1") if st["saved"] == 1 else t(lang, "streak.saved_n", n=st["saved"])


def freeze_line(lang: str, st: dict) -> str:
    tail = t(lang, "streak.full") if st["freezes"] >= 2 else t(lang, "streak.next", n=st["next_freeze"])
    return f"{t(lang, 'streak.freezes', n=st['freezes'])} · {tail}"


def progress_bar(pct: int, width: int = 10) -> str:
    full = pct * width // 100
    return "▰" * full + "▱" * (width - full)


def mar_state(lang: str, m: dict) -> str:
    if m["state"] == "soon":
        return t(lang, "mar.soon", n=m["in"])
    if m["state"] == "live":
        return t(lang, "mar.live", day=m["elapsed"], days=m["days"])
    return t(lang, "mar.over")


def usual_text(lang: str, usual: int | None) -> str:
    return t(lang, "flag.usual_none") if usual is None else t(lang, "fmt.rate", n=usual)
