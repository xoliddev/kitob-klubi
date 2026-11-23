"""HTTP: initData HMAC + freshness, readers and leaders kept apart over the API, the public certificate check (one
answer for every failure, rate-limited), the PNG sent to the bot, strict input checks, body caps, CSP, static files."""

from __future__ import annotations

import base64
import json
import struct
import zlib
from contextlib import asynccontextmanager

from aiohttp.test_utils import TestClient, TestServer

from kitobklubi.core import cert
from kitobklubi.core.clock import at_local
from kitobklubi.security import sign_init_data
from kitobklubi.web import make_app

from .helpers import LEADER, MADINA, SARDOR, STRANGER, club_code, service_env

TOKEN = "123456:TEST-ONLY-NOT-A-REAL-TOKEN"


class Spy:
    def __init__(self) -> None:
        self.notes: list[dict] = []
        self.pictures: list[tuple[int, str, bytes]] = []

    async def send(self, notes):
        self.notes.extend(notes)

    async def picture(self, uid, name, data, caption):
        self.pictures.append((uid, name, data))


def init_data(uid: int, clock, age: int = 0, token: str = TOKEN) -> str:
    fields = {"auth_date": str(clock() // 1000 - age), "query_id": "AAE-test",
              "user": json.dumps({"id": uid, "first_name": f"U{uid}", "language_code": "uz"})}
    return sign_init_data(fields, token)


def tiny_png(w: int = 2, h: int = 2) -> bytes:
    def chunk(kind: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))
    raw = b"".join(b"\x00" + b"\xff\x00\x00" * w for _ in range(h))
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw)) + \
        chunk(b"IEND", b"")


@asynccontextmanager
async def api(rate: int = 1000, verify_rate: int = 1000, marathon: bool = True):
    async with service_env(marathon=marathon) as (svc, clock):
        spy = Spy()
        client = TestClient(TestServer(make_app(svc, TOKEN, spy, 3600, rate, verify_rate)))
        await client.start_server()

        def h(uid: int, age: int = 0, token: str = TOKEN) -> dict:
            return {"Authorization": "tma " + init_data(uid, clock, age, token)}

        try:
            yield client, svc, clock, h, spy
        finally:
            await client.close()


async def test_auth_is_required_and_checked():
    async with api() as (c, _, _clock, h, _):
        assert (await c.get("/api/me")).status == 401
        assert (await c.get("/api/me", headers={"Authorization": "Bearer x"})).status == 401
        assert (await c.get("/api/me", headers=h(MADINA, token="999:WRONG-TEST-ONLY"))).status == 401
        assert (await c.get("/api/me", headers=h(MADINA, age=4000))).status == 401
        assert (await c.get("/api/me", headers=h(MADINA, age=-600))).status == 401
        me = await (await c.get("/api/me", headers=h(MADINA))).json()
        assert me["id"] == MADINA and me["cap"] == 300
        resp = await c.get("/api/me", headers=h(MADINA))
        assert "frame-ancestors" in resp.headers["Content-Security-Policy"] and resp.headers["Cache-Control"] == "no-store"
        assert (await c.get("/api/nothing", headers=h(MADINA))).status == 404


