"""The real aiogram handlers against a mocked Bot API: Madina adds a book from the catalog and logs with one tap, the
flame lights, typed numbers and "hozir qaysi betdasiz?", yesterday's log; joining a club by its deep link; the leader
starts a marathon; Sardor's 900 pages are capped and flagged, the leader asks for an isbot, Sardor writes it, the
leader accepts; the evening nudge; finishing a book and its fikr; certificates and the verify deep link; forged
buttons; settings and the language."""

from __future__ import annotations

from kitobklubi.core.clock import at_local

from .helpers import ADMIN, LEADER, MADINA, SARDOR, STRANGER, Clock, club_code, service_env
from .tg_sim import TgSim

PROOF = "Pyer va Natasha uchrashgan bal sahnasini o'qidim. Knyaz Andrey yaralangan joyi ham bor."


async def test_reader_and_leader_by_buttons():
    clock = Clock(at_local(20_775, 18 * 60))
    async with service_env(clock, marathon=False) as (svc, _):
        tg = TgSim(svc)
        await tg.say(MADINA, "/start")
        assert "Assalomu alaykum" in tg.last(MADINA) and "Olov hali yonmagan" in tg.last(MADINA)
        await tg.tap(MADINA, "📖 Bugun o'qidim")
        assert "Qaysi kitobni o'qiyapsiz?" in tg.last(MADINA)
        await tg.tap(MADINA, "O'tkan kunlar — Abdulla Qodiriy")
        assert "«O'tkan kunlar» qo'shildi (384 bet)" in tg.last(MADINA)
        await tg.tap(MADINA, "+20")
        text = tg.last(MADINA)
        assert "✅ +20 bet: «O'tkan kunlar»" in text and "🔥 Olov yondi!" in text and "taxminan" in text and "dekabrda tugatasiz" in text
        await tg.tap(MADINA, "📖 Bugun o'qidim")
        await tg.tap(MADINA, "✏️ Boshqa son")
        await tg.say(MADINA, "ko'p")
        assert "Betlar sonini raqam bilan yozing" in tg.last(MADINA)
        await tg.say(MADINA, "15")
        assert "✅ +15 bet" in tg.last(MADINA) and "Bugun: 35 / 10 bet — maqsad bajarildi ✅" in tg.last(MADINA)
        await tg.tap(MADINA, "📖 Bugun o'qidim")
        await tg.tap(MADINA, "📅 Kecha uchun")
        assert "Kecha necha bet o'qigansiz?" in tg.last(MADINA)
        await tg.tap(MADINA, "+10")
        assert "Kecha uchun +10 bet" in tg.last(MADINA)
        await tg.tap(MADINA, "📖 Bugun o'qidim")
        await tg.tap(MADINA, "📍 Hozir qaysi betdasiz?")
        await tg.say(MADINA, "40")
        assert "Bu bet avvalgisidan oldin" in tg.last(MADINA)
        await tg.say(MADINA, "60")
        assert "✅ +15 bet" in tg.last(MADINA)

        code = await club_code(svc)
        await tg.say(MADINA, f"/start k_{code}")
        assert "«Ziyo kitobxonlari» klubiga qo'shildingiz" in tg.last(MADINA) and "Qo'shilish kodi" not in tg.last(MADINA)
        await tg.say(LEADER, "/start")
        await tg.tap(LEADER, "👥 Klublar")
        await tg.tap(LEADER, "👥 Ziyo kitobxonlari")
        assert f"<code>{code}</code>" in tg.last(LEADER) and f"start=k_{code}" in tg.last(LEADER)
        await tg.tap(LEADER, "🏁 Marafon ochish")
        await tg.tap(LEADER, "30 kunda 1000 bet")
        assert "Marafon boshlandi" in tg.last(LEADER) and "1-kun / 30" in tg.last(LEADER)
        assert any("yangi marafon: «30 kunda 1000 bet»" in x for x in tg.texts(MADINA))

        await tg.say(SARDOR, "/start")
        await tg.tap(SARDOR, "📖 Bugun o'qidim")
        await tg.tap(SARDOR, "✏️ Boshqa son")
        await tg.say(SARDOR, "900")
        assert "Kuniga 300 betgacha hisoblanadi: 900 o'rniga 300 bet yozildi" in tg.last(SARDOR)
        flag = tg.texts(LEADER)[-1]
        assert "<b>Sardor Aliyev</b>" in flag and "300 bet yozdi (900 deb yozgan)" in flag and "kuniga ~" in flag
        await tg.tap(LEADER, "❓ Isbot so'rash")
        assert "isbot so'radi" in tg.texts(SARDOR)[-1].lower()
        await tg.tap(SARDOR, "✍️ Isbot yozish")
        await tg.say(SARDOR, "Bir. Ikki. Uch.")
        assert "Ko'pi bilan 2 gap yozing" in tg.last(SARDOR)
        await tg.say(SARDOR, PROOF)
        assert "Isbot ustozga yuborildi" in tg.last(SARDOR)
        assert "Pyer va Natasha" in tg.texts(LEADER)[-1]
        await tg.tap(LEADER, "✅ Qabul")
        assert "Tekshiradigan narsa yo'q" in tg.last(LEADER)
        assert "Ustoz" in tg.texts(SARDOR)[-1] and "300 betni qabul qildi" in tg.texts(SARDOR)[-1]
        await tg.tap(LEADER, "⬅️ Orqaga")
        assert "1. Sardor Aliyev — 300 bet" in tg.last(LEADER) and "2. Madina Yusupova — 50 bet" in tg.last(LEADER)

        await tg.tap_data(STRANGER, "fy:1")
        await tg.tap_data(MADINA, "kp:1:0")
        await tg.tap_data(MADINA, "la:999:10:t")
        await tg.tap_data(MADINA, "la:1:10:t")  # Sardor's book
        await tg.tap_data(MADINA, "la:6:11:t")  # not a quick amount
        alerts = tg.alerts()
        assert alerts.count("Topilmadi yoki sizga tegishli emas.") >= 4 and "Bu tugma eskirgan. Menyudan qayta oching." in alerts


