-- ---------------------------------------------------------------------------
-- 023: Anti-Gaming & Integrity System
-- ---------------------------------------------------------------------------

-- Reports submitted by players
create table if not exists integrity_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references profiles(id),
  suspect_id uuid not null references profiles(id),
  reason text not null,
  evidence text,
  status text not null default 'pending',
  reviewed_by uuid references profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

-- Auto-detected and admin-confirmed violations
create table if not exists integrity_violations (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id),
  violation_type text not null,
  severity text not null,
  details jsonb,
  auto_detected boolean not null default true,
  created_at timestamptz not null default now()
);

-- Device/IP fingerprints for multi-account detection
create table if not exists account_fingerprints (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id),
  ip_address text,
  device_id text,
  user_agent text,
  recorded_at timestamptz not null default now()
);

-- Indices for fast lookups
create index if not exists idx_integrity_violations_profile
  on integrity_violations(profile_id);

create index if not exists idx_account_fingerprints_profile
  on account_fingerprints(profile_id);

create index if not exists idx_account_fingerprints_ip
  on account_fingerprints(ip_address);

create index if not exists idx_integrity_reports_suspect
  on integrity_reports(suspect_id);

create index if not exists idx_integrity_reports_reporter
  on integrity_reports(reporter_id);

create index if not exists idx_integrity_reports_status
  on integrity_reports(status);