async def test_reader_flow_and_isolation_over_http():
    async with api(marathon=False) as (c, svc, _clock, h, spy):
        book = await (await c.post("/api/books", json={"book": {"catalog": "otkan_kunlar"}}, headers=h(MADINA))).json()
        out = await (await c.post(f"/api/books/{book['id']}/log", json={"add": 25}, headers=h(MADINA))).json()
        assert out["streak"]["streak"] == 1 and out["lit"]
        for method, path, payload in (("GET", f"/api/books/{book['id']}", None), ("POST", f"/api/books/{book['id']}/log", {"add": 5}),
                                      ("POST", f"/api/books/{book['id']}/review", {"text": "Zo'r."}), ("GET", "/api/clubs/1", None),
                                      ("POST", "/api/clubs/1/marathon", {"marathon": {"title": "Men", "days": 7, "goal": 100}}),
                                      ("POST", "/api/logs/1/decide", {"accept": False}), ("GET", "/api/certs/1", None),
                                      ("POST", "/api/clubs/1/members/-103/remove", None)):
            resp = await c.request(method, path, json=payload, headers=h(STRANGER))
            assert resp.status == 404, path
        bad = await c.post(f"/api/books/{book['id']}/log", json={"add": "<script>"}, headers=h(MADINA))
        assert bad.status == 400 and (await bad.json())["error"] == "pages"
        assert (await c.post(f"/api/books/{book['id']}/log", json={"add": 5, "day": "2026-01-01"}, headers=h(MADINA))).status == 400
        assert (await c.post("/api/books", data="not json", headers=h(MADINA))).status == 400
        big = await c.post("/api/books", json={"book": {"title": "x" * 20_000}}, headers=h(MADINA))
        assert big.status == 413
        code = await club_code(svc)
        joined = await (await c.post("/api/clubs/join", json={"code": code}, headers=h(MADINA))).json()
        assert joined["club"]["name"] == "Ziyo kitobxonlari" and "code" not in joined["club"]
        lead = await (await c.post("/api/clubs/1/marathon", json={"marathon": {"title": "30 kunda 1000 bet", "days": 30, "goal": 1000}},
                                   headers=h(LEADER))).json()
        assert lead["marathon"]["goal"] == 1000 and {n["to"] for n in spy.notes} >= {MADINA, SARDOR}
        out = await (await c.post("/api/books/1/log", json={"add": 900}, headers=h(SARDOR))).json()
        assert out["log"]["pages"] == 300 and spy.notes[-1]["type"] == "flag"
        lid = out["log"]["id"]
        assert (await c.post(f"/api/logs/{lid}/ask", headers=h(MADINA))).status == 404, "only the leader"
        view = await (await c.post(f"/api/logs/{lid}/ask", headers=h(LEADER))).json()
        assert view["flags"][0]["status"] == "asked"
        other = {"text": "Men ham shu kitobni o'qidim, rostdan."}
        assert (await c.post(f"/api/logs/{lid}/proof", json=other, headers=h(MADINA))).status == 404
        proof = {"text": "Borodino jangi va Kutuzov kengashi haqida o'qidim."}
        ok = await c.post(f"/api/logs/{lid}/proof", json=proof, headers=h(SARDOR))
        assert ok.status == 200
        view = await (await c.post(f"/api/logs/{lid}/decide", json={"accept": "yes"}, headers=h(LEADER))).json()
        assert view == {"error": "generic"}
        view = await (await c.post(f"/api/logs/{lid}/decide", json={"accept": False}, headers=h(LEADER))).json()
        assert next(r for r in view["board"] if r["id"] == SARDOR)["pages"] == 0, "rejected pages do not count"
        stats = await (await c.get("/api/stats", headers=h(MADINA))).json()
        assert stats["summary"]["pages"] == 25 and len(stats["heatmap"]) >= 99 and len(stats["weekly"]) == 8


async def test_verify_is_public_uniform_and_rate_limited():
    async with api(verify_rate=5) as (c, svc, clock, h, spy):
        big = await svc.add_book(104, {"catalog": "urush_va_tinchlik"})
        for _ in range(20):
            clock.now = at_local(svc.today() + 1, 12 * 60)
            await svc.log(104, big["id"], {"add": 50})
        clock.now = at_local(svc.today() + 1, 9 * 60)
        notes = await svc.tick()
        cid = next(n for n in notes if n["type"] == "cert")["cert_id"]
        code = (await svc.cert(104, cid))["code"]
        ok = await c.post("/api/verify", json={"code": code})
        assert ok.status == 200
        data = await ok.json()
        assert data["ok"] and data["cert"]["name"] == "Dilnoza Ergasheva" and "id" not in data["cert"]
        raw = cert.norm(code)
        answers = set()
        for bad in (raw[:-1] + ("A" if raw[-1] != "A" else "B"), "nonsense", None):
            resp = await c.post("/api/verify", json={"code": bad})
            answers.add((resp.status, json.dumps(await resp.json())))
        resp = await c.post("/api/verify", data="{oops")
        answers.add((resp.status, json.dumps(await resp.json())))
        assert answers == {(404, '{"ok": false}')}
        assert (await c.post("/api/verify", json={"code": code})).status == 429, "five a minute per address"

        assert (await c.post(f"/api/certs/{cid}/png", json={"png": base64.b64encode(tiny_png()).decode()}, headers=h(MADINA))).status == 404
        sent = await c.post(f"/api/certs/{cid}/png", json={"png": base64.b64encode(tiny_png()).decode()}, headers=h(104 + 0))
        assert sent.status == 200 and spy.pictures[-1][0] == 104 and spy.pictures[-1][2].startswith(b"\x89PNG")
        for bad in (base64.b64encode(b"GIF89a....").decode(), "!!!", base64.b64encode(tiny_png(5000, 1)).decode()):
            assert (await c.post(f"/api/certs/{cid}/png", json={"png": bad}, headers=h(104))).status == 400


async def test_static_files_and_rate_limit():
    async with api(rate=3) as (c, _svc, _clock, h, _):
        page = await c.get("/webapp/index.html")
        root = await c.get("/webapp/")  # the address the bot opens
        assert root.status == 200 and "<html" in (await root.text()).lower()
        assert page.status == 200 and "Content-Security-Policy" in page.headers
        assert (await c.get("/shared/locales/uz.json")).status == 200
        assert (await c.get("/healthz")).status == 200
        assert (await c.get("/webapp/../kitobklubi/config.py")).status in (403, 404)
        codes = [(await c.get("/api/me", headers=h(MADINA))).status for _ in range(5)]
        assert codes[:3] == [200, 200, 200] and codes[-1] == 429
