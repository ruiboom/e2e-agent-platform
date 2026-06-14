-- A pinned knowledge-base release an agent_version consumes (table only in P0).
CREATE TABLE kb_release (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id     uuid NOT NULL REFERENCES project(id),
  release_key    text NOT NULL,                    -- e.g. "kb-2026-06-14"
  item_revisions jsonb NOT NULL DEFAULT '[]'::jsonb,
  content_hash   text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, release_key)
);
