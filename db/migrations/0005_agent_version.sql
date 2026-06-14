-- A runnable agent build (table only in P0; populated in Phase 1 Build).
CREATE TABLE agent_version (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id                uuid NOT NULL REFERENCES project(id),
  version                   int  NOT NULL,
  build_paradigm            text,                  -- langgraph|adk|code|canvas|generative
  runtime                   text,
  retrieval_strategy        text,                  -- vector|lexical|hybrid|graph|graph_hybrid
  kb_release_id             uuid REFERENCES kb_release(id),
  system_prompt_artifact_id uuid REFERENCES artifact(id),
  config                    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at                timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, version)
);
