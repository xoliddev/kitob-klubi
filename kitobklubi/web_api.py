"""The Mini App API (signed initData, see web.py). The user always comes from the verified initData; ids in the URL
are only looked up among that user's own books, clubs and certificates, so anyone else's id answers "not_found".
``POST /api/verify`` is public and answers every failure the same way."""

from __future__ import annotations

import base64
import binascii

from aiohttp import web

from .common import Refused
from .i18n import t
from .web import MAX_PICTURE, body, num

ID = r"{id:\d{1,9}}"
PNG = b"\x89PNG\r\n\x1a\n"


def png_bytes(value: object) -> bytes:
    """A certificate picture from the Mini App: base64 of a real PNG, at most 1 MB and 4000 px a side."""
    if not isinstance(value, str) or len(value) > MAX_PICTURE * 4 // 3 + 8:
        raise Refused("too_big")
    try:
        data = base64.b64decode(value, validate=True)
    except (binascii.Error, ValueError) as err:
        raise Refused("generic") from err
    if len(data) > MAX_PICTURE or data[:8] != PNG or data[12:16] != b"IHDR":
        raise Refused("generic")
    w, h = int.from_bytes(data[16:20], "big"), int.from_bytes(data[20:24], "big")
    if not (0 < w <= 4000 and 0 < h <= 4000):
        raise Refused("generic")
    return data


def add_routes(r: web.UrlDispatcher, svc, me_key, notify, notifier) -> None:
    def ok(data) -> web.Response:
        return web.json_response(data)

    async def me(request):
        return ok(await svc.me(request[me_key]))

    async def lang(request):
        return ok({"lang": await svc.set_lang(request[me_key], (await body(request)).get("lang"))})

    async def home(request):
        return ok(await svc.home(request[me_key]))

    async def books(request):
        return ok(await svc.books(request[me_key]))

    async def add_book(request):
        return ok(await svc.add_book(request[me_key], (await body(request)).get("book")))

    async def book(request):
        return ok(await svc.book_view(request[me_key], num(request)))

    async def log(request):
        out, notes = await svc.log(request[me_key], num(request), await body(request))
        await notify(notes)
        return ok(out)

    async def review(request):
        return ok(await svc.review(request[me_key], num(request), (await body(request)).get("text")))

    async def goal(request):
        return ok(await svc.set_goal(request[me_key], (await body(request)).get("goal")))

    async def nudge(request):
        return ok(await svc.set_nudge(request[me_key], (await body(request)).get("nudge")))

    async def stats(request):
        return ok(await svc.stats(request[me_key]))

    async def clubs(request):
        return ok({"items": await svc.my_clubs(request[me_key])})

    async def create_club(request):
        return ok(await svc.create_club(request[me_key], (await body(request)).get("name")))

    async def join(request):
        return ok(await svc.join(request[me_key], (await body(request)).get("code")))

    async def club(request):
        return ok(await svc.club_view(request[me_key], num(request)))

    async def leave(request):
        await svc.leave(request[me_key], num(request))
        return ok({"items": await svc.my_clubs(request[me_key])})

    async def marathon(request):
        view, notes = await svc.create_marathon(request[me_key], num(request), (await body(request)).get("marathon"))
        await notify(notes)
        return ok(view)

    async def settings(request):
        return ok(await svc.club_settings(request[me_key], num(request), await body(request)))

    async def remove(request):
        return ok(await svc.remove_member(request[me_key], num(request), int(request.match_info["uid"])))

    async def ask(request):
        view, notes = await svc.ask_proof(request[me_key], num(request))
        await notify(notes)
        return ok(view)

    async def proof(request):
        out, notes = await svc.write_proof(request[me_key], num(request), (await body(request)).get("text"))
        await notify(notes)
        return ok(out)

    async def decide(request):
        view, notes = await svc.decide(request[me_key], num(request), (await body(request)).get("accept"))
        await notify(notes)
        return ok(view)

    async def certs(request):
        return ok({"items": await svc.certs(request[me_key])})

    async def cert(request):
        return ok(await svc.cert(request[me_key], num(request)))

    async def picture(request):
        uid = request[me_key]
        c = await svc.cert(uid, num(request))
        data = png_bytes((await body(request, MAX_PICTURE * 4 // 3 + 1024)).get("png"))
        if notifier is not None:
            lang = (await svc.user(uid))["lang"]
            await notifier.picture(uid, f"sertifikat-{c['id']}.png", data, t(lang, "note.cert", title=c["title"]).replace("<b>", ""))
        return ok({"sent": True})

    async def verify(request):
        """Public. Every failure — bad JSON, a malformed, forged, edited or unknown code — gets this same answer."""
        try:
            return ok(await svc.verify((await body(request)).get("code")))
        except (Refused, ValueError, TypeError, AttributeError):
            return web.json_response({"ok": False}, status=404)

    r.add_get("/api/me", me)
    r.add_post("/api/lang", lang)
    r.add_get("/api/home", home)
    r.add_get("/api/books", books)
    r.add_post("/api/books", add_book)
    r.add_get(f"/api/books/{ID}", book)
    r.add_post(f"/api/books/{ID}/log", log)
    r.add_post(f"/api/books/{ID}/review", review)
    r.add_post("/api/goal", goal)
    r.add_post("/api/nudge", nudge)
    r.add_get("/api/stats", stats)
    r.add_get("/api/clubs", clubs)
    r.add_post("/api/clubs", create_club)
    r.add_post("/api/clubs/join", join)
    r.add_get(f"/api/clubs/{ID}", club)
    r.add_post(f"/api/clubs/{ID}/leave", leave)
    r.add_post(f"/api/clubs/{ID}/marathon", marathon)
    r.add_post(f"/api/clubs/{ID}/settings", settings)
    r.add_post(f"/api/clubs/{ID}/members/{{uid:-?\\d{{1,12}}}}/remove", remove)
    r.add_post(f"/api/logs/{ID}/ask", ask)
    r.add_post(f"/api/logs/{ID}/proof", proof)
    r.add_post(f"/api/logs/{ID}/decide", decide)
    r.add_get("/api/certs", certs)
    r.add_get(f"/api/certs/{ID}", cert)
    r.add_post(f"/api/certs/{ID}/png", picture)
    r.add_post("/api/verify", verify)
