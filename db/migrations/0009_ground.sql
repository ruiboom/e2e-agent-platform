-- Ground canonical store (minimal, mirrors the KMS shape). The canonical store
-- is the only source of truth; pgvector is a rebuildable projection on kb_chunk.
CREATE TABLE kb_item (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES project(id),
  uri        text NOT NULL,
  title      text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, uri)
);

-- Immutable revisions (one per ingest of changed content).
CREATE TABLE kb_revision (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id      uuid NOT NULL REFERENCES kb_item(id),
  rev_number   int  NOT NULL,
  body         text NOT NULL,
  content_hash text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (item_id, rev_number)
);

-- Heading-aware chunks + their vector projection (384-dim Phase-1 embedder).
CREATE TABLE kb_chunk (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  revision_id  uuid NOT NULL REFERENCES kb_revision(id),
  chunk_index  int  NOT NULL,
  heading_path text,
  body         text NOT NULL,
  embedding    vector(384),
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (revision_id, chunk_index)
);
CREATE INDEX idx_kb_chunk_revision ON kb_chunk (revision_id);
