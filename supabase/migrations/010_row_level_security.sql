-- 010_row_level_security.sql
-- Enable RLS on all tables and create permissive policies for the anon role.
-- service_role bypasses RLS automatically. The real access control lives in
-- API route logic; RLS is defense-in-depth against direct client access.

-- ============================================================
-- Enable RLS
-- ============================================================

ALTER TABLE lobbies             ENABLE ROW LEVEL SECURITY;
ALTER TABLE traders             ENABLE ROW LEVEL SECURITY;
ALTER TABLE rounds              ENABLE ROW LEVEL SECURITY;
ALTER TABLE positions           ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions            ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles            ENABLE ROW LEVEL SECURITY;
ALTER TABLE volatility_events   ENABLE ROW LEVEL SECURITY;
ALTER TABLE prediction_markets  ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_outcomes     ENABLE ROW LEVEL SECURITY;
ALTER TABLE bets                ENABLE ROW LEVEL SECURITY;
ALTER TABLE odds_history        ENABLE ROW LEVEL SECURITY;
ALTER TABLE sabotages           ENABLE ROW LEVEL SECURITY;
ALTER TABLE defenses            ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_allocations  ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchases           ENABLE ROW LEVEL SECURITY;
ALTER TABLE entry_fee_pots      ENABLE ROW LEVEL SECURITY;
ALTER TABLE entry_fee_payouts   ENABLE ROW LEVEL SECURITY;
ALTER TABLE prices              ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- lobbies — SELECT, INSERT, UPDATE (no DELETE)
-- ============================================================

CREATE POLICY "lobbies_select" ON lobbies
  FOR SELECT TO anon USING (true);

CREATE POLICY "lobbies_insert" ON lobbies
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "lobbies_update" ON lobbies
  FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- ============================================================
-- traders — SELECT, INSERT, UPDATE (no DELETE)
-- ============================================================

CREATE POLICY "traders_select" ON traders
  FOR SELECT TO anon USING (true);

CREATE POLICY "traders_insert" ON traders
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "traders_update" ON traders
  FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- ============================================================
-- rounds — SELECT, INSERT, UPDATE (no DELETE)
-- ============================================================

CREATE POLICY "rounds_select" ON rounds
  FOR SELECT TO anon USING (true);

CREATE POLICY "rounds_insert" ON rounds
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "rounds_update" ON rounds
  FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- ============================================================
-- positions — SELECT, INSERT, UPDATE, DELETE (cancel orders)
-- ============================================================

CREATE POLICY "positions_select" ON positions
  FOR SELECT TO anon USING (true);

CREATE POLICY "positions_insert" ON positions
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "positions_update" ON positions
  FOR UPDATE TO anon USING (true) WITH CHECK (true);

CREATE POLICY "positions_delete" ON positions
  FOR DELETE TO anon USING (true);

-- ============================================================
-- sessions — SELECT, INSERT, UPDATE (no DELETE)
-- ============================================================

CREATE POLICY "sessions_select" ON sessions
  FOR SELECT TO anon USING (true);

CREATE POLICY "sessions_insert" ON sessions
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "sessions_update" ON sessions
  FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- ============================================================
-- profiles — SELECT, INSERT, UPDATE (no DELETE)
-- ============================================================

CREATE POLICY "profiles_select" ON profiles
  FOR SELECT TO anon USING (true);

CREATE POLICY "profiles_insert" ON profiles
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "profiles_update" ON profiles
  FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- ============================================================
-- volatility_events — SELECT, INSERT (no UPDATE, no DELETE)
-- ============================================================

CREATE POLICY "volatility_events_select" ON volatility_events
  FOR SELECT TO anon USING (true);

CREATE POLICY "volatility_events_insert" ON volatility_events
  FOR INSERT TO anon WITH CHECK (true);

-- ============================================================
-- prediction_markets — SELECT, INSERT, UPDATE (no DELETE)
-- ============================================================

