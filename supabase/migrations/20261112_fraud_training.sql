-- "Scam or Legit?" fraud training (/training/fraud): quarterly completions.
--
-- Public page, no login. Attempts are written only by /api/fraud-training/submit (service role), which
-- grades the answers on the server from src/lib/fraud-training/cards.ts. RLS is on with no policies,
-- so anon / authenticated can't read or write these tables; the admin page reads them with the
-- service role after an admin check.

create table public.fraud_training_attempts (
  id uuid primary key default gen_random_uuid(),
  first_name text not null check (char_length(first_name) between 1 and 40),
  last_name text not null check (char_length(last_name) between 1 and 40),
  location text not null check (location in ('gahanna', 'grandview', 'westerville', 'dsp')),
  quarter text not null check (quarter ~ '^\d{4}-Q[1-4]$'), -- e.g. 2026-Q4, America/New_York
  score int not null check (score >= 0),
  correct_count int not null check (correct_count >= 0),
  total_count int not null check (total_count > 0 and correct_count <= total_count),
  percent numeric(5,2) not null check (percent between 0 and 100),
  passed boolean not null,                 -- percent >= 80
  badge text not null,
  missed_card_ids jsonb not null default '[]'::jsonb,
  dealt_card_ids jsonb not null default '[]'::jsonb, -- for miss rates on the admin page
  started_at timestamptz not null,
  completed_at timestamptz not null default now(),
  duration_seconds int not null check (duration_seconds >= 0),
  completion_code text not null unique check (completion_code ~ '^FRD-[A-Z0-9]{4}$'),
  run_id text not null unique,             -- one record per played run (a double-tapped Submit can't duplicate)
  created_at timestamptz not null default now()
);
create index fraud_training_attempts_quarter_idx on public.fraud_training_attempts (quarter, location, completed_at desc);

-- Rate limiting, same pattern as arcade_rate_events: a keyed hash that rotates daily, never a raw IP.
create table public.fraud_training_rate_events (
  id bigint generated always as identity primary key,
  key_hash text not null,
  kind text not null check (kind in ('start', 'submit')),
  created_at timestamptz not null default now()
);
create index fraud_training_rate_events_lookup_idx on public.fraud_training_rate_events (key_hash, kind, created_at desc);
create index fraud_training_rate_events_created_idx on public.fraud_training_rate_events (created_at);

alter table public.fraud_training_attempts enable row level security;
alter table public.fraud_training_rate_events enable row level security;
revoke all on public.fraud_training_attempts from anon, authenticated;
revoke all on public.fraud_training_rate_events from anon, authenticated;
