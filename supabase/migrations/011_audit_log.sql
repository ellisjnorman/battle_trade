-- 011_audit_log.sql
-- Admin audit log for tracking lobby-scoped actions.

CREATE TABLE audit_logs (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  lobby_id   uuid        REFERENCES lobbies(id),
  action     text        NOT NULL,
  actor      text        DEFAULT 'admin',
  details    jsonb       DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

-- Index for querying logs by lobby in reverse-chronological order
CREATE INDEX idx_audit_logs_lobby_created
  ON audit_logs (lobby_id, created_at DESC);

-- RLS
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_logs_select" ON audit_logs
  FOR SELECT TO anon USING (true);

CREATE POLICY "audit_logs_insert" ON audit_logs
  FOR INSERT TO anon WITH CHECK (true);
