-- Versioned, parent-linked artifact. Immutable append: a new fact is a new
-- row (version = max+1); payload is never UPDATEd. Only `status` transitions.
CREATE TABLE artifact (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES project(id),
  type        text NOT NULL,                       -- proposition|scope|system_prompt|...
  version     int  NOT NULL,
  status      text NOT NULL DEFAULT 'draft'
              CHECK (status IN ('draft','approved','superseded')),
  payload     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by  text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, type, version)
);
CREATE INDEX idx_artifact_project_type ON artifact (project_id, type);
