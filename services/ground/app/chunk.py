"""Heading-aware markdown chunking (minimal)."""
from __future__ import annotations

import re


def chunk_markdown(body: str, max_chars: int = 800) -> list[tuple[str, str]]:
    """Split into (heading_path, text) chunks; group paragraphs up to max_chars."""
    paras = re.split(r"\n\s*\n", body.strip())
    chunks: list[tuple[str, str]] = []
    heading = ""
    cur: list[str] = []
    cur_len = 0

    def flush() -> None:
        nonlocal cur, cur_len
        if cur:
            chunks.append((heading, "\n\n".join(cur).strip()))
            cur = []
            cur_len = 0

    for raw in paras:
        p = raw.strip()
        if not p:
            continue
        if p.startswith("#") and len(p.splitlines()) == 1:
            flush()
            heading = p.lstrip("#").strip()
            continue
        if cur and cur_len + len(p) > max_chars:
            flush()
        cur.append(p)
        cur_len += len(p)

    flush()
    return chunks
