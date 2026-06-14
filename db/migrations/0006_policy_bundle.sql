-- Per-project governance policy bundle (on by default, configurable).
-- Table only in P0; enforcement is wired across stages in later phases.
CREATE TABLE policy_bundle (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       uuid NOT NULL REFERENCES project(id),
  pii              boolean NOT NULL DEFAULT true,
  injection        boolean NOT NULL DEFAULT true,
  classification   boolean NOT NULL DEFAULT true,
  risk_classifier  boolean NOT NULL DEFAULT false,
  opa_rules        jsonb NOT NULL DEFAULT '{}'::jsonb,   -- pre_authorize + final_gate
  pre_deploy_gates jsonb NOT NULL DEFAULT '{}'::jsonb,   -- quality|latency|cost thresholds
  runtime_guards   jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX idx_policy_bundle_project ON policy_bundle (project_id);
