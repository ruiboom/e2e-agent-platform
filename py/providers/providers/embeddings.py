"""Embedding adapter seam (H5).

Uses a real ONNX embedding model — **BAAI/bge-small-en-v1.5** via `fastembed`
(384-dim, matches the `kb_chunk.embedding vector(384)` column) — for genuine
semantic retrieval. Falls back to a deterministic feature-hash embedder if
fastembed/the model is unavailable, so Ground still works offline. `embed_engine()`
reports which is active. Re-embedding existing chunks is a projection rebuild;
new ingests use whichever engine is active.
"""
from __future__ import annotations

import hashlib
import math
import re
from typing import Any

EMBED_DIM = 384
_TOKEN_RE = re.compile(r"[a-z0-9]+")

_UNSET: Any = object()
_MODEL: Any = _UNSET


def _model():
    global _MODEL
    if _MODEL is _UNSET:
        try:
            from fastembed import TextEmbedding
            _MODEL = TextEmbedding(model_name="BAAI/bge-small-en-v1.5")
        except Exception:
            _MODEL = None
    return _MODEL


def embed_engine() -> str:
    return "fastembed:bge-small-en-v1.5" if _model() is not None else "hash"


# ── feature-hash fallback (offline, deterministic) ─────────────────────────
def _hash_embed_one(text: str) -> list[float]:
    vec = [0.0] * EMBED_DIM
    for tok in _TOKEN_RE.findall((text or "").lower()):
        h = int(hashlib.md5(tok.encode()).hexdigest(), 16)
        idx = h % EMBED_DIM
        sign = 1.0 if (h >> 8) & 1 else -1.0
        vec[idx] += sign
    norm = math.sqrt(sum(v * v for v in vec)) or 1.0
    return [v / norm for v in vec]


def embed(texts: list[str]) -> list[list[float]]:
    """Embed a batch of texts into EMBED_DIM-dimensional unit vectors."""
    model = _model()
    if model is None:
        return [_hash_embed_one(t) for t in texts]
    return [[float(x) for x in v] for v in model.embed(list(texts))]


def to_pgvector(vec: list[float]) -> str:
    """Render a vector as the pgvector text literal: '[0.1,0.2,...]'."""
    return "[" + ",".join(f"{v:.6f}" for v in vec) + "]"
