-- Prediction markets tables

create table prediction_markets (
  id uuid primary key default gen_random_uuid(),
  lobby_id uuid references lobbies(id),
  round_id uuid references rounds(id),
  question text not null,
  status text default 'open',
  provider text default 'mock',
  resolved_team_id uuid,
  total_volume int default 0,
  created_at timestamptz default now()
);

create table market_outcomes (
  id uuid primary key default gen_random_uuid(),
  market_id uuid references prediction_markets(id),
  team_id uuid references teams(id),
  probability decimal default 0.125,
  odds decimal default 8.0,
  volume int default 0,
  updated_at timestamptz default now()
);

create table bets (
  id uuid primary key default gen_random_uuid(),
  market_id uuid references prediction_markets(id),
  outcome_id uuid references market_outcomes(id),
  bettor_id uuid,
  amount_credits int not null,
  odds_at_placement decimal not null,
  potential_payout int,
  status text default 'pending',
  placed_at timestamptz default now()
);

create table odds_history (
  id uuid primary key default gen_random_uuid(),
  market_id uuid references prediction_markets(id),
  outcome_id uuid references market_outcomes(id),
  odds decimal not null,
  probability decimal not null,
  recorded_at timestamptz default now()
);

-- Enable Realtime on market tables
alter publication supabase_realtime add table market_outcomes;
alter publication supabase_realtime add table bets;
