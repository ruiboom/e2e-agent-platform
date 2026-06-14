"""Operate service — close the loop from live logs (Phase 7)."""
from __future__ import annotations

from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[3] / ".env")

from fastapi import FastAPI, HTTPException  # noqa: E402
from pydantic import BaseModel  # noqa: E402

from app import operate as operate_mod  # noqa: E402

app = FastAPI(title="optimise", version="0.0.0")


class OperateRequest(BaseModel):
    agent_version_id: str


@app.get("/healthz")
def healthz() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/v1/operate")
def operate(req: OperateRequest) -> dict:
    try:
        return operate_mod.operate(req.agent_version_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"operate failed: {e}")
