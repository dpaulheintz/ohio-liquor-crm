-- Wholesale Forms: replaces the Word "Wholesale Sales Report (Grandview warehouse #30174)".
-- Access: admins, plus users whose visible_pages include '/admin/wholesale-forms' (the distillery account).
-- Money is integer cents everywhere. Form totals are always derived from lines by the database.

create or replace function public.can_use_wholesale_forms()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select role = 'admin' or '/admin/wholesale-forms' = any(coalesce(visible_pages, '{}'))
     from profiles where id = auth.uid()),
    false
  );
$$;
revoke execute on function public.can_use_wholesale_forms() from public, anon;
grant execute on function public.can_use_wholesale_forms() to authenticated;

-- ─── Settings (single row) ───────────────────────────────────────────────────

create table public.wholesale_form_settings (
  id boolean primary key default true check (id),
  warehouse_label text not null default 'GRANDVIEW',
  agency_number text not null default '30174',
  a3a_name text not null default 'High Bank Distillery',
  a3a_address text not null default '1051 Goodale Blvd., Columbus, OH 43212',
  a3a_phone text not null default '614-826-5347',
  a3a_email text not null default 'cwilcox@highbankco.com',
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);
insert into public.wholesale_form_settings default values;

-- ─── Price list ──────────────────────────────────────────────────────────────

create table public.wholesale_products (
  id uuid primary key default gen_random_uuid(),
  brand_code text not null unique check (char_length(trim(brand_code)) > 0),
  description text not null check (char_length(trim(description)) > 0),
  unit_type text not null default 'Bottles',
  price_cents integer not null check (price_cents >= 0),
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.wholesale_products (brand_code, description, price_cents, sort_order) values
  ('6928B', 'Whiskey War 750 mL',                 3666,  10),
  ('6929B', 'Statehouse Gin 750 mL',              2538,  20),
  ('6928L', 'Whiskey War 1 L',                    3760,  30),
  ('6930L', 'High Bank Vodka 1 L',                2162,  40),
  ('6930D', 'High Bank Vodka 1.75L',              3314,  50),
  ('6931B', 'Whiskey War Barrel Proof 750 mL',    5170,  60),
  ('4166L', '614 Vodka 1 L',                      1692,  70),
  ('6619B', 'Midnight Cask Barrel Proof 750 mL',  5452,  80),
  ('6933B', 'Whiskey War Double Oak 750 mL',      6580,  90),
  ('6934B', 'Whiskey War Barrel Select 750 mL',  10810, 100),
  ('6627B', 'Whiskey War Cigar Cask 750 mL',      9400, 110),
  ('6628B', 'Old Fashioned RTD 750 mL',           3760, 120);

-- ─── Wholesaler directory ────────────────────────────────────────────────────

create table public.wholesale_customers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) > 0),
  address_line1 text,
  city text,
  state text not null default 'OH',
  zip text,
  phone text,
  account_type text not null default 'wholesale' check (account_type in ('wholesale', 'transient')),
  account_number text,
  customer_id_number text,
  crm_account_id uuid references public.accounts(id) on delete set null,
  notes text,
  times_used integer not null default 0,
  last_used_at timestamptz,
  archived boolean not null default false,
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index wholesale_customers_account_number_key
  on public.wholesale_customers (account_number) where account_number is not null;

-- Blank strings are stored as null (keeps the account_number uniqueness meaningful).
create or replace function public.wholesale_customers_normalize()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.name := trim(new.name);
  new.address_line1 := nullif(trim(new.address_line1), '');
  new.city := nullif(trim(new.city), '');
  new.state := coalesce(nullif(upper(trim(new.state)), ''), 'OH');
  new.zip := nullif(trim(new.zip), '');
  new.phone := nullif(trim(new.phone), '');
  new.account_number := nullif(trim(new.account_number), '');
  new.customer_id_number := nullif(trim(new.customer_id_number), '');
  new.notes := nullif(trim(new.notes), '');
  new.updated_at := now();
  return new;
end;
$$;

create trigger wholesale_customers_normalize
  before insert or update on public.wholesale_customers
  for each row execute function public.wholesale_customers_normalize();

-- ─── Forms ───────────────────────────────────────────────────────────────────

