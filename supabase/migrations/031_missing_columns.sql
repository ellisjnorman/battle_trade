-- 031_missing_columns.sql
-- Adds columns that code depends on but were never created by any migration.

-- traders.is_competitor — used by auto-admin, registration, chat, active lobbies, quickplay
ALTER TABLE traders ADD COLUMN IF NOT EXISTS is_competitor BOOLEAN DEFAULT true;

-- traders.code — used by registration routes for invite/join codes
ALTER TABLE traders ADD COLUMN IF NOT EXISTS code TEXT;

-- sessions.max_leverage — used by leverage_cap sabotage effect
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS max_leverage INTEGER;

-- sessions.positions_locked — used by blackout sabotage (migration 004 may already have this)
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS positions_locked BOOLEAN DEFAULT false;

-- sessions.positions_public — used by reveal sabotage
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS positions_public BOOLEAN DEFAULT false;

-- sessions.frozen_asset — used by trading_halt sabotage
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS frozen_asset TEXT;

-- increment_market_volume RPC (used by prediction-markets.ts with fallback)
CREATE OR REPLACE FUNCTION increment_market_volume(
  p_market_id UUID,
  p_amount NUMERIC
) RETURNS VOID AS $$
BEGIN
  UPDATE prediction_markets
  SET total_volume = COALESCE(total_volume, 0) + p_amount
  WHERE id = p_market_id;
END;
$$ LANGUAGE plpgsql;
