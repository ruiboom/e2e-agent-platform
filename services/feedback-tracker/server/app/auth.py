"""Ingest and admin authentication.

Ingest auth is enforced when either:
  - FEEDBACK_TRACKER_AUTH is set to required/on/true/1, or
  - FEEDBACK_TRACKER_TOKENS is set (legacy static map "app1:tok1,app2:tok2").

Two key types live in the apps registry (managed via /admin.html):
  - publishable keys (pk_…) — safe to embed in a browser widget; write-only.
  - secret tokens (sek_…) — for the server SDK and, with an admin token, admin.
Both authorise *write-as-this-app* for ingest; when auth is enforced, each
item's `app` field must match the app bound to the presented key.

Admin endpoints are protected by FEEDBACK_TRACKER_ADMIN_TOKEN when set;
otherwise they are open (dev / trusted network), like the rest of the API.
"""

import os
from typing import Optional

from fastapi import Header, HTTPException

from .db import get_conn


def env_token_map():
    out = {}
    for pair in os.environ.get("FEEDBACK_TRACKER_TOKENS", "").split(","):
        pair = pair.strip()
        if not pair:
            continue
        app, _, tok = pair.partition(":")
        if app.strip() and tok.strip():
            out[tok.strip()] = app.strip()
    return out


def auth_required() -> bool:
    if env_token_map():
        return True
    return os.environ.get("FEEDBACK_TRACKER_AUTH", "").lower() in (
        "required", "on", "true", "1")


def resolve_token(token: str) -> Optional[str]:
    """Return the app bound to a token (secret or publishable), or None."""
    app = env_token_map().get(token)
    if app:
        return app
    row = get_conn().execute(
        "SELECT app FROM apps WHERE secret_token = ? OR publishable_key = ?",
        (token, token)).fetchone()
    return row["app"] if row else None


def _bearer(authorization: Optional[str]) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="missing bearer token")
    return authorization[len("Bearer "):].strip()


def authenticate(authorization: Optional[str] = Header(default=None)) -> Optional[str]:
    """Ingest auth. Returns the caller's app, or None in open mode."""
    if not auth_required():
        return None
    app = resolve_token(_bearer(authorization))
    if app is None:
        raise HTTPException(status_code=401, detail="invalid key")
    return app


def admin_guard(authorization: Optional[str] = Header(default=None)) -> None:
    admin_token = os.environ.get("FEEDBACK_TRACKER_ADMIN_TOKEN", "")
    if not admin_token:
        return
    if _bearer(authorization) != admin_token:
        raise HTTPException(status_code=401, detail="invalid admin token")
