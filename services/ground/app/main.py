"""Ground service — minimal canonical store + vector RAG (Phase 1).

Ingest docs -> canonical store (items/revisions/chunks) -> pgvector projection.
Pin a kb_release (emits a lineage artifact). Retrieve returns the provenance
{item_id, revision_id, chunk_id} on every chunk — the join key for the runtime.
"""
from __future__ import annotations

from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[3] / ".env")

from fastapi import FastAPI  # noqa: E402
from pydantic import BaseModel, Field  # noqa: E402

from app import store  # noqa: E402

app = FastAPI(title="ground", version="0.0.0")


class Doc(BaseModel):
    uri: str
    title: str | None = None
    body: str


class IngestRequest(BaseModel):
    project_id: str
    docs: list[Doc]


class ReleaseRequest(BaseModel):
    project_id: str
    kb_outline_artifact_id: str | None = None


class RetrieveRequest(BaseModel):
    project_id: str
    release_key: str
    query: str
    k: int = Field(default=4, ge=1, le=20)


@app.get("/healthz")
def healthz() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/v1/ingest")
def ingest(req: IngestRequest) -> dict:
    return {"items": store.ingest(req.project_id, [d.model_dump() for d in req.docs])}


@app.post("/v1/release")
def release(req: ReleaseRequest) -> dict:
    return store.create_release(req.project_id, req.kb_outline_artifact_id)


@app.post("/v1/retrieve")
def retrieve(req: RetrieveRequest) -> dict:
    return {"chunks": store.retrieve(req.project_id, req.release_key, req.query, req.k)}
