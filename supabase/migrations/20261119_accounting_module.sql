-- Accounting (P&L hub). Reads each monthly P&L export by account and location (never by position),
-- stores account lines only (subtotals are always recalculated), checks them to the cent, and drives
-- the store-by-store P&L, trends, flags and close checklist screens.
--
-- Access is an allowlist (profiles.accounting_access), like payroll_access. Every fin_* table grants
-- nothing to anon or service_role, so the AI Assistant (exec_sql, run as service_role) cannot read
-- them no matter how a query is written. Money is numeric(14,2).

-- ─── Access ──────────────────────────────────────────────────────────────────

alter table public.profiles add column accounting_access boolean not null default false;

create or replace function public.has_accounting_access()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select accounting_access from public.profiles where id = auth.uid()), false);
$$;
revoke execute on function public.has_accounting_access() from public, anon;
grant execute on function public.has_accounting_access() to authenticated;

-- accounting_access, like payroll_access, can only change via direct SQL.
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
    if new.accounting_access is distinct from old.accounting_access then
      raise exception 'accounting_access can only be changed by a database administrator';
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

update public.profiles set accounting_access = true
 where lower(email) in ('pheintzman@highbankco.com', 'accounting@highbankco.com');

-- ─── Reference data ──────────────────────────────────────────────────────────

create table public.fin_entities (
  code text primary key check (code ~ '^[A-Z]{2,4}$'),
  name text not null,
  aliases text[] not null default '{}',        -- export column headers, e.g. 'Distilled Spirits Plant'
  sort_order int not null default 0,
  prime_cost_check boolean not null default true, -- flag prime cost % outside the normal range
  toast_location_id uuid references public.locations(id) on delete set null, -- cross-check mapping
  active boolean not null default true
);

insert into public.fin_entities (code, name, aliases, sort_order, prime_cost_check, toast_location_id) values
  ('DSP', 'DSP',         array['Distilled Spirits Plant', '8 - Distilled Spirits Plant'], 1, false, null),
  ('WV',  'Westerville', array['HBD Westerville', '10 - HBD Westerville'], 2, true, (select id from public.locations where name = 'Westerville')),
  ('GV',  'Grandview',   array['High Bank Distillery Co', '7 - High Bank Distillery Co'], 3, true, (select id from public.locations where name = 'Grandview')),
  ('GH',  'Gahanna',     array['High Bank Gahanna', '9 - High Bank Gahanna'], 4, true, (select id from public.locations where name = 'Gahanna')),
  ('PO',  'PO Box 21',   array['Speakeasy', '11 - Speakeasy'], 5, true, (select id from public.locations where name = 'PO BOX 21'));

create table public.fin_accounts (
  gl_number text primary key check (gl_number ~ '^[0-9]{3,6}$'),
  name text not null check (char_length(trim(name)) > 0),
  section text not null check (section in ('sales', 'discounts', 'prime', 'opex', 'noncontrollable')),
  sort_order int not null default 0,
  active boolean not null default true,
  created_period date,                 -- the month it first appeared in an upload (null = seeded history)
  created_at timestamptz not null default now()
);

-- Name-only exports map through aliases (normalized: lowercase letters and digits only).
create table public.fin_account_aliases (
  alias_key text primary key check (alias_key ~ '^[a-z0-9]+$'),
  alias text not null,
  gl_number text not null references public.fin_accounts(gl_number) on update cascade on delete cascade,
  created_at timestamptz not null default now()
);

create table public.fin_periods (
  period date primary key check (extract(day from period) = 1),
  status text not null default 'open' check (status in ('open', 'closed')),
  closed_by uuid references public.profiles(id),
  closed_at timestamptz,
  notes text
);

create table public.fin_settings (
  key text primary key,
  value jsonb not null,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);
insert into public.fin_settings (key, value) values
  ('thresholds', jsonb_build_object(
    'mom_pct', 0.20,            -- Review Assumptions: MoM change
    'materiality', 1000,        -- $ materiality
    'yoy_pct', 0.50,            -- YoY change
    'large_multiple', 2,        -- large charge vs trailing-3-month average
    'high_priority', 10000,     -- high priority $ impact
    'prime_min', 0.55, 'prime_max', 0.68,  -- prime cost % normal range
    'reclass_min', 5000, 'reclass_tolerance', 0.15,
    'checklist_window', 9, 'checklist_min_months', 7));

