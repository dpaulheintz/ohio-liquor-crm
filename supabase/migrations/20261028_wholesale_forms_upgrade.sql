-- Wholesale Forms upgrade: three warehouse profiles (A-3a box per agency), custom lines,
-- email sends, and the 2026 price list. Additive: the old single-row settings columns stay
-- (unused by the app now) so code that predates this migration keeps working until deploy.

-- ─── Warehouses ──────────────────────────────────────────────────────────────

create table public.wholesale_warehouses (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(trim(name)) > 0),
  label text not null check (char_length(trim(label)) > 0),
  agency_number text not null check (char_length(trim(agency_number)) > 0),
  a3a_name text not null check (char_length(trim(a3a_name)) > 0),
  a3a_address text not null check (char_length(trim(a3a_address)) > 0),
  a3a_phone text not null check (char_length(trim(a3a_phone)) > 0),
  a3a_email text not null check (char_length(trim(a3a_email)) > 0),
  is_default boolean not null default false,
  sort_order integer not null default 0,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);
create unique index wholesale_warehouses_one_default on public.wholesale_warehouses (is_default) where is_default;

insert into public.wholesale_warehouses (name, label, agency_number, a3a_name, a3a_address, a3a_phone, a3a_email, is_default, sort_order) values
  ('Grandview',   'GRANDVIEW',   '30174', 'High Bank Distillery', '1051 Goodale Blvd., Columbus, OH 43212',    '614-826-5347', 'accounting@highbankco.com', true,  10),
  ('Gahanna',     'GAHANNA',     '90394', 'High Bank Distillery', '1379 E Johnstown Road, Gahanna, OH 43230',  '614-656-7343', 'accounting@highbankco.com', false, 20),
  ('Westerville', 'WESTERVILLE', '90286', 'High Bank Distillery', '28 South State Street, Westerville, OH 43081', '614-380-3130', 'accounting@highbankco.com', false, 30);

create trigger wholesale_warehouses_updated_at
  before update on public.wholesale_warehouses
  for each row execute function public.update_updated_at();

alter table public.wholesale_warehouses enable row level security;
revoke all on public.wholesale_warehouses from anon;
create policy wholesale_warehouses_select on public.wholesale_warehouses
  for select to authenticated using (public.can_use_wholesale_forms());
create policy wholesale_warehouses_admin_update on public.wholesale_warehouses
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- The old single settings row: the email moves to accounting@ (no longer used for the A-3a box).
update public.wholesale_form_settings set a3a_email = 'accounting@highbankco.com' where a3a_email = 'cwilcox@highbankco.com';

-- Who finalized forms are emailed to.
alter table public.wholesale_form_settings
  add column email_recipients text[] not null default array['msmith@highbankco.com', 'dsprequest@highbankco.com'];

-- ─── Forms and wholesalers pick a warehouse ──────────────────────────────────

alter table public.wholesale_forms add column warehouse_id uuid references public.wholesale_warehouses(id) on delete restrict;
alter table public.wholesale_customers add column default_warehouse_id uuid references public.wholesale_warehouses(id) on delete set null;

-- The A-3a/warehouse snapshot follows the form's warehouse (default: Grandview), so later
-- profile edits never change past PDFs, but switching a form's warehouse re-snapshots it.
create or replace function public.wholesale_forms_snapshot_settings()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.warehouse_id is null then
    select id into new.warehouse_id from public.wholesale_warehouses where is_default limit 1;
  end if;
  if tg_op = 'INSERT' or new.warehouse_id is distinct from old.warehouse_id or new.settings_snapshot is null then
    select jsonb_build_object(
      'warehouse_name', name, 'warehouse_label', label, 'agency_number', agency_number, 'a3a_name', a3a_name,
      'a3a_address', a3a_address, 'a3a_phone', a3a_phone, 'a3a_email', a3a_email)
      into new.settings_snapshot
      from public.wholesale_warehouses where id = new.warehouse_id;
  end if;
  return new;
end;
$$;
revoke execute on function public.wholesale_forms_snapshot_settings() from public, anon, authenticated;

drop trigger wholesale_forms_snapshot_settings on public.wholesale_forms;
create trigger wholesale_forms_snapshot_settings
  before insert or update of warehouse_id on public.wholesale_forms
  for each row execute function public.wholesale_forms_snapshot_settings();

