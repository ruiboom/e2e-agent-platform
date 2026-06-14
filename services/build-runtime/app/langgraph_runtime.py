"""A real LangGraph StateGraph (retrieve -> generate) for the `langgraph` build
paradigm. Executes the same shared RAG steps as the inline runtime, but as a
compiled graph — the genuine LangGraph runtime rather than a config placeholder.
"""
from __future__ import annotations

from typing import Any, TypedDict

from langgraph.graph import END, START, StateGraph

from app import rag


class _State(TypedDict, total=False):
    project_id: str
    release_key: str
    mode: str
    system_prompt: str
    question: str
    k: int
    chunks: list[dict[str, Any]]
    gen: dict[str, Any]


def _retrieve_node(state: _State) -> dict[str, Any]:
    return {"chunks": rag.retrieve(state["project_id"], state["release_key"], state["question"], state["k"], state["mode"])}


def _generate_node(state: _State) -> dict[str, Any]:
    context = rag.build_context(state["chunks"])
    return {"gen": rag.generate(state["project_id"], state["system_prompt"], context, state["question"])}


def _build():
    g = StateGraph(_State)
    g.add_node("retrieve", _retrieve_node)
    g.add_node("generate", _generate_node)
    g.add_edge(START, "retrieve")
    g.add_edge("retrieve", "generate")
    g.add_edge("generate", END)
    return g.compile()


_COMPILED = _build()


def run(project_id: str, release_key: str, mode: str, system_prompt: str, question: str, k: int):
    result = _COMPILED.invoke({
        "project_id": project_id, "release_key": release_key, "mode": mode,
        "system_prompt": system_prompt, "question": question, "k": k,
    })
    return result["chunks"], result["gen"]
