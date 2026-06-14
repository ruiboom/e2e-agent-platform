"""Ingest connectors. RSS + web + GitHub today; Confluence/STT remain deferred
(need provider credentials). Each normalises external content into ingest docs
{uri, title, body}. Accepts inline `content` (deterministic) or fetches a source.
"""
from __future__ import annotations

import base64
import os
import re
import xml.etree.ElementTree as ET
from typing import Any

import httpx


def _strip_html(html: str) -> str:
    html = re.sub(r"(?is)<(script|style)[^>]*>.*?</\1>", " ", html)
    text = re.sub(r"(?s)<[^>]+>", " ", html)
    text = re.sub(r"&[a-z]+;", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def _fetch(url: str) -> str:
    r = httpx.get(url, timeout=20.0, follow_redirects=True, headers={"User-Agent": "agent-platform/0.1"})
    r.raise_for_status()
    return r.text


def parse_web(html: str, url: str) -> dict[str, Any]:
    m = re.search(r"(?is)<title[^>]*>(.*?)</title>", html)
    title = (m.group(1).strip() if m else url)[:200]
    body = _strip_html(html)
    return {"uri": url, "title": title, "body": f"# {title}\n\n{body}"}


def parse_rss(xml: str) -> list[dict[str, Any]]:
    root = ET.fromstring(xml.encode() if isinstance(xml, str) else xml)
    docs: list[dict[str, Any]] = []
    for item in root.iter("item"):
        title = (item.findtext("title") or "").strip()
        desc = _strip_html(item.findtext("description") or "")
        link = (item.findtext("link") or title).strip()
        docs.append({"uri": f"rss/{link}", "title": title, "body": f"# {title}\n\n{desc}"})
    return docs


def fetch_github(repo: str, paths: list[str] | None = None) -> list[dict[str, Any]]:
    """Fetch docs from a public GitHub repo (owner/name). With no paths, the README;
    otherwise each path. Uses GITHUB_TOKEN if set (higher rate limit)."""
    headers = {"User-Agent": "agent-platform/0.1", "Accept": "application/vnd.github+json"}
    if os.environ.get("GITHUB_TOKEN"):
        headers["Authorization"] = f"Bearer {os.environ['GITHUB_TOKEN']}"

    def _get(path: str) -> dict[str, Any]:
        r = httpx.get(f"https://api.github.com/repos/{repo}/{path}", headers=headers,
                      timeout=20.0, follow_redirects=True)
        r.raise_for_status()
        return r.json()

    docs: list[dict[str, Any]] = []
    targets = paths or [None]  # None → the repo README
    for p in targets:
        j = _get("readme" if p is None else f"contents/{p}")
        body = base64.b64decode(j.get("content", "")).decode("utf-8", "ignore")
        docs.append({"uri": f"github/{repo}/{j['path']}", "title": f"{repo}: {j['name']}", "body": body})
    return docs


def collect(kind: str, url: str | None, content: str | None, paths: list[str] | None = None) -> list[dict[str, Any]]:
    if kind == "rss":
        return parse_rss(content if content is not None else _fetch(url or ""))
    if kind == "web":
        if content is not None:
            return [parse_web(content, url or "inline")]
        return [parse_web(_fetch(url or ""), url or "")]
    if kind == "github":
        return fetch_github(url or "", paths)   # url carries "owner/name"
    raise ValueError(f"unknown connector '{kind}'")
