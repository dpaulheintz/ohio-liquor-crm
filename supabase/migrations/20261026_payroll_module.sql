-- Payroll module (Toast → Paycom). Access is an allowlist (profiles.payroll_access), not "admin".
-- Units: hours are integer hundredths (*_hh, 40.00 h = 4000); money is integer cents (*_cents).
-- Payroll tables grant nothing to anon or service_role, so the AI Assistant (exec_sql, run as
-- service_role) cannot read them no matter how a query is written.

-- ─── Access ──────────────────────────────────────────────────────────────────

alter table public.profiles add column payroll_access boolean not null default false;

create or replace function public.has_payroll_access()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select payroll_access from public.profiles where id = auth.uid()), false);
$$;
revoke execute on function public.has_payroll_access() from public, anon;
grant execute on function public.has_payroll_access() to authenticated;

-- Users could previously update their own role / is_approved / visible_pages through the API.
-- payroll_access can only change via direct SQL; the other privileged columns need an admin.
create or replace function public.profiles_guard_privileged()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if new.payroll_access is distinct from old.payroll_access then
      raise exception 'payroll_access can only be changed by a database administrator';
    end if;
    if (new.role is distinct from old.role
        or new.is_approved is distinct from old.is_approved
        or new.visible_pages is distinct from old.visible_pages)
       and not public.is_admin() then
      raise exception 'Only admins can change roles or page access';
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function public.profiles_guard_privileged() from public, anon, authenticated;

create trigger profiles_guard_privileged
  before update on public.profiles
  for each row execute function public.profiles_guard_privileged();

-- ─── Settings & mappings ─────────────────────────────────────────────────────

create table public.payroll_settings (
  id boolean primary key default true check (id),
  pay_frequency text not null default 'biweekly' check (pay_frequency in ('weekly', 'biweekly', 'semimonthly')),
  workweek_start_dow smallint not null default 1 check (workweek_start_dow between 0 and 6), -- 0 = Sunday, 1 = Monday
  next_period_start date,
  min_wage_cents integer not null default 1100 check (min_wage_cents > 0),
  tipped_cash_wage_cents integer not null default 550 check (tipped_cash_wage_cents > 0),
  ot_threshold_hh integer not null default 4000 check (ot_threshold_hh > 0),
  alert_weekly_hours_hh integer not null default 6000 check (alert_weekly_hours_hh > 0),
  alert_tips_cents integer not null default 300000 check (alert_tips_cents >= 0),
  big_change_pct integer not null default 50 check (big_change_pct > 0),
  big_change_min_cents integer not null default 20000 check (big_change_min_cents >= 0),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);
insert into public.payroll_settings default values;

