"""The reader in the bot: "Bugun o'qidim" → +10 / +20 / +50 / another number / "hozir qaysi betdasiz?" (today or
yesterday), books, adding a book from the catalog or by hand, the fikr after the last page, and writing an isbot."""

from __future__ import annotations

import re

from aiogram import F, Router
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery, Message

from ..common import Refused
from ..i18n import t
from . import views
from .cb import D, Flow, N, W, when
from .setup import show

router = Router(name="read")


def number(text: str) -> int | str:
    s = text.replace(" ", "").replace("'", "").strip()
    return int(s) if s.isascii() and s.isdigit() and len(s) <= 6 else text


async def log_and_show(event, svc, me, lang, cfg, notifier, bid: int, data: dict) -> None:
    out, notes = await svc.log(me, bid, data)
    await show(event, views.logged(lang, out, svc.cap, svc.today()), cfg)
    await notifier.send(notes)


@router.callback_query(F.data == "r")
async def read(cq: CallbackQuery, svc, me, lang, cfg) -> None:
    home = await svc.home(me)
    if not home["books"]:
        await show(cq, views.catalog(lang, svc.catalog, 0), cfg)
    elif len(home["books"]) == 1:
        await show(cq, views.log_screen(lang, home["books"][0]), cfg)
    else:
        await show(cq, views.choose_book(lang, home["books"]), cfg)


@router.callback_query(F.data.regexp(rf"^l:{N}:{D}$").as_("m"))
async def log_screen(cq: CallbackQuery, m: re.Match, state: FSMContext, svc, me, lang, cfg) -> None:
    await state.clear()
    v = await svc.book_view(me, int(m.group(1)))
    await show(cq, views.log_screen(lang, v["book"], m.group(2)), cfg)


@router.callback_query(F.data.regexp(rf"^la:{N}:(10|20|50):{D}$").as_("m"))
async def log_quick(cq: CallbackQuery, m: re.Match, svc, me, lang, cfg, notifier) -> None:
    await log_and_show(cq, svc, me, lang, cfg, notifier, int(m.group(1)), {"add": int(m.group(2)), "day": when(m.group(3))})


@router.callback_query(F.data.regexp(rf"^l([op]):{N}:{D}$").as_("m"))
async def log_typed(cq: CallbackQuery, m: re.Match, state: FSMContext, svc, me, lang, cfg) -> None:
    v = await svc.book_view(me, int(m.group(2)))
    await state.set_state(Flow.log_n if m.group(1) == "o" else Flow.log_page)
    await state.update_data(bid=v["book"]["id"], day=when(m.group(3)))
    key = "log.type_n" if m.group(1) == "o" else "log.type_page"
    await show(cq, (t(lang, key, page=v["book"]["page"], pages=v["book"]["pages"]), [views.back(lang, f"l:{v['book']['id']}:t")]), cfg)


@router.message(Flow.log_n, F.text)
@router.message(Flow.log_page, F.text)
async def log_typed_value(message: Message, state: FSMContext, svc, me, lang, cfg, notifier) -> None:
    d = await state.get_data()
    field = "add" if await state.get_state() == Flow.log_n.state else "page"
    await log_and_show(message, svc, me, lang, cfg, notifier, d.get("bid"), {field: number(message.text), "day": d.get("day")})
    await state.clear()


@router.callback_query(F.data == "n:books")
async def books(cq: CallbackQuery, state: FSMContext, svc, me, lang, cfg) -> None:
    await state.clear()
    await show(cq, views.books(lang, await svc.books(me), svc.today()), cfg)


@router.callback_query(F.data.regexp(rf"^b:{N}$").as_("m"))
async def book(cq: CallbackQuery, m: re.Match, svc, me, lang, cfg) -> None:
    await show(cq, views.book(lang, await svc.book_view(me, int(m.group(1)))), cfg)


@router.callback_query(F.data == "n:add")
@router.callback_query(F.data.regexp(r"^bc:(\d{1,2})$").as_("m"))
async def catalog(cq: CallbackQuery, state: FSMContext, svc, lang, cfg, m: re.Match | None = None) -> None:
    await state.clear()
    await show(cq, views.catalog(lang, svc.catalog, int(m.group(1)) if m else 0), cfg)