CREATE POLICY "prediction_markets_select" ON prediction_markets
  FOR SELECT TO anon USING (true);

CREATE POLICY "prediction_markets_insert" ON prediction_markets
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "prediction_markets_update" ON prediction_markets
  FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- ============================================================
-- market_outcomes — SELECT, INSERT, UPDATE (no DELETE)
-- ============================================================

CREATE POLICY "market_outcomes_select" ON market_outcomes
  FOR SELECT TO anon USING (true);

CREATE POLICY "market_outcomes_insert" ON market_outcomes
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "market_outcomes_update" ON market_outcomes
  FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- ============================================================
-- bets — SELECT, INSERT, UPDATE (no DELETE)
-- ============================================================

CREATE POLICY "bets_select" ON bets
  FOR SELECT TO anon USING (true);

CREATE POLICY "bets_insert" ON bets
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "bets_update" ON bets
  FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- ============================================================
-- odds_history — SELECT, INSERT (no UPDATE, no DELETE)
-- ============================================================

CREATE POLICY "odds_history_select" ON odds_history
  FOR SELECT TO anon USING (true);

CREATE POLICY "odds_history_insert" ON odds_history
  FOR INSERT TO anon WITH CHECK (true);

-- ============================================================
-- sabotages — SELECT, INSERT, UPDATE (no DELETE)
-- ============================================================

CREATE POLICY "sabotages_select" ON sabotages
  FOR SELECT TO anon USING (true);

CREATE POLICY "sabotages_insert" ON sabotages
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "sabotages_update" ON sabotages
  FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- ============================================================
-- defenses — SELECT, INSERT, UPDATE (no DELETE)
-- ============================================================

CREATE POLICY "defenses_select" ON defenses
  FOR SELECT TO anon USING (true);

CREATE POLICY "defenses_insert" ON defenses
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "defenses_update" ON defenses
  FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- ============================================================
-- credit_allocations — SELECT, INSERT, UPDATE, DELETE (reset)
-- ============================================================

CREATE POLICY "credit_allocations_select" ON credit_allocations
  FOR SELECT TO anon USING (true);

CREATE POLICY "credit_allocations_insert" ON credit_allocations
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "credit_allocations_update" ON credit_allocations
  FOR UPDATE TO anon USING (true) WITH CHECK (true);

CREATE POLICY "credit_allocations_delete" ON credit_allocations
  FOR DELETE TO anon USING (true);

-- ============================================================
-- purchases — SELECT, INSERT, UPDATE (no DELETE)
-- ============================================================

CREATE POLICY "purchases_select" ON purchases
  FOR SELECT TO anon USING (true);

CREATE POLICY "purchases_insert" ON purchases
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "purchases_update" ON purchases
  FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- ============================================================
-- entry_fee_pots — SELECT, INSERT, UPDATE (no DELETE)
-- ============================================================

CREATE POLICY "entry_fee_pots_select" ON entry_fee_pots
  FOR SELECT TO anon USING (true);

CREATE POLICY "entry_fee_pots_insert" ON entry_fee_pots
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "entry_fee_pots_update" ON entry_fee_pots
  FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- ============================================================
-- entry_fee_payouts — SELECT, INSERT (no UPDATE, no DELETE)
-- ============================================================

CREATE POLICY "entry_fee_payouts_select" ON entry_fee_payouts
  FOR SELECT TO anon USING (true);

CREATE POLICY "entry_fee_payouts_insert" ON entry_fee_payouts
  FOR INSERT TO anon WITH CHECK (true);

-- ============================================================
-- prices — SELECT, INSERT, UPDATE (no DELETE)
-- ============================================================

CREATE POLICY "prices_select" ON prices
  FOR SELECT TO anon USING (true);

CREATE POLICY "prices_insert" ON prices
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "prices_update" ON prices
  FOR UPDATE TO anon USING (true) WITH CHECK (true);