create table public.wholesale_forms (
  id uuid primary key default gen_random_uuid(),
  sales_date date not null,
  customer_id uuid references public.wholesale_customers(id) on delete restrict,
  -- Recipient snapshot: editing a wholesaler later never changes past forms.
  recipient_name text,
  recipient_address_line1 text,
  recipient_city text,
  recipient_state text,
  recipient_zip text,
  recipient_phone text,
  account_type text check (account_type in ('wholesale', 'transient')),
  account_number text,
  customer_id_number text,
  total_bottles integer not null default 0,
  receipt_total_cents bigint not null default 0,
  status text not null default 'draft' check (status in ('draft', 'final')),
  completed_by uuid references public.profiles(id) on delete set null,
  finalized_at timestamptz,
  notes text,
  source text not null default 'app' check (source in ('app', 'imported_scan')),
  scan_storage_path text,
  signed_copy_path text,
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint wholesale_forms_final_complete check (
    status = 'draft' or (coalesce(trim(recipient_name), '') <> '' and total_bottles > 0)
  )
);

create index wholesale_forms_sales_date_idx on public.wholesale_forms (sales_date desc);
create index wholesale_forms_customer_idx on public.wholesale_forms (customer_id);

create table public.wholesale_form_lines (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.wholesale_forms(id) on delete cascade,
  product_id uuid references public.wholesale_products(id) on delete set null,
  brand_code text not null,
  description text not null,
  unit_type text not null,
  price_cents integer not null check (price_cents >= 0),
  quantity integer not null default 0 check (quantity >= 0),
  line_total_cents bigint not null,
  sort_order integer not null default 0,
  constraint wholesale_form_lines_total_exact check (line_total_cents = price_cents::bigint * quantity),
  constraint wholesale_form_lines_product_once unique (form_id, product_id)
);

create index wholesale_form_lines_form_idx on public.wholesale_form_lines (form_id);

-- Totals are always recomputed from lines, so they can't drift or be set directly.
create or replace function public.wholesale_forms_before_write()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.total_bottles := 0;
    new.receipt_total_cents := 0;
  else
    select coalesce(sum(quantity), 0), coalesce(sum(line_total_cents), 0)
      into new.total_bottles, new.receipt_total_cents
      from public.wholesale_form_lines where form_id = new.id;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger wholesale_forms_before_write
  before insert or update on public.wholesale_forms
  for each row execute function public.wholesale_forms_before_write();

create or replace function public.wholesale_form_lines_after_write()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  update public.wholesale_forms set updated_at = now()
   where id = coalesce(new.form_id, old.form_id);
  return null;
end;
$$;

create trigger wholesale_form_lines_after_write
  after insert or update or delete on public.wholesale_form_lines
  for each row execute function public.wholesale_form_lines_after_write();

-- Wholesaler usage stats follow their finalized forms (also covers merges).
create or replace function public.wholesale_forms_after_write()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  ids uuid[] := array_remove(array[
    case when tg_op <> 'DELETE' then new.customer_id end,
    case when tg_op <> 'INSERT' then old.customer_id end
  ], null);
begin
  update public.wholesale_customers c
     set times_used = s.n, last_used_at = s.last_used
    from (
      select u.cid, count(f.id) filter (where f.status = 'final') as n,
             max(f.finalized_at) filter (where f.status = 'final') as last_used
        from (select distinct unnest(ids) as cid) u
        left join public.wholesale_forms f on f.customer_id = u.cid
       group by u.cid
    ) s
   where c.id = s.cid
     and (c.times_used is distinct from s.n or c.last_used_at is distinct from s.last_used);
  return null;
end;
$$;

create trigger wholesale_forms_after_write
  after insert or update or delete on public.wholesale_forms
  for each row execute function public.wholesale_forms_after_write();

create trigger wholesale_products_updated_at
  before update on public.wholesale_products
  for each row execute function public.update_updated_at();

create trigger wholesale_form_settings_updated_at
  before update on public.wholesale_form_settings
  for each row execute function public.update_updated_at();

-- ─── Save (one transaction: form + lines, prices snapshotted from the price list) ──

