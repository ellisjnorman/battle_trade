// ---------------------------------------------------------------------------
// Core entities
// ---------------------------------------------------------------------------

export interface Lobby {
  id: string;
  name: string;
  format: 'elimination' | 'marathon' | 'blitz';
  status: 'waiting' | 'active' | 'completed';
  config: LobbyConfig;
  created_by: string | null;
  is_public: boolean;
  invite_code: string | null;
  created_at: string;
}

export interface LobbyConfig {
  operator_controlled?: boolean;
  credit_source?: 'sponsor_funded' | 'self_funded';
  starting_balance: number;
  available_symbols: string[];
  leverage_tiers: number[];
  volatility_engine: 'manual' | 'algorithmic' | 'off';
  round_duration_seconds: number;           // each round (default 300 = 5 min)
  lobby_duration_minutes?: number;          // total lobby length (15-60 min, optional)
  scoring_mode?: 'best_round' | 'cumulative' | 'last_round';  // how winner is decided (default best_round)
  trade_execution_mode?: 'paper_only' | 'paper_plus_onchain' | 'live' | 'hyperliquid';
  prediction_rake_pct?: number;   // 0-100, platform rake on prediction market payouts (default 10)
  entry_fee?: number;             // credits required to enter (0 = free / IRL events)
  entry_rake_pct?: number;        // 0-100, platform cut of entry fee pot (default 20)
  sponsor_api?: {
    base_url: string;
    api_key: string;
    testnet: boolean;
  };
}

export interface Profile {
  id: string;
  display_name: string;
  handle: string | null;
  avatar_url: string | null;
  exchange_uid: string | null;
  total_lobbies_played: number;
  total_wins: number;
  win_rate: number;
  best_return: number;
  global_rank: number | null;
  credits: number;
  created_at: string;
}

export interface Session {
  id: string;
  trader_id: string;
  lobby_id: string;
  starting_balance: number;
  final_balance: number | null;
  final_rank: number | null;
  is_eliminated: boolean;
  created_at: string;
}

export interface VolatilityEventRecord {
  id: string;
  lobby_id: string;
  type: string;
  asset: string | null;
  magnitude: number | null;
  duration_seconds: number | null;
  headline: string | null;
  trigger_mode: 'manual' | 'algorithmic';
  trigger_at: string | null;
  fired_at: string | null;
  created_by: string | null;
}

// ---------------------------------------------------------------------------
// Existing entities (now with lobby_id)
// ---------------------------------------------------------------------------

export interface Trader {
  id: string;
  name: string;
  team_id: string | null;
  wallet_address: string | null;
  avatar_url: string | null;
  is_eliminated: boolean;
  eliminated_at: string | null;
  event_id: string;
  lobby_id: string | null;
  created_at: string;
}

export interface Team {
  id: string;
  name: string;
  color: string;
  event_id: string;
  created_at: string;
}

export interface Round {
  id: string;
  event_id: string;
  lobby_id: string | null;
  round_number: number;
  status: 'pending' | 'active' | 'frozen' | 'completed';
  started_at: string | null;
  ended_at: string | null;
  starting_balance: number;
  duration_seconds: number;
  elimination_pct: number;
  created_at: string;
}

export type OrderType = 'market' | 'limit' | 'stop_limit' | 'trailing_stop';
export type PositionStatus = 'open' | 'pending' | 'closed' | 'cancelled' | 'stopped';

export interface Position {
  id: string;
  trader_id: string;
  round_id: string;
  symbol: string;
  direction: 'long' | 'short';
  size: number;
  leverage: number;
  entry_price: number;
  exit_price: number | null;
  realized_pnl: number | null;
  opened_at: string;
  closed_at: string | null;
  order_type: OrderType;
  limit_price: number | null;
  stop_price: number | null;
  trail_pct: number | null;
  trail_peak: number | null;
  status: PositionStatus;
}

export interface Price {
  id: string;
  symbol: string;
  price: number;
  updated_at: string;
}

export interface EventConfig {
  id: string;
  name: string;
  slug: string;
  status: 'draft' | 'lobby' | 'active' | 'completed';
  starting_balance: number;
  max_leverage: number;
  symbols: string[];
  round_duration_seconds: number;
  elimination_pct: number;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Reputation & Social
// ---------------------------------------------------------------------------

export type RankTier = 'paper_hands' | 'retail' | 'swing_trader' | 'market_maker' | 'whale' | 'degen_king' | 'legendary';

export interface TRScore {
  total: number;
  performance: number;
  combat: number;
  strategy: number;
  community: number;
  streak: number;
  tier: RankTier;
}

export interface DailyStats {
  trader_id: string;
  date: string;
  lobbies_played: number;
  rounds: number;
  trades: number;
  avg_return: number;
  pnl: number;
  attacks_sent: number;
  attacks_received: number;
  defenses_used: number;
}

export interface Strategy {
  id: string;
  author_id: string;
  title: string;
  body: string;
  tags: string[];
  upvotes: number;
  usage_count: number;
  win_rate: number;
  created_at: string;
  // Joined fields
  author_name?: string;
  author_rank_tier?: RankTier;
  author_tr_score?: number;
  voted?: boolean;
}

export interface Follow {
  follower_id: string;
  following_id: string;
  created_at: string;
}

export interface ProfileFull extends Profile {
  auth_user_id: string | null;
  email: string | null;
  wallet_address: string | null;
  badges: Array<{ id: string; name: string; icon: string; earned_at: string }>;
  elo_rating: number;
  total_earnings: number;
  streak_current: number;
  streak_best: number;
  tr_score: number;
  tr_performance: number;
  tr_combat: number;
  tr_strategy: number;
  tr_community: number;
  tr_streak: number;
  rank_tier: RankTier;
  bio: string | null;
  location: string | null;
  followers_count: number;
  following_count: number;
}

// ---------------------------------------------------------------------------
// Streaming
// ---------------------------------------------------------------------------

export interface LobbyStream {
  id: string;
  lobby_id: string;
  provider: 'mux' | 'cloudflare' | 'custom';
  stream_key: string;
  rtmp_url: string;
  playback_url: string;
  playback_id: string | null;
  external_id: string | null;
  status: 'idle' | 'active' | 'disconnected';
  created_at: string;
}

// ---------------------------------------------------------------------------
// Bracket Tournaments
// ---------------------------------------------------------------------------

export interface BracketTournament {
  id: string;
  lobby_id: string;
  name: string;
  total_rounds: number;
  current_round: number;
  round_duration_minutes: number;
  status: 'registration' | 'active' | 'completed';
  entry_fee: number;
  prize_pool: number;
  sponsor: string | null;
  created_at: string;
}

export interface BracketSlot {
  id: string;
  tournament_id: string;
  round_number: number;
  position: number;
  profile_id: string | null;
  trader_id: string | null;
  return_pct: number | null;
  advanced: boolean;
}
