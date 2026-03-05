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
  round_duration_seconds: number;
  trade_execution_mode?: 'paper_only' | 'paper_plus_onchain' | 'live';
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
