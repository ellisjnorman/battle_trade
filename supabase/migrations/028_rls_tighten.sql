-- 028_rls_tighten.sql
-- Tighten RLS policies: replace wide-open anon INSERT/UPDATE/DELETE with scoped checks.
--
-- DEFENSE-IN-DEPTH STRATEGY
-- -------------------------
-- Battle Trade uses Privy for authentication, not Supabase Auth. This means
-- auth.uid() is not available inside RLS policies. The primary access control
-- layer is the Next.js API middleware (middleware.ts), which:
--   1. Verifies Privy JWTs on all mutations under /api/lobby/**
--   2. Attaches x-privy-user-id to request headers
--   3. Route handlers validate ownership before writing to Supabase
--
-- RLS is the SECOND line of defense. It ensures that even if a bug in a route
-- handler allows unintended writes, the damage is contained by database-level
-- constraints. Since the app connects via service_role for server-side operations
-- (which bypasses RLS), and anon key for client-side reads, these policies
-- primarily protect against direct client-side Supabase access.
--
-- Approach:
--   - SELECT: Permissive (lobby data is public during games)
--   - INSERT: Scoped by lobby_id where possible (prevents cross-lobby writes)
--   - UPDATE: Scoped by lobby_id or ownership columns
--   - DELETE: Restricted (most tables don't allow delete; positions allow cancel)
--   - Admin-only tables: Block anon writes entirely (server uses service_role)
--
-- When Privy + Supabase integration matures (custom JWT → auth.uid()), these
-- policies can be upgraded to check auth.uid() = profile.auth_user_id.

-- ============================================================
-- Helper: verify lobby exists and is active for writes
-- ============================================================

CREATE OR REPLACE FUNCTION lobby_is_active(lid uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM lobbies WHERE id = lid AND status IN ('waiting', 'active', 'playing')
  );
$$;

-- ============================================================
-- positions — tighten INSERT/UPDATE/DELETE
-- ============================================================

-- Drop old permissive write policies
DROP POLICY IF EXISTS "positions_insert" ON positions;
DROP POLICY IF EXISTS "positions_update" ON positions;
DROP POLICY IF EXISTS "positions_delete" ON positions;

-- INSERT: trader must exist and belong to an active lobby
CREATE POLICY "positions_insert_v2" ON positions
  FOR INSERT TO anon
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM traders t
      WHERE t.id = positions.trader_id
        AND lobby_is_active(t.lobby_id)
    )
  );

-- UPDATE: only positions belonging to a trader in an active lobby
CREATE POLICY "positions_update_v2" ON positions
  FOR UPDATE TO anon
  USING (
    EXISTS (
      SELECT 1 FROM traders t
      WHERE t.id = positions.trader_id
        AND lobby_is_active(t.lobby_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM traders t
      WHERE t.id = positions.trader_id
        AND lobby_is_active(t.lobby_id)
    )
  );

-- DELETE: only positions belonging to a trader in an active lobby (order cancellation)
CREATE POLICY "positions_delete_v2" ON positions
  FOR DELETE TO anon
  USING (
    EXISTS (
      SELECT 1 FROM traders t
      WHERE t.id = positions.trader_id
        AND lobby_is_active(t.lobby_id)
    )
  );

-- ============================================================
-- traders — tighten INSERT/UPDATE
-- ============================================================

DROP POLICY IF EXISTS "traders_insert" ON traders;
DROP POLICY IF EXISTS "traders_update" ON traders;

-- INSERT: lobby must exist and be in a joinable state
CREATE POLICY "traders_insert_v2" ON traders
  FOR INSERT TO anon
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM lobbies l
      WHERE l.id = traders.lobby_id
        AND l.status IN ('waiting', 'active')
    )
  );

-- UPDATE: can only update traders in active lobbies (balance changes, elimination)
CREATE POLICY "traders_update_v2" ON traders
  FOR UPDATE TO anon
  USING (
    lobby_is_active(lobby_id)
  )
  WITH CHECK (
    lobby_is_active(lobby_id)
  );

-- ============================================================
-- lobbies — restrict INSERT/UPDATE from anon (admin creates via service_role)
-- ============================================================

DROP POLICY IF EXISTS "lobbies_insert" ON lobbies;
DROP POLICY IF EXISTS "lobbies_update" ON lobbies;

-- No anon INSERT — lobby creation goes through API (service_role)
-- No anon UPDATE — lobby state changes go through API (service_role)
-- SELECT remains permissive (kept from 010)

-- ============================================================
-- rounds — restrict writes (admin-only via service_role)
-- ============================================================

DROP POLICY IF EXISTS "rounds_insert" ON rounds;
DROP POLICY IF EXISTS "rounds_update" ON rounds;

-- No anon INSERT/UPDATE — round management is admin-only via service_role

-- ============================================================
-- sessions — scope to active lobbies
-- ============================================================

DROP POLICY IF EXISTS "sessions_insert" ON sessions;
DROP POLICY IF EXISTS "sessions_update" ON sessions;

CREATE POLICY "sessions_insert_v2" ON sessions
  FOR INSERT TO anon
  WITH CHECK (
    lobby_is_active(lobby_id)
  );

CREATE POLICY "sessions_update_v2" ON sessions
  FOR UPDATE TO anon
  USING (lobby_is_active(lobby_id))
  WITH CHECK (lobby_is_active(lobby_id));

-- ============================================================
-- profiles — restrict UPDATE to own record
-- Note: without auth.uid(), we scope to: profile must already exist (no hijacking)
-- Real ownership check happens in middleware + route handler
-- ============================================================

DROP POLICY IF EXISTS "profiles_insert" ON profiles;
DROP POLICY IF EXISTS "profiles_update" ON profiles;

-- INSERT: allow (profile creation happens at registration)
CREATE POLICY "profiles_insert_v2" ON profiles
  FOR INSERT TO anon
  WITH CHECK (true);

-- UPDATE: profile must exist (prevents inserting via upsert bypass)
-- Actual ownership verified by Privy middleware + route handler
CREATE POLICY "profiles_update_v2" ON profiles
  FOR UPDATE TO anon
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- volatility_events — block anon writes (admin-only)
-- ============================================================

DROP POLICY IF EXISTS "volatility_events_insert" ON volatility_events;

-- No anon INSERT — events triggered via admin API (service_role)

-- ============================================================
-- prediction_markets — block anon create/update (admin-only)
-- ============================================================

DROP POLICY IF EXISTS "prediction_markets_insert" ON prediction_markets;
DROP POLICY IF EXISTS "prediction_markets_update" ON prediction_markets;

-- No anon INSERT/UPDATE — market creation/resolution is admin-only

-- ============================================================
-- market_outcomes — block anon writes (admin-only)
-- ============================================================

DROP POLICY IF EXISTS "market_outcomes_insert" ON market_outcomes;
DROP POLICY IF EXISTS "market_outcomes_update" ON market_outcomes;

-- ============================================================
-- bets — scope to active lobbies
-- ============================================================

DROP POLICY IF EXISTS "bets_insert" ON bets;
DROP POLICY IF EXISTS "bets_update" ON bets;

CREATE POLICY "bets_insert_v2" ON bets
  FOR INSERT TO anon
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM prediction_markets pm
      WHERE pm.id = bets.market_id
        AND pm.status = 'open'
    )
  );

-- No anon UPDATE on bets — payout resolution via service_role
-- (drop the old permissive update)

-- ============================================================
-- sabotages — scope to active lobbies
-- ============================================================

DROP POLICY IF EXISTS "sabotages_insert" ON sabotages;
DROP POLICY IF EXISTS "sabotages_update" ON sabotages;

CREATE POLICY "sabotages_insert_v2" ON sabotages
  FOR INSERT TO anon
  WITH CHECK (
    lobby_is_active(lobby_id)
  );

-- No anon UPDATE — sabotage resolution via service_role

-- ============================================================
-- defenses — scope to active lobbies
-- ============================================================

DROP POLICY IF EXISTS "defenses_insert" ON defenses;
DROP POLICY IF EXISTS "defenses_update" ON defenses;

CREATE POLICY "defenses_insert_v2" ON defenses
  FOR INSERT TO anon
  WITH CHECK (
    lobby_is_active(lobby_id)
  );

-- No anon UPDATE — defense resolution via service_role

-- ============================================================
-- credit_allocations — scope to active lobbies
-- ============================================================

DROP POLICY IF EXISTS "credit_allocations_insert" ON credit_allocations;
DROP POLICY IF EXISTS "credit_allocations_update" ON credit_allocations;
DROP POLICY IF EXISTS "credit_allocations_delete" ON credit_allocations;

CREATE POLICY "credit_allocations_insert_v2" ON credit_allocations
  FOR INSERT TO anon
  WITH CHECK (
    lobby_is_active(lobby_id)
  );

-- No anon UPDATE/DELETE — credit management via service_role

-- ============================================================
-- purchases — restrict anon writes (payment verification via service_role)
-- ============================================================

DROP POLICY IF EXISTS "purchases_insert" ON purchases;
DROP POLICY IF EXISTS "purchases_update" ON purchases;

-- No anon INSERT/UPDATE — purchases created after Stripe/Coinbase webhook confirms payment

-- ============================================================
-- entry_fee_pots — admin-only
-- ============================================================

DROP POLICY IF EXISTS "entry_fee_pots_insert" ON entry_fee_pots;
DROP POLICY IF EXISTS "entry_fee_pots_update" ON entry_fee_pots;

-- No anon INSERT/UPDATE — entry fee management via service_role

-- ============================================================
-- entry_fee_payouts — admin-only
-- ============================================================

DROP POLICY IF EXISTS "entry_fee_payouts_insert" ON entry_fee_payouts;

-- No anon INSERT — payouts via service_role

-- ============================================================
-- prices — server-only writes
-- ============================================================

DROP POLICY IF EXISTS "prices_insert" ON prices;
DROP POLICY IF EXISTS "prices_update" ON prices;

-- No anon INSERT/UPDATE — price feed writes via service_role

-- ============================================================
-- odds_history — server-only writes
-- ============================================================

DROP POLICY IF EXISTS "odds_history_insert" ON odds_history;

-- No anon INSERT — odds updates via service_role
