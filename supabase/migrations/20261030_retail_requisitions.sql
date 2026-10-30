-- Retail Requisitions: replaces the paper "HBD Retail Requisition" sheet. No prices.
-- Access: admins, plus users whose visible_pages include '/admin/retail-requisitions' (the distillery account).

create or replace function public.can_use_retail_requisitions()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select role = 'admin' or '/admin/retail-requisitions' = any(coalesce(visible_pages, '{}'))
     from profiles where id = auth.uid()),
    false
  );
$$;
revoke execute on function public.can_use_retail_requisitions() from public, anon;
grant execute on function public.can_use_retail_requisitions() to authenticated;

update public.profiles
   set visible_pages = array_append(visible_pages, '/admin/retail-requisitions')
 where email = 'distillery@highbankco.com'
   and visible_pages is not null
   and not ('/admin/retail-requisitions' = any(visible_pages));

-- ─── Tables ───────────────────────────────────────────────────────────────────

create table public.retail_req_products (
  id uuid primary key default gen_random_uuid(),
  sku text not null unique check (sku = upper(btrim(sku)) and sku <> ''),
  description text not null check (btrim(description) <> ''),
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.retail_requisitions (
  id uuid primary key default gen_random_uuid(),
  location text not null check (location in ('Grandview', 'Gahanna', 'Westerville')),
  purpose text not null check (purpose in ('Sales', 'Batch', 'Bar', 'Retail')),
  req_date date not null,
  status text not null default 'draft' check (status in ('draft', 'final')),
  requested_by uuid default auth.uid() references public.profiles(id) on delete set null,
  notes text,
  sent_at timestamptz,
  sent_by uuid references public.profiles(id) on delete set null,
  sent_to text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index retail_requisitions_repeat_idx on public.retail_requisitions (location, purpose, req_date desc, created_at desc);

create table public.retail_requisition_lines (
  id uuid primary key default gen_random_uuid(),
  requisition_id uuid not null references public.retail_requisitions(id) on delete cascade,
  product_id uuid references public.retail_req_products(id) on delete set null, -- null = custom line
  sku text not null check (btrim(sku) <> ''),
  description text not null check (btrim(description) <> ''),
  quantity integer not null check (quantity > 0 and quantity <= 99999),
  sort_order integer not null default 0
);
create index retail_requisition_lines_req_idx on public.retail_requisition_lines (requisition_id, sort_order);

-- Every email, including resends. retail_requisitions.sent_* holds the latest one.
create table public.retail_requisition_sends (
  id uuid primary key default gen_random_uuid(),
  requisition_id uuid not null references public.retail_requisitions(id) on delete cascade,
  sent_at timestamptz not null default now(),
  sent_by uuid default auth.uid() references public.profiles(id) on delete set null,
  recipients text[] not null check (cardinality(recipients) > 0),
  subject text not null
);
create index retail_requisition_sends_req_idx on public.retail_requisition_sends (requisition_id, sent_at desc);

-- ─── Triggers ─────────────────────────────────────────────────────────────────

create or replace function public.retail_req_touch()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end $$;
create trigger retail_req_products_touch before update on public.retail_req_products
  for each row execute function public.retail_req_touch();

-- requested_by is always the signed-in user who created it.
create or replace function public.retail_requisitions_before_write()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.requested_by := coalesce(auth.uid(), new.requested_by);
  else
    new.requested_by := old.requested_by;
    new.updated_at := now();
  end if;
  return new;
end $$;
create trigger retail_requisitions_before_write before insert or update on public.retail_requisitions
  for each row execute function public.retail_requisitions_before_write();

-- A finalized requisition must have at least one item. Checked at commit, so saving can replace the lines.
create or replace function public.retail_requisitions_require_items()
returns trigger language plpgsql set search_path = public as $$
declare
  v_id uuid;
begin
  if tg_table_name = 'retail_requisitions' then
    v_id := new.id;
  else
    v_id := old.requisition_id;
  end if;
  if exists (select 1 from public.retail_requisitions where id = v_id and status = 'final')
     and not exists (select 1 from public.retail_requisition_lines where requisition_id = v_id) then
    raise exception 'retail_requisition_final_needs_items';
  end if;
  return null;
end $$;
create constraint trigger retail_requisitions_final_items
  after insert or update on public.retail_requisitions
  deferrable initially deferred
  for each row execute function public.retail_requisitions_require_items();
create constraint trigger retail_requisition_lines_final_items
  after delete on public.retail_requisition_lines
  deferrable initially deferred
  for each row execute function public.retail_requisitions_require_items();

-- ─── RLS ──────────────────────────────────────────────────────────────────────

alter table public.retail_req_products enable row level security;
alter table public.retail_requisitions enable row level security;
alter table public.retail_requisition_lines enable row level security;
alter table public.retail_requisition_sends enable row level security;

revoke all on public.retail_req_products, public.retail_requisitions, public.retail_requisition_lines, public.retail_requisition_sends from anon;

create policy retail_req_products_select on public.retail_req_products
  for select to authenticated using (public.can_use_retail_requisitions());
create policy retail_req_products_insert on public.retail_req_products
  for insert to authenticated with check (public.is_admin());
create policy retail_req_products_update on public.retail_req_products
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy retail_requisitions_select on public.retail_requisitions
  for select to authenticated using (public.can_use_retail_requisitions());
create policy retail_requisitions_insert on public.retail_requisitions
  for insert to authenticated with check (public.can_use_retail_requisitions());
create policy retail_requisitions_update on public.retail_requisitions
  for update to authenticated using (public.can_use_retail_requisitions()) with check (public.can_use_retail_requisitions());
-- Drafts can be deleted by anyone using the module; finalized requisitions by admins only. Lines cascade.
create policy retail_requisitions_delete on public.retail_requisitions
  for delete to authenticated using (public.can_use_retail_requisitions() and (status = 'draft' or public.is_admin()));

create policy retail_requisition_lines_select on public.retail_requisition_lines
  for select to authenticated using (public.can_use_retail_requisitions());
create policy retail_requisition_lines_insert on public.retail_requisition_lines
  for insert to authenticated with check (public.can_use_retail_requisitions());
create policy retail_requisition_lines_update on public.retail_requisition_lines
  for update to authenticated using (public.can_use_retail_requisitions()) with check (public.can_use_retail_requisitions());
create policy retail_requisition_lines_delete on public.retail_requisition_lines
  for delete to authenticated using (public.can_use_retail_requisitions());

create policy retail_requisition_sends_select on public.retail_requisition_sends
  for select to authenticated using (public.can_use_retail_requisitions());
create policy retail_requisition_sends_insert on public.retail_requisition_sends
  for insert to authenticated with check (public.can_use_retail_requisitions() and sent_by = auth.uid());

-- Send uses the same recipient list as Wholesale Forms (Wholesale Forms → Settings).
create policy wholesale_settings_select_retail on public.wholesale_form_settings
  for select to authenticated using (public.can_use_retail_requisitions());

-- ─── Save (header + lines in one transaction) ─────────────────────────────────

-- p_req: { status, location, purpose, req_date, notes }
-- p_quantities: { product_id: quantity }
-- p_custom: [{ sku, description, quantity, save_to_list }]
create or replace function public.save_retail_requisition(p_id uuid, p_req jsonb, p_quantities jsonb, p_custom jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
  v_custom jsonb;
  v_sku text;
  v_description text;
  v_qty integer;
  v_product public.retail_req_products;
  v_product_id uuid;
  v_sort integer := 100000;
begin
  if not public.can_use_retail_requisitions() then
    raise exception 'Not authorized';
  end if;

  if p_id is null then
    insert into public.retail_requisitions (location, purpose, req_date, status, notes)
    values (p_req->>'location', p_req->>'purpose', (p_req->>'req_date')::date, p_req->>'status', nullif(btrim(p_req->>'notes'), ''))
    returning id into v_id;
  else
    update public.retail_requisitions set
      location = p_req->>'location',
      purpose = p_req->>'purpose',
      req_date = (p_req->>'req_date')::date,
      status = p_req->>'status',
      notes = nullif(btrim(p_req->>'notes'), '')
    where id = p_id
    returning id into v_id;
    if v_id is null then
      raise exception 'Requisition not found';
    end if;
    delete from public.retail_requisition_lines where requisition_id = v_id;
  end if;

  insert into public.retail_requisition_lines (requisition_id, product_id, sku, description, quantity, sort_order)
  select v_id, p.id, p.sku, p.description, q.value::integer, p.sort_order
    from jsonb_each_text(coalesce(p_quantities, '{}'::jsonb)) q
    join public.retail_req_products p on p.id = q.key::uuid and p.active
   where q.value::integer > 0;
  if (select count(*) from jsonb_each_text(coalesce(p_quantities, '{}'::jsonb)) q where q.value::integer > 0)
     <> (select count(*) from public.retail_requisition_lines where requisition_id = v_id) then
    raise exception 'An item on this requisition is no longer on the SKU list. Reload and try again.';
  end if;

  for v_custom in select value from jsonb_array_elements(coalesce(p_custom, '[]'::jsonb)) loop
    v_sku := upper(btrim(v_custom->>'sku'));
    v_description := btrim(v_custom->>'description');
    v_qty := (v_custom->>'quantity')::integer;
    v_sort := v_sort + 1;
    v_product_id := null;

    select * into v_product from public.retail_req_products where sku = v_sku;
    if found and v_product.active then
      raise exception 'SKU % is already on the list — enter its quantity on that row.', v_sku;
    end if;

    if coalesce((v_custom->>'save_to_list')::boolean, false) then
      if not public.is_admin() then
        raise exception 'Only admins can add items to the SKU list.';
      end if;
      if v_product.id is not null then
        update public.retail_req_products set active = true, description = v_description where id = v_product.id;
        v_product_id := v_product.id;
      else
        insert into public.retail_req_products (sku, description, sort_order)
        values (v_sku, v_description, (select coalesce(max(sort_order), 0) + 1 from public.retail_req_products))
        returning id into v_product_id;
      end if;
    end if;

    insert into public.retail_requisition_lines (requisition_id, product_id, sku, description, quantity, sort_order)
    values (v_id, v_product_id, v_sku, v_description, v_qty, v_sort);
  end loop;

  return v_id;
end $$;
revoke execute on function public.save_retail_requisition(uuid, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.save_retail_requisition(uuid, jsonb, jsonb, jsonb) to authenticated;

-- ─── SKU list, in the paper form's order ──────────────────────────────────────

insert into public.retail_req_products (sku, description, sort_order) values
  ('4166B', '614 Vodka 750 mL', 1),
  ('4166L', '614 Vodka 1 L', 2),
  ('4280B', 'Single Barrel Double Oaked 750 mL', 3),
  ('4281B', 'Double Double Oaked 750 mL', 4),
  ('6619B', 'Midnight Cask Barrel Proof 750 mL', 5),
  ('6624B', 'Midnight Manhattan 750 mL', 6),
  ('6627B', 'Cigar Cask 750 mL', 7),
  ('6628B', 'Old Fashioned 750 mL', 8),
  ('6928B', 'Whiskey War 750 mL', 9),
  ('6929B', 'Statehouse Gin 750 mL', 10),
  ('6930B', 'High Bank Vodka 750 mL', 11),
  ('6930D', 'High Bank Vodka 1.75L', 12),
  ('6930L', 'High Bank Vodka 1L', 13),
  ('6931B', 'Whiskey War Barrel Proof 750 mL', 14),
  ('6933B', 'Double Oaked 750 mL', 15),
  ('6934B', 'Barrel Select 750 mL', 16),
  ('6935B', 'Master Blend 750 mL', 17),
  ('6938B', 'Barrel Select Gin 750 mL', 18),
  ('7000B', 'HB Bourbon BP 750 mL', 19),
  ('7010B', 'HB Bourbon 750 mL', 20),
  ('6928L', 'Whiskey War 1 L', 21),
  ('6619H', 'Midnight Cask BP 200 mL', 22),
  ('6928H', 'Whiskey War 200 mL', 23),
  ('6929H', 'Statehouse Gin 200 mL', 24),
  ('6930H', 'High Bank Vodka 200 mL', 25),
  ('6931H', 'Whiskey War Barrel Proof 200 mL', 26),
  ('6933H', 'Double Oaked 200 mL', 27),
  ('6936H', 'Premium Whiskey Trio 3x200 mL', 28);
