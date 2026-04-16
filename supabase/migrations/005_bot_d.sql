-- Add Bot D (Narrative Scout) columns to gematria_settings
ALTER TABLE gematria_settings ADD COLUMN IF NOT EXISTS bot_d_system_prompt TEXT NOT NULL DEFAULT '';
ALTER TABLE gematria_settings ADD COLUMN IF NOT EXISTS bot_d_bet_rules    TEXT NOT NULL DEFAULT '';
ALTER TABLE gematria_settings ADD COLUMN IF NOT EXISTS bot_d_model        TEXT NOT NULL DEFAULT 'claude-sonnet-4-6';