-- ─── Uploads and lines ───────────────────────────────────────────────────────

create table public.fin_uploads (
  id uuid primary key default gen_random_uuid(),
  period date not null references public.fin_periods(period),
  version int not null,
  status text not null default 'current' check (status in ('current', 'superseded')),
  source text not null default 'upload' check (source in ('upload', 'history')),
  file_path text,                       -- in the private fin-uploads bucket
  file_name text,
  sheet_name text,
  detected_columns jsonb not null default '[]',  -- [{col, header, entity}] in the file's own order
  check_results jsonb not null default '[]',
  mappings jsonb not null default '[]',          -- name-only rows mapped to a GL on this upload
  diff jsonb,                                     -- vs the previous version
  uploaded_by uuid references public.profiles(id),
  uploaded_at timestamptz not null default now(),
  unique (period, version)
);
create unique index fin_uploads_one_current on public.fin_uploads (period) where status = 'current';

create table public.fin_lines (
  period date not null references public.fin_periods(period),
  entity_code text not null references public.fin_entities(code) on update cascade,
  gl_number text not null references public.fin_accounts(gl_number) on update cascade,
  amount numeric(14,2) not null,
  upload_id uuid not null references public.fin_uploads(id),
  primary key (period, entity_code, gl_number)
);
create index fin_lines_gl on public.fin_lines (gl_number, period);

create table public.fin_file_subtotals (
  upload_id uuid not null references public.fin_uploads(id) on delete cascade,
  period date not null,
  entity_code text not null,   -- an entity code, or 'TOTAL'
  name text not null check (name in ('gross_sales', 'total_discounts', 'net_sales', 'total_prime', 'total_opex', 'total_noncontrollable', 'net_profit')),
  amount numeric(14,2) not null,
  primary key (upload_id, entity_code, name)
);

-- ─── Review ──────────────────────────────────────────────────────────────────

create table public.fin_flags (
  id uuid primary key default gen_random_uuid(),
  period date not null,
  entity_code text,
  gl_number text,
  type text not null,
  rule_key text not null,              -- stable per rule hit, so notes survive recalculation
  severity text not null check (severity in ('high', 'medium', 'info')),
  message text not null,
  impact numeric(14,2),
  status text not null default 'open' check (status in ('open', 'explained', 'resolved')),
  note text,
  noted_by uuid references public.profiles(id),
  noted_at timestamptz,
  stale boolean not null default false, -- explained/resolved but no longer triggered
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (period, rule_key)
);

create table public.fin_checklist (
  period date not null,
  entity_code text not null,
  gl_number text not null,
  expected numeric(14,2) not null,     -- median of the months it posted
  months_posted int not null,
  window_months int not null,
  status text not null default 'missing' check (status in ('missing', 'posted', 'not_needed')),
  note text,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz,
  primary key (period, entity_code, gl_number)
);

create table public.fin_audit_log (
  id bigserial primary key,
  at timestamptz not null default now(),
  user_id uuid references public.profiles(id),
  action text not null,
  period date,
  detail jsonb not null default '{}'
);

-- ─── RLS: every fin_* table requires accounting_access; nothing for anon/service_role ──

do $$
declare t text;
begin
  foreach t in array array['fin_entities', 'fin_accounts', 'fin_account_aliases', 'fin_periods', 'fin_settings', 'fin_uploads',
                           'fin_lines', 'fin_file_subtotals', 'fin_flags', 'fin_checklist', 'fin_audit_log'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, service_role', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.has_accounting_access())', t || '_select', t);
    if t in ('fin_entities', 'fin_accounts', 'fin_account_aliases', 'fin_settings') then
      execute format('create policy %I on public.%I for insert to authenticated with check (public.has_accounting_access())', t || '_insert', t);
      execute format('create policy %I on public.%I for update to authenticated using (public.has_accounting_access()) with check (public.has_accounting_access())', t || '_update', t);
      execute format('create policy %I on public.%I for delete to authenticated using (public.has_accounting_access())', t || '_delete', t);
    elsif t in ('fin_flags', 'fin_checklist') then
      -- notes / status only; rows are written by fin_save_flags / fin_save_checklist
      execute format('revoke insert, delete, truncate on public.%I from authenticated', t);
      execute format('create policy %I on public.%I for update to authenticated using (public.has_accounting_access()) with check (public.has_accounting_access())', t || '_update', t);
    else
      -- written only through the security-definer functions below
      execute format('revoke insert, update, delete, truncate on public.%I from authenticated', t);
    end if;
  end loop;
