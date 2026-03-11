-- Bracket elimination tournaments
-- Each tournament has N rounds (log2 of player count), with top 50% advancing each round.

create table if not exists bracket_tournaments (
  id uuid primary key default gen_random_uuid(),
  lobby_id uuid not null references lobbies(id),
  name text not null,
  total_rounds int not null,
  current_round int not null default 0,
  round_duration_minutes int not null default 20,
  status text not null default 'registration'
    check (status in ('registration', 'active', 'completed')),
  entry_fee int not null default 0,
  prize_pool int not null default 0,
  sponsor text,
  created_at timestamptz not null default now()
);

create table if not exists bracket_slots (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references bracket_tournaments(id) on delete cascade,
  round_number int not null,
  position int not null,
  profile_id uuid references profiles(id),
  trader_id uuid references traders(id),
  return_pct numeric,
  advanced boolean not null default false,
  unique (tournament_id, round_number, position)
);

create index if not exists idx_bracket_slots_tournament_round
  on bracket_slots (tournament_id, round_number);

create index if not exists idx_bracket_tournaments_lobby
  on bracket_tournaments (lobby_id);
