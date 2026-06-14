-- Phase 7: live chat logs — the signal the operate loop learns from.
CREATE TABLE chat_log (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       uuid NOT NULL REFERENCES project(id),
  agent_version_id uuid NOT NULL REFERENCES artifact(id),
  question         text NOT NULL,
  answer           text,
  top_score        real,
  flagged          boolean NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_chat_log_agent ON chat_log (agent_version_id, created_at);
