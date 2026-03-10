-- Migration 009: Performance indices for hot query paths
-- These cover the most frequent queries in trading, leaderboard, and admin operations.

-- Positions: most queried table during active rounds
CREATE INDEX IF NOT EXISTS idx_positions_trader_round
  ON positions (trader_id, round_id) WHERE closed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_positions_round_status
  ON positions (round_id, status);

CREATE INDEX IF NOT EXISTS idx_positions_symbol_status
  ON positions (symbol, status) WHERE status = 'open';

-- Traders: lobby scoping is the primary access pattern
CREATE INDEX IF NOT EXISTS idx_traders_lobby
  ON traders (lobby_id);

CREATE INDEX IF NOT EXISTS idx_traders_lobby_eliminated
  ON traders (lobby_id, is_eliminated);

-- Rounds: always filtered by lobby + status
CREATE INDEX IF NOT EXISTS idx_rounds_lobby_status
  ON rounds (lobby_id, status);

CREATE INDEX IF NOT EXISTS idx_rounds_lobby_number
  ON rounds (lobby_id, round_number);

-- Sessions: trader + lobby lookups
CREATE INDEX IF NOT EXISTS idx_sessions_trader_lobby
  ON sessions (trader_id, lobby_id);

-- Sabotage records: active sabotages per target
CREATE INDEX IF NOT EXISTS idx_sabotages_target_active
  ON sabotage_records (target_id, lobby_id, status) WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_sabotages_attacker
  ON sabotage_records (attacker_id, lobby_id);

-- Credit allocations: per-trader per-lobby
CREATE INDEX IF NOT EXISTS idx_credits_trader_lobby
  ON credit_allocations (trader_id, lobby_id);

-- Bets: per-bettor, per-market
CREATE INDEX IF NOT EXISTS idx_bets_bettor
  ON bets (bettor_id);

CREATE INDEX IF NOT EXISTS idx_bets_market
  ON bets (market_id);

-- Prediction markets: per-lobby per-round
CREATE INDEX IF NOT EXISTS idx_markets_lobby_round
  ON prediction_markets (lobby_id, round_id);

-- Market outcomes: per-market
CREATE INDEX IF NOT EXISTS idx_outcomes_market
  ON market_outcomes (market_id);

-- Volatility events: per-lobby, recent first
CREATE INDEX IF NOT EXISTS idx_events_lobby
  ON volatility_events (lobby_id, fired_at DESC);

-- Lobbies: invite code lookups
CREATE INDEX IF NOT EXISTS idx_lobbies_invite_code
  ON lobbies (invite_code) WHERE invite_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_lobbies_status
  ON lobbies (status);

-- Prices: symbol lookups (single row per symbol)
CREATE UNIQUE INDEX IF NOT EXISTS idx_prices_symbol
  ON prices (symbol);

-- Profiles: handle lookups
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_handle
  ON profiles (handle) WHERE handle IS NOT NULL;
