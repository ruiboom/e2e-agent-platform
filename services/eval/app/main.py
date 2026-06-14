"""Eval service — one Judge node over transcripts (Phase 1)."""
from __future__ import annotations

from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[3] / ".env")

from fastapi import FastAPI, HTTPException  # noqa: E402
from pydantic import BaseModel  # noqa: E402

from app import evaluate  # noqa: E402

app = FastAPI(title="eval", version="0.0.0")

DEFAULT_QUESTIONS = [
    "What is the interest rate on an arranged overdraft?",
    "How long does switching my account take?",
    "Is there a monthly fee on the Classic account?",
]


class EvalRequest(BaseModel):
    agent_version_id: str
    questions: list[str] | None = None


@app.get("/healthz")
def healthz() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/v1/eval")
def run(req: EvalRequest) -> dict:
    try:
        return evaluate.run_eval(req.agent_version_id, req.questions or DEFAULT_QUESTIONS)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"eval failed: {e}")
