"""Callback data is ``<prefix>:<fields>`` with digits only for ids and ``[a-z_]`` for catalog ids, matched by strict
regexes in the handlers; anything else falls through to the "stale button" answer. Nothing in callback data is trusted
for authorization: the service re-checks every action against the caller's Telegram id. demo/bot.js speaks the same."""

from __future__ import annotations

from aiogram.fsm.state import State, StatesGroup

N = r"(\d{1,9})"
D = r"([ty])"  # t = today, y = yesterday
W = r"([a-z_]{1,32})"


class Flow(StatesGroup):
    log_n = State()
    log_page = State()
    add_title = State()
    add_author = State()
    add_pages = State()
    review = State()
    proof = State()
    club_name = State()
    club_code = State()


def when(flag: str) -> str:
    return "yesterday" if flag == "y" else "today"
