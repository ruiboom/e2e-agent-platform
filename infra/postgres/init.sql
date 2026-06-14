-- Extensions the canonical/lineage store relies on.
-- pgvector is provisioned now (Phase 0 does not query it; Phase 1 Ground does).
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
