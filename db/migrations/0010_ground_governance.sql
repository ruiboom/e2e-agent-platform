-- Phase 3: four-eyes governance on revisions + a lightweight entity index for
-- the graph retrieval modes.

-- Governance: revisions are submitted, then approved by a *different* actor.
-- Releases pin only approved revisions. (Existing rows default to 'approved'.)
ALTER TABLE kb_revision ADD COLUMN state        text NOT NULL DEFAULT 'approved'
  CHECK (state IN ('submitted','approved','rejected'));
ALTER TABLE kb_revision ADD COLUMN submitted_by text;
ALTER TABLE kb_revision ADD COLUMN approved_by  text;
ALTER TABLE kb_revision ADD COLUMN scan_results jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Minimal entity projection for graph / graph_hybrid retrieval (significant
-- tokens per chunk). Production graph (Neo4j/AGE + graph-enricher) is deferred.
CREATE TABLE kb_chunk_entity (
  chunk_id uuid NOT NULL REFERENCES kb_chunk(id),
  entity   text NOT NULL,
  PRIMARY KEY (chunk_id, entity)
);
CREATE INDEX idx_kb_chunk_entity_entity ON kb_chunk_entity (entity);
