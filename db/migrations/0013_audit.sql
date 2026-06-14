-- Hardening H1: tamper-evident audit log (hash-chained, append-only / WORM).
-- Each event commits to its predecessor via prev_hash and to its own content via
-- hash = sha256(prev_hash ⋮ actor ⋮ action ⋮ target_type ⋮ target_id ⋮ meta).
CREATE TABLE audit_event (
  id          bigserial PRIMARY KEY,        -- monotonic order
  project_id  uuid,                          -- null for platform-level events
  actor       text NOT NULL,
  actor_kind  text NOT NULL DEFAULT 'user',  -- user | service | agent
  action      text NOT NULL,                 -- artifact.create | artifact.approve | knowledge.approve | ...
  target_type text,
  target_id   text,
  meta        text,                          -- deterministic, hashed
  payload     jsonb NOT NULL DEFAULT '{}',   -- human-readable, NOT hashed
  prev_hash   text NOT NULL,
  hash        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_project ON audit_event (project_id, id);

-- WORM: the audit log is insert-only. Tampering requires disabling this trigger,
-- which is itself a privileged, loggable act; the hash chain then makes any edit
-- detectable by verification.
CREATE OR REPLACE FUNCTION forbid_audit_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_event is append-only (WORM)';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_audit_no_update BEFORE UPDATE OR DELETE ON audit_event
  FOR EACH ROW EXECUTE FUNCTION forbid_audit_mutation();
