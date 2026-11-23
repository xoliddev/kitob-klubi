"""Certificate codes: short, typed by hand, signed.

A code is 5 random bytes followed by the first 5 bytes of HMAC-SHA256(secret, "sertifikat:" + nonce), written in a
32-letter alphabet without 0/O/1/I: 16 characters, shown as ``KX7M-QP2D-9RTE-HW4B``. The signature is checked in
constant time before the database is asked, so an edited or invented code costs nothing and tells nothing; every
failure gets the same answer. shared/cert.js is the same code for the browser demo.
"""

from __future__ import annotations

import hashlib
import hmac

ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
LEN = 16


def secret_from(seed: str) -> bytes:
    """The signing key, derived from CERT_SECRET (or the bot token when none is set)."""
    return hmac.new(b"kitobklubi-sertifikat", seed.encode(), hashlib.sha256).digest()


def _sig(secret: bytes, nonce: bytes) -> bytes:
    return hmac.new(secret, b"sertifikat:" + nonce, hashlib.sha256).digest()[:5]


def _b32(raw: bytes) -> str:
    n = int.from_bytes(raw, "big")
    return "".join(ALPHABET[(n >> (5 * (LEN - 1 - i))) & 31] for i in range(LEN))


def make(secret: bytes, nonce: bytes) -> str:
    return _b32(nonce + _sig(secret, nonce))


def pretty(code: str) -> str:
    return "-".join(code[i:i + 4] for i in range(0, LEN, 4))


def norm(text: object) -> str | None:
    """What a person typed or pasted -> 16 alphabet letters, or None."""
    if not isinstance(text, str) or len(text) > 40:
        return None
    s = text.strip().upper().replace("-", "").replace(" ", "")
    return s if len(s) == LEN and all(c in ALPHABET for c in s) else None


def nonce_of(secret: bytes, text: object) -> str | None:
    """The nonce (hex) of a well-formed, correctly signed code, else None."""
    code = norm(text)
    if code is None:
        return None
    n = 0
    for c in code:
        n = n * 32 + ALPHABET.index(c)
    raw = n.to_bytes(10, "big")
    return raw[:5].hex() if hmac.compare_digest(raw[5:], _sig(secret, raw[:5])) else None


def code_from(n: int, length: int = 8) -> str:
    """A club join code from a random number (40 bits for 8 letters)."""
    return "".join(ALPHABET[(n >> (5 * (length - 1 - i))) & 31] for i in range(length))