create or replace function public.save_wholesale_form(p_form_id uuid, p_form jsonb, p_quantities jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
  v_status text := coalesce(p_form->>'status', 'draft');
  v_was_final boolean;
begin
  if not public.can_use_wholesale_forms() then
    raise exception 'Not authorized';
  end if;
  if v_status not in ('draft', 'final') then
    raise exception 'Invalid status';
  end if;

  if p_form_id is null then
    insert into public.wholesale_forms (
      sales_date, customer_id, recipient_name, recipient_address_line1, recipient_city,
      recipient_state, recipient_zip, recipient_phone, account_type, account_number,
      customer_id_number, notes, status
    ) values (
      (p_form->>'sales_date')::date, nullif(p_form->>'customer_id', '')::uuid,
      nullif(trim(p_form->>'recipient_name'), ''), nullif(trim(p_form->>'recipient_address_line1'), ''),
      nullif(trim(p_form->>'recipient_city'), ''), nullif(trim(p_form->>'recipient_state'), ''),
      nullif(trim(p_form->>'recipient_zip'), ''), nullif(trim(p_form->>'recipient_phone'), ''),
      coalesce(nullif(p_form->>'account_type', ''), 'wholesale'), nullif(trim(p_form->>'account_number'), ''),
      nullif(trim(p_form->>'customer_id_number'), ''), nullif(trim(p_form->>'notes'), ''), 'draft'
    )
    returning id into v_id;

    -- Every active product gets a line (qty 0 included) with today's price frozen in.
    insert into public.wholesale_form_lines (
      form_id, product_id, brand_code, description, unit_type, price_cents, quantity, line_total_cents, sort_order
    )
    select v_id, p.id, p.brand_code, p.description, p.unit_type, p.price_cents,
           q.qty, p.price_cents::bigint * q.qty, p.sort_order
      from public.wholesale_products p
      cross join lateral (select coalesce((p_quantities->>p.id::text)::integer, 0) as qty) q
     where p.active;
  else
    select status = 'final' into v_was_final
      from public.wholesale_forms where id = p_form_id for update;
    if not found then
      raise exception 'Form not found';
    end if;
    v_id := p_form_id;

    update public.wholesale_forms set
      sales_date = (p_form->>'sales_date')::date,
      customer_id = nullif(p_form->>'customer_id', '')::uuid,
      recipient_name = nullif(trim(p_form->>'recipient_name'), ''),
      recipient_address_line1 = nullif(trim(p_form->>'recipient_address_line1'), ''),
      recipient_city = nullif(trim(p_form->>'recipient_city'), ''),
      recipient_state = nullif(trim(p_form->>'recipient_state'), ''),
      recipient_zip = nullif(trim(p_form->>'recipient_zip'), ''),
      recipient_phone = nullif(trim(p_form->>'recipient_phone'), ''),
      account_type = coalesce(nullif(p_form->>'account_type', ''), 'wholesale'),
      account_number = nullif(trim(p_form->>'account_number'), ''),
      customer_id_number = nullif(trim(p_form->>'customer_id_number'), ''),
      notes = nullif(trim(p_form->>'notes'), '')
    where id = v_id;

    -- Existing lines keep their snapshot price; only quantities change.
    update public.wholesale_form_lines l set
      quantity = q.qty,
      line_total_cents = l.price_cents::bigint * q.qty
      from (select l2.id, coalesce((p_quantities->>l2.product_id::text)::integer, 0) as qty
              from public.wholesale_form_lines l2
             where l2.form_id = v_id and l2.product_id is not null) q
     where l.id = q.id;

    -- A finalized form stays final when edited.
    if v_was_final then
      v_status := 'final';
    end if;
  end if;

  if v_status = 'final' then
    update public.wholesale_forms set
      status = 'final',
      completed_by = coalesce(completed_by, auth.uid()),
      finalized_at = coalesce(finalized_at, now())
    where id = v_id;
  end if;

  return v_id;
end;
$$;

revoke execute on function public.save_wholesale_form(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.save_wholesale_form(uuid, jsonb, jsonb) to authenticated;

-- ─── Merge duplicate wholesalers ─────────────────────────────────────────────

create or replace function public.merge_wholesale_customers(p_keep uuid, p_dup uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  d public.wholesale_customers;
begin
  if not public.can_use_wholesale_forms() then
    raise exception 'Not authorized';
  end if;
  if p_keep = p_dup then
    raise exception 'Choose two different wholesalers';
  end if;
  select * into d from public.wholesale_customers where id = p_dup for update;
  if not found then
    raise exception 'Duplicate wholesaler not found';
  end if;
  perform 1 from public.wholesale_customers where id = p_keep for update;
  if not found then
    raise exception 'Wholesaler to keep not found';
  end if;

  update public.wholesale_forms set customer_id = p_keep where customer_id = p_dup;
  delete from public.wholesale_customers where id = p_dup;

  -- The kept record wins; its blanks are filled from the duplicate.
  update public.wholesale_customers k set
    address_line1 = coalesce(k.address_line1, d.address_line1),
    city = coalesce(k.city, d.city),
    zip = coalesce(k.zip, d.zip),
    phone = coalesce(k.phone, d.phone),
    account_number = coalesce(k.account_number, d.account_number),
    customer_id_number = coalesce(k.customer_id_number, d.customer_id_number),
    crm_account_id = coalesce(k.crm_account_id, d.crm_account_id),
    notes = coalesce(k.notes, d.notes)
  where k.id = p_keep;
end;
$$;

revoke execute on function public.merge_wholesale_customers(uuid, uuid) from public, anon;
grant execute on function public.merge_wholesale_customers(uuid, uuid) to authenticated;

-- Trigger functions are not part of the API.
revoke execute on function public.wholesale_customers_normalize() from public, anon, authenticated;
revoke execute on function public.wholesale_forms_before_write() from public, anon, authenticated;
revoke execute on function public.wholesale_form_lines_after_write() from public, anon, authenticated;
revoke execute on function public.wholesale_forms_after_write() from public, anon, authenticated;

-- ─── RLS ─────────────────────────────────────────────────────────────────────

alter table public.wholesale_form_settings enable row level security;
alter table public.wholesale_products enable row level security;
alter table public.wholesale_customers enable row level security;
alter table public.wholesale_forms enable row level security;
alter table public.wholesale_form_lines enable row level security;

revoke all on public.wholesale_form_settings, public.wholesale_products, public.wholesale_customers,
  public.wholesale_forms, public.wholesale_form_lines from anon;

create policy wholesale_settings_select on public.wholesale_form_settings
  for select to authenticated using (public.can_use_wholesale_forms());
create policy wholesale_settings_admin_update on public.wholesale_form_settings
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy wholesale_products_select on public.wholesale_products
  for select to authenticated using (public.can_use_wholesale_forms());
create policy wholesale_products_admin_insert on public.wholesale_products
  for insert to authenticated with check (public.is_admin());
create policy wholesale_products_admin_update on public.wholesale_products
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy wholesale_customers_all on public.wholesale_customers
  for all to authenticated
  using (public.can_use_wholesale_forms()) with check (public.can_use_wholesale_forms());

create policy wholesale_forms_select on public.wholesale_forms
  for select to authenticated using (public.can_use_wholesale_forms());
create policy wholesale_forms_insert on public.wholesale_forms
  for insert to authenticated with check (public.can_use_wholesale_forms());
create policy wholesale_forms_update on public.wholesale_forms
  for update to authenticated
  using (public.can_use_wholesale_forms()) with check (public.can_use_wholesale_forms());

create policy wholesale_form_lines_select on public.wholesale_form_lines
  for select to authenticated using (public.can_use_wholesale_forms());
create policy wholesale_form_lines_insert on public.wholesale_form_lines
  for insert to authenticated with check (public.can_use_wholesale_forms());
create policy wholesale_form_lines_update on public.wholesale_form_lines
  for update to authenticated
  using (public.can_use_wholesale_forms()) with check (public.can_use_wholesale_forms());

-- ─── Storage: signed copies and (later) imported scans ───────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('wholesale-forms', 'wholesale-forms', false, 26214400, array['application/pdf', 'image/*'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy wholesale_forms_storage_select on storage.objects
  for select to authenticated
  using (bucket_id = 'wholesale-forms' and public.can_use_wholesale_forms());
create policy wholesale_forms_storage_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'wholesale-forms' and public.can_use_wholesale_forms());

-- ─── Grant the module to the distillery account ──────────────────────────────

update public.profiles
   set visible_pages = array_append(visible_pages, '/admin/wholesale-forms')
 where email = 'distillery@highbankco.com'
   and visible_pages is not null
   and not ('/admin/wholesale-forms' = any(visible_pages));

-- ─── A-3a/warehouse info is snapshotted onto each form, so later Settings edits never change past PDFs ──

alter table public.wholesale_forms add column settings_snapshot jsonb;

create or replace function public.wholesale_forms_snapshot_settings()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.settings_snapshot is null then
    select jsonb_build_object(
      'warehouse_label', warehouse_label, 'agency_number', agency_number, 'a3a_name', a3a_name,
      'a3a_address', a3a_address, 'a3a_phone', a3a_phone, 'a3a_email', a3a_email)
      into new.settings_snapshot
      from public.wholesale_form_settings limit 1;
  end if;
  return new;
end;
$$;
revoke execute on function public.wholesale_forms_snapshot_settings() from public, anon, authenticated;

create trigger wholesale_forms_snapshot_settings
  before insert on public.wholesale_forms
  for each row execute function public.wholesale_forms_snapshot_settings();
