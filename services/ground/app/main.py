"""Ground service — governed canonical store + multi-mode vector RAG (Phase 3)."""
from __future__ import annotations

from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[3] / ".env")

from fastapi import FastAPI, HTTPException  # noqa: E402
from pydantic import BaseModel, Field  # noqa: E402

from app import connectors, store  # noqa: E402

app = FastAPI(title="ground", version="0.1.0")

RETRIEVAL_MODES = ["vector", "lexical", "hybrid", "graph", "graph_hybrid"]


class Doc(BaseModel):
    uri: str
    title: str | None = None
    body: str


class IngestRequest(BaseModel):
    project_id: str
    docs: list[Doc]
    submitted_by: str = "ingest"


class ConnectRequest(BaseModel):
    project_id: str
    kind: str
    url: str | None = None
    content: str | None = None
    submitted_by: str = "connector"


class ApproveRequest(BaseModel):
    revision_id: str
    approver: str


class ReleaseRequest(BaseModel):
    project_id: str
    kb_outline_artifact_id: str | None = None


class RetrieveRequest(BaseModel):
    project_id: str
    release_key: str
    query: str
    k: int = Field(default=4, ge=1, le=20)
    mode: str = "vector"


@app.get("/healthz")
def healthz() -> dict[str, str]:
    return {"status": "ok", "modes": ",".join(RETRIEVAL_MODES)}


@app.post("/v1/ingest")
def ingest(req: IngestRequest) -> dict:
    return {"items": store.ingest(req.project_id, [d.model_dump() for d in req.docs], req.submitted_by)}


@app.post("/v1/connect")
def connect(req: ConnectRequest) -> dict:
    try:
        docs = connectors.collect(req.kind, req.url, req.content)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"connector": req.kind, "items": store.ingest(req.project_id, docs, req.submitted_by)}


@app.post("/v1/approve")
def approve(req: ApproveRequest) -> dict:
    try:
        return store.approve(req.revision_id, req.approver)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/v1/release")
def release(req: ReleaseRequest) -> dict:
    return store.create_release(req.project_id, req.kb_outline_artifact_id)


@app.post("/v1/retrieve")
def retrieve(req: RetrieveRequest) -> dict:
    if req.mode not in RETRIEVAL_MODES:
        raise HTTPException(status_code=400, detail=f"unknown mode '{req.mode}'")
    return {"mode": req.mode, "chunks": store.retrieve(req.project_id, req.release_key, req.query, req.k, req.mode)}
