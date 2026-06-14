"""Build runtime service — minimal vector-RAG agent (Phase 1)."""
from __future__ import annotations

from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[3] / ".env")

from fastapi import FastAPI, HTTPException  # noqa: E402
from pydantic import BaseModel, Field  # noqa: E402

from app import runtime  # noqa: E402

app = FastAPI(title="build-runtime", version="0.0.0")


class AgentVersionRequest(BaseModel):
    project_id: str
    system_prompt_artifact_id: str
    kb_release_artifact_id: str
    retrieval_strategy: str = "vector"
    build_paradigm: str = "code"


class BuildRequest(BaseModel):
    project_id: str
    paradigm: str
    system_prompt_artifact_id: str
    kb_release_artifact_id: str
    retrieval_strategy: str = "vector"


class ChatRequest(BaseModel):
    agent_version_id: str
    question: str
    k: int = Field(default=4, ge=1, le=20)


@app.get("/healthz")
def healthz() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/v1/agent-version")
def agent_version(req: AgentVersionRequest) -> dict:
    try:
        return runtime.create_agent_version(
            req.project_id, req.system_prompt_artifact_id, req.kb_release_artifact_id,
            req.retrieval_strategy, req.build_paradigm,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/v1/build")
def build(req: BuildRequest) -> dict:
    try:
        return runtime.build_agent(
            req.project_id, req.paradigm, req.system_prompt_artifact_id,
            req.kb_release_artifact_id, req.retrieval_strategy,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"build failed: {e}")


@app.post("/v1/chat")
def chat(req: ChatRequest) -> dict:
    try:
        return runtime.chat(req.agent_version_id, req.question, req.k)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"chat failed: {e}")
