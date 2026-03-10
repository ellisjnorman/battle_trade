-- Migration 012: Proper auth accounts
-- Links profiles to Supabase Auth users, adds badges, elo, auto-admin

-- Link profiles to auth.users
alter table profiles add column if not exists auth_user_id uuid unique;
alter table profiles add column if not exists email text;
alter table profiles add column if not exists wallet_address text;
alter table profiles add column if not exists wallet_type text; -- 'evm' | 'solana'
alter table profiles add column if not exists badges jsonb default '[]';
alter table profiles add column if not exists elo_rating int default 1000;
alter table profiles add column if not exists total_earnings decimal default 0;
alter table profiles add column if not exists streak_current int default 0;
alter table profiles add column if not exists streak_best int default 0;
alter table profiles add column if not exists last_active_at timestamptz;

-- Auto-admin config on lobbies
alter table lobbies add column if not exists auto_admin boolean default false;
alter table lobbies add column if not exists min_players int default 2;
alter table lobbies add column if not exists max_players int default 50;
alter table lobbies add column if not exists auto_start_countdown int default 30; -- seconds after min_players reached
alter table lobbies add column if not exists entry_fee_amount decimal default 0; -- actual currency amount (0 = free)
alter table lobbies add column if not exists entry_fee_currency text default 'credits'; -- 'credits' | 'usd' | 'sol' | 'eth'

-- Link traders to profiles via auth (not just random profile_id)
alter table traders add column if not exists profile_id uuid references profiles(id);

-- Payout history
create table if not exists payouts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id),
  lobby_id uuid references lobbies(id),
  amount decimal not null,
  currency text default 'credits',
  payout_type text default 'prize', -- 'prize' | 'prediction' | 'refund'
  rank int,
  tx_hash text, -- on-chain tx if applicable
  created_at timestamptz default now()
);

-- Badge definitions for reference
comment on column profiles.badges is 'JSON array of badge objects: [{id, name, icon, earned_at}]';

-- Indices
create index if not exists idx_profiles_auth_user on profiles(auth_user_id);
create index if not exists idx_profiles_email on profiles(email);
create index if not exists idx_profiles_wallet on profiles(wallet_address);
create index if not exists idx_payouts_profile on payouts(profile_id);
create index if not exists idx_traders_profile on traders(profile_id);
