-- The lineage DAG: child artifact -> the parent artifacts it was derived from.
CREATE TABLE artifact_parent (
  child_id  uuid NOT NULL REFERENCES artifact(id),
  parent_id uuid NOT NULL REFERENCES artifact(id),
  PRIMARY KEY (child_id, parent_id),
  CHECK (child_id <> parent_id)
);
CREATE INDEX idx_artifact_parent_parent ON artifact_parent (parent_id);
