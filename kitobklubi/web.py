"""aiohttp server: the Mini App's static files and its JSON API.

Every ``/api/...`` call must carry ``Authorization: tma <initData>``; the HMAC and ``auth_date`` are checked, then
the call runs *as* that Telegram user through the same Service the bot uses (web_api.py). The one public call is
``POST /api/verify`` (anyone checking a certificate, inside or outside Telegram): it is rate-limited per address and
answers every failure the same way. Bodies are capped at 16 KB (a certificate picture sent to the bot at 1 MB) and
every response carries a strict CSP.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path

from aiohttp import web

from .common import Refused
from .security import AuthError, RateLimiter, validate_init_data
from .service import Service

log = logging.getLogger(__name__)
ME = web.RequestKey("me", int)
ROOT = Path(__file__).resolve().parent.parent
MAX_BODY = 16 * 1024
MAX_PICTURE = 1024 * 1024
CSP = ("default-src 'self'; script-src 'self' https://telegram.org; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; "
       "connect-src 'self'; frame-ancestors 'self' https://web.telegram.org https://*.telegram.org; base-uri 'none'; "
       "form-action 'none'; object-src 'none'")
HEADERS = {"Content-Security-Policy": CSP, "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer",
           "Permissions-Policy": "camera=(), microphone=(), geolocation=()", "Cross-Origin-Opener-Policy": "same-origin"}
STATUS = {"forbidden": 403, "not_found": 404, "auth": 401, "rate": 429, "cert_unknown": 404, "too_big": 413}
PUBLIC = ("/api/verify",)


async def body(request: web.Request, limit: int = MAX_BODY) -> dict:
    raw = await request.read()
    if len(raw) > limit:
        raise Refused("too_big")
    try:
        data = json.loads(raw)
    except (json.JSONDecodeError, UnicodeDecodeError) as err:
        raise Refused("generic") from err
    if not isinstance(data, dict) or len(data) > 24:
        raise Refused("generic")
    return data


def num(request: web.Request, name: str = "id") -> int:
    return int(request.match_info[name])


def make_app(service: Service, bot_token: str, notifier=None, max_age: int = 3600, rate_per_minute: int = 120,
             verify_rate: int = 30, trust_proxy: bool = False) -> web.Application:
    from .web_api import add_routes

    users = RateLimiter(rate_per_minute)
    checkers = RateLimiter(verify_rate)

    def address(request: web.Request) -> str:
        if trust_proxy:
            forwarded = request.headers.get("X-Forwarded-For", "")
            if forwarded:
                return forwarded.split(",")[0].strip()[:64]
        return request.remote or "?"

    @web.middleware
    async def guard(request: web.Request, handler):
        try:
            if request.path in PUBLIC:
                if not checkers.allow(address(request)):
                    raise Refused("rate")
            elif request.path.startswith("/api/"):
                header = request.headers.get("Authorization", "")
                if not header.startswith("tma "):
                    raise AuthError("missing")
                user = validate_init_data(header[4:], bot_token, max_age, now=service.now() / 1000)
                if not users.allow(user["id"]):
                    raise Refused("rate")
                await service.touch_user(user["id"], user["first_name"], user["language_code"])
                request[ME] = user["id"]
            resp = await handler(request)
        except AuthError:
            resp = web.json_response({"error": "auth"}, status=401)
        except Refused as err:
            resp = web.json_response({"error": err.code}, status=STATUS.get(err.code, 400))
        except (ValueError, KeyError, TypeError):
            resp = web.json_response({"error": "generic"}, status=400)
        resp.headers.update(HEADERS)
        if request.path.startswith("/api/"):
            resp.headers["Cache-Control"] = "no-store"
        return resp

    async def notify(notes: list[dict]) -> None:
        if notifier is not None and notes:
            try:
                await notifier.send(notes)
            except Exception:  # a failed message never fails the action itself
                log.exception("notify failed")

    async def health(_: web.Request) -> web.Response:
        return web.json_response({"ok": True})

    async def index(_: web.Request) -> web.Response:
        raise web.HTTPFound("/webapp/")

    async def unknown(_: web.Request) -> web.Response:
        raise Refused("not_found")

    app = web.Application(middlewares=[guard], client_max_size=MAX_PICTURE + 4096)
    r = app.router
    add_routes(r, service, ME, notify, notifier)
    r.add_route("*", "/api/{tail:.*}", unknown)
    r.add_get("/healthz", health)
    r.add_get("/", index)
    async def webapp_index(_: web.Request) -> web.FileResponse:
        """The Mini App's address is /webapp/; add_static alone answers 403 for a folder."""
        return web.FileResponse(ROOT / "webapp" / "index.html")

    r.add_get("/webapp/", webapp_index)
    r.add_static("/webapp/", ROOT / "webapp", append_version=False)
    r.add_static("/shared/", ROOT / "shared", append_version=False)
    return app