async def test_nudge_finish_review_certificates_verify_settings():
    clock = Clock(at_local(20_775, 19 * 60 + 30))
    async with service_env(clock) as (svc, _):
        tg = TgSim(svc)
        await tg.say(MADINA, "/start")
        await tg.tap(MADINA, "⚙️ Sozlamalar")
        await tg.tap(MADINA, "⏰ Eslatma vaqti")
        await tg.tap(MADINA, "20:00")
        assert "Kechki eslatma: <b>20:00</b>" in tg.last(MADINA)
        await tg.tap(MADINA, "🎯 Kunlik maqsad")
        await tg.tap(MADINA, "20")
        assert "Kunlik maqsad: <b>20 bet</b>" in tg.last(MADINA)
        await tg.tap_data(MADINA, "tm:1215")
        assert "Vaqtni tugmalardan tanlang." in tg.alerts()
        clock.skip(minutes=31)
        await tg.notifier.send(await svc.tick())
        assert "yana <b>20 bet</b>" in tg.texts(MADINA)[-1] and "olov yonadi" in tg.texts(MADINA)[-1]
        await tg.tap(MADINA, "📖 Bugun o'qidim")
        await tg.tap(MADINA, "▶️")
        await tg.tap(MADINA, "Kichkina shahzoda")
        await tg.tap(MADINA, "📍 Hozir qaysi betdasiz?")
        await tg.say(MADINA, "96")
        assert "«Kichkina shahzoda» tugadi" in tg.last(MADINA)
        await tg.tap(MADINA, "💬 Fikr yozish")
        await tg.say(MADINA, "Bolalikni eslatdi. Hamma o'qishi kerak.")
        assert "Fikringiz saqlandi" in tg.last(MADINA) and "Fikringiz: Bolalikni eslatdi" in tg.last(MADINA)
        assert [n for n in await svc.tick() if n["type"] == "nudge"] == [], "one nudge a day"

        # Dilnoza (seeded, made real here) finishes the seeded marathon and gets a certificate
        await svc.touch_user(104, "Dilnoza", "uz")
        big = await svc.add_book(104, {"catalog": "urush_va_tinchlik"})
        for _ in range(20):
            clock.now = at_local(svc.today() + 1, 12 * 60)
            await svc.log(104, big["id"], {"add": 50})
        clock.now = at_local(svc.today() + 1, 9 * 60)
        await tg.notifier.send(await svc.tick())
        assert "Sizga sertifikat berildi: «30 kunda 1000 bet»" in tg.texts(104)[-1]
        assert "Sertifikat olganlar: 1 kishi" in tg.texts(LEADER)[-1]
        await tg.tap(104, "🏅 Sertifikatni ko'rish")
        text = tg.last(104)
        code = text.split("<code>")[1].split("</code>")[0]
        assert "Dilnoza Ergasheva" in text and "https://kitob.example/webapp/?v=" + code.replace("-", "") in text
        await tg.say(STRANGER, "/start v_" + code.replace("-", ""))
        assert "✅ Haqiqiy sertifikat" in tg.last(STRANGER) and "Dilnoza Ergasheva" in tg.last(STRANGER)
        bad = code.replace("-", "")
        bad = bad[:-1] + ("A" if bad[-1] != "A" else "B")
        await tg.say(STRANGER, "/start v_" + bad)
        assert "❌ Bunday sertifikat yo'q" in tg.last(STRANGER)

        await tg.say(MADINA, "salom")
        await tg.tap(MADINA, "🇷🇺 Русский")
        assert "Огонь" in tg.last(MADINA) and "📖 Я сегодня читал(а)" in tg.buttons(MADINA)
        await tg.say(ADMIN, "/start")
        await tg.tap(ADMIN, "🛠 Admin")
        assert "Foydalanuvchilar" in tg.last(ADMIN)
        await tg.tap(ADMIN, "Bloklash: Ziyo kitobxonlari")
        assert "⛔ #1" in tg.last(ADMIN)
        await tg.tap_data(SARDOR, "n:admin")
        assert "Topilmadi yoki sizga tegishli emas." in tg.alerts()
