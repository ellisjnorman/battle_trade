-- 029_perf_indexes.sql
-- Additional indexes identified by performance audit.
-- Covers prediction markets, bets, profiles leaderboard, and lobbies listing.

-- Prediction markets by lobby + status (hot path: fetching open markets)
CREATE INDEX IF NOT EXISTS idx_prediction_markets_lobby_status
  ON prediction_markets (lobby_id, status);

-- Market outcomes by market (joined on every market fetch)
CREATE INDEX IF NOT EXISTS idx_market_outcomes_market
  ON market_outcomes (market_id);

-- Bets by market (aggregated for odds calculation)
CREATE INDEX IF NOT EXISTS idx_bets_market_created
  ON bets (market_id, created_at DESC);

-- Bets by bettor (user's active bets lookup)
CREATE INDEX IF NOT EXISTS idx_bets_bettor
  ON bets (bettor_id);

-- Profiles by tr_score for global leaderboard ranking
CREATE INDEX IF NOT EXISTS idx_profiles_tr_score
  ON profiles (tr_score DESC);

-- Lobbies by status + created_at (active/waiting lobby listing)
CREATE INDEX IF NOT EXISTS idx_lobbies_status_created
  ON lobbies (status, created_at DESC);

-- Lobbies public + waiting (quickplay query)
CREATE INDEX IF NOT EXISTS idx_lobbies_public_waiting
  ON lobbies (is_public, status) WHERE status = 'waiting' AND is_public = true;

-- Positions by status (open positions query, liquidation sweeps)
CREATE INDEX IF NOT EXISTS idx_positions_status
  ON positions (status) WHERE status = 'open';

-- Duels queue by status (matchmaking)
CREATE INDEX IF NOT EXISTS idx_duels_status
  ON duels (status);
