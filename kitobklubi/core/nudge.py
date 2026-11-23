"""The evening nudge: at the reader's chosen time, only if today's goal is not met yet, at most once a day (the key is
claimed in the database before sending), never during the quiet hours 22:00–08:00."""

from __future__ import annotations

from .text import InputError, whole

QUIET_FROM = 22 * 60
QUIET_TO = 8 * 60
CHOICES = list(range(18 * 60, 22 * 60, 30))  # the buttons: 18:00 ... 21:30


def valid(value: object) -> int | None:
    """A nudge time: a minute of the day on the half hour between 08:00 and 21:30, or None (off)."""
    if value is None or value == "off":
        return None
    m = whole(value, QUIET_TO, QUIET_FROM - 30, "nudge")
    if m % 30:
        raise InputError("nudge")
    return m


def quiet(minute: int) -> bool:
    return minute >= QUIET_FROM or minute < QUIET_TO


def due(minute: int, at: int | None, met: bool) -> bool:
    return at is not None and not met and not quiet(minute) and minute >= at


def key(day: int) -> str:
    return f"nudge:{day}"
