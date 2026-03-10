-- 008: Entry fee pot tracking
-- Tracks collected entry fees per lobby and payouts to winners

CREATE TABLE IF NOT EXISTS entry_fee_pots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lobby_id uuid NOT NULL REFERENCES lobbies(id) UNIQUE,
  total_collected integer NOT NULL DEFAULT 0,
  total_entries integer NOT NULL DEFAULT 0,
  rake_collected integer NOT NULL DEFAULT 0,
  prize_pool integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'collecting' CHECK (status IN ('collecting', 'distributed')),
  distributed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS entry_fee_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lobby_id uuid NOT NULL REFERENCES lobbies(id),
  trader_id uuid NOT NULL REFERENCES traders(id),
  amount integer NOT NULL,
  rank integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_entry_fee_pots_lobby ON entry_fee_pots (lobby_id);
CREATE INDEX IF NOT EXISTS idx_entry_fee_payouts_lobby ON entry_fee_payouts (lobby_id);
