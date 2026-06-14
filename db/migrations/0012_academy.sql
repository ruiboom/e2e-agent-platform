-- Phase 8: Academy progress (per-user, per-role-path stage completion).
CREATE TABLE academy_progress (
  user_id      text NOT NULL,
  role_path    text NOT NULL,
  stage_id     text NOT NULL,
  completed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, role_path, stage_id)
);
