-- 030_atomic_credits.sql
-- Atomic credit operations to prevent double-spending race conditions.

-- Deduct credits atomically: returns true if successful, false if insufficient balance
CREATE OR REPLACE FUNCTION deduct_credits(
  p_trader_id UUID,
  p_lobby_id UUID,
  p_amount INTEGER
) RETURNS BOOLEAN AS $$
DECLARE
  rows_updated INTEGER;
BEGIN
  UPDATE credit_allocations
  SET balance = balance - p_amount,
      total_spent = total_spent + p_amount,
      updated_at = NOW()
  WHERE trader_id = p_trader_id
    AND lobby_id = p_lobby_id
    AND balance >= p_amount;

  GET DIAGNOSTICS rows_updated = ROW_COUNT;
  RETURN rows_updated > 0;
END;
$$ LANGUAGE plpgsql;

-- Add credits atomically
CREATE OR REPLACE FUNCTION add_credits(
  p_trader_id UUID,
  p_lobby_id UUID,
  p_amount INTEGER
) RETURNS BOOLEAN AS $$
DECLARE
  rows_updated INTEGER;
BEGIN
  UPDATE credit_allocations
  SET balance = balance + p_amount,
      total_earned = total_earned + p_amount,
      updated_at = NOW()
  WHERE trader_id = p_trader_id
    AND lobby_id = p_lobby_id;

  GET DIAGNOSTICS rows_updated = ROW_COUNT;
  RETURN rows_updated > 0;
END;
$$ LANGUAGE plpgsql;

-- Atomic pot update for entry fees
CREATE OR REPLACE FUNCTION add_to_pot(
  p_lobby_id UUID,
  p_fee INTEGER,
  p_rake INTEGER,
  p_prize INTEGER
) RETURNS BOOLEAN AS $$
DECLARE
  rows_updated INTEGER;
BEGIN
  UPDATE entry_fee_pots
  SET total_collected = total_collected + p_fee,
      total_entries = total_entries + 1,
      rake_collected = rake_collected + p_rake,
      prize_pool = prize_pool + p_prize
  WHERE lobby_id = p_lobby_id;

  GET DIAGNOSTICS rows_updated = ROW_COUNT;

  IF rows_updated = 0 THEN
    INSERT INTO entry_fee_pots (lobby_id, total_collected, total_entries, rake_collected, prize_pool)
    VALUES (p_lobby_id, p_fee, 1, p_rake, p_prize)
    ON CONFLICT (lobby_id) DO UPDATE
    SET total_collected = entry_fee_pots.total_collected + p_fee,
        total_entries = entry_fee_pots.total_entries + 1,
        rake_collected = entry_fee_pots.rake_collected + p_rake,
        prize_pool = entry_fee_pots.prize_pool + p_prize;
  END IF;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;
