-- Assignments: admin assigns an account to a rep with optional notes
create table public.assignments (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid not null references public.accounts(id) on delete cascade,
  assigned_to   uuid not null references public.profiles(id) on delete cascade,
  assigned_by   uuid not null references public.profiles(id) on delete cascade,
  notes         text,
  status        text not null default 'pending'
                  check (status in ('pending', 'completed')),
  created_at    timestamptz not null default now(),
  completed_at  timestamptz
);

-- Indexes for common queries
create index assignments_assigned_to_idx on public.assignments(assigned_to);
create index assignments_account_id_idx  on public.assignments(account_id);
create index assignments_status_idx      on public.assignments(status);

-- RLS
alter table public.assignments enable row level security;

-- Reps: read their own assignments
create policy "reps_read_own_assignments"
  on public.assignments for select
  using (assigned_to = auth.uid() or is_admin());

-- Reps: update their own assignments (to mark complete)
create policy "reps_update_own_assignments"
  on public.assignments for update
  using (assigned_to = auth.uid() or is_admin())
  with check (assigned_to = auth.uid() or is_admin());

-- Admins only: insert
create policy "admins_insert_assignments"
  on public.assignments for insert
  with check (is_admin());

-- Admins only: delete
create policy "admins_delete_assignments"
  on public.assignments for delete
  using (is_admin());