async def added(event, svc, me, lang, cfg, data: dict) -> None:
    card = await svc.add_book(me, data)
    text, rows = views.log_screen(lang, card)
    await show(event, (t(lang, "add.saved", title=card["title"], pages=card["pages"]) + "\n\n" + text, rows), cfg)


@router.callback_query(F.data.regexp(rf"^bk:{W}$").as_("m"))
async def add_catalog(cq: CallbackQuery, m: re.Match, svc, me, lang, cfg) -> None:
    await added(cq, svc, me, lang, cfg, {"catalog": m.group(1)})


@router.callback_query(F.data == "bm")
async def add_manual(cq: CallbackQuery, state: FSMContext, lang, cfg) -> None:
    await state.set_state(Flow.add_title)
    await show(cq, (t(lang, "add.ask_title"), [views.back(lang, "n:add")]), cfg)


@router.message(Flow.add_title, F.text)
async def add_title(message: Message, state: FSMContext, lang, cfg) -> None:
    await state.update_data(title=message.text[:200])
    await state.set_state(Flow.add_author)
    await show(message, (t(lang, "add.ask_author"), [views.back(lang, "n:add")]), cfg)


@router.message(Flow.add_author, F.text)
async def add_author(message: Message, state: FSMContext, lang, cfg) -> None:
    await state.update_data(author=message.text[:200])
    await state.set_state(Flow.add_pages)
    await show(message, (t(lang, "add.ask_pages"), [views.back(lang, "n:add")]), cfg)


@router.message(Flow.add_pages, F.text)
async def add_pages(message: Message, state: FSMContext, svc, me, lang, cfg) -> None:
    d = await state.get_data()
    try:
        await added(message, svc, me, lang, cfg, {"title": d.get("title"), "author": d.get("author"), "pages": number(message.text)})
    except Refused as err:
        if err.code != "pages":  # a bad title or author: start again from the name
            await state.set_state(Flow.add_title)
        raise
    await state.clear()


@router.callback_query(F.data.regexp(rf"^rv:{N}$").as_("m"))
async def review(cq: CallbackQuery, m: re.Match, state: FSMContext, svc, me, lang, cfg) -> None:
    v = await svc.book_view(me, int(m.group(1)))
    await state.set_state(Flow.review)
    await state.update_data(bid=v["book"]["id"])
    await show(cq, (t(lang, "review.ask"), [views.back(lang, f"b:{v['book']['id']}")]), cfg)


@router.message(Flow.review, F.text)
async def review_text(message: Message, state: FSMContext, svc, me, lang, cfg) -> None:
    bid = (await state.get_data()).get("bid")
    await svc.review(me, bid, message.text)
    await state.clear()
    text, rows = views.book(lang, await svc.book_view(me, bid))
    await show(message, (t(lang, "review.saved") + "\n\n" + text, rows), cfg)


@router.callback_query(F.data.regexp(rf"^pw:{N}$").as_("m"))
async def proof(cq: CallbackQuery, m: re.Match, state: FSMContext, svc, me, lang, cfg) -> None:
    info = await svc.log_info(me, int(m.group(1)))
    if info["user_id"] != me:
        await cq.answer(t(lang, "err.stale"), show_alert=True)
        return
    await state.set_state(Flow.proof)
    await state.update_data(lid=info["id"])
    await show(cq, (t(lang, "proof.ask"), [views.back(lang)]), cfg)


@router.message(Flow.proof, F.text)
async def proof_text(message: Message, state: FSMContext, svc, me, lang, cfg, notifier) -> None:
    _, notes = await svc.write_proof(me, (await state.get_data()).get("lid"), message.text)
    await state.clear()
    await notifier.send(notes)
    home = await svc.home(me)
    text, rows = views.menu(lang, home)
    await show(message, (t(lang, "proof.sent") + "\n\n" + text, rows), cfg)
