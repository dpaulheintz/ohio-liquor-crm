-- Bottle Sales Tracker: replaces accounting's OHLQ requisition spreadsheet.
--
-- Every bottle sold or pulled at the 4 locations, one row per SKU line, grouped into log entries
-- (entry_id = one date + location + type). Prices are snapshotted from ohlq_products when a line is
-- created, so a new OHLQ product file only affects new entries.
--
-- Money: numeric(12,2). paid_per_bottle = round(case_price / units_per_case, 2) (what OHLQ pays us);
-- line amounts = per-bottle price x bottles (rounded per bottle first).
--
-- Access: only distillery@, pheintzman@ and accounting@highbankco.com (bottle_sales_can_use()).
-- Mirrored for the nav in src/lib/bottle-sales.ts (BOTTLE_SALES_EMAILS). Reads go through RLS; every
-- write goes through the SECURITY DEFINER functions below, which re-check access.

-- ─── Access ───────────────────────────────────────────────────────────────────

create or replace function public.bottle_sales_can_use()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select role <> 'pending'
       and lower(email) in ('distillery@highbankco.com', 'pheintzman@highbankco.com', 'accounting@highbankco.com')
      from public.profiles where id = auth.uid()), false);
$$;
revoke execute on function public.bottle_sales_can_use() from public, anon;
grant execute on function public.bottle_sales_can_use() to authenticated;

-- The distillery login is restricted to its visible_pages (proxy), so add the module there.
update public.profiles
   set visible_pages = array_append(visible_pages, '/admin/bottle-sales')
 where lower(email) = 'distillery@highbankco.com'
   and visible_pages is not null
   and not ('/admin/bottle-sales' = any(visible_pages));

-- ─── Settings ─────────────────────────────────────────────────────────────────

create table public.bottle_sales_settings (
  id boolean primary key default true check (id),
  fiscal_year_start_month int not null default 11 check (fiscal_year_start_month between 1 and 12), -- FY2026 = Nov 2025 - Oct 2026
  updated_at timestamptz not null default now()
);
insert into public.bottle_sales_settings (id) values (true);

-- ─── Products (OHLQ product file) ─────────────────────────────────────────────

