from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field, field_validator

KINDS = {"nps", "csat", "thumb", "freeform", "bug", "idea", "praise"}
SENTIMENTS = {"positive", "neutral", "negative"}
STATUSES = {"new", "triaged", "resolved", "archived"}


def derive_sentiment(kind: str, rating: Optional[int]) -> Optional[str]:
    """Coarse sentiment from an unambiguous signal — a deterministic rule, not a
    guess. Free text (freeform / idea) stays None for later async enrichment."""
    if kind == "praise":
        return "positive"
    if kind == "bug":
        return "negative"
    if rating is None:
        return None
    if kind == "thumb":
        return "positive" if rating > 0 else "negative"
    if kind == "nps":
        if rating >= 9:
            return "positive"   # promoter
        if rating >= 7:
            return "neutral"    # passive
        return "negative"       # detractor
    if kind == "csat":
        if rating >= 4:
            return "positive"
        if rating == 3:
            return "neutral"
        return "negative"
    return None


class Feedback(BaseModel):
    feedback_id: str = Field(min_length=8, max_length=128)
    app: str = Field(min_length=1, max_length=128)
    ts: datetime
    kind: str = Field(default="freeform", min_length=1, max_length=32)
    rating: Optional[int] = Field(default=None, ge=-1, le=10)
    sentiment: Optional[str] = None
    text: Optional[str] = Field(default=None, max_length=10000)
    user_id: Optional[str] = Field(default=None, max_length=256)
    session_id: Optional[str] = Field(default=None, max_length=256)
    meta: Optional[Dict[str, Any]] = None

    @field_validator("sentiment")
    @classmethod
    def _check_sentiment(cls, v):
        if v is not None and v not in SENTIMENTS:
            raise ValueError("sentiment must be positive|neutral|negative")
        return v

    def ts_utc(self) -> str:
        dt = self.ts
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


class FeedbackBatch(BaseModel):
    items: List[Feedback] = Field(max_length=5000)


class FeedbackPatch(BaseModel):
    """Triage update. Only provided fields are changed."""
    status: Optional[str] = None
    tags: Optional[List[str]] = None
    note: Optional[str] = Field(default=None, max_length=4000)

    @field_validator("status")
    @classmethod
    def _check_status(cls, v):
        if v is not None and v not in STATUSES:
            raise ValueError("status must be new|triaged|resolved|archived")
        return v
