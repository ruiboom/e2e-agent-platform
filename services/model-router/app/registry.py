"""Prompt / version registry — data access over Postgres.

Activate = rollback by activating a prior version. The DB enforces at most one
active version per prompt (partial unique index uq_prompt_active).
"""
from __future__ import annotations

from typing import Any, Optional

from sqlalchemy import text

from app.db import get_engine


class PromptNotFound(Exception):
    pass


def create_prompt(key: str, name: str) -> dict[str, Any]:
    with get_engine().begin() as conn:
        row = conn.execute(
            text("INSERT INTO prompt (key, name) VALUES (:key, :name) RETURNING id, key, name, created_at"),
            {"key": key, "name": name},
        ).mappings().one()
        return dict(row)


def _prompt_id_for_key(conn, key: str) -> str:
    row = conn.execute(text("SELECT id FROM prompt WHERE key = :key"), {"key": key}).first()
    if not row:
        raise PromptNotFound(f"prompt '{key}' not found")
    return str(row[0])


def add_version(
    key: str,
    *,
    template: str,
    version: Optional[int] = None,
    default_model: Optional[str] = None,
    activate: bool = False,
) -> dict[str, Any]:
    with get_engine().begin() as conn:
        prompt_id = _prompt_id_for_key(conn, key)
        if version is None:
            version = conn.execute(
                text("SELECT COALESCE(MAX(version),0)+1 FROM prompt_version WHERE prompt_id = :pid"),
                {"pid": prompt_id},
            ).scalar_one()
        row = conn.execute(
            text(
                "INSERT INTO prompt_version (prompt_id, version, template, default_model) "
                "VALUES (:pid, :v, :tpl, :dm) RETURNING id, version, template, default_model, is_active"
            ),
            {"pid": prompt_id, "v": version, "tpl": template, "dm": default_model},
        ).mappings().one()
        result = dict(row)
        if activate:
            conn.execute(
                text("UPDATE prompt_version SET is_active = false WHERE prompt_id = :pid"),
                {"pid": prompt_id},
            )
            conn.execute(
                text("UPDATE prompt_version SET is_active = true WHERE prompt_id = :pid AND version = :v"),
                {"pid": prompt_id, "v": version},
            )
            result["is_active"] = True
        return result


def activate(key: str, version: int) -> dict[str, Any]:
    with get_engine().begin() as conn:
        prompt_id = _prompt_id_for_key(conn, key)
        exists = conn.execute(
            text("SELECT 1 FROM prompt_version WHERE prompt_id = :pid AND version = :v"),
            {"pid": prompt_id, "v": version},
        ).first()
        if not exists:
            raise PromptNotFound(f"prompt '{key}' has no version {version}")
        conn.execute(
            text("UPDATE prompt_version SET is_active = false WHERE prompt_id = :pid"),
            {"pid": prompt_id},
        )
        conn.execute(
            text("UPDATE prompt_version SET is_active = true WHERE prompt_id = :pid AND version = :v"),
            {"pid": prompt_id, "v": version},
        )
        return {"key": key, "active_version": version}


def get_prompt(key: str) -> dict[str, Any]:
    with get_engine().connect() as conn:
        prow = conn.execute(
            text("SELECT id, key, name, created_at FROM prompt WHERE key = :key"), {"key": key}
        ).mappings().first()
        if not prow:
            raise PromptNotFound(f"prompt '{key}' not found")
        versions = conn.execute(
            text(
                "SELECT version, template, default_model, is_active, created_at "
                "FROM prompt_version WHERE prompt_id = :pid ORDER BY version"
            ),
            {"pid": prow["id"]},
        ).mappings().all()
        active = next((v["version"] for v in versions if v["is_active"]), None)
        return {**dict(prow), "active_version": active, "versions": [dict(v) for v in versions]}


def resolve(
    *, prompt_id: Optional[str] = None, prompt_key: Optional[str] = None, version: Optional[int] = None
) -> dict[str, Any]:
    """Return the prompt_version to use: an explicit version, else the active one."""
    if not prompt_id and not prompt_key:
        raise ValueError("resolve: prompt_id or prompt_key is required")
    with get_engine().connect() as conn:
        if prompt_key:
            base = conn.execute(
                text("SELECT id, key FROM prompt WHERE key = :key"), {"key": prompt_key}
            ).mappings().first()
        else:
            base = conn.execute(
                text("SELECT id, key FROM prompt WHERE id = :id"), {"id": prompt_id}
            ).mappings().first()
        if not base:
            raise PromptNotFound(f"prompt {prompt_key or prompt_id} not found")

        if version is not None:
            vrow = conn.execute(
                text(
                    "SELECT version, template, default_model FROM prompt_version "
                    "WHERE prompt_id = :pid AND version = :v"
                ),
                {"pid": base["id"], "v": version},
            ).mappings().first()
        else:
            vrow = conn.execute(
                text(
                    "SELECT version, template, default_model FROM prompt_version "
                    "WHERE prompt_id = :pid AND is_active = true"
                ),
                {"pid": base["id"]},
            ).mappings().first()
        if not vrow:
            raise PromptNotFound(
                f"prompt '{base['key']}' has no {'version ' + str(version) if version else 'active version'}"
            )
        return {"prompt_id": str(base["id"]), "key": base["key"], **dict(vrow)}
