-- 006: Add prediction market rake tracking
-- Adds rake columns to bets and prediction_markets tables

-- Track rake per bet
ALTER TABLE bets ADD COLUMN IF NOT EXISTS actual_payout integer;
ALTER TABLE bets ADD COLUMN IF NOT EXISTS rake_amount integer DEFAULT 0;

-- Track total rake per market
ALTER TABLE prediction_markets ADD COLUMN IF NOT EXISTS total_rake integer DEFAULT 0;

-- Index for revenue reporting
CREATE INDEX IF NOT EXISTS idx_bets_rake ON bets (rake_amount) WHERE rake_amount > 0;
CREATE INDEX IF NOT EXISTS idx_markets_rake ON prediction_markets (total_rake) WHERE total_rake > 0;
