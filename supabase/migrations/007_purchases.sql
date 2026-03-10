-- 007: Credit purchase tracking
-- Stores all credit purchase attempts (Stripe + Coinbase Commerce)

CREATE TABLE IF NOT EXISTS purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trader_id uuid NOT NULL REFERENCES traders(id),
  lobby_id uuid NOT NULL REFERENCES lobbies(id),
  package_id text,
  credits_granted integer NOT NULL DEFAULT 0,
  amount_usd_cents integer NOT NULL DEFAULT 0,
  payment_method text NOT NULL CHECK (payment_method IN ('stripe', 'coinbase_commerce')),
  payment_ref text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_purchases_trader ON purchases (trader_id);
CREATE INDEX IF NOT EXISTS idx_purchases_lobby ON purchases (lobby_id);
CREATE INDEX IF NOT EXISTS idx_purchases_ref ON purchases (payment_ref);
CREATE INDEX IF NOT EXISTS idx_purchases_status ON purchases (status) WHERE status = 'pending';
