-- Live streaming support for lobbies
create table if not exists lobby_streams (
  id uuid primary key default gen_random_uuid(),
  lobby_id uuid references lobbies(id) on delete cascade,
  provider text not null default 'mux',
  stream_key text not null,
  rtmp_url text not null,
  playback_url text not null,
  playback_id text,
  external_id text,
  status text default 'idle' check (status in ('idle', 'active', 'disconnected')),
  created_at timestamptz default now(),
  unique(lobby_id)
);

-- Index for quick lookups
create index if not exists idx_lobby_streams_lobby_id on lobby_streams(lobby_id);
