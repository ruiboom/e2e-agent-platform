"""SQLite store. WAL mode, one connection per thread.

The collector is the only writer, so SQLite comfortably handles this
workload. Set COST_TRACKER_DB to relocate the database file.
"""

import os
import sqlite3
import threading

_local = threading.local()

SCHEMA = """
CREATE TABLE IF NOT EXISTS events (
  event_id TEXT PRIMARY KEY,
  app TEXT NOT NULL,
  model TEXT NOT NULL,
  ts TEXT NOT NULL,               -- turn time, UTC, 'YYYY-MM-DD HH:MM:SS'
  received_at TEXT NOT NULL,      -- collector time, UTC
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cache_read_tokens INTEGER NOT NULL DEFAULT 0,
  cache_write_tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd REAL NOT NULL DEFAULT 0,
  session_id TEXT,
  meta TEXT
);
CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts);
CREATE INDEX IF NOT EXISTS idx_events_app_ts ON events(app, ts);
CREATE INDEX IF NOT EXISTS idx_events_model_ts ON events(model, ts);

CREATE TABLE IF NOT EXISTS apps (
  app TEXT PRIMARY KEY,
  token TEXT UNIQUE NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL,
  token_rotated_at TEXT
);
"""


def db_path():
    return os.environ.get("COST_TRACKER_DB", "cost_tracker.db")


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
