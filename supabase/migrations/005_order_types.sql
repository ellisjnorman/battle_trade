-- Add order type support to positions table
ALTER TABLE positions
  ADD COLUMN IF NOT EXISTS order_type text NOT NULL DEFAULT 'market',
  ADD COLUMN IF NOT EXISTS limit_price numeric,
  ADD COLUMN IF NOT EXISTS stop_price numeric,
  ADD COLUMN IF NOT EXISTS trail_pct numeric,
  ADD COLUMN IF NOT EXISTS trail_peak numeric,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'open';

-- Backfill existing rows
UPDATE positions SET status = 'closed' WHERE closed_at IS NOT NULL AND status = 'open';

-- Index for fast pending order lookups
CREATE INDEX IF NOT EXISTS idx_positions_pending ON positions (status, round_id) WHERE status = 'pending';

COMMENT ON COLUMN positions.order_type IS 'market | limit | stop_limit | trailing_stop';
COMMENT ON COLUMN positions.limit_price IS 'Trigger/fill price for limit and stop-limit orders';
COMMENT ON COLUMN positions.stop_price IS 'Stop trigger price for stop-limit orders';
COMMENT ON COLUMN positions.trail_pct IS 'Trailing stop percentage (e.g. 5 = 5%)';
COMMENT ON COLUMN positions.trail_peak IS 'Peak price tracked for trailing stop calculation';
COMMENT ON COLUMN positions.status IS 'open | pending | closed | cancelled | stopped';
