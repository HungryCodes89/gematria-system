-- Allow bots to store lean analysis even when not placing a real bet.
-- 'analysis' bet_type = pass/lean record (units=0, stake=0, result='pass')
-- 'pass' result = analyzed but did not meet bet threshold

ALTER TABLE paper_trades
  DROP CONSTRAINT IF EXISTS paper_trades_bet_type_check;
ALTER TABLE paper_trades
  ADD CONSTRAINT paper_trades_bet_type_check
  CHECK (bet_type IN ('moneyline', 'over_under', 'analysis'));

ALTER TABLE paper_trades
  DROP CONSTRAINT IF EXISTS paper_trades_result_check;
ALTER TABLE paper_trades
  ADD CONSTRAINT paper_trades_result_check
  CHECK (result IN ('pending', 'win', 'loss', 'push', 'void', 'pass'));