-- ─── Save: warehouse + one-off custom lines ──────────────────────────────────
-- p_form.custom_lines (when present) replaces the form's custom lines:
--   [{ brand_code, description, unit_type, price_cents, quantity }]

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
  v_warehouse uuid := nullif(p_form->>'warehouse_id', '')::uuid;
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
      customer_id_number, notes, status, warehouse_id
    ) values (
      (p_form->>'sales_date')::date, nullif(p_form->>'customer_id', '')::uuid,
      nullif(trim(p_form->>'recipient_name'), ''), nullif(trim(p_form->>'recipient_address_line1'), ''),
      nullif(trim(p_form->>'recipient_city'), ''), nullif(trim(p_form->>'recipient_state'), ''),
      nullif(trim(p_form->>'recipient_zip'), ''), nullif(trim(p_form->>'recipient_phone'), ''),
      coalesce(nullif(p_form->>'account_type', ''), 'wholesale'), nullif(trim(p_form->>'account_number'), ''),
      nullif(trim(p_form->>'customer_id_number'), ''), nullif(trim(p_form->>'notes'), ''), 'draft', v_warehouse
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
      notes = nullif(trim(p_form->>'notes'), ''),
      warehouse_id = coalesce(v_warehouse, warehouse_id)
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

  if p_form ? 'custom_lines' then
    if jsonb_typeof(p_form->'custom_lines') <> 'array' or jsonb_array_length(p_form->'custom_lines') > 50 then
      raise exception 'Invalid custom lines';
    end if;
    if exists (
      select 1 from jsonb_array_elements(p_form->'custom_lines') c
       where coalesce(trim(c->>'brand_code'), '') = '' or coalesce(trim(c->>'description'), '') = ''
          or coalesce(c->>'price_cents', '') !~ '^\d{1,9}$' or coalesce(c->>'quantity', '') !~ '^\d{1,5}$'
    ) then
      raise exception 'Each added item needs a brand code, description, price, and whole-number quantity';
    end if;

    delete from public.wholesale_form_lines where form_id = v_id and product_id is null;
    insert into public.wholesale_form_lines (
      form_id, product_id, brand_code, description, unit_type, price_cents, quantity, line_total_cents, sort_order
    )
    select v_id, null, upper(trim(c->>'brand_code')), trim(c->>'description'),
           coalesce(nullif(trim(c->>'unit_type'), ''), 'Bottles'),
           (c->>'price_cents')::integer, (c->>'quantity')::integer,
           (c->>'price_cents')::bigint * (c->>'quantity')::integer, 100000 + n
      from jsonb_array_elements(p_form->'custom_lines') with ordinality as t(c, n);
  end if;

  -- Totals are recomputed from lines by wholesale_forms_before_write.
  update public.wholesale_forms set updated_at = now() where id = v_id;

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

-- Drafts can be deleted by anyone using the module; finalized forms by admins only. Lines cascade.
create policy wholesale_forms_delete on public.wholesale_forms
  for delete to authenticated using (public.can_use_wholesale_forms() and (status = 'draft' or public.is_admin()));
create policy wholesale_form_lines_delete on public.wholesale_form_lines
  for delete to authenticated using (public.can_use_wholesale_forms());

-- ─── Email sends (log) ───────────────────────────────────────────────────────

create table public.wholesale_form_sends (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.wholesale_forms(id) on delete cascade,
  sent_at timestamptz not null default now(),
  sent_by uuid default auth.uid() references public.profiles(id) on delete set null,
  recipients text[] not null check (cardinality(recipients) > 0),
  subject text not null
);
create index wholesale_form_sends_form_idx on public.wholesale_form_sends (form_id, sent_at desc);

alter table public.wholesale_form_sends enable row level security;
revoke all on public.wholesale_form_sends from anon;
create policy wholesale_form_sends_select on public.wholesale_form_sends
  for select to authenticated using (public.can_use_wholesale_forms());
create policy wholesale_form_sends_insert on public.wholesale_form_sends
  for insert to authenticated with check (public.can_use_wholesale_forms() and sent_by = auth.uid());

-- ─── 2026 price list ─────────────────────────────────────────────────────────

insert into public.wholesale_products (brand_code, description, price_cents, active) values
  ('4281B', 'WW Double Double 750 mL',          9400, true),
  ('7000B', 'HBD Barrel Proof Bourbon 750 mL',  5640, true),
  ('7010B', 'HBD Small Batch Bourbon 750 mL',   4230, true),
  ('6938B', 'Statehouse BS Gin 750 mL',         4230, true),
  ('6930B', 'High Bank Vodka 750 mL',           1786, true),
  ('4166B', '614 Vodka 750 mL',                 1410, true),
  ('6624B', 'Midnight Manhattan RTD 750 mL',    3760, false)
on conflict (brand_code) do nothing;

-- Order of the 2026 paper form (inactive 6624B last).
update public.wholesale_products p set sort_order = o.n * 10
  from unnest(array['6928B','6929B','4281B','6930L','6930D','6931B','7000B','6619B','6933B','6934B','6627B',
                    '6938B','6928L','4166L','6930B','4166B','7010B','6628B','6624B']) with ordinality as o(code, n)
 where p.brand_code = o.code;
