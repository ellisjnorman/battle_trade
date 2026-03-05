-- New tables for lobby-scoped architecture

create table lobbies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  format text default 'elimination',
  status text default 'waiting',
  config jsonb not null default '{}',
  created_by uuid,
  is_public boolean default true,
  invite_code text unique,
  created_at timestamptz default now()
);

create table sessions (
  id uuid primary key default gen_random_uuid(),
  trader_id uuid references traders(id),
  lobby_id uuid references lobbies(id),
  starting_balance decimal default 10000,
  final_balance decimal,
  final_rank int,
  is_eliminated boolean default false,
  created_at timestamptz default now()
);

create table profiles (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  handle text unique,
  avatar_url text,
  exchange_uid text,
  total_lobbies_played int default 0,
  total_wins int default 0,
  win_rate decimal default 0,
  best_return decimal default 0,
  global_rank int,
  credits int default 0,
  created_at timestamptz default now()
);

create table volatility_events (
  id uuid primary key default gen_random_uuid(),
  lobby_id uuid references lobbies(id),
  type text not null,
  asset text,
  magnitude decimal,
  duration_seconds int,
  headline text,
  trigger_mode text default 'manual',
  trigger_at timestamptz,
  fired_at timestamptz,
  created_by uuid
);

-- Add lobby_id to existing tables
alter table traders add column lobby_id uuid references lobbies(id);
alter table rounds add column lobby_id uuid references lobbies(id);
alter table credit_allocations add column lobby_id uuid references lobbies(id);
