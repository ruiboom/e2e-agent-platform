from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class Event(BaseModel):
    event_id: str = Field(min_length=8, max_length=128)
    app: str = Field(min_length=1, max_length=128)
    model: str = Field(min_length=1, max_length=128)
    ts: datetime
    input_tokens: int = Field(0, ge=0)
    output_tokens: int = Field(0, ge=0)
    cache_read_tokens: int = Field(0, ge=0)
    cache_write_tokens: int = Field(0, ge=0)
    cost_usd: float = Field(0.0, ge=0)
    session_id: Optional[str] = Field(None, max_length=256)
    meta: Optional[Dict[str, Any]] = None

    def ts_utc(self) -> str:
        dt = self.ts
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


class EventBatch(BaseModel):
    events: List[Event] = Field(max_length=5000)
