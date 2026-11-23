"""Clubs in the bot: the list, joining by code, opening a club, the club with its marathon and leaderboard, leaving;
for the leader: a marathon from the presets, the fair-play queue (ask for an isbot, accept, reject), members, a new
code and book certificates; and the reader's certificates."""

from __future__ import annotations

import re

from aiogram import F, Router
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery, Message

from ..core.marathon import PRESETS
from ..i18n import t
from . import views
from . import views_club as vc
from .cb import Flow, N
from .setup import show

router = Router(name="club")


def club_screen(lang: str, v: dict, cfg) -> tuple:
    return vc.club(lang, v, cfg.join_link(v["club"]["code"]) if "code" in v["club"] else "")


@router.callback_query(F.data == "n:clubs")
async def clubs(cq: CallbackQuery, state: FSMContext, svc, me, lang, cfg) -> None:
    await state.clear()
    await show(cq, vc.clubs(lang, await svc.my_clubs(me)), cfg)


@router.callback_query(F.data.regexp(rf"^k:{N}$").as_("m"))
async def club(cq: CallbackQuery, m: re.Match, state: FSMContext, svc, me, lang, cfg) -> None:
    await state.clear()
    await show(cq, club_screen(lang, await svc.club_view(me, int(m.group(1))), cfg), cfg)


@router.callback_query(F.data.in_({"kn", "kj"}))
async def ask_text(cq: CallbackQuery, state: FSMContext, lang, cfg) -> None:
    await state.set_state(Flow.club_name if cq.data == "kn" else Flow.club_code)
    await show(cq, (t(lang, "create.ask" if cq.data == "kn" else "join.ask"), [views.back(lang, "n:clubs")]), cfg)


@router.message(Flow.club_name, F.text)
async def create(message: Message, state: FSMContext, svc, me, lang, cfg) -> None:
    v = await svc.create_club(me, message.text)
    await state.clear()
    await show(message, club_screen(lang, v, cfg), cfg)


@router.message(Flow.club_code, F.text)
async def join(message: Message, state: FSMContext, svc, me, lang, cfg) -> None:
    v = await svc.join(me, message.text)
    await state.clear()
    text, rows = club_screen(lang, v, cfg)
    await show(message, (t(lang, "join.done", name=v["club"]["name"]) + "\n\n" + text, rows), cfg)


@router.callback_query(F.data.regexp(rf"^kl:{N}(:y)?$").as_("m"))
async def leave(cq: CallbackQuery, m: re.Match, svc, me, lang, cfg) -> None:
    cid = int(m.group(1))
    if not m.group(2):
        v = await svc.club_view(me, cid)
        rows = [[(t(lang, "btn.yes"), f"kl:{cid}:y"), (t(lang, "btn.no"), f"k:{cid}")]]
        await show(cq, (t(lang, "leave.sure", name=v["club"]["name"]), rows), cfg)
        return
    await svc.leave(me, cid)
    text, rows = vc.clubs(lang, await svc.my_clubs(me))
    await show(cq, (t(lang, "leave.done") + "\n\n" + text, rows), cfg)


@router.callback_query(F.data.regexp(rf"^km:{N}$").as_("m"))
async def presets(cq: CallbackQuery, m: re.Match, svc, me, lang, cfg) -> None:
    v = await svc.club_view(me, int(m.group(1)))
    if not v["club"]["is_leader"]:
        await cq.answer(t(lang, "err.not_found"), show_alert=True)
        return
    await show(cq, vc.presets(lang, v["club"]["id"]), cfg)


@router.callback_query(F.data.regexp(rf"^kp:{N}:([0-2])$").as_("m"))
async def start_marathon(cq: CallbackQuery, m: re.Match, svc, me, lang, cfg, notifier) -> None:
    days, goal = PRESETS[int(m.group(2))]
    v, notes = await svc.create_marathon(me, int(m.group(1)), {"title": t(lang, "mar.title", days=days, goal=goal), "days": days,
                                                                "goal": goal})
    text, rows = club_screen(lang, v, cfg)
    await show(cq, (t(lang, "mar.created") + "\n\n" + text, rows), cfg)
    await notifier.send(notes)


@router.callback_query(F.data.regexp(rf"^kf:{N}$").as_("m"))
async def flags(cq: CallbackQuery, m: re.Match, svc, me, lang, cfg) -> None:
    v = await svc.club_view(me, int(m.group(1)))
    await show(cq, vc.flags(lang, v), cfg)


@router.callback_query(F.data.regexp(rf"^f([ayn]):{N}$").as_("m"))
async def judge(cq: CallbackQuery, m: re.Match, svc, me, lang, cfg, notifier) -> None:
    lid = int(m.group(2))
    if m.group(1) == "a":
        v, notes = await svc.ask_proof(me, lid)
    else:
        v, notes = await svc.decide(me, lid, m.group(1) == "y")
    await show(cq, vc.flags(lang, v), cfg)
    await notifier.send(notes)


@router.callback_query(F.data.regexp(rf"^kx:{N}$").as_("m"))
async def members(cq: CallbackQuery, m: re.Match, svc, me, lang, cfg) -> None:
    v = await svc.club_view(me, int(m.group(1)))
    if not v["club"]["is_leader"]:
        await cq.answer(t(lang, "err.not_found"), show_alert=True)
        return
    await show(cq, vc.members(lang, v), cfg)


@router.callback_query(F.data.regexp(rf"^kr:{N}:(-?\d{{1,12}})$").as_("m"))
async def remove(cq: CallbackQuery, m: re.Match, svc, me, lang, cfg) -> None:
    await show(cq, vc.members(lang, await svc.remove_member(me, int(m.group(1)), int(m.group(2)))), cfg)


@router.callback_query(F.data.regexp(rf"^k([cb]):{N}$").as_("m"))
async def club_settings(cq: CallbackQuery, m: re.Match, svc, me, lang, cfg) -> None:
    cid = int(m.group(2))
    if m.group(1) == "c":
        v = await svc.club_settings(me, cid, {"code": True})
    else:
        v = await svc.club_settings(me, cid, {"book_certs": not (await svc.club_view(me, cid))["club"]["book_certs"]})
    await show(cq, club_screen(lang, v, cfg), cfg)


@router.callback_query(F.data == "n:certs")
async def certs(cq: CallbackQuery, svc, me, lang, cfg) -> None:
    await show(cq, vc.certs(lang, await svc.certs(me)), cfg)


@router.callback_query(F.data.regexp(rf"^c:{N}$").as_("m"))
async def cert(cq: CallbackQuery, m: re.Match, svc, me, lang, cfg) -> None:
    c = await svc.cert(me, int(m.group(1)))
    await show(cq, vc.cert(lang, c, cfg.verify_link(c["code"])), cfg)
