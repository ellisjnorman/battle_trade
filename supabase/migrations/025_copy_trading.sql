-- Migration 025: Copy Trading
-- Subscriptions, copied trades, and fee ledger for Top 20 copy trading

create table if not exists copy_subscriptions (
  id uuid primary key default gen_random_uuid(),
  follower_id uuid not null references profiles(id),
  leader_id uuid not null references profiles(id),
  budget_usd numeric not null default 5000,
  leverage_multiplier numeric not null default 1.0,
  is_active boolean default true,
  paused_at timestamptz,
  pause_reason text,
  created_at timestamptz default now(),
  unique(follower_id, leader_id),
  check (follower_id != leader_id),
  check (budget_usd > 0),
  check (leverage_multiplier >= 0.5 and leverage_multiplier <= 2.0)
);

create table if not exists copied_trades (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references copy_subscriptions(id) on delete cascade,
  leader_position_id uuid,
  follower_position_id uuid,
  leader_entry_price numeric,
  follower_entry_price numeric,
  size_ratio numeric,
  status text not null default 'pending',
  pnl_usd numeric,
  fee_usd numeric,
  created_at timestamptz default now(),
  closed_at timestamptz
);

create table if not exists copy_fee_ledger (
  id uuid primary key default gen_random_uuid(),
  copied_trade_id uuid not null references copied_trades(id),
  leader_fee numeric not null,
  platform_fee numeric not null,
  follower_id uuid not null references profiles(id),
  leader_id uuid not null references profiles(id),
  created_at timestamptz default now()
);

-- Indexes
create index if not exists idx_copy_subscriptions_leader on copy_subscriptions(leader_id);
create index if not exists idx_copy_subscriptions_follower on copy_subscriptions(follower_id);
create index if not exists idx_copied_trades_subscription on copied_trades(subscription_id);
create index if not exists idx_copied_trades_status on copied_trades(status);
create index if not exists idx_copy_fee_ledger_leader on copy_fee_ledger(leader_id);
create index if not exists idx_copy_fee_ledger_follower on copy_fee_ledger(follower_id);
