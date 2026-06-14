#!/usr/bin/env bash
# H5 — real ONNX embeddings (fastembed / bge-small): semantic retrieval.
set -u
uv run python "$(dirname "$0")/verify_h_embed.py"
