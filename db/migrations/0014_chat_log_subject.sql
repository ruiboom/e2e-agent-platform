-- Hardening H3: make chat logs attributable to a data subject for DSAR.
ALTER TABLE chat_log ADD COLUMN user_id    text;
ALTER TABLE chat_log ADD COLUMN session_id text;
CREATE INDEX idx_chat_log_user ON chat_log (user_id);
