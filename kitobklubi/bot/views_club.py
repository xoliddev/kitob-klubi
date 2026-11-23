"""Club, fair-play and certificate screens, and the messages the bot sends on its own (nudges, flags for the leader,
"isbot so'raldi", proofs, decisions, new marathons, certificates). demo/bot-views.js builds the same."""

from __future__ import annotations

import html

from ..core.marathon import PRESETS
from ..i18n import Raw, date_short, mar_state, t, usual_text
from .views import Rows, back


def _esc(s: str) -> str:
    return html.escape(str(s), quote=False)


def clubs(lang: str, items: list[dict]) -> tuple[str, Rows]:
    lines = [t(lang, "club.list")]
    for k in items:
        m = k["marathon"]
        tail = f" · 🏁 {_esc(m['title'])} ({mar_state(lang, m)})" if m and not m["closed"] else ""
        lead = f" · {t(lang, 'club.leader_badge')}" if k["is_leader"] else ""
        lines.append(f"• <b>{_esc(k['name'])}</b>{lead}{tail}")
    if not items:
        lines.append(t(lang, "club.none"))
    rows: Rows = [[(f"👥 {k['name']}", f"k:{k['id']}")] for k in items]
    return "\n".join(lines), [*rows, [(t(lang, "btn.join"), "kj"), (t(lang, "btn.create"), "kn")], back(lang)]


def board_lines(lang: str, v: dict, top: int = 10) -> list[str]:
    out = []
    for r in v["board"][:top]:
        marks = "".join(f" {t(lang, k)}" for k, on in (("board.done", r["done"]), ("board.check", r["flags"] > 0),
                                                       ("board.behind", r.get("behind"))) if on)
        line = t(lang, "board.row", rank=r["rank"], name=r["name"], pages=r["pages"], streak=r["streak"]) + marks
        out.append(f"<b>{line}</b>" if r["me"] else line)
    return out or [t(lang, "board.empty")]


def club(lang: str, v: dict, link: str = "") -> tuple[str, Rows]:
    k, m = v["club"], v["marathon"]
    lines = [t(lang, "club.head", name=k["name"], leader=k["leader_name"], n=k["members"])]
    if m:
        lines += ["", t(lang, "mar.head", title=m["title"], start=Raw(date_short(lang, m["start"])), end=Raw(date_short(lang, m["end"]))),
                  mar_state(lang, m)]
        if m["state"] == "live":
            lines.append(t(lang, "mar.expected", n=m["expected"]))
        if v["me"]:
            me = v["me"]
            lines.append(t(lang, "board.me", rank=me["rank"], pages=me["pages"], goal=m["goal"], pct=me["pct"]))
        lines += ["", *board_lines(lang, v)]
    else:
        lines.append(t(lang, "club.no_marathon"))
    rows: Rows = []
    if k["is_leader"]:
        lines += ["", t(lang, "club.code", code=k["code"], link=link or k["code"])]
        if not m or m["closed"]:
            rows.append([(t(lang, "btn.marathon"), f"km:{k['id']}")])
        rows.append([(t(lang, "btn.flags", n=len(v["flags"])), f"kf:{k['id']}"), (t(lang, "btn.members"), f"kx:{k['id']}")])
        rows.append([(t(lang, "btn.code"), f"kc:{k['id']}"),
                     (t(lang, "btn.certs_on" if k["book_certs"] else "btn.certs_off"), f"kb:{k['id']}")])
    else:
        rows.append([(t(lang, "btn.leave"), f"kl:{k['id']}")])
    rows.append([(t(lang, "btn.app"), f"@app#k={k['id']}")])
    return "\n".join(lines), [*rows, back(lang, "n:clubs")]


def presets(lang: str, cid: int) -> tuple[str, Rows]:
    rows = [[(t(lang, "mar.title", days=d, goal=g), f"kp:{cid}:{i}")] for i, (d, g) in enumerate(PRESETS)]
    return t(lang, "mar.presets"), [*rows, back(lang, f"k:{cid}")]


def flags(lang: str, v: dict) -> tuple[str, Rows]:
    cid = v["club"]["id"]
    lines = [t(lang, "flags.head")]
    rows: Rows = []
    for f in v["flags"][:5]:
        lines += ["", t(lang, "flag.row", name=f["name"], date=Raw(date_short(lang, f["day"])), title=f["title"], asked=f["asked"],
                        pages=f["pages"], usual=Raw(usual_text(lang, f["usual"])))]
        if f["proof"]:
            lines.append(t(lang, "flag.proof", proof=f["proof"]))
        row = [(t(lang, "btn.ask_proof"), f"fa:{f['id']}")] if f["status"] == "flagged" else []
        rows.append([*row, (t(lang, "btn.accept"), f"fy:{f['id']}"), (t(lang, "btn.reject"), f"fn:{f['id']}")])
    if not v["flags"]:
        lines.append(t(lang, "flags.none"))
    return "\n".join(lines), [*rows, back(lang, f"k:{cid}")]


