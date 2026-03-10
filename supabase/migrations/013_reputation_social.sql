-- Migration 013: Reputation system, social features, strategies
-- Adds TR score, daily activity tracking, strategies, follows

-- TR score columns on profiles
alter table profiles add column if not exists tr_score int default 0;
alter table profiles add column if not exists tr_performance int default 0;
alter table profiles add column if not exists tr_combat int default 0;
alter table profiles add column if not exists tr_strategy int default 0;
alter table profiles add column if not exists tr_community int default 0;
alter table profiles add column if not exists tr_streak int default 0;
alter table profiles add column if not exists rank_tier text default 'paper_hands';
alter table profiles add column if not exists bio text;
alter table profiles add column if not exists location text;
alter table profiles add column if not exists followers_count int default 0;
alter table profiles add column if not exists following_count int default 0;

-- Daily activity stats (activity heatmap)
create table if not exists daily_stats (
  trader_id uuid not null,
  date date not null,
  lobbies_played int default 0,
  rounds int default 0,
  trades int default 0,
  avg_return numeric default 0,
  pnl numeric default 0,
  attacks_sent int default 0,
  attacks_received int default 0,
  defenses_used int default 0,
  primary key (trader_id, date)
);

-- Strategies (community-shared)
create table if not exists strategies (
  id uuid primary key default gen_random_uuid(),
  author_id uuid references profiles(id) on delete cascade,
  title text not null,
  body text not null,
  tags text[] default '{}',
  upvotes int default 0,
  usage_count int default 0,
  win_rate numeric default 0,
  created_at timestamptz default now()
);

-- Strategy votes (one per user per strategy)
create table if not exists strategy_votes (
  strategy_id uuid references strategies(id) on delete cascade,
  voter_id uuid references profiles(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (strategy_id, voter_id)
);

-- Follows
create table if not exists follows (
  follower_id uuid references profiles(id) on delete cascade,
  following_id uuid references profiles(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (follower_id, following_id),
  check (follower_id != following_id)
);

-- Indexes
create index if not exists idx_daily_stats_trader on daily_stats(trader_id);
create index if not exists idx_daily_stats_date on daily_stats(date);
create index if not exists idx_strategies_author on strategies(author_id);
create index if not exists idx_strategies_upvotes on strategies(upvotes desc);
create index if not exists idx_follows_following on follows(following_id);
create index if not exists idx_profiles_tr_score on profiles(tr_score desc);
create index if not exists idx_profiles_rank_tier on profiles(rank_tier);

-- Follow count triggers
create or replace function update_follow_counts() returns trigger as $$
begin
  if TG_OP = 'INSERT' then
    update profiles set following_count = following_count + 1 where id = NEW.follower_id;
    update profiles set followers_count = followers_count + 1 where id = NEW.following_id;
    return NEW;
  elsif TG_OP = 'DELETE' then
    update profiles set following_count = greatest(0, following_count - 1) where id = OLD.follower_id;
    update profiles set followers_count = greatest(0, followers_count - 1) where id = OLD.following_id;
    return OLD;
  end if;
  return null;
end;
$$ language plpgsql;

drop trigger if exists trg_follow_counts on follows;
create trigger trg_follow_counts
  after insert or delete on follows
  for each row execute function update_follow_counts();
