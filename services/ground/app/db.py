"""Shared Postgres engine for Ground."""
from __future__ import annotations

import os

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine

_engine: Engine | None = None


def _normalize(url: str) -> str:
    if url.startswith("postgresql://"):
        return "postgresql+psycopg://" + url[len("postgresql://") :]
    return url


def get_engine() -> Engine:
    global _engine
    if _engine is None:
        url = os.environ.get(
            "DATABASE_URL", "postgresql://postgres:postgres@localhost:5433/agent_platform"
        )
        _engine = create_engine(_normalize(url), pool_pre_ping=True)
    return _engine
