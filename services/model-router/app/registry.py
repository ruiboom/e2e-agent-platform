"""Prompt / version registry — data access over Postgres.

Activate = rollback by activating a prior version. The DB enforces at most one
active version per prompt (partial unique index uq_prompt_active).
"""
from __future__ import annotations

import json
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
    """Return the prompt_version to use: an explicit version, else a pending
    draft (drafts take effect immediately — the app is the test bench), else
    the active one. Draft-served calls report version 0."""
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
            draft = conn.execute(
                text("SELECT template FROM prompt_draft WHERE prompt_id = :pid"),
                {"pid": base["id"]},
            ).first()
            if draft:
                return {
                    "prompt_id": str(base["id"]),
                    "key": base["key"],
                    "version": 0,  # draft marker — visible in accounting
                    "template": draft[0],
                    "default_model": vrow["default_model"] if vrow else None,
                }
        if not vrow:
            raise PromptNotFound(
                f"prompt '{base['key']}' has no {'version ' + str(version) if version else 'active version'}"
            )
        return {"prompt_id": str(base["id"]), "key": base["key"], **dict(vrow)}


# ── Prompt-set governance: drafts + full-bundle versions ────────────────────
#
# A draft is a per-prompt working copy that live routing prefers immediately.
# Approval promotes every draft and snapshots the COMPLETE prompt set into
# prompt_bundle version max+1 — prompts are never versioned individually from
# this surface, so no prompt ever deviates on its own.


def get_prompt_set() -> dict[str, Any]:
    with get_engine().connect() as conn:
        prompts = conn.execute(
            text(
                """
                SELECT p.key, p.name,
                       v.version AS active_version, v.template, v.default_model,
                       d.template  AS draft_template,
                       d.updated_by AS draft_by,
                       d.updated_at AS draft_at
                  FROM prompt p
                  LEFT JOIN prompt_version v ON v.prompt_id = p.id AND v.is_active
                  LEFT JOIN prompt_draft d   ON d.prompt_id = p.id
                 ORDER BY p.key
                """
            )
        ).mappings().all()
        bundles = conn.execute(
            text(
                "SELECT version, prompt_count, approved_by, created_at "
                "FROM prompt_bundle ORDER BY version DESC"
            )
        ).mappings().all()
        return {
            "prompts": [
                {
                    "key": r["key"],
                    "name": r["name"],
                    "active_version": r["active_version"],
                    "template": r["template"],
                    "default_model": r["default_model"],
                    "draft": (
                        {
                            "template": r["draft_template"],
                            "updated_by": r["draft_by"],
                            "updated_at": str(r["draft_at"]),
                        }
                        if r["draft_template"] is not None
                        else None
                    ),
                }
                for r in prompts
            ],
            "draft_count": sum(1 for r in prompts if r["draft_template"] is not None),
            "bundle": dict(bundles[0]) if bundles else None,
            "bundles": [dict(b) for b in bundles],
        }


def save_draft(key: str, template: str, updated_by: str) -> dict[str, Any]:
    if not template.strip():
        raise ValueError("template must not be empty")
    with get_engine().begin() as conn:
        prompt_id = _prompt_id_for_key(conn, key)
        conn.execute(
            text(
                "INSERT INTO prompt_draft (prompt_id, template, updated_by) "
                "VALUES (:pid, :tpl, :by) "
                "ON CONFLICT (prompt_id) DO UPDATE "
                "SET template = :tpl, updated_by = :by, updated_at = now()"
            ),
            {"pid": prompt_id, "tpl": template, "by": updated_by},
        )
        return {"key": key, "draft": True, "updated_by": updated_by}


def discard_draft(key: str) -> dict[str, Any]:
    with get_engine().begin() as conn:
        prompt_id = _prompt_id_for_key(conn, key)
        conn.execute(text("DELETE FROM prompt_draft WHERE prompt_id = :pid"), {"pid": prompt_id})
        return {"key": key, "draft": False}


def approve_bundle(approved_by: str) -> dict[str, Any]:
    """Promote every pending draft to the active prompt version, then snapshot
    the COMPLETE prompt set as the next bundle version. One transaction."""
    with get_engine().begin() as conn:
        drafts = conn.execute(
            text(
                "SELECT d.prompt_id, d.template, p.key FROM prompt_draft d "
                "JOIN prompt p ON p.id = d.prompt_id ORDER BY p.key"
            )
        ).mappings().all()
        if not drafts:
            raise ValueError("no drafts to approve — edit a prompt first")

        promoted: list[str] = []
        for d in drafts:
            dm = conn.execute(
                text(
                    "SELECT default_model FROM prompt_version "
                    "WHERE prompt_id = :pid AND is_active = true"
                ),
                {"pid": d["prompt_id"]},
            ).scalar()
            next_v = conn.execute(
                text("SELECT COALESCE(MAX(version),0)+1 FROM prompt_version WHERE prompt_id = :pid"),
                {"pid": d["prompt_id"]},
            ).scalar_one()
            conn.execute(
                text("UPDATE prompt_version SET is_active = false WHERE prompt_id = :pid"),
                {"pid": d["prompt_id"]},
            )
            conn.execute(
                text(
                    "INSERT INTO prompt_version (prompt_id, version, template, default_model, is_active) "
                    "VALUES (:pid, :v, :tpl, :dm, true)"
                ),
                {"pid": d["prompt_id"], "v": next_v, "tpl": d["template"], "dm": dm},
            )
            promoted.append(d["key"])

        snapshot_rows = conn.execute(
            text(
                "SELECT p.key, v.version, v.template, v.default_model "
                "FROM prompt p JOIN prompt_version v ON v.prompt_id = p.id AND v.is_active "
                "ORDER BY p.key"
            )
        ).mappings().all()
        snapshot = {
            r["key"]: {
                "version": r["version"],
                "template": r["template"],
                "default_model": r["default_model"],
            }
            for r in snapshot_rows
        }
        bundle_version = conn.execute(
            text("SELECT COALESCE(MAX(version),0)+1 FROM prompt_bundle")
        ).scalar_one()
        conn.execute(
            text(
                "INSERT INTO prompt_bundle (version, prompts, prompt_count, approved_by) "
                "VALUES (:v, :prompts, :n, :by)"
            ),
            {
                "v": bundle_version,
                "prompts": json.dumps(snapshot),
                "n": len(snapshot),
                "by": approved_by,
            },
        )
        conn.execute(text("DELETE FROM prompt_draft"))
        return {
            "version": bundle_version,
            "prompt_count": len(snapshot),
            "promoted": promoted,
            "approved_by": approved_by,
        }
