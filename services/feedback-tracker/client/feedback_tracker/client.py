"""Fire-and-forget user-feedback submission.

submit() appends one JSON line to a local spool file and returns immediately;
a daemon thread batches pending lines and POSTs them to the collector with
retry and backoff. The host app's path never touches the network, and nothing
is lost while the collector is unreachable. submit() never raises.

This is the server-side surface (a faithful port of cost_tracker). For
collecting feedback directly in a browser UI, use the JS widget instead.
"""

import atexit
import json
import logging
import os
import threading
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

import httpx

from .sentiment import derive_sentiment

logger = logging.getLogger("feedback_tracker")

_TS_FMT = "%Y-%m-%dT%H:%M:%SZ"


class FeedbackTracker:
    def __init__(self, *, url=None, token=None, app=None, spool_dir=None,
                 flush_interval=5.0, batch_size=200, transport=None):
        self.url = (url or os.environ.get("FEEDBACK_TRACKER_URL", "")).rstrip("/")
        self.token = token or os.environ.get("FEEDBACK_TRACKER_TOKEN", "")
        self.app = app or os.environ.get("FEEDBACK_TRACKER_APP", "")
        self.flush_interval = flush_interval
        self.batch_size = batch_size
        self._transport = transport  # injectable for tests

        spool_dir = Path(
            spool_dir
            or os.environ.get("FEEDBACK_TRACKER_SPOOL_DIR")
            or Path.home() / ".feedback_tracker" / "spool"
        )
        spool_dir.mkdir(parents=True, exist_ok=True)
        safe = "".join(c if c.isalnum() or c in "-_" else "_"
                       for c in (self.app or "default"))
        self._spool = spool_dir / f"{safe}.jsonl"
        self._offset_file = spool_dir / f"{safe}.jsonl.offset"

        self._lock = threading.Lock()
        self._wakeup = threading.Event()
        self._stop = threading.Event()
        self._thread = None
        self._client = None
        self._backoff = 0.0
        atexit.register(self._shutdown)

    # ------------------------------------------------------------------
    # public API

    def submit(self, *, kind="freeform", rating=None, sentiment=None, text=None,
               user_id=None, session_id=None, ts=None, meta=None, app=None,
               feedback_id=None):
        """Record one piece of feedback. Returns immediately; never raises."""
        try:
            if sentiment is None:
                sentiment = derive_sentiment(kind, rating)
            if isinstance(ts, datetime):
                ts = ts.astimezone(timezone.utc).strftime(_TS_FMT)
            item = {
                "feedback_id": str(feedback_id) if feedback_id else str(uuid.uuid4()),
                "app": app or self.app or "unknown",
                "kind": str(kind),
                "ts": ts or datetime.now(timezone.utc).strftime(_TS_FMT),
            }
            if rating is not None:
                item["rating"] = int(rating)
            if sentiment:
                item["sentiment"] = sentiment
            if text:
                item["text"] = str(text)
            if user_id:
                item["user_id"] = str(user_id)
            if session_id:
                item["session_id"] = str(session_id)
            if meta:
                item["meta"] = meta
            line = json.dumps(item, separators=(",", ":")) + "\n"
            with self._lock:
                with open(self._spool, "a", encoding="utf-8") as f:
                    f.write(line)
            self._ensure_thread()
            self._wakeup.set()
        except Exception:
            logger.warning("feedback_tracker: failed to record feedback", exc_info=True)

    def flush(self, timeout=10.0):
        """Synchronously drain the spool. Returns True if fully drained."""
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            sent = self._flush_once()
            if sent == 0:
                return True
            if sent < 0:
                return False
        return False

    def pending(self):
        """Number of bytes spooled but not yet acknowledged by the collector."""
        try:
            return self._spool.stat().st_size - self._read_offset()
        except FileNotFoundError:
            return 0

    # ------------------------------------------------------------------
    # internals

    def _ensure_thread(self):
        if self._thread is not None and self._thread.is_alive():
            return
        with self._lock:
            if self._thread is None or not self._thread.is_alive():
                self._thread = threading.Thread(
                    target=self._run, name="feedback-tracker-flusher", daemon=True)
                self._thread.start()

    def _run(self):
        while not self._stop.is_set():
            self._wakeup.wait(self.flush_interval + self._backoff)
            self._wakeup.clear()
            if self._stop.is_set():
                return
            sent = self._flush_once()
            if sent < 0:
                self._backoff = min(max(self._backoff, 1.0) * 2, 60.0)
            else:
                self._backoff = 0.0

    def _read_offset(self):
        try:
            return int(self._offset_file.read_text() or 0)
        except (FileNotFoundError, ValueError):
            return 0

    def _flush_once(self):
        """Send one batch. Returns items sent, 0 if drained, -1 on failure."""
        if not self.url:
            return 0  # not configured; feedback accumulates in the spool
        with self._lock:
            offset = self._read_offset()
            raw_lines, consumed = [], 0
            try:
                with open(self._spool, "rb") as f:
                    f.seek(offset)
                    for _ in range(self.batch_size):
                        raw = f.readline()
                        if not raw:
                            break
                        consumed += len(raw)
                        raw_lines.append(raw)
            except FileNotFoundError:
                return 0
        if not raw_lines:
            return 0

        items = []
        for raw in raw_lines:
            try:
                items.append(json.loads(raw.decode("utf-8")))
            except (ValueError, UnicodeDecodeError):
                pass  # skip corrupt line but still advance past it

        if items:
            try:
                resp = self._get_client().post(
                    self.url + "/v1/feedback", json={"items": items})
            except Exception as exc:
                logger.debug("feedback_tracker: collector unreachable: %s", exc)
                return -1
            if resp.status_code in (401, 403) or resp.status_code >= 500:
                logger.warning("feedback_tracker: collector returned %s; retrying",
                               resp.status_code)
                return -1
            if resp.status_code >= 400:
                # validation rejection: a poison batch must not block the queue
                logger.error(
                    "feedback_tracker: collector rejected batch (%s): %s — "
                    "dropping %d items",
                    resp.status_code, resp.text[:200], len(items))

        with self._lock:
            self._offset_file.write_text(str(offset + consumed))
            self._maybe_compact()
        return len(items) or len(raw_lines)

    def _maybe_compact(self, threshold=1_000_000):
        # caller holds self._lock
        offset = self._read_offset()
        if offset < threshold:
            return
        try:
            with open(self._spool, "rb") as f:
                f.seek(offset)
                rest = f.read()
            tmp = self._spool.with_suffix(".jsonl.tmp")
            tmp.write_bytes(rest)
            tmp.replace(self._spool)
            self._offset_file.write_text("0")
        except OSError:
            logger.warning("feedback_tracker: spool compaction failed", exc_info=True)

    def _get_client(self):
        if self._client is None:
            headers = {}
            if self.token:
                headers["Authorization"] = f"Bearer {self.token}"
            self._client = httpx.Client(
                headers=headers, timeout=10.0, transport=self._transport)
        return self._client

    def _shutdown(self):
        self._stop.set()
        self._wakeup.set()
        try:
            self.flush(timeout=3.0)
        except Exception:
            pass


# ----------------------------------------------------------------------
# module-level default instance, configured from env vars

_default = None
_default_lock = threading.Lock()


def _get_default():
    global _default
    if _default is None:
        with _default_lock:
            if _default is None:
                _default = FeedbackTracker()
    return _default


def configure(**kwargs):
    """Replace the default tracker (otherwise built from env vars on first use)."""
    global _default
    with _default_lock:
        _default = FeedbackTracker(**kwargs)
    return _default


def submit(**kwargs):
    _get_default().submit(**kwargs)


def flush(timeout=10.0):
    return _get_default().flush(timeout)
