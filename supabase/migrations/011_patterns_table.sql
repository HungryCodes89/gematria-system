-- ============================================================
-- Migration 011 — Patterns table (ring visualization seed)
-- Run in Supabase SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS patterns (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  category    TEXT NOT NULL,
  status      TEXT NOT NULL CHECK (status IN ('observed', 'live_tested', 'validated')),
  description TEXT,
  live_record TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_patterns_category ON patterns(category);
CREATE INDEX IF NOT EXISTS idx_patterns_status   ON patterns(status);

ALTER TABLE patterns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_patterns" ON patterns
  FOR ALL USING (true) WITH CHECK (true);

-- Seed patterns
INSERT INTO patterns (name, category, status, description, live_record) VALUES
  ('Triple Milestone',   'triple_milestones', 'live_tested', '78=78th win, 50=50th win', NULL),
  ('Date Lock',          'date_locks',        'observed',    'Win OR sacrifice direction', NULL),
  ('47/74 Masonic',      'masonic_jesuit',    'observed',    '47 and 74 appear in cipher values on Jesuit-coded dates', NULL),
  ('36=666 Triangular',  'masonic_jesuit',    'live_tested', 'Sum to 666 via T(n)=n(n+1)/2 — T(36)=666', NULL),
  ('Mirror 27/72',       'mirror_mechanics',  'observed',    'Mirror pair 27/72 aligning with ordinal reduction', NULL),
  ('Mirror 58/85',       'mirror_mechanics',  'observed',    'Mirror pair 58/85 on same date hash', NULL),
  ('Return Stamp',       'return_stamps',     'live_tested', NULL, '3-0 live record')
ON CONFLICT DO NOTHING;
