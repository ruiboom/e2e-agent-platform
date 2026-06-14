"""SQLite store. WAL mode, one connection per thread, FTS5 over feedback text.

The collector is the only writer, so SQLite comfortably handles this
workload. Set FEEDBACK_TRACKER_DB to relocate the database file.
"""

import os
import sqlite3
import threading

_local = threading.local()

SCHEMA = """
CREATE TABLE IF NOT EXISTS feedback (
  feedback_id TEXT PRIMARY KEY,
  app TEXT NOT NULL,
  ts TEXT NOT NULL,               -- submission time, UTC, 'YYYY-MM-DD HH:MM:SS'
  received_at TEXT NOT NULL,      -- collector time, UTC
  kind TEXT NOT NULL,             -- nps | csat | thumb | freeform | bug | idea | praise
  rating INTEGER,                 -- nps 0-10 | csat 1-5 | thumb -1/1 | NULL
  sentiment TEXT,                 -- positive | neutral | negative | NULL
  text TEXT,                      -- the comment (may be empty for a bare rating)
  user_id TEXT,                   -- optional, pseudonymous
  session_id TEXT,
  meta TEXT,                      -- JSON: page, app_version, feature, ...
  -- collector-owned lifecycle (set via the dashboard, never by the submitter):
  status TEXT NOT NULL DEFAULT 'new',  -- new | triaged | resolved | archived
  tags TEXT,                      -- JSON array, added during triage
  note TEXT                       -- internal triage note
);
CREATE INDEX IF NOT EXISTS idx_feedback_ts ON feedback(ts);
CREATE INDEX IF NOT EXISTS idx_feedback_app_ts ON feedback(app, ts);
CREATE INDEX IF NOT EXISTS idx_feedback_sentiment_ts ON feedback(sentiment, ts);
CREATE INDEX IF NOT EXISTS idx_feedback_kind_ts ON feedback(kind, ts);
CREATE INDEX IF NOT EXISTS idx_feedback_status ON feedback(status);

-- full-text search over the comment. External-content FTS keyed on the
-- feedback table's implicit rowid, kept in sync by triggers.
CREATE VIRTUAL TABLE IF NOT EXISTS feedback_fts
  USING fts5(text, content='feedback', content_rowid='rowid');

CREATE TRIGGER IF NOT EXISTS feedback_ai AFTER INSERT ON feedback BEGIN
  INSERT INTO feedback_fts(rowid, text) VALUES (new.rowid, new.text);
END;
CREATE TRIGGER IF NOT EXISTS feedback_ad AFTER DELETE ON feedback BEGIN
  INSERT INTO feedback_fts(feedback_fts, rowid, text) VALUES ('delete', old.rowid, old.text);
END;
CREATE TRIGGER IF NOT EXISTS feedback_au AFTER UPDATE ON feedback BEGIN
  INSERT INTO feedback_fts(feedback_fts, rowid, text) VALUES ('delete', old.rowid, old.text);
  INSERT INTO feedback_fts(rowid, text) VALUES (new.rowid, new.text);
END;

CREATE TABLE IF NOT EXISTS apps (
  app TEXT PRIMARY KEY,
  secret_token TEXT UNIQUE NOT NULL,     -- sek_… : server SDK + (with admin token) admin
  publishable_key TEXT UNIQUE NOT NULL,  -- pk_…  : safe to embed in a browser widget
  origins TEXT,                          -- JSON array, CORS allowlist (informational for now)
  note TEXT,
  created_at TEXT NOT NULL,
  token_rotated_at TEXT
);
"""


def db_path():
    return os.environ.get("FEEDBACK_TRACKER_DB", "feedback_tracker.db")


def get_conn():
    conn = getattr(_local, "conn", None)
    if conn is None or getattr(_local, "path", None) != db_path():
        conn = sqlite3.connect(db_path())
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA synchronous=NORMAL")
        conn.executescript(SCHEMA)
        _local.conn = conn
        _local.path = db_path()
    return conn
