-- Bottle Sales: agency number + GL sales account per location (accounting posts entries per location).
-- Westerville and PO Box 21 share agency 90286 / GL 4322 on purpose.

alter table public.bottle_locations
  add column agency_number text check (agency_number ~ '^[0-9]{4,6}$'),
  add column gl_account text check (gl_account ~ '^[0-9]{3,8}$'),
  add column updated_at timestamptz,
  add column updated_by uuid references public.profiles(id);

update public.bottle_locations set agency_number = '30174', gl_account = '4323' where code = 'GV';
update public.bottle_locations set agency_number = '90394', gl_account = '4324' where code = 'GH';
update public.bottle_locations set agency_number = '90286', gl_account = '4322' where code = 'WV';
update public.bottle_locations set agency_number = '90286', gl_account = '4322' where code = 'PO';

-- Who may edit them: Bottle Sales users who are admins, or accounting@ (today: Paul + accounting).
create or replace function public.bottle_sales_can_edit_locations()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.bottle_sales_can_use() and (
    public.is_admin()
    or coalesce((select lower(email) = 'accounting@highbankco.com' from public.profiles where id = auth.uid()), false));
$$;

create or replace function public.bottle_sales_update_location(p_code text, p_agency_number text, p_gl_account text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.bottle_sales_can_edit_locations() then raise exception 'Not authorized'; end if;
  if coalesce(trim(p_agency_number), '') !~ '^[0-9]{4,6}$' then raise exception 'Agency # must be 4–6 digits'; end if;
  if coalesce(trim(p_gl_account), '') !~ '^[0-9]{3,8}$' then raise exception 'GL account must be 3–8 digits'; end if;
  update public.bottle_locations
     set agency_number = trim(p_agency_number), gl_account = trim(p_gl_account), updated_at = now(), updated_by = auth.uid()
   where code = p_code;
  if not found then raise exception 'Unknown location %', p_code; end if;
end $$;

revoke execute on function public.bottle_sales_can_edit_locations() from public, anon;
revoke execute on function public.bottle_sales_update_location(text, text, text) from public, anon;
grant execute on function public.bottle_sales_can_edit_locations() to authenticated;
grant execute on function public.bottle_sales_update_location(text, text, text) to authenticated;
