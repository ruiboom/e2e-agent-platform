"""The route() core: resolve prompt -> render -> call model -> account -> return."""
from __future__ import annotations

import os

from jinja2 import Template

from app import accounting, providers, registry
from app.schemas import RouteRequest, RouteResponse, Tokens

DEFAULT_MODEL = os.environ.get("MODEL_ROUTER_DEFAULT_MODEL", "claude-haiku-4-5")


def route(req: RouteRequest) -> RouteResponse:
    resolved = registry.resolve(
        prompt_id=req.prompt_id, prompt_key=req.prompt_key, version=req.version
    )
    rendered = Template(resolved["template"]).render(**req.vars)
    messages = [{"role": "user", "content": rendered}]
    model = req.model_pref or resolved.get("default_model") or DEFAULT_MODEL

    content, tokens, latency_ms = providers.complete(messages, model)

    cost = accounting.record(
        model=model,
        input_tokens=tokens["input"],
        output_tokens=tokens["output"],
        latency_ms=latency_ms,
        project_id=req.project_id,
        prompt_key=resolved["key"],
        prompt_version=resolved["version"],
    )

    return RouteResponse(
        text=content,
        model=model,
        tokens=Tokens(input=tokens["input"], output=tokens["output"]),
        cost_usd=cost,
        latency_ms=round(latency_ms, 1),
        prompt_version=resolved["version"],
    )
