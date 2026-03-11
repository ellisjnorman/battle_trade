-- 027_indexes.sql
-- Comprehensive indexes for all critical query paths.
-- Covers positions, traders, rounds, sessions, sabotages, defenses,
-- volatility_events, profiles, chat_messages, markets, predictions,
-- copy_subscriptions, and credits tables.
-- All indexes use IF NOT EXISTS for idempotent re-runs.

-- =============================================================================
-- 1. positions
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_positions_trader_round
  ON positions (trader_id, round_id);

CREATE INDEX IF NOT EXISTS idx_positions_lobby
  ON positions (lobby_id);

CREATE INDEX IF NOT EXISTS idx_positions_symbol_round
  ON positions (symbol, round_id);

-- =============================================================================
-- 2. traders
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_traders_lobby
  ON traders (lobby_id);

CREATE INDEX IF NOT EXISTS idx_traders_profile
  ON traders (profile_id);

CREATE INDEX IF NOT EXISTS idx_traders_lobby_profile
  ON traders (lobby_id, profile_id);

CREATE INDEX IF NOT EXISTS idx_traders_lobby_eliminated
  ON traders (lobby_id, is_eliminated);

-- =============================================================================
-- 3. rounds
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_rounds_lobby
  ON rounds (lobby_id);

CREATE INDEX IF NOT EXISTS idx_rounds_lobby_status
  ON rounds (lobby_id, status);

-- =============================================================================
-- 4. sessions
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_sessions_trader
  ON sessions (trader_id);

CREATE INDEX IF NOT EXISTS idx_sessions_lobby
  ON sessions (lobby_id);

CREATE INDEX IF NOT EXISTS idx_sessions_profile
  ON sessions (profile_id);

-- =============================================================================
-- 5. sabotages
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_sabotages_target_lobby
  ON sabotages (target_trader_id, lobby_id);

CREATE INDEX IF NOT EXISTS idx_sabotages_source
  ON sabotages (source_trader_id);

-- =============================================================================
-- 6. defenses
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_defenses_trader_lobby
  ON defenses (trader_id, lobby_id);

-- =============================================================================
-- 7. volatility_events
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_volatility_events_lobby_status
  ON volatility_events (lobby_id, status);

-- =============================================================================
-- 8. profiles
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_profiles_auth_user
  ON profiles (auth_user_id);

CREATE INDEX IF NOT EXISTS idx_profiles_is_guest
  ON profiles (is_guest);

-- =============================================================================
-- 9. chat_messages
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_chat_messages_lobby_created
  ON chat_messages (lobby_id, created_at DESC);

-- =============================================================================
-- 10. markets / predictions
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_markets_lobby
  ON markets (lobby_id);

CREATE INDEX IF NOT EXISTS idx_predictions_market
  ON predictions (market_id);

-- =============================================================================
-- 11. copy_subscriptions
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_copy_subscriptions_leader_active
  ON copy_subscriptions (leader_id, is_active);

CREATE INDEX IF NOT EXISTS idx_copy_subscriptions_follower
  ON copy_subscriptions (follower_id);

-- =============================================================================
-- 12. credits
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_credits_profile
  ON credits (profile_id);