end $$;
revoke all on sequence public.fin_audit_log_id_seq from anon, service_role;

-- ─── Locks + audit ───────────────────────────────────────────────────────────

create or replace function public.fin_lines_lock()
returns trigger
language plpgsql
set search_path = public
as $$
declare v_period date := coalesce(new.period, old.period);
begin
  if exists (select 1 from public.fin_periods where period = v_period and status = 'closed') then
    raise exception 'The % P&L is closed. Reopen it in Settings before changing it.', to_char(v_period, 'Mon YYYY');
  end if;
  return coalesce(new, old);
end $$;
revoke execute on function public.fin_lines_lock() from public, anon, authenticated;
create trigger fin_lines_lock before insert or update or delete on public.fin_lines
  for each row execute function public.fin_lines_lock();

create or replace function public.fin_log(p_action text, p_period date, p_detail jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_accounting_access() then raise exception 'Not authorized'; end if;
  insert into public.fin_audit_log (user_id, action, period, detail) values (auth.uid(), p_action, p_period, coalesce(p_detail, '{}'));
end $$;
revoke execute on function public.fin_log(text, date, jsonb) from public, anon;
grant execute on function public.fin_log(text, date, jsonb) to authenticated;

create or replace function public.fin_set_period_status(p_period date, p_status text, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_old text;
begin
  if not public.has_accounting_access() then raise exception 'Not authorized'; end if;
  if p_status not in ('open', 'closed') then raise exception 'Invalid status'; end if;
  select status into v_old from public.fin_periods where period = p_period for update;
  if v_old is null then raise exception 'No P&L for %', to_char(p_period, 'Mon YYYY'); end if;
  if v_old = p_status then return; end if;
  if p_status = 'open' and coalesce(trim(p_note), '') = '' then raise exception 'Say why the month is being reopened'; end if;
  update public.fin_periods
     set status = p_status,
         closed_by = case when p_status = 'closed' then auth.uid() else closed_by end,
         closed_at = case when p_status = 'closed' then now() else closed_at end,
         notes = coalesce(nullif(trim(p_note), ''), notes)
   where period = p_period;
  insert into public.fin_audit_log (user_id, action, period, detail)
  values (auth.uid(), case when p_status = 'closed' then 'close_month' else 'reopen_month' end, p_period, jsonb_build_object('note', p_note));
end $$;
revoke execute on function public.fin_set_period_status(date, text, text) from public, anon;
grant execute on function public.fin_set_period_status(date, text, text) to authenticated;

-- ─── Commit an upload ────────────────────────────────────────────────────────
-- p: { period, file_path, file_name, sheet_name, source, detected_columns, check_results, mappings,
--      new_accounts:[{gl_number,name,section}], new_aliases:[{alias_key,alias,gl_number}],
--      lines:[{entity_code,gl_number,amount}], totals:[{gl_number,amount}],
--      subtotals:[{entity_code,name,amount}] }
-- Everything the upload screen checked is checked again here, to the cent, before anything is written.

create or replace function public.fin_commit_upload(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_period date := (p->>'period')::date;
  v_status text;
  v_version int;
  v_upload uuid;
  v_diff jsonb;
  v_bad text;
begin
  if not public.has_accounting_access() then raise exception 'Not authorized'; end if;
  if v_period is null or extract(day from v_period) <> 1 then raise exception 'Invalid month'; end if;

  select status into v_status from public.fin_periods where period = v_period for update;
  if v_status is null then
    insert into public.fin_periods (period, status) values (v_period, 'open');
  elsif v_status = 'closed' then
    raise exception 'The % P&L is closed. Reopen it in Settings before uploading a new version.', to_char(v_period, 'Mon YYYY');
  end if;

  insert into public.fin_accounts (gl_number, name, section, sort_order, created_period)
  select a.gl_number, trim(a.name), a.section, a.gl_number::int, v_period
    from jsonb_to_recordset(coalesce(p->'new_accounts', '[]')) as a(gl_number text, name text, section text)
  on conflict (gl_number) do nothing;

  insert into public.fin_account_aliases (alias_key, alias, gl_number)
  select a.alias_key, a.alias, a.gl_number
    from jsonb_to_recordset(coalesce(p->'new_aliases', '[]')) as a(alias_key text, alias text, gl_number text)
  on conflict (alias_key) do update set gl_number = excluded.gl_number, alias = excluded.alias;

  create temp table _fin_l on commit drop as
  select x.entity_code, x.gl_number, x.amount::numeric(14,2) as amount
    from jsonb_to_recordset(coalesce(p->'lines', '[]')) as x(entity_code text, gl_number text, amount numeric);
  create temp table _fin_s on commit drop as
  select x.entity_code, x.name, x.amount::numeric(14,2) as amount
    from jsonb_to_recordset(coalesce(p->'subtotals', '[]')) as x(entity_code text, name text, amount numeric);

  if not exists (select 1 from _fin_l) then raise exception 'No account lines in this upload'; end if;

  select string_agg(entity_code || ' ' || gl_number, ', ') into v_bad
    from (select entity_code, gl_number from _fin_l group by 1, 2 having count(*) > 1) d;
  if v_bad is not null then raise exception 'Duplicate account rows: %', v_bad; end if;

  select string_agg(distinct l.gl_number, ', ') into v_bad from _fin_l l left join public.fin_accounts a using (gl_number) where a.gl_number is null;
  if v_bad is not null then raise exception 'Unmapped accounts: %', v_bad; end if;
  select string_agg(distinct l.entity_code, ', ') into v_bad from _fin_l l left join public.fin_entities e on e.code = l.entity_code where e.code is null;
  if v_bad is not null then raise exception 'Unknown locations: %', v_bad; end if;

  -- Recalculated subtotals must equal the export's own subtotals, per entity, to the cent.
  with sec as (
    select l.entity_code,
           sum(l.amount) filter (where a.section = 'sales') as gross,
           sum(l.amount) filter (where a.section = 'discounts') as disc,
           sum(l.amount) filter (where a.section = 'prime') as prime,
           sum(l.amount) filter (where a.section = 'opex') as opex,
           sum(l.amount) filter (where a.section = 'noncontrollable') as nonc
      from _fin_l l join public.fin_accounts a using (gl_number)
     group by l.entity_code
  ), calc as (
    select entity_code, n.name,
           case n.name
             when 'gross_sales' then coalesce(gross, 0)
             when 'total_discounts' then coalesce(disc, 0)
             when 'net_sales' then coalesce(gross, 0) + coalesce(disc, 0)
             when 'total_prime' then coalesce(prime, 0)
             when 'total_opex' then coalesce(opex, 0)
             when 'total_noncontrollable' then coalesce(nonc, 0)
             when 'net_profit' then coalesce(gross, 0) + coalesce(disc, 0) - coalesce(prime, 0) - coalesce(opex, 0) - coalesce(nonc, 0)
           end as amount
      from sec cross join (values ('gross_sales'), ('total_discounts'), ('net_sales'), ('total_prime'), ('total_opex'), ('total_noncontrollable'), ('net_profit')) n(name)
  )
  select string_agg(format('%s %s: file %s, recalculated %s', s.entity_code, s.name, s.amount, coalesce(c.amount, 0)), '; ') into v_bad
    from _fin_s s left join calc c on c.entity_code = s.entity_code and c.name = s.name
   where s.entity_code <> 'TOTAL' and s.amount <> coalesce(c.amount, 0);
  if v_bad is not null then raise exception 'Subtotals do not match: %', v_bad; end if;

  -- Locations must add up to the Total column on every line.
  select string_agg(format('%s: locations %s, Total %s', t.gl_number, coalesce(s.amount, 0), t.amount), '; ') into v_bad
    from jsonb_to_recordset(coalesce(p->'totals', '[]')) as t(gl_number text, amount numeric)
    left join (select gl_number, sum(amount) as amount from _fin_l group by 1) s using (gl_number)
   where t.amount::numeric(14,2) <> coalesce(s.amount, 0);
  if v_bad is not null then raise exception 'Locations do not add up to Total: %', v_bad; end if;

  -- What changed since the last version
  select jsonb_build_object(
    'added',   coalesce((select jsonb_agg(jsonb_build_object('entity_code', n.entity_code, 'gl_number', n.gl_number, 'amount', n.amount) order by n.entity_code, n.gl_number)
                           from _fin_l n left join public.fin_lines o on o.period = v_period and o.entity_code = n.entity_code and o.gl_number = n.gl_number
                          where o.gl_number is null), '[]'),
    'removed', coalesce((select jsonb_agg(jsonb_build_object('entity_code', o.entity_code, 'gl_number', o.gl_number, 'amount', o.amount) order by o.entity_code, o.gl_number)
                           from public.fin_lines o left join _fin_l n on n.entity_code = o.entity_code and n.gl_number = o.gl_number
                          where o.period = v_period and n.gl_number is null), '[]'),
    'changed', coalesce((select jsonb_agg(jsonb_build_object('entity_code', n.entity_code, 'gl_number', n.gl_number, 'from', o.amount, 'to', n.amount) order by n.entity_code, n.gl_number)
                           from _fin_l n join public.fin_lines o on o.period = v_period and o.entity_code = n.entity_code and o.gl_number = n.gl_number
                          where o.amount <> n.amount), '[]'),
    'previous_version', (select max(version) from public.fin_uploads where period = v_period))
  into v_diff;

  select coalesce(max(version), 0) + 1 into v_version from public.fin_uploads where period = v_period;
  update public.fin_uploads set status = 'superseded' where period = v_period and status = 'current';
  insert into public.fin_uploads (period, version, status, source, file_path, file_name, sheet_name, detected_columns, check_results, mappings, diff, uploaded_by)
  values (v_period, v_version, 'current', coalesce(p->>'source', 'upload'), p->>'file_path', p->>'file_name', p->>'sheet_name',
          coalesce(p->'detected_columns', '[]'), coalesce(p->'check_results', '[]'), coalesce(p->'mappings', '[]'),
          case when v_version = 1 then null else v_diff end, auth.uid())
  returning id into v_upload;

  delete from public.fin_lines where period = v_period;
  insert into public.fin_lines (period, entity_code, gl_number, amount, upload_id)
  select v_period, entity_code, gl_number, amount, v_upload from _fin_l;
  insert into public.fin_file_subtotals (upload_id, period, entity_code, name, amount)
  select v_upload, v_period, entity_code, name, amount from _fin_s;

  insert into public.fin_audit_log (user_id, action, period, detail)
  values (auth.uid(), 'upload', v_period, jsonb_build_object(
    'upload_id', v_upload, 'version', v_version, 'file_name', p->>'file_name', 'sheet_name', p->>'sheet_name', 'source', coalesce(p->>'source', 'upload'),
    'lines', (select count(*) from _fin_l), 'new_accounts', coalesce(p->'new_accounts', '[]'), 'mappings', coalesce(p->'mappings', '[]'),
    'changed', jsonb_array_length(v_diff->'changed'), 'added', jsonb_array_length(v_diff->'added'), 'removed', jsonb_array_length(v_diff->'removed')));

  return jsonb_build_object('upload_id', v_upload, 'version', v_version, 'diff', v_diff);
end $$;
revoke execute on function public.fin_commit_upload(jsonb) from public, anon;
grant execute on function public.fin_commit_upload(jsonb) to authenticated;

-- ─── Flags + checklist (calculated in the app, saved here) ───────────────────
-- Replaces the open flags of the given months; explained/resolved flags keep their notes, and are
-- marked stale if their rule no longer fires.

create or replace function public.fin_save_flags(p_periods date[], p_flags jsonb)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare v_n int;
begin
  if not public.has_accounting_access() then raise exception 'Not authorized'; end if;
  create temp table _ff on commit drop as
  select * from jsonb_to_recordset(coalesce(p_flags, '[]'))
    as f(period date, entity_code text, gl_number text, type text, rule_key text, severity text, message text, impact numeric);

  delete from public.fin_flags f
   where f.period = any(p_periods) and f.status = 'open'
     and not exists (select 1 from _ff n where n.period = f.period and n.rule_key = f.rule_key);
  update public.fin_flags f set stale = true, updated_at = now()
   where f.period = any(p_periods) and f.status <> 'open'
     and not exists (select 1 from _ff n where n.period = f.period and n.rule_key = f.rule_key);

  insert into public.fin_flags (period, entity_code, gl_number, type, rule_key, severity, message, impact)
  select period, entity_code, gl_number, type, rule_key, severity, message, impact from _ff where period = any(p_periods)
  on conflict (period, rule_key) do update
    set severity = excluded.severity, message = excluded.message, impact = excluded.impact,
        entity_code = excluded.entity_code, gl_number = excluded.gl_number, type = excluded.type, stale = false, updated_at = now();
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke execute on function public.fin_save_flags(date[], jsonb) from public, anon;
grant execute on function public.fin_save_flags(date[], jsonb) to authenticated;

create or replace function public.fin_save_checklist(p_period date, p_items jsonb)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare v_n int;
begin
  if not public.has_accounting_access() then raise exception 'Not authorized'; end if;
  create temp table _fc on commit drop as
  select * from jsonb_to_recordset(coalesce(p_items, '[]'))
    as c(entity_code text, gl_number text, expected numeric, months_posted int, window_months int, posted boolean);

  -- items no longer expected disappear unless someone already annotated them
  delete from public.fin_checklist c
   where c.period = p_period and c.note is null and c.status = 'missing'
     and not exists (select 1 from _fc n where n.entity_code = c.entity_code and n.gl_number = c.gl_number);

  insert into public.fin_checklist (period, entity_code, gl_number, expected, months_posted, window_months, status)
  select p_period, entity_code, gl_number, expected, months_posted, window_months, case when posted then 'posted' else 'missing' end from _fc
  on conflict (period, entity_code, gl_number) do update
    set expected = excluded.expected, months_posted = excluded.months_posted, window_months = excluded.window_months,
        -- a line that has since posted is ticked automatically; "not needed" stays as the user set it
        status = case when fin_checklist.status = 'not_needed' then 'not_needed' when excluded.status = 'posted' then 'posted' else 'missing' end;
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke execute on function public.fin_save_checklist(date, jsonb) from public, anon;
grant execute on function public.fin_save_checklist(date, jsonb) to authenticated;

-- ─── Storage: private bucket for P&L exports ─────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fin-uploads', 'fin-uploads', false, 20971520, array['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy fin_uploads_select on storage.objects for select to authenticated
  using (bucket_id = 'fin-uploads' and public.has_accounting_access());
create policy fin_uploads_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'fin-uploads' and public.has_accounting_access());
create policy fin_uploads_delete on storage.objects for delete to authenticated
  using (bucket_id = 'fin-uploads' and public.has_accounting_access());

-- ─── Per-location prime cost range (applied after the history load) ──────────
-- null = use the global 55–68% in fin_settings.thresholds. PO Box 21 (a bar) normally runs 40–53%.
alter table public.fin_entities
  add column prime_min numeric(5,4) check (prime_min is null or prime_min between 0 and 1),
  add column prime_max numeric(5,4) check (prime_max is null or prime_max between 0 and 1);
update public.fin_entities set prime_min = 0.35, prime_max = 0.55 where code = 'PO';

-- History (Oct 2025, Jan–Oct 2026) was loaded with fin-load-history.ts (kept in private-data/accounting/, not in git: it holds the control totals) through fin_commit_upload()
-- via a temporary insert-only staging table (fin_import_staging), dropped right after the load.
