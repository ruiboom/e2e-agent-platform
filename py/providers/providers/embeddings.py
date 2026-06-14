"""Embedding adapter seam.

Phase 1 ships a dependency-free, deterministic **feature-hashing** embedder so
Ground's vector RAG works offline with no model download. It ranks by shared-token
overlap (cosine over L2-normalised signed-hash bags) — enough to prove the thread.
Swapping in a real model (sentence-transformers / fastembed / a hosted embeddings
API) is a one-function change here; the rest of Ground is unchanged.
"""
from __future__ import annotations

import hashlib
import math
import re

EMBED_DIM = 384
_TOKEN_RE = re.compile(r"[a-z0-9]+")


def _embed_one(text: str) -> list[float]:
    vec = [0.0] * EMBED_DIM
    for tok in _TOKEN_RE.findall(text.lower()):
        h = int(hashlib.md5(tok.encode()).hexdigest(), 16)
        idx = h % EMBED_DIM
        sign = 1.0 if (h >> 8) & 1 else -1.0
        vec[idx] += sign
    norm = math.sqrt(sum(v * v for v in vec)) or 1.0
    return [v / norm for v in vec]


def embed(texts: list[str]) -> list[list[float]]:
    """Embed a batch of texts into EMBED_DIM-dimensional unit vectors."""
    return [_embed_one(t) for t in texts]


def to_pgvector(vec: list[float]) -> str:
    """Render a vector as the pgvector text literal: '[0.1,0.2,...]'."""
    return "[" + ",".join(f"{v:.6f}" for v in vec) + "]"
