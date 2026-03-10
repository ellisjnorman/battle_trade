-- Add sabotage-related columns to sessions table
-- These are required by lib/sabotage.ts applySabotageEffect

alter table sessions add column if not exists positions_locked boolean default false;
alter table sessions add column if not exists positions_public boolean default false;
alter table sessions add column if not exists frozen_asset text;
