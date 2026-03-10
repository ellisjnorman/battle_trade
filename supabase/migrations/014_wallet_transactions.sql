-- Wallet transactions: deposits, claims, and withdrawals via linked wallets
create table if not exists wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id),
  wallet_address text not null,
  type text not null check (type in ('deposit', 'claim', 'withdraw')),
  amount numeric not null,
  credits_amount int not null,
  chain text default 'ethereum',
  tx_hash text,
  status text default 'pending' check (status in ('pending', 'completed', 'failed')),
  created_at timestamptz default now()
);

create index idx_wallet_tx_profile on wallet_transactions(profile_id);
create index idx_wallet_tx_status on wallet_transactions(status);
