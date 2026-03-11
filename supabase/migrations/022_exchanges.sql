-- Exchange connections: stores encrypted API credentials per profile+exchange
create table if not exists exchange_connections (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id),
  exchange text not null,
  encrypted_credentials text not null,
  is_active boolean default true,
  connected_at timestamptz default now(),
  last_synced_at timestamptz,
  unique(profile_id, exchange)
);

-- Index for lookups by profile
create index if not exists idx_exchange_connections_profile
  on exchange_connections(profile_id);

-- RLS: users can only see their own connections
alter table exchange_connections enable row level security;

create policy "Users can view own exchange connections"
  on exchange_connections for select
  using (profile_id = auth.uid());

create policy "Users can insert own exchange connections"
  on exchange_connections for insert
  with check (profile_id = auth.uid());

create policy "Users can update own exchange connections"
  on exchange_connections for update
  using (profile_id = auth.uid());
