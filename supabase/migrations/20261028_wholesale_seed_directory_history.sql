-- Wholesaler directory and order history from the paper forms. Idempotent: wholesalers upsert
-- on account #, and an imported form is skipped if that wholesaler already has an imported form
-- on that date. Lines use the prices printed on the forms (= the current list prices); totals are
-- recomputed in cents by the database, and any difference from the paper goes in the notes.

insert into public.wholesale_customers
  (name, address_line1, city, state, zip, phone, account_type, account_number, customer_id_number, notes, default_warehouse_id)
select v.name, v.addr, v.city, 'OH', v.zip, v.phone, 'wholesale', v.acct, v.acct, v.notes,
       (select id from public.wholesale_warehouses where name = 'Grandview')
  from (values
    ('High Bank Distillery – Grandview (Bar)', '1051 Goodale Blvd', 'Columbus', '43212', '614-826-5347', '3931910',
     E'Internal bar pull\nTypical order: 6928B × 36, 6929B × 6, 6930L × 12, 6931B × 6, 6619B × 6 ($2,368.80) — from an undated paper form, not imported'),
    ('High Bank Distillery – Gahanna', '1379 E Johnstown Road', 'Gahanna', '43230', '614-656-7343', '3931910-0005', 'Internal bar pull'),
    ('High Bank Distillery – Westerville', '28 South State Street', 'Westerville', '43081', '614-380-3130', '3931910-0010', 'Internal bar pull'),
    ('Marcella''s Polaris (CMR LLC)', '1219 Polaris Pkwy', 'Columbus', null, null, '12046700030', 'Verify street # (handwritten 1219 vs 1319) and zip'),
    ('Marcella''s Short North (CMR LLC)', '615 N High St', 'Columbus', null, null, '12046700090', 'Add zip'),
    ('Clock Tower Kitchen & Bar (Around the Clock Hospitality)', '101 S Chillicothe St', 'Plain City', '43064', '614-873-2970', '00257887-1', 'Verify phone (handwritten)'),
    ('JT''s Grandview', '845 Goodale Blvd', 'Grandview Heights', '43212', '614-407-0088', '10006967-1', null)
  ) as v(name, addr, city, zip, phone, acct, notes)
on conflict (account_number) where account_number is not null do update set
  name = excluded.name, address_line1 = excluded.address_line1, city = excluded.city, state = excluded.state,
  zip = excluded.zip, phone = excluded.phone, account_type = excluded.account_type,
  customer_id_number = excluded.customer_id_number, notes = excluded.notes,
  default_warehouse_id = coalesce(public.wholesale_customers.default_warehouse_id, excluded.default_warehouse_id);

do $$
declare
  o record;
  c public.wholesale_customers;
  v_form uuid;
begin
  for o in
    select * from (values
      ('10006967-1',   date '2026-08-30', 'Grandview',   '{"6930L":5,"6928L":18}'::jsonb,
       'Imported from paper form. Line math matches the paper total ($784.90).'),
      ('00257887-1',   date '2026-07-16', 'Grandview',   '{"6928L":6}'::jsonb,
       'Imported from paper form. Line math matches the paper total ($225.60).'),
      ('12046700090',  date '2024-10-02', 'Grandview',   '{"6930L":12}'::jsonb,
       'Imported from paper form. Paper item total said $261.84 (math error); the receipt total $259.44 (12 × $21.62) is correct.'),
      ('12046700030',  date '2024-08-18', 'Grandview',   '{"6930L":24}'::jsonb,
       'Imported from paper form. Year unclear on paper — confirm the sales date. Line math matches the paper total ($518.88).'),
      ('3931910-0005', date '2026-10-27', 'Gahanna',     '{"6928B":36,"6929B":18,"6930L":12,"6930D":12,"6933B":6,"6928L":6}'::jsonb,
       'Imported from paper form. Line math matches the paper total ($3,054.12).'),
      ('3931910-0010', date '2026-10-27', 'Westerville', '{"6928B":30,"6929B":18,"6928L":12,"6930L":12,"6930D":12,"6931B":6,"6619B":6}'::jsonb,
       'Imported from paper form. Paper receipt said $2,851.08: the Whiskey War 1 L line (12 × $37.60 = $451.20) was never extended. Correct total $3,302.28.')
    ) as t(acct, sales_date, warehouse, qty, notes)
  loop
    select * into c from public.wholesale_customers where account_number = o.acct;
    if not found then
      raise exception 'Wholesaler % not found', o.acct;
    end if;
    continue when exists (
      select 1 from public.wholesale_forms
       where customer_id = c.id and sales_date = o.sales_date and source = 'imported_scan');

    -- Inserted as a draft (totals start at 0), lines added, then finalized.
    insert into public.wholesale_forms (
      sales_date, customer_id, recipient_name, recipient_address_line1, recipient_city, recipient_state,
      recipient_zip, recipient_phone, account_type, account_number, customer_id_number, notes, status,
      source, warehouse_id, created_by
    ) values (
      o.sales_date, c.id, c.name, c.address_line1, c.city, c.state, c.zip, c.phone, c.account_type,
      c.account_number, c.customer_id_number, o.notes, 'draft', 'imported_scan',
      (select id from public.wholesale_warehouses where name = o.warehouse), null
    ) returning id into v_form;

    insert into public.wholesale_form_lines (
      form_id, product_id, brand_code, description, unit_type, price_cents, quantity, line_total_cents, sort_order
    )
    select v_form, p.id, p.brand_code, p.description, p.unit_type, p.price_cents,
           coalesce((o.qty->>p.brand_code)::integer, 0),
           p.price_cents::bigint * coalesce((o.qty->>p.brand_code)::integer, 0), p.sort_order
      from public.wholesale_products p
     where p.active;

    if (select count(*) from jsonb_object_keys(o.qty)) <> (
      select count(*) from public.wholesale_form_lines where form_id = v_form and quantity > 0) then
      raise exception 'Imported form for % has a brand code that is not on the active price list', o.acct;
    end if;

    update public.wholesale_forms
       set status = 'final', finalized_at = (o.sales_date + time '12:00') at time zone 'America/New_York'
     where id = v_form;
  end loop;
end $$;
