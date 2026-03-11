create table if not exists chat_messages (
  id uuid primary key default gen_random_uuid(),
  lobby_id uuid not null references lobbies(id) on delete cascade,
  sender_id uuid not null,
  sender_name text not null,
  sender_role text not null default 'spectator',
  content text not null,
  message_type text not null default 'text',
  created_at timestamptz not null default now()
);

create index idx_chat_lobby_time on chat_messages(lobby_id, created_at desc);

-- Auto-delete messages older than 24 hours (optional cron)
-- For now just index for efficient cleanup
create index idx_chat_created on chat_messages(created_at);
