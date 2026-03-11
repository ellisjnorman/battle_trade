-- Migration 020: Duel system — 1v1 matchmaking queue and challenge tracking

-- Matchmaking queue
create table if not exists duel_queue (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  btr_score int not null default 1000,
  duration_minutes int not null,
  queued_at timestamptz not null default now(),
  unique (profile_id)
);

-- Duel records
create table if not exists duels (
  id uuid primary key default gen_random_uuid(),
  challenger_id uuid not null references profiles(id),
  opponent_id uuid references profiles(id),
  duration_minutes int not null,
  status text not null default 'pending',
  lobby_id uuid references lobbies(id),
  winner_id uuid references profiles(id),
  challenger_return_pct numeric,
  opponent_return_pct numeric,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

-- Indexes
create index if not exists idx_duels_status on duels (status);
create index if not exists idx_duels_challenger on duels (challenger_id);
create index if not exists idx_duels_opponent on duels (opponent_id);
create index if not exists idx_duel_queue_match on duel_queue (duration_minutes, btr_score);