def members(lang: str, v: dict) -> tuple[str, Rows]:
    cid = v["club"]["id"]
    people = v["board"] or v["members"]
    rows = [[(f"{t(lang, 'btn.remove')}: {p['name']}", f"kr:{cid}:{p['id']}")] for p in people[:30]]
    head = t(lang, "club.head", name=v["club"]["name"], leader=v["club"]["leader_name"], n=v["club"]["members"])
    return head, [*rows, back(lang, f"k:{cid}")]


def certs(lang: str, items: list[dict]) -> tuple[str, Rows]:
    rows = [[(f"🏅 {c['title']}", f"c:{c['id']}")] for c in items]
    return t(lang, "cert.list") + "\n" + ("" if items else t(lang, "cert.none")), [*rows, back(lang)]


def cert(lang: str, c: dict, link: str = "") -> tuple[str, Rows]:
    text = t(lang, "cert.text", title=c["title"], name=c["name"], pages=c["pages"], days=c["days"], club=c["club"],
             date=Raw(date_short(lang, c["issued_day"])), code=c["code"])
    if link:
        text += "\n" + t(lang, "cert.link", link=link)
    return text, [[(t(lang, "btn.app"), f"@app#c={c['id']}")], back(lang, "n:certs")]


def verified(lang: str, res: dict | None) -> str:
    if not res:
        return f"{t(lang, 'verify.bad')}\n{t(lang, 'verify.bad_lead')}"
    c = res["cert"]
    return t(lang, "verify.ok") + "\n" + t(lang, "cert.text", title=c["title"], name=c["name"], pages=c["pages"], days=c["days"],
                                           club=c["club"], date=Raw(date_short(lang, c["issued_day"])), code=c["code"])


# ── messages the bot sends on its own ──
def nudge(lang: str, n: dict) -> tuple[str, Rows]:
    key = "nudge.streak" if n["streak"] > 0 else "nudge.start"
    return t(lang, key, left=n["left"]), [[(t(lang, "btn.read"), "r")]]


def judge_rows(lang: str, log_id: int, ask: bool) -> Rows:
    row = [(t(lang, "btn.ask_proof"), f"fa:{log_id}")] if ask else []
    return [[*row, (t(lang, "btn.accept"), f"fy:{log_id}"), (t(lang, "btn.reject"), f"fn:{log_id}")]]


def flag_note(lang: str, log: dict) -> tuple[str, Rows]:
    text = t(lang, "note.flag", name=log["name"], date=Raw(date_short(lang, log["day"])), pages=log["pages"], asked=log["asked"],
             usual=Raw(usual_text(lang, log["usual"])))
    return text, judge_rows(lang, log["id"], log["status"] == "flagged")


def ask_note(lang: str, log: dict) -> tuple[str, Rows]:
    return t(lang, "note.ask", date=Raw(date_short(lang, log["day"])), title=log["title"], pages=log["pages"]), \
        [[(t(lang, "btn.write_proof"), f"pw:{log['id']}")]]


def proof_note(lang: str, log: dict) -> tuple[str, Rows]:
    text = t(lang, "note.proof", name=log["name"], date=Raw(date_short(lang, log["day"])), pages=log["pages"], proof=log["proof"])
    return text, judge_rows(lang, log["id"], False)


def decided_note(lang: str, log: dict, yes: bool) -> str:
    return t(lang, "note.decided_yes" if yes else "note.decided_no", date=Raw(date_short(lang, log["day"])), pages=log["pages"])


def marathon_note(lang: str, v: dict) -> tuple[str, Rows]:
    m = v["marathon"]
    text = t(lang, "note.marathon", club=v["club"]["name"], title=m["title"], start=Raw(date_short(lang, m["start"])),
             end=Raw(date_short(lang, m["end"])), goal=m["goal"])
    return text, [[(t(lang, "btn.club"), f"k:{v['club']['id']}")]]


def cert_note(lang: str, c: dict) -> tuple[str, Rows]:
    return t(lang, "note.cert", title=c["title"]), [[(t(lang, "btn.cert"), f"c:{c['id']}")]]


def closed_note(lang: str, v: dict, winners: int) -> tuple[str, Rows]:
    return t(lang, "note.closed", title=v["marathon"]["title"], n=winners), [[(t(lang, "btn.club"), f"k:{v['club']['id']}")]]


def admin(lang: str, a: dict) -> tuple[str, Rows]:
    text = t(lang, "admin.head", users=a["users"], readers=a["readers_today"], pages=a["pages_today"], certs=a["certs"])
    lines = [text] + [f"{'⛔ ' if k['blocked'] else ''}#{k['id']} {_esc(k['name'])} · {k['members']}" for k in a["clubs"]]
    rows = [[(f"{t(lang, 'btn.unblock' if k['blocked'] else 'btn.block')}: {k['name']}", f"ab:{k['id']}:{0 if k['blocked'] else 1}")]
            for k in a["clubs"][:10]]
    return "\n".join(lines), [*rows, back(lang)]
