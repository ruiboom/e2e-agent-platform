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


class TestsuiteRequest(BaseModel):
    agent_version_id: str


class RunSuiteRequest(BaseModel):
    agent_version_id: str
    test_suite_id: str


class PolicyRequest(BaseModel):
    project_id: str
    pre_deploy_gates: dict
    opa_rules: dict | None = None


class Gate2Request(BaseModel):
    project_id: str
    agent_version_id: str
    context: dict | None = None


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


@app.post("/v1/testsuite")
def testsuite(req: TestsuiteRequest) -> dict:
    try:
        return evaluate.generate_testsuite(req.agent_version_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/v1/run-suite")
def run_suite(req: RunSuiteRequest) -> dict:
    try:
        return evaluate.run_suite(req.agent_version_id, req.test_suite_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"run-suite failed: {e}")


@app.get("/v1/policy")
def get_policy(project_id: str) -> dict:
    return evaluate.get_policy(project_id)


@app.post("/v1/policy")
def set_policy(req: PolicyRequest) -> dict:
    return evaluate.set_policy(req.project_id, req.pre_deploy_gates, req.opa_rules)


@app.post("/v1/gate2")
def gate2(req: Gate2Request) -> dict:
    return evaluate.gate2(req.project_id, req.agent_version_id, req.context)
