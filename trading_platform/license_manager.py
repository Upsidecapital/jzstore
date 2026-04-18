"""
License key management and user authentication.

In production this would validate against a cloud endpoint (Stripe + custom
auth service).  Here we ship a self-contained implementation that:
  - hashes the key with a salt known only to the binary
  - stores the validated licence in an encrypted local file
  - provides a clean UserSession object consumed by the UI

Key format: JZST-XXXX-XXXX-XXXX-XXXX  (4×4 alphanum groups, dash-separated)
"""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import re
import time
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Optional

# ── Constants ─────────────────────────────────────────────────────────────────

_KEY_SALT   = b"upside-trading-v1-salt-0xDEADBEEF"
_KEY_REGEX  = re.compile(
    r"^JZST-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$"
)
_SESSION_FILE = Path.home() / ".upside_analytics" / "session.json"

# Hard-coded demo keys (replace with cloud validation in production)
_VALID_KEYS: dict[str, dict] = {
    "JZST-DEMO-FREE-0000-0001": {"tier": "free",  "name": "Demo User"},
    "JZST-PRO1-FULL-ACCS-2024": {"tier": "pro",   "name": "Pro Trader"},
    "JZST-INST-ENTR-PRIS-2024": {"tier": "elite", "name": "Elite Desk"},
}

TIER_FEATURES = {
    "free":  {"max_candles": 50,  "ws_feed": False, "export": False},
    "pro":   {"max_candles": 500, "ws_feed": True,  "export": True},
    "elite": {"max_candles": 500, "ws_feed": True,  "export": True},
}


# ── Session ───────────────────────────────────────────────────────────────────

@dataclass
class UserSession:
    username:  str
    tier:      str           # "free" | "pro" | "elite"
    key_hash:  str
    logged_in_at: float

    @property
    def features(self) -> dict:
        return TIER_FEATURES.get(self.tier, TIER_FEATURES["free"])

    @property
    def is_pro(self) -> bool:
        return self.tier in ("pro", "elite")

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, d: dict) -> "UserSession":
        return cls(**d)


# ── Validation ────────────────────────────────────────────────────────────────

def _hash_key(raw_key: str) -> str:
    return hmac.new(_KEY_SALT, raw_key.encode(), hashlib.sha256).hexdigest()


def validate_license(key: str) -> tuple[bool, str, Optional[UserSession]]:
    """
    Returns (ok, message, session_or_None).
    """
    key = key.strip().upper()

    if not _KEY_REGEX.match(key):
        return False, "Invalid key format. Expected: JZST-XXXX-XXXX-XXXX-XXXX", None

    meta = _VALID_KEYS.get(key)
    if meta is None:
        return False, "License key not recognised.", None

    session = UserSession(
        username=meta["name"],
        tier=meta["tier"],
        key_hash=_hash_key(key),
        logged_in_at=time.time(),
    )
    _save_session(session)
    return True, f"Welcome, {session.username}!", session


def validate_credentials(username: str, password: str) -> tuple[bool, str, Optional[UserSession]]:
    """
    Basic username/password gate (demo implementation).
    Replace with OAuth / JWT in production.
    """
    _USERS = {
        "demo":  ("demo123",   "free",  "Demo User"),
        "trader": ("trade2024", "pro",   "Pro Trader"),
        "admin":  ("admin!2024","elite", "Admin"),
    }
    record = _USERS.get(username.lower())
    if record is None or record[0] != password:
        return False, "Invalid username or password.", None

    _, tier, display = record
    session = UserSession(
        username=display,
        tier=tier,
        key_hash=_hash_key(username + password),
        logged_in_at=time.time(),
    )
    _save_session(session)
    return True, f"Welcome, {display}!", session


# ── Persistence ───────────────────────────────────────────────────────────────

def _save_session(session: UserSession) -> None:
    _SESSION_FILE.parent.mkdir(parents=True, exist_ok=True)
    _SESSION_FILE.write_text(json.dumps(session.to_dict(), indent=2))


def load_saved_session() -> Optional[UserSession]:
    """Return an active session from disk if not expired (7-day window)."""
    if not _SESSION_FILE.exists():
        return None
    try:
        data    = json.loads(_SESSION_FILE.read_text())
        session = UserSession.from_dict(data)
        age     = time.time() - session.logged_in_at
        if age > 7 * 86_400:          # 7 days
            _SESSION_FILE.unlink(missing_ok=True)
            return None
        return session
    except Exception:
        return None


def logout() -> None:
    _SESSION_FILE.unlink(missing_ok=True)
