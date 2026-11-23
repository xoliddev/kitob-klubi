# Changelog

## 1.0.0 — 2026-11-23

Daily portfolio challenge #7.

- Pure core with a JavaScript port checked by shared vectors: Tashkent calendar, books from the catalog or typed by
  hand, the pace forecast over two weeks, the daily olov with freezes (7 counted days earn one, at most 2, a missed day
  spends one), fair play (today or yesterday, the daily cap, the jump flag), marathons and the ranked leaderboard with
  "behind", HMAC-signed 16-letter certificate codes, the heatmap and weekly pages, the evening nudge, the seeded world.
- Service on SQLite (WAL, `BEGIN IMMEDIATE`, rules in the schema): reading, clubs and marathons, the fair-play queue
  (isbot, accept, reject — rejected pages taken back everywhere), certificates issued once per achievement, nudges
  claimed exactly once, marathons closed by the scheduler.
- aiogram bot, buttons only, Uzbek and Russian; aiohttp API with initData HMAC, the PNG sent to the bot, and the public
  certificate check that answers every failure the same way.
- Mini App: the olov (the flame drawn in SVG), books, clubs with the live leaderboard and the leader's tools, my numbers,
  certificates drawn in SVG and saved as PNG, the check page that works outside Telegram.
- Browser demo with three phones and an eleven-step story; pytest, node tests and Playwright e2e; Docker (non-root,
  read-only), CI and GitHub Pages.
