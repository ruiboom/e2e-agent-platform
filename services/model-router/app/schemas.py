"""Request/response contracts for the model router."""
from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, Field


class RouteRequest(BaseModel):
    prompt_id: Optional[str] = None
    prompt_key: Optional[str] = None
    version: Optional[int] = None
    vars: dict[str, Any] = Field(default_factory=dict)
    model_pref: Optional[str] = None
    project_id: Optional[str] = None


class Tokens(BaseModel):
    input: int
    output: int


class RouteResponse(BaseModel):
    text: str
    model: str
    tokens: Tokens
    cost_usd: float
    latency_ms: float
    prompt_version: int


class CreatePromptRequest(BaseModel):
    key: str
    name: str


class AddVersionRequest(BaseModel):
    version: Optional[int] = None
    template: str
    default_model: Optional[str] = None
    activate: bool = False
