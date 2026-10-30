-- Wholesale Forms: the wholesaler decides the warehouse. Only our own Gahanna and Westerville
-- locations ship from those warehouses; everyone else is Grandview. Past forms keep their own
-- warehouse_id and settings_snapshot, so they are not touched.

update public.wholesale_customers c
   set default_warehouse_id = w.id
  from public.wholesale_warehouses w
 where w.name = case c.account_number
                  when '3931910-0005' then 'Gahanna'
                  when '3931910-0010' then 'Westerville'
                  else 'Grandview'
                end;

-- New wholesalers default to Grandview (the default warehouse), however they are created.
create or replace function public.wholesale_customers_default_warehouse()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.default_warehouse_id is null then
    select id into new.default_warehouse_id from public.wholesale_warehouses where is_default limit 1;
  end if;
  return new;
end $$;
revoke execute on function public.wholesale_customers_default_warehouse() from public, anon, authenticated;

create trigger wholesale_customers_default_warehouse
  before insert on public.wholesale_customers
  for each row execute function public.wholesale_customers_default_warehouse();
