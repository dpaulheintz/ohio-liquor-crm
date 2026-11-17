-- Forms: "PO Box 21" location + a short Description that goes in the email subject (Mike's requests).
-- PO Box 21 uses Westerville's agency/address/phone but needs its own name for reporting.

-- ─── Description (optional, one line, ≤ 60 chars) ─────────────────────────────
alter table public.wholesale_forms add column description text check (description is null or char_length(description) <= 60);
alter table public.retail_requisitions add column description text check (description is null or char_length(description) <= 60);

-- ─── Retail Requisitions: PO Box 21 location ──────────────────────────────────
alter table public.retail_requisitions drop constraint retail_requisitions_location_check;
alter table public.retail_requisitions add constraint retail_requisitions_location_check
  check (location in ('Grandview', 'Gahanna', 'Westerville', 'PO Box 21'));

-- ─── Wholesale Forms: PO Box 21 warehouse + saved wholesaler ──────────────────
insert into public.wholesale_warehouses (name, label, agency_number, a3a_name, a3a_address, a3a_phone, a3a_email, is_default, sort_order)
select 'PO Box 21', 'PO Box 21', w.agency_number, w.a3a_name, w.a3a_address, w.a3a_phone, w.a3a_email, false, 40
  from public.wholesale_warehouses w where w.name = 'Westerville'
on conflict (name) do nothing;

-- One wholesaler per account # per warehouse (PO Box 21 shares Westerville's 3931910-0010).
drop index if exists public.wholesale_customers_account_number_key;
create unique index wholesale_customers_account_number_key
  on public.wholesale_customers (account_number, default_warehouse_id) where account_number is not null;

insert into public.wholesale_customers (name, address_line1, city, state, zip, phone, account_type, account_number, customer_id_number, default_warehouse_id)
select 'High Bank Distillery – PO Box 21', '28 South State Street', 'Westerville', 'OH', '43081', '614-380-3130', 'wholesale',
       '3931910-0010', '3931910-0010', w.id
  from public.wholesale_warehouses w
 where w.name = 'PO Box 21'
   and not exists (select 1 from public.wholesale_customers c where c.name = 'High Bank Distillery – PO Box 21');

-- ─── Save functions: also store the description ───────────────────────────────
create or replace function public.save_wholesale_form(p_form_id uuid, p_form jsonb, p_quantities jsonb)
 returns uuid
 language plpgsql
 set search_path to 'public'
as $function$
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
      customer_id_number, notes, status, warehouse_id, description
    ) values (
      (p_form->>'sales_date')::date, nullif(p_form->>'customer_id', '')::uuid,
      nullif(trim(p_form->>'recipient_name'), ''), nullif(trim(p_form->>'recipient_address_line1'), ''),
      nullif(trim(p_form->>'recipient_city'), ''), nullif(trim(p_form->>'recipient_state'), ''),
      nullif(trim(p_form->>'recipient_zip'), ''), nullif(trim(p_form->>'recipient_phone'), ''),
      coalesce(nullif(p_form->>'account_type', ''), 'wholesale'), nullif(trim(p_form->>'account_number'), ''),
      nullif(trim(p_form->>'customer_id_number'), ''), nullif(trim(p_form->>'notes'), ''), 'draft', v_warehouse,
      nullif(trim(p_form->>'description'), '')
    )
    returning id into v_id;

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
      description = nullif(trim(p_form->>'description'), ''),
      warehouse_id = coalesce(v_warehouse, warehouse_id)
    where id = v_id;

    update public.wholesale_form_lines l set
      quantity = q.qty,
      line_total_cents = l.price_cents::bigint * q.qty
      from (select l2.id, coalesce((p_quantities->>l2.product_id::text)::integer, 0) as qty
              from public.wholesale_form_lines l2
             where l2.form_id = v_id and l2.product_id is not null) q
     where l.id = q.id;

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
$function$;

create or replace function public.save_retail_requisition(p_id uuid, p_req jsonb, p_quantities jsonb, p_custom jsonb)
 returns uuid
 language plpgsql
 set search_path to 'public'
as $function$
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
    insert into public.retail_requisitions (location, purpose, req_date, status, notes, description)
    values (p_req->>'location', p_req->>'purpose', (p_req->>'req_date')::date, p_req->>'status', nullif(btrim(p_req->>'notes'), ''),
            nullif(btrim(p_req->>'description'), ''))
    returning id into v_id;
  else
    update public.retail_requisitions set
      location = p_req->>'location',
      purpose = p_req->>'purpose',
      req_date = (p_req->>'req_date')::date,
      status = p_req->>'status',
      notes = nullif(btrim(p_req->>'notes'), ''),
      description = nullif(btrim(p_req->>'description'), '')
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
end $function$;
