-- Add strategy_version to paper_trades for tracking performance across strategy changes
-- Increment this when you change bot prompts, settings, or methodology
ALTER TABLE paper_trades ADD COLUMN IF NOT EXISTS strategy_version TEXT DEFAULT 'v1';
