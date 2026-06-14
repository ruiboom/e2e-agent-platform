-- A live run of an agent_version on a target + channels (table only in P0).
CREATE TABLE deployment (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id         uuid NOT NULL REFERENCES project(id),
  agent_version_id   uuid REFERENCES agent_version(id),
  target             text,                          -- gcp|azure|vercel|local|...
  channels           jsonb NOT NULL DEFAULT '[]'::jsonb,
  guardrail_policy_id uuid REFERENCES policy_bundle(id),
  status             text NOT NULL DEFAULT 'paused',
  created_at         timestamptz NOT NULL DEFAULT now()
);
