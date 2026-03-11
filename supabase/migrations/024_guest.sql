-- Add guest flag to profiles
alter table profiles add column if not exists is_guest boolean default false;
create index if not exists idx_profiles_guest on profiles(is_guest) where is_guest = true;