create table public.payroll_locations (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  toast_location_name text,
  paycom_location_code text,
  paycom_department_code text,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
insert into public.payroll_locations (name, toast_location_name, sort_order) values
  ('Grandview', 'Grandview', 10),
  ('Westerville', 'Westerville', 20),
  ('Gahanna', 'Gahanna', 30),
  ('PO Box 21', 'PO Box 21', 40);

-- Never store SSNs, bank info, or addresses here (import drops those columns).
create table public.payroll_employees (
  id uuid primary key default gen_random_uuid(),
  toast_name text not null check (char_length(trim(toast_name)) > 0),
  toast_employee_id text,
  paycom_employee_code text,
  first_name text,
  last_name text,
  primary_location_id uuid references public.payroll_locations(id) on delete set null,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index payroll_employees_toast_id_key on public.payroll_employees (toast_employee_id) where toast_employee_id is not null;
create unique index payroll_employees_toast_name_key on public.payroll_employees (lower(toast_name)) where toast_employee_id is null;
create unique index payroll_employees_paycom_code_key on public.payroll_employees (paycom_employee_code) where paycom_employee_code is not null;

-- Imported Paycom roster, used only to suggest employee matches.
create table public.payroll_paycom_roster (
  id uuid primary key default gen_random_uuid(),
  paycom_employee_code text not null unique,
  first_name text,
  last_name text,
  department_code text,
  location_code text,
  imported_at timestamptz not null default now(),
  imported_by uuid default auth.uid() references public.profiles(id) on delete set null
);

create table public.payroll_job_map (
  id uuid primary key default gen_random_uuid(),
  location_id uuid references public.payroll_locations(id) on delete cascade, -- null = any location
  toast_job_title text not null check (char_length(trim(toast_job_title)) > 0),
  paycom_department_code text,
  paycom_position_code text,
  is_tipped boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index payroll_job_map_key on public.payroll_job_map
  (coalesce(location_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(toast_job_title));

create table public.payroll_paycode_map (
  id uuid primary key default gen_random_uuid(),
  earning_type text not null unique,
  paycom_earning_code text,
  description text,
  kind text not null default 'amount' check (kind in ('hours', 'amount')),
  manual_only boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
insert into public.payroll_paycode_map (earning_type, paycom_earning_code, description, kind, manual_only, sort_order) values
  ('REG', 'REG', 'Regular hours', 'hours', false, 10),
  ('OT', 'OT', 'Overtime hours', 'hours', false, 20),
  ('CCTIPS', 'CCTIPS', 'Non-cash (credit card) tips', 'amount', false, 30),
  ('CASHTIPS', 'CASHTIPS', 'Declared cash tips', 'amount', false, 40),
  ('GRAT', 'GRAT', 'Gratuity / service charge', 'amount', false, 50),
  ('TIPCREDIT_MAKEUP', 'TIPCREDIT_MAKEUP', 'Tip credit make-up to minimum wage', 'amount', true, 60),
  ('BONUS', 'BONUS', 'Bonus', 'amount', true, 70),
  ('HOLIDAY', 'HOLIDAY', 'Holiday pay', 'hours', true, 80),
  ('REIMB', 'REIMB', 'Reimbursement', 'amount', true, 90);

create table public.payroll_output_template (
  id boolean primary key default true check (id),
  name text not null default 'Default (placeholder until Paycom format is confirmed)',
  file_type text not null default 'csv' check (file_type in ('csv', 'xlsx')),
  date_format text not null default 'MM/DD/YYYY',
  include_rate boolean not null default true,
  columns jsonb not null,
  key_columns jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);
insert into public.payroll_output_template (columns, key_columns) values (
  '[{"header":"Employee Code","source":"employee_code"},{"header":"Last Name","source":"last_name"},{"header":"First Name","source":"first_name"},{"header":"Earning Code","source":"earning_code"},{"header":"Hours","source":"hours"},{"header":"Rate","source":"rate"},{"header":"Amount","source":"amount"},{"header":"Department","source":"department"},{"header":"Location","source":"location"},{"header":"Pay Period Start","source":"period_start"},{"header":"Pay Period End","source":"period_end"}]',
  '["Employee Code","Earning Code","Department","Location"]'
);

-- Remembered column mappings per Toast export layout (keyed by a header signature).
create table public.payroll_column_mappings (
  id uuid primary key default gen_random_uuid(),
  header_signature text not null unique,
  file_kind text not null check (file_kind in ('payroll_export', 'time_entries')),
  mapping jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid() references public.profiles(id) on delete set null
);

-- ─── Runs ────────────────────────────────────────────────────────────────────

create table public.payroll_runs (
  id uuid primary key default gen_random_uuid(),
  period_start date not null,
  period_end date not null,
  status text not null default 'draft' check (status in ('draft', 'in_review', 'approved', 'exported')),
  totals jsonb,
  notes text,
  processed_at timestamptz,
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  exported_by uuid references public.profiles(id) on delete set null,
  exported_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (period_end >= period_start)
);

create table public.payroll_run_files (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.payroll_runs(id) on delete cascade,
  storage_path text not null,
  original_name text,
  file_kind text not null check (file_kind in ('payroll_export', 'time_entries')),
  location_id uuid references public.payroll_locations(id) on delete set null,
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  row_count integer not null default 0,
  control_totals jsonb,
  column_mapping jsonb,
  dropped_columns text[] not null default '{}',
  uploaded_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (run_id, sha256)
);
create index payroll_run_files_sha_idx on public.payroll_run_files (sha256);

-- Parsed rows (sensitive columns already dropped), kept so a run can be re-processed after mapping fixes.
create table public.payroll_source_rows (
  id bigint generated always as identity primary key,
  run_id uuid not null references public.payroll_runs(id) on delete cascade,
  file_id uuid not null references public.payroll_run_files(id) on delete cascade,
  file_kind text not null check (file_kind in ('payroll_export', 'time_entries')),
  location_id uuid references public.payroll_locations(id) on delete set null,
  row_number integer not null,
  toast_name text,
  toast_employee_id text,
  job_title text,
  work_date date,
  reg_hh integer not null default 0,
  ot_hh integer not null default 0,
  rate_cents integer,
  reg_pay_cents bigint,
  ot_pay_cents bigint,
  cctips_cents bigint not null default 0,
  cashtips_cents bigint not null default 0,
  grat_cents bigint not null default 0,
  issues text[] not null default '{}'
);
create index payroll_source_rows_run_idx on public.payroll_source_rows (run_id);

create table public.payroll_run_lines (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.payroll_runs(id) on delete cascade,
  employee_id uuid references public.payroll_employees(id) on delete set null,
  toast_name text not null,
  toast_employee_id text,
  location_id uuid references public.payroll_locations(id) on delete set null,
  job_title text,
  earning_type text not null,
  hours_hh integer not null default 0,
  rate_cents integer,
  amount_cents bigint not null default 0,
  source text not null default 'toast' check (source in ('toast', 'manual_adjustment')),
  adjustment_reason text,
  original jsonb,
  edited_by uuid references public.profiles(id) on delete set null,
  edited_at timestamptz,
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  check (source = 'toast' or coalesce(trim(adjustment_reason), '') <> ''),
  check (edited_at is null or coalesce(trim(adjustment_reason), '') <> '')
);
create index payroll_run_lines_run_idx on public.payroll_run_lines (run_id);

-- Blockers clear only when the underlying data is fixed (re-check); warnings are acknowledged with a note.
create table public.payroll_run_flags (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.payroll_runs(id) on delete cascade,
  flag_key text not null,
  flag_type text not null,
  severity text not null check (severity in ('blocker', 'warning')),
  message text not null,
  details jsonb,
  toast_name text,
  location_id uuid references public.payroll_locations(id) on delete set null,
  resolved_by uuid references public.profiles(id) on delete set null,
  resolved_at timestamptz,
  resolution_note text,
  created_at timestamptz not null default now(),
  unique (run_id, flag_key),
  check (severity = 'warning' or resolved_at is null),
  check (resolved_at is null or coalesce(trim(resolution_note), '') <> '')
);

create table public.payroll_audit_log (
  id bigint generated always as identity primary key,
  run_id uuid, -- no FK: the audit trail outlives deleted runs
  actor uuid default auth.uid() references public.profiles(id) on delete set null,
  action text not null,
  entity text,
  entity_id text,
  details jsonb,
  created_at timestamptz not null default now()
);
create index payroll_audit_log_run_idx on public.payroll_audit_log (run_id, created_at desc);

create table public.payroll_examples (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) > 0),
  period_start date,
  period_end date,
  notes text,
  toast_files jsonb not null default '[]',
  expected_path text,
  expected_name text,
  last_result jsonb,
  last_run_at timestamptz,
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ─── Audit (written only by these SECURITY DEFINER functions) ────────────────

create or replace function public.payroll_log(p_action text, p_entity text, p_entity_id text, p_details jsonb, p_run_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_payroll_access() then
    raise exception 'Not authorized';
  end if;
  insert into public.payroll_audit_log (run_id, actor, action, entity, entity_id, details)
  values (p_run_id, auth.uid(), p_action, p_entity, p_entity_id, p_details);
end;
$$;
revoke execute on function public.payroll_log(text, text, text, jsonb, uuid) from public, anon;
grant execute on function public.payroll_log(text, text, text, jsonb, uuid) to authenticated;

create or replace function public.payroll_audit_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r jsonb := to_jsonb(coalesce(new, old));
begin
  -- Toast-generated run lines are rebuilt in bulk on every re-process; only human changes are audited.
  if tg_table_name = 'payroll_run_lines' and r->>'source' = 'toast' and tg_op <> 'UPDATE' then
    return null;
  end if;
  insert into public.payroll_audit_log (run_id, actor, action, entity, entity_id, details)
  values (
    case when tg_table_name = 'payroll_run_lines' then (r->>'run_id')::uuid end,
    auth.uid(),
    lower(tg_op),
    tg_table_name,
    r->>'id',
    case tg_op
      when 'INSERT' then jsonb_build_object('new', to_jsonb(new))
      when 'DELETE' then jsonb_build_object('old', to_jsonb(old))
      else jsonb_build_object('old', to_jsonb(old), 'new', to_jsonb(new))
    end
  );
  return null;
end;
$$;
revoke execute on function public.payroll_audit_row() from public, anon, authenticated;

create trigger payroll_settings_audit after update on public.payroll_settings for each row execute function public.payroll_audit_row();
create trigger payroll_locations_audit after insert or update or delete on public.payroll_locations for each row execute function public.payroll_audit_row();
create trigger payroll_employees_audit after insert or update or delete on public.payroll_employees for each row execute function public.payroll_audit_row();
create trigger payroll_job_map_audit after insert or update or delete on public.payroll_job_map for each row execute function public.payroll_audit_row();
create trigger payroll_paycode_map_audit after insert or update or delete on public.payroll_paycode_map for each row execute function public.payroll_audit_row();
create trigger payroll_output_template_audit after update on public.payroll_output_template for each row execute function public.payroll_audit_row();
create trigger payroll_run_lines_audit after insert or update or delete on public.payroll_run_lines for each row execute function public.payroll_audit_row();

-- updated_at bookkeeping
create or replace function public.payroll_touch()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  if tg_table_name in ('payroll_settings', 'payroll_output_template') then
    new.updated_by := auth.uid();
  end if;
  return new;
end;
$$;
revoke execute on function public.payroll_touch() from public, anon, authenticated;

create trigger payroll_settings_touch before update on public.payroll_settings for each row execute function public.payroll_touch();
create trigger payroll_locations_touch before update on public.payroll_locations for each row execute function public.payroll_touch();
create trigger payroll_employees_touch before update on public.payroll_employees for each row execute function public.payroll_touch();
create trigger payroll_job_map_touch before update on public.payroll_job_map for each row execute function public.payroll_touch();
create trigger payroll_paycode_map_touch before update on public.payroll_paycode_map for each row execute function public.payroll_touch();
create trigger payroll_output_template_touch before update on public.payroll_output_template for each row execute function public.payroll_touch();
create trigger payroll_examples_touch before update on public.payroll_examples for each row execute function public.payroll_touch();

-- ─── Run lifecycle (enforced in the database) ────────────────────────────────

-- security definer: it writes the audit row, and the audit log is read-only to users.
create or replace function public.payroll_runs_before_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  open_blockers integer;
  open_warnings integer;
begin
  new.updated_at := now();

  if new.status is not distinct from old.status then
    if old.status in ('approved', 'exported')
       and (new.period_start is distinct from old.period_start or new.period_end is distinct from old.period_end
            or new.totals is distinct from old.totals) then
      raise exception 'Run is approved — reopen it to make changes';
    end if;
    return new;
  end if;

  if old.status = 'draft' and new.status = 'in_review' then
    null;
  elsif old.status = 'in_review' and new.status = 'approved' then
    select count(*) filter (where severity = 'blocker'),
           count(*) filter (where severity = 'warning' and resolved_at is null)
      into open_blockers, open_warnings
      from public.payroll_run_flags where run_id = new.id and (severity = 'blocker' or resolved_at is null);
    if open_blockers > 0 then
      raise exception 'Cannot approve: % blocker(s) still open', open_blockers;
    end if;
    if open_warnings > 0 then
      raise exception 'Cannot approve: % warning(s) not yet acknowledged', open_warnings;
    end if;
    if new.processed_at is null then
      raise exception 'Cannot approve: run has not been checked';
    end if;
    new.approved_by := auth.uid();
    new.approved_at := now();
  elsif old.status = 'approved' and new.status = 'exported' then
    new.exported_by := auth.uid();
    new.exported_at := now();
  elsif old.status in ('approved', 'exported') and new.status = 'in_review' then
    new.approved_by := null;
    new.approved_at := null;
    new.exported_by := null;
    new.exported_at := null;
  else
    raise exception 'Invalid status change: % → %', old.status, new.status;
  end if;

  insert into public.payroll_audit_log (run_id, actor, action, entity, entity_id, details)
  values (new.id, auth.uid(),
          case when old.status in ('approved', 'exported') and new.status = 'in_review' then 'reopen' else new.status end,
          'payroll_runs', new.id::text,
          jsonb_build_object('from', old.status, 'to', new.status));
  return new;
end;
$$;
revoke execute on function public.payroll_runs_before_update() from public, anon, authenticated;

create trigger payroll_runs_before_update
  before update on public.payroll_runs
  for each row execute function public.payroll_runs_before_update();

-- An approved/exported run is locked: no file, row, line, or flag changes until it is reopened.
create or replace function public.payroll_guard_locked_run()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  st text;
begin
  select status into st from public.payroll_runs where id = coalesce(new.run_id, old.run_id);
  if st in ('approved', 'exported') then
    raise exception 'Run is approved — reopen it to make changes';
  end if;
  return coalesce(new, old);
end;
$$;
revoke execute on function public.payroll_guard_locked_run() from public, anon, authenticated;

create trigger payroll_run_files_locked before insert or update or delete on public.payroll_run_files for each row execute function public.payroll_guard_locked_run();
create trigger payroll_source_rows_locked before insert or update or delete on public.payroll_source_rows for each row execute function public.payroll_guard_locked_run();
create trigger payroll_run_lines_locked before insert or update or delete on public.payroll_run_lines for each row execute function public.payroll_guard_locked_run();
create trigger payroll_run_flags_locked before insert or update or delete on public.payroll_run_flags for each row execute function public.payroll_guard_locked_run();

-- ─── RLS: every payroll table requires payroll_access ────────────────────────

do $$
declare
  t text;
begin
  foreach t in array array[
    'payroll_settings', 'payroll_locations', 'payroll_employees', 'payroll_paycom_roster', 'payroll_job_map',
    'payroll_paycode_map', 'payroll_output_template', 'payroll_column_mappings', 'payroll_runs',
    'payroll_run_files', 'payroll_source_rows', 'payroll_run_lines', 'payroll_run_flags', 'payroll_audit_log',
    'payroll_examples'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, service_role', t);
    if t = 'payroll_audit_log' then
      execute format('revoke insert, update, delete, truncate on public.%I from authenticated', t);
      execute format('create policy %I on public.%I for select to authenticated using (public.has_payroll_access())', t || '_select', t);
    elsif t in ('payroll_settings', 'payroll_output_template') then
      execute format('create policy %I on public.%I for select to authenticated using (public.has_payroll_access())', t || '_select', t);
      execute format('create policy %I on public.%I for update to authenticated using (public.has_payroll_access()) with check (public.has_payroll_access())', t || '_update', t);
    else
      execute format('create policy %I on public.%I for all to authenticated using (public.has_payroll_access()) with check (public.has_payroll_access())', t || '_all', t);
    end if;
  end loop;
end $$;

revoke all on sequence public.payroll_source_rows_id_seq, public.payroll_audit_log_id_seq from anon, service_role;

-- ─── Storage: private bucket for Toast uploads and training examples ─────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('payroll-uploads', 'payroll-uploads', false, 10485760, null)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

create policy payroll_uploads_select on storage.objects for select to authenticated
  using (bucket_id = 'payroll-uploads' and public.has_payroll_access());
create policy payroll_uploads_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'payroll-uploads' and public.has_payroll_access());
create policy payroll_uploads_delete on storage.objects for delete to authenticated
  using (bucket_id = 'payroll-uploads' and public.has_payroll_access());

-- ─── AI Assistant: run exec_sql as its caller (service_role), which has no payroll privileges ──

create or replace function public.exec_sql(query_text text)
returns json
language plpgsql
security invoker
set search_path to 'public'
as $function$
declare
  result json;
begin
  -- Read-only for the rest of this transaction: injected statements and writing functions fail.
  set local transaction_read_only = on;
  execute format('SELECT json_agg(t) FROM (%s) AS t', query_text)
    into result;
  return coalesce(result, '[]'::json);
end;
$function$;
revoke all on function public.exec_sql(text) from public, anon, authenticated;
grant execute on function public.exec_sql(text) to service_role;

-- ─── Allowlist ───────────────────────────────────────────────────────────────

update public.profiles set payroll_access = true
 where email in ('pheintzman@highbankco.com', 'jireland@highbankco.com', 'accounting@highbankco.com');
update public.profiles set full_name = 'Jeff Ireland' where email = 'jireland@highbankco.com';
