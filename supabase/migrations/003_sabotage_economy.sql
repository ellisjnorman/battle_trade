-- Sabotage economy tables

create table sabotages (
  id uuid primary key default gen_random_uuid(),
  lobby_id uuid references lobbies(id),
  attacker_id uuid,
  target_id uuid references traders(id),
  type text not null,
  cost int not null,
  status text default 'active',
  payload jsonb,
  duration_seconds int,
  fired_at timestamptz default now(),
  expires_at timestamptz,
  sponsor_name text
);

create table defenses (
  id uuid primary key default gen_random_uuid(),
  lobby_id uuid references lobbies(id),
  trader_id uuid references traders(id),
  type text not null,
  cost int not null,
  status text default 'active',
  activated_at timestamptz default now(),
  expires_at timestamptz
);

create table credit_allocations (
  id uuid primary key default gen_random_uuid(),
  lobby_id uuid references lobbies(id),
  trader_id uuid,
  balance int default 500,
  total_earned int default 500,
  total_spent int default 0,
  updated_at timestamptz default now()
);

-- Enable Realtime
alter publication supabase_realtime add table sabotages;
alter publication supabase_realtime add table defenses;
alter publication supabase_realtime add table credit_allocations;
