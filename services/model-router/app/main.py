"""Model router service.

One seam over all LLM providers (via LiteLLM) + a prompt/version registry.
Every /v1/route call emits tokens/cost/latency to the cost-tracker.
"""
from __future__ import annotations

from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query

# Load the repo-root .env (DATABASE_URL, COST_TRACKER_URL, ANTHROPIC_API_KEY, ...)
# when run on the host via `uv run`. No-op if the file is absent.
load_dotenv(Path(__file__).resolve().parents[3] / ".env")

from app import registry, router  # noqa: E402
from app.schemas import (  # noqa: E402
    AddVersionRequest,
    ApproveBundleRequest,
    CreatePromptRequest,
    RouteRequest,
    RouteResponse,
    SaveDraftRequest,
)

app = FastAPI(title="model-router", version="0.0.0")


@app.get("/healthz")
def healthz() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/v1/route", response_model=RouteResponse)
def route(req: RouteRequest) -> RouteResponse:
    if not req.prompt_id and not req.prompt_key:
        raise HTTPException(status_code=400, detail="prompt_id or prompt_key is required")
    try:
        return router.route(req)
    except registry.PromptNotFound as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:  # provider/LiteLLM failures (e.g. missing API key)
        raise HTTPException(status_code=502, detail=f"model call failed: {e}")


@app.post("/v1/prompts")
def create_prompt(req: CreatePromptRequest) -> dict:
    return registry.create_prompt(req.key, req.name)


@app.post("/v1/prompts/{key}/versions")
def add_version(key: str, req: AddVersionRequest) -> dict:
    try:
        return registry.add_version(
            key, template=req.template, version=req.version,
            default_model=req.default_model, activate=req.activate,
        )
    except registry.PromptNotFound as e:
        raise HTTPException(status_code=404, detail=str(e))


@app.post("/v1/prompts/{key}/activate")
def activate(key: str, version: int = Query(...)) -> dict:
    try:
        return registry.activate(key, version)
    except registry.PromptNotFound as e:
        raise HTTPException(status_code=404, detail=str(e))


@app.get("/v1/prompts/{key}")
def get_prompt(key: str) -> dict:
    try:
        return registry.get_prompt(key)
    except registry.PromptNotFound as e:
        raise HTTPException(status_code=404, detail=str(e))


# ── Prompt-set governance: drafts (live immediately) + full-bundle versions ──


@app.get("/v1/prompt-set")
def get_prompt_set() -> dict:
    return registry.get_prompt_set()


@app.put("/v1/prompt-set/draft")
def save_draft(req: SaveDraftRequest) -> dict:
    try:
        return registry.save_draft(req.key, req.template, req.updated_by)
    except registry.PromptNotFound as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.delete("/v1/prompt-set/draft/{key}")
def discard_draft(key: str) -> dict:
    try:
        return registry.discard_draft(key)
    except registry.PromptNotFound as e:
        raise HTTPException(status_code=404, detail=str(e))


@app.post("/v1/prompt-set/approve")
def approve_bundle(req: ApproveBundleRequest) -> dict:
    try:
        return registry.approve_bundle(req.approved_by)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
