"""Embedding + LLM provider adapters.

LLM access in Phase 0 goes through the model-router service (wraps LiteLLM).
Phase 1 adds the embedding seam used by Ground's vector RAG.
"""
from providers.embeddings import EMBED_DIM, embed, to_pgvector

__all__ = ["embed", "to_pgvector", "EMBED_DIM", "__version__"]
__version__ = "0.0.0"
