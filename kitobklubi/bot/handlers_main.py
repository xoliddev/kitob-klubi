"""/start with its deep links (``k_<club code>`` joins a club, ``v_<certificate code>`` checks a certificate), the
main menu with the olov, the language switch, settings (daily goal, nudge time), the admin screen and the stale-button
fallback. ``/start`` is the only command: everything else is buttons, and every screen has "⬅️ Orqaga"."""

from __future__ import annotations

import re

from aiogram import F, Router
from aiogram.filters import CommandObject, CommandStart
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery, Message, ReplyKeyboardRemove

from ..common import Refused
from ..i18n import plain, t
from . import views, views_club
from .setup import show

router = Router(name="main")
fallback = Router(name="fallback")
JOIN = re.compile(r"^k_([A-Z2-9]{8})$")
VERIFY = re.compile(r"^v_([A-Z2-9]{16})$")


async def menu(event, svc, me: int, cfg, hello: bool = False) -> None:
    home = await svc.home(me)
    await show(event, views.menu(home["me"]["lang"], home, hello), cfg)


@router.message(CommandStart())
async def start(message: Message, state: FSMContext, svc, me, lang, cfg, command: CommandObject | None = None) -> None:
    await state.clear()
    arg = (command.args or "") if command else ""
    if m := JOIN.match(arg):
        try:
            v = await svc.join(me, m.group(1))
        except Refused as err:
            await message.answer(t(lang, f"err.{err.code}"), reply_markup=ReplyKeyboardRemove())
            await menu(message, svc, me, cfg)
            return
        text, rows = views_club.club(lang, v, cfg.join_link(v["club"]["code"]) if "code" in v["club"] else "")
        await show(message, (t(lang, "join.done", name=v["club"]["name"]) + "\n\n" + text, rows), cfg)
        return
    if m := VERIFY.match(arg):
        try:
            res = await svc.verify(m.group(1))
        except Refused:
            res = None
        await message.answer(views_club.verified(lang, res), reply_markup=ReplyKeyboardRemove())
        return
    await message.answer("📚", reply_markup=ReplyKeyboardRemove())
    await menu(message, svc, me, cfg, hello=True)


@router.callback_query(F.data == "n:menu")
async def nav_menu(cq: CallbackQuery, state: FSMContext, svc, me, cfg) -> None:
    await state.clear()
    await menu(cq, svc, me, cfg)


@router.callback_query(F.data == "n:lang")
async def nav_lang(cq: CallbackQuery, svc, me, lang, cfg) -> None:
    await svc.set_lang(me, "ru" if lang == "uz" else "uz")
    await menu(cq, svc, me, cfg)


@router.callback_query(F.data == "n:set")
async def settings(cq: CallbackQuery, state: FSMContext, svc, me, lang, cfg) -> None:
    await state.clear()
    await show(cq, views.settings(lang, await svc.me(me)), cfg)


@router.callback_query(F.data == "g")
async def goal_menu(cq: CallbackQuery, svc, me, lang, cfg) -> None:
    await show(cq, views.goals(lang, (await svc.me(me))["goal"]), cfg)


@router.callback_query(F.data.regexp(r"^g:(\d{1,3})$").as_("m"))
async def goal_set(cq: CallbackQuery, m: re.Match, svc, me, lang, cfg) -> None:
    await show(cq, views.settings(lang, await svc.set_goal(me, int(m.group(1)))), cfg)


@router.callback_query(F.data == "tm")
async def nudge_menu(cq: CallbackQuery, svc, me, lang, cfg) -> None:
    await show(cq, views.nudges(lang, (await svc.me(me))["nudge"]), cfg)


@router.callback_query(F.data.regexp(r"^tm:(\d{3,4}|off)$").as_("m"))
async def nudge_set(cq: CallbackQuery, m: re.Match, svc, me, lang, cfg) -> None:
    value = None if m.group(1) == "off" else int(m.group(1))
    await show(cq, views.settings(lang, await svc.set_nudge(me, value)), cfg)


@router.callback_query(F.data == "n:admin")
async def admin(cq: CallbackQuery, svc, me, lang, cfg) -> None:
    await show(cq, views_club.admin(lang, await svc.admin_home(me)), cfg)


@router.callback_query(F.data.regexp(r"^ab:(\d{1,9}):([01])$").as_("m"))
async def admin_block(cq: CallbackQuery, m: re.Match, svc, me, lang, cfg) -> None:
    await show(cq, views_club.admin(lang, await svc.admin_block(me, int(m.group(1)), m.group(2) == "1")), cfg)


@fallback.callback_query()
async def stale(cq: CallbackQuery, lang) -> None:
    await cq.answer(plain(t(lang, "err.stale")), show_alert=True)


@fallback.message()
async def anything(message: Message, state: FSMContext, svc, me, cfg) -> None:
    await state.clear()
    await menu(message, svc, me, cfg)