create table public.ohlq_products (
  sku text primary key,                       -- OHLQ ItemId, e.g. 6928B
  item_name text not null,
  display_name text not null,                 -- friendly, e.g. "Whiskey War 750 mL"
  category text,
  report_group text not null default 'Whiskey', -- matrix grouping: Whiskey / Vodka / Gin / Rum / RTD / 200 mL
  proof numeric(5,1),
  age int,
  status text,
  detail_code text,                           -- DetailCodeDescription: A3A Bailment, Barrel, Delisted, ...
  upc text,
  case_price numeric(12,2) not null check (case_price >= 0),
  units_per_case int not null check (units_per_case > 0),
  volume_l numeric(6,3),
  retail_price numeric(12,2) not null check (retail_price >= 0),     -- MSRP: what the customer pays
  wholesale_price numeric(12,2) not null check (wholesale_price >= 0), -- what bars pay
  paid_per_bottle numeric(12,2) generated always as (round(case_price / units_per_case, 2)) stored, -- what OHLQ pays us
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.bottle_locations (
  code text primary key check (code ~ '^[A-Z]{2}$'),
  name text not null,
  sort_order int not null default 0,
  active boolean not null default true
);
insert into public.bottle_locations (code, name, sort_order) values
  ('GV', 'Grandview', 1), ('GH', 'Gahanna', 2), ('WV', 'Westerville', 3), ('PO', 'PO Box 21', 4);

-- ─── Sales lines ──────────────────────────────────────────────────────────────

create table public.bottle_sales (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null,
  sale_date date not null,
  location_code text not null references public.bottle_locations(code),
  type text not null check (type in ('Retail', 'Bar', 'Batch')),
  sku text not null references public.ohlq_products(sku),
  bottles int not null check (bottles > 0),
  -- price snapshot at entry
  paid_per_bottle numeric(12,2) not null,
  wholesale_price numeric(12,2) not null,
  retail_price numeric(12,2) not null,
  units_per_case int not null check (units_per_case > 0),
  paid_amount numeric(12,2) generated always as (paid_per_bottle * bottles) stored,
  wholesale_amount numeric(12,2) generated always as (wholesale_price * bottles) stored,
  retail_amount numeric(12,2) generated always as (retail_price * bottles) stored,
  source text not null default 'manual' check (source in ('legacy_fy2026', 'manual')),
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);
create index bottle_sales_entry_idx on public.bottle_sales (entry_id);
create index bottle_sales_date_idx on public.bottle_sales (sale_date);

create table public.bottle_sales_audit (
  id bigint generated always as identity primary key,
  line_id uuid not null,
  entry_id uuid not null,
  action text not null check (action in ('update', 'delete')),
  old_values jsonb not null,
  new_values jsonb,
  changed_by uuid references public.profiles(id),
  changed_at timestamptz not null default now()
);
create index bottle_sales_audit_entry_idx on public.bottle_sales_audit (entry_id, changed_at desc);

create or replace function public.bottle_sales_audit_trg()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    insert into public.bottle_sales_audit (line_id, entry_id, action, old_values, new_values, changed_by)
    values (old.id, old.entry_id, 'update', to_jsonb(old), to_jsonb(new), auth.uid());
    return new;
  end if;
  insert into public.bottle_sales_audit (line_id, entry_id, action, old_values, changed_by)
  values (old.id, old.entry_id, 'delete', to_jsonb(old), auth.uid());
  return old;
end $$;
revoke execute on function public.bottle_sales_audit_trg() from public, anon, authenticated;
create trigger bottle_sales_audit after update or delete on public.bottle_sales
  for each row execute function public.bottle_sales_audit_trg();

-- ─── RLS: read for allowed users, no direct writes ────────────────────────────

alter table public.bottle_sales_settings enable row level security;
alter table public.ohlq_products enable row level security;
alter table public.bottle_locations enable row level security;
alter table public.bottle_sales enable row level security;
alter table public.bottle_sales_audit enable row level security;
revoke all on public.bottle_sales_settings, public.ohlq_products, public.bottle_locations, public.bottle_sales, public.bottle_sales_audit from anon, authenticated;
grant select on public.bottle_sales_settings, public.ohlq_products, public.bottle_locations, public.bottle_sales, public.bottle_sales_audit to authenticated;
create policy bottle_sales_settings_select on public.bottle_sales_settings for select to authenticated using (public.bottle_sales_can_use());
create policy ohlq_products_select on public.ohlq_products for select to authenticated using (public.bottle_sales_can_use());
create policy bottle_locations_select on public.bottle_locations for select to authenticated using (public.bottle_sales_can_use());
create policy bottle_sales_select on public.bottle_sales for select to authenticated using (public.bottle_sales_can_use());
create policy bottle_sales_audit_select on public.bottle_sales_audit for select to authenticated using (public.bottle_sales_can_use());

-- ─── Writes ───────────────────────────────────────────────────────────────────

-- Create or edit one log entry. p_lines: [{ "id": uuid|null, "sku": text, "bottles": int }].
-- New entry: p_entry_id null. Edit: lines with an id keep their price snapshot (only bottles change),
-- lines without an id are priced from ohlq_products now, existing lines left out are deleted.
-- Returns { entry_id, bottles, paid, wholesale, retail }.
create or replace function public.bottle_sales_save_entry(
  p_entry_id uuid, p_date date, p_location text, p_type text, p_notes text, p_lines jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry uuid := coalesce(p_entry_id, gen_random_uuid());
  v_uid uuid := auth.uid();
  l jsonb;
  v_id uuid;
  v_sku text;
  v_bottles int;
  v_keep uuid[] := '{}';
  p public.ohlq_products;
  v_out jsonb;
begin
  if not public.bottle_sales_can_use() then raise exception 'Not authorized'; end if;
  if p_date is null or p_location is null or p_type not in ('Retail', 'Bar', 'Batch') then raise exception 'Date, location and type are required'; end if;
  if not exists (select 1 from public.bottle_locations where code = p_location) then raise exception 'Unknown location %', p_location; end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then raise exception 'Add at least one bottle'; end if;
  if p_entry_id is not null and not exists (select 1 from public.bottle_sales where entry_id = p_entry_id) then raise exception 'Entry not found'; end if;

  for l in select * from jsonb_array_elements(p_lines) loop
    v_sku := l->>'sku';
    v_bottles := (l->>'bottles')::int;
    if v_bottles is null or v_bottles <= 0 then raise exception 'Bottles must be a whole number above 0'; end if;
    v_id := nullif(l->>'id', '')::uuid;
    if v_id is not null then
      update public.bottle_sales
         set bottles = v_bottles, sale_date = p_date, location_code = p_location, type = p_type,
             notes = nullif(btrim(p_notes), ''), updated_by = v_uid, updated_at = now()
       where id = v_id and entry_id = v_entry
         and (bottles, sale_date, location_code, type, coalesce(notes, '')) is distinct from
             (v_bottles, p_date, p_location, p_type, coalesce(nullif(btrim(p_notes), ''), ''));
      if not exists (select 1 from public.bottle_sales where id = v_id and entry_id = v_entry) then raise exception 'Line not found'; end if;
      v_keep := v_keep || v_id;
    else
      select * into p from public.ohlq_products where sku = v_sku;
      if not found then raise exception 'Unknown SKU %', v_sku; end if;
      insert into public.bottle_sales (entry_id, sale_date, location_code, type, sku, bottles, paid_per_bottle, wholesale_price,
                                       retail_price, units_per_case, source, notes, created_by, updated_by)
      values (v_entry, p_date, p_location, p_type, p.sku, v_bottles, p.paid_per_bottle, p.wholesale_price, p.retail_price,
              p.units_per_case, 'manual', nullif(btrim(p_notes), ''), v_uid, v_uid)
      returning id into v_id;
      v_keep := v_keep || v_id;
    end if;
  end loop;

  if p_entry_id is not null then
    delete from public.bottle_sales where entry_id = v_entry and not (id = any(v_keep));
  end if;

  select jsonb_build_object('entry_id', v_entry, 'bottles', sum(bottles), 'paid', sum(paid_amount),
                            'wholesale', sum(wholesale_amount), 'retail', sum(retail_amount))
    into v_out from public.bottle_sales where entry_id = v_entry;
  return v_out;
end $$;
revoke execute on function public.bottle_sales_save_entry(uuid, date, text, text, text, jsonb) from public, anon;
grant execute on function public.bottle_sales_save_entry(uuid, date, text, text, text, jsonb) to authenticated;

create or replace function public.bottle_sales_delete_entry(p_entry_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare v_n int;
begin
  if not public.bottle_sales_can_use() then raise exception 'Not authorized'; end if;
  delete from public.bottle_sales where entry_id = p_entry_id;
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke execute on function public.bottle_sales_delete_entry(uuid) from public, anon;
grant execute on function public.bottle_sales_delete_entry(uuid) to authenticated;

-- Upsert the OHLQ product file (rows already parsed + named by the app). Existing sales keep their
-- snapshot prices. SKUs missing from the file are left as they are.
create or replace function public.bottle_sales_apply_products(p_rows jsonb)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare v_n int;
begin
  if not public.bottle_sales_can_use() then raise exception 'Not authorized'; end if;
  insert into public.ohlq_products as t (sku, item_name, display_name, category, report_group, proof, age, status, detail_code, upc,
                                         case_price, units_per_case, volume_l, retail_price, wholesale_price, active, sort_order)
  select r.sku, r.item_name, r.display_name, r.category, r.report_group, r.proof, r.age, r.status, r.detail_code, r.upc,
         r.case_price, r.units_per_case, r.volume_l, r.retail_price, r.wholesale_price, r.active, r.sort_order
    from jsonb_to_recordset(p_rows) as r(sku text, item_name text, display_name text, category text, report_group text,
         proof numeric, age int, status text, detail_code text, upc text, case_price numeric, units_per_case int,
         volume_l numeric, retail_price numeric, wholesale_price numeric, active boolean, sort_order int)
  on conflict (sku) do update set
    item_name = excluded.item_name, category = excluded.category, proof = excluded.proof, age = excluded.age,
    status = excluded.status, detail_code = excluded.detail_code, upc = excluded.upc, case_price = excluded.case_price,
    units_per_case = excluded.units_per_case, volume_l = excluded.volume_l, retail_price = excluded.retail_price,
    wholesale_price = excluded.wholesale_price, active = excluded.active, updated_at = now();
    -- display_name, report_group and sort_order are kept on existing SKUs (they may have been tidied by hand)
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke execute on function public.bottle_sales_apply_products(jsonb) from public, anon;
grant execute on function public.bottle_sales_apply_products(jsonb) to authenticated;
