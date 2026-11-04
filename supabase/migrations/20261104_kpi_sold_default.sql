-- KPI Sold/Unsold smart default.
--
-- Menu and Feature KPIs pay more at an account that hasn't bought High Bank (unsold), but
-- visit_kpis.sold_status defaulted to 'sold', so a rep who skipped the toggle was underpaid.
-- kpi_sold_default_for() works out the right default from the account's purchase history; the web
-- and iOS forms pre-set the toggle from it, and a trigger applies it whenever a Menu/Feature KPI
-- is saved without a sold_status.

-- ─── accounts.status: always lowercase ('prospect' / 'customer' / 'inactive') ──

update public.accounts set status = lower(btrim(status)) where status is distinct from lower(btrim(status));

-- Older iOS builds write 'Prospect' / 'Customer'; normalise on every write instead of rejecting.
create or replace function public.accounts_lowercase_status()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.status := nullif(lower(btrim(new.status)), '');
  return new;
end $$;
revoke execute on function public.accounts_lowercase_status() from public, anon, authenticated;

create trigger accounts_lowercase_status
  before insert or update of status on public.accounts
  for each row execute function public.accounts_lowercase_status();

-- ─── Name matching ────────────────────────────────────────────────────────────

-- "DBA Olentangy River Brewing Co., LLC" → "olentangyriverbrewing": drops a leading DBA, legal
-- suffixes and punctuation so the account name and the state's wholesale names compare equal.
create or replace function public.kpi_match_name(p_name text)
returns text
language sql
immutable
set search_path = public
as $$
  select nullif(
    regexp_replace(
      regexp_replace(
        regexp_replace(lower(btrim(coalesce(p_name, ''))), '^dba\s+', ''),
        '\m(llc|inc|co|corp|ltd|company|the)\M', '', 'g'),
      '[^a-z0-9]', '', 'g'),
    '');
$$;

-- ─── Sold default ─────────────────────────────────────────────────────────────

-- sold: the account bought High Bank in the 12 months before the visit (by permit #, then
--       account-group match terms, then effective name, where TRANSIENT rows resolve to the dba),
--       or its status is 'customer'.
-- last_purchase_month: most recent purchase month before the visit (any age), for the hint.
-- matched_by: 'permit' | 'group' | 'name' | null — how the purchases were found.
create or replace function public.kpi_sold_default_for(p_account_id uuid, p_visit_date date)
returns table (sold boolean, last_purchase_month text, matched_by text, account_status text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  a public.accounts;
  v_date date := coalesce(p_visit_date, (now() at time zone 'America/New_York')::date);
  v_to text := to_char(v_date, 'YYYY-MM');                         -- purchases before the visit month
  v_from text := to_char(v_date - interval '12 months', 'YYYY-MM'); -- …and within 12 months of it
  v_names text[];
begin
  select * into a from public.accounts where id = p_account_id;
  if not found then
    return;
  end if;

  v_names := array_remove(array[public.kpi_match_name(a.display_name), public.kpi_match_name(a.legal_name)], null);

  return query
  with grp as (
    select g.match_terms, g.match_columns
      from public.account_groups g
     where exists (
       select 1
         from unnest(g.match_terms) t, unnest(array[a.display_name, a.legal_name]) n
        where btrim(t) <> '' and n is not null and lower(n) like '%' || lower(btrim(t)) || '%')
  ),
  hits as (
    select r.month, 1 as rank, 'permit' as how
      from public.wholesale_detail_resolved r
     where nullif(btrim(a.permit_number), '') is not null
       and btrim(r.permit_number) = btrim(a.permit_number)
    union all
    select r.month, 2, 'group'
      from public.wholesale_detail_resolved r
      join grp g on exists (
        select 1 from unnest(g.match_terms) t
         where btrim(t) <> ''
           and case g.match_columns
                 when 'wholesaler' then lower(coalesce(r.wholesaler_name, '')) like '%' || lower(btrim(t)) || '%'
                 when 'dba'        then lower(coalesce(r.dba, '')) like '%' || lower(btrim(t)) || '%'
                 when 'effective'  then lower(r.effective_account_name) like '%' || lower(btrim(t)) || '%'
                 else lower(coalesce(r.wholesaler_name, '')) like '%' || lower(btrim(t)) || '%'
                   or lower(coalesce(r.dba, '')) like '%' || lower(btrim(t)) || '%'
               end)
    union all
    select r.month, 3, 'name'
      from public.wholesale_detail_resolved r
     where cardinality(v_names) > 0
       and (public.kpi_match_name(r.effective_account_name) = any (v_names)
            or public.kpi_match_name(r.dba) = any (v_names))
  ),
  before_visit as (
    select * from hits where month < v_to
  )
  select
    exists (select 1 from before_visit where month >= v_from) or lower(coalesce(a.status, '')) = 'customer',
    (select max(month) from before_visit),
    coalesce(
      (select how from before_visit where month >= v_from order by rank limit 1),
      (select how from before_visit order by rank limit 1)),
    lower(a.status);
end $$;
revoke execute on function public.kpi_sold_default_for(uuid, date) from public, anon, authenticated;

-- What the web and iOS KPI forms call (approved users only).
create or replace function public.kpi_sold_default(p_account_id uuid, p_visit_date date default null)
returns table (sold boolean, last_purchase_month text, matched_by text, account_status text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_approved() then
    raise exception 'Not authorized';
  end if;
  return query select * from public.kpi_sold_default_for(p_account_id, p_visit_date);
end $$;
revoke execute on function public.kpi_sold_default(uuid, date) from public, anon;
grant execute on function public.kpi_sold_default(uuid, date) to authenticated;

-- ─── Default on save ──────────────────────────────────────────────────────────

-- No more blanket 'sold' default: a Menu/Feature KPI saved without a sold_status gets the smart
-- default for its visit; other KPI types don't use the field and get 'sold' as before.
alter table public.visit_kpis alter column sold_status drop default;

create or replace function public.visit_kpis_default_sold_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account uuid;
  v_date date;
begin
  if new.sold_status is null then
    if new.kpi_type in ('Menu', 'Feature') then
      select account_id, (visited_at at time zone 'America/New_York')::date into v_account, v_date
        from public.visit_logs where id = new.visit_id;
      select case when d.sold then 'sold' else 'unsold' end into new.sold_status
        from public.kpi_sold_default_for(v_account, v_date) d;
    end if;
    new.sold_status := coalesce(new.sold_status, 'sold');
  end if;
  return new;
end $$;
revoke execute on function public.visit_kpis_default_sold_status() from public, anon, authenticated;

create trigger visit_kpis_default_sold_status
  before insert on public.visit_kpis
  for each row execute function public.visit_kpis_default_sold_status();
