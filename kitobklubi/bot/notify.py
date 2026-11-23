"""Messages the bot sends on its own, from the service's notes: the evening nudge, a flagged log for the leader,
"isbot so'raldi", the reader's proof, the decision, a new marathon, a certificate. Used by the bot handlers, the
Mini App API and the scheduler."""

from __future__ import annotations

import logging

from aiogram import Bot
from aiogram.exceptions import TelegramAPIError
from aiogram.types import BufferedInputFile

from ..i18n import t
from . import views_club as vc
from .markup import markup

log = logging.getLogger(__name__)


class Notifier:
    def __init__(self, bot: Bot, service, cfg) -> None:
        self.bot, self.svc, self.cfg = bot, service, cfg

    async def _send(self, uid: int, text: str, rows=None) -> bool:
        if uid <= 0:  # the seeded, fictional people
            return False
        try:
            await self.bot.send_message(uid, text, reply_markup=markup(rows or [], self.cfg.webapp_url), disable_web_page_preview=True)
            return True
        except TelegramAPIError as err:  # blocked the bot, deleted account...
            log.info("could not notify %s: %s", uid, err)
            return False

    async def picture(self, uid: int, name: str, data: bytes, caption: str) -> None:
        await self.bot.send_document(uid, BufferedInputFile(data, filename=name), caption=caption)

    async def send(self, notes: list[dict]) -> None:
        for n in notes:
            try:
                lang = ((await self.svc.user(n["to"])) or {}).get("lang", "uz")
                await getattr(self, f"on_{n['type']}")(n, lang)
            except Exception:  # one failed message never stops the rest
                log.exception("note %s failed", n.get("type"))

    async def on_nudge(self, n: dict, lang: str) -> None:
        await self._send(n["to"], *vc.nudge(lang, n))

    async def on_flag(self, n: dict, lang: str) -> None:
        await self._send(n["to"], *vc.flag_note(lang, await self.svc.log_info(n["to"], n["log_id"])))

    async def on_ask(self, n: dict, lang: str) -> None:
        await self._send(n["to"], *vc.ask_note(lang, await self.svc.log_info(n["to"], n["log_id"])))

    async def on_proof(self, n: dict, lang: str) -> None:
        await self._send(n["to"], *vc.proof_note(lang, await self.svc.log_info(n["to"], n["log_id"])))

    async def on_decided(self, n: dict, lang: str) -> None:
        info = await self.svc.log_info(n["to"], n["log_id"])
        await self._send(n["to"], vc.decided_note(lang, info, n["yes"]), [[(t(lang, "btn.menu"), "n:menu")]])

    async def on_marathon(self, n: dict, lang: str) -> None:
        await self._send(n["to"], *vc.marathon_note(lang, await self.svc.club_view(n["to"], n["club_id"])))

    async def on_cert(self, n: dict, lang: str) -> None:
        await self._send(n["to"], *vc.cert_note(lang, await self.svc.cert(n["to"], n["cert_id"])))

    async def on_closed(self, n: dict, lang: str) -> None:
        await self._send(n["to"], *vc.closed_note(lang, await self.svc.club_view(n["to"], n["club_id"]), n["winners"]))
