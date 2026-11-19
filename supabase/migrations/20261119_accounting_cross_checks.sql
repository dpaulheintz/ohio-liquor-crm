-- Accounting cross-check sources: monthly Toast F&B revenue per location and Bottle Sales "paid to us",
-- summarised for accounting users only (daily_sales is admin-only and bottle_sales has its own allowlist).
create or replace function public.fin_cross_check_sources(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.has_accounting_access() then raise exception 'Not authorized'; end if;
  return jsonb_build_object(
    'toast', coalesce((
      select jsonb_agg(jsonb_build_object('location_id', location_id, 'period', period, 'fnb', fnb, 'days', days) order by period)
        from (select d.location_id, date_trunc('month', d.business_date)::date as period,
                     sum(d.fnb_revenue)::numeric(14,2) as fnb, count(distinct d.business_date) as days
                from public.daily_sales d
               where d.business_date >= p_from and d.business_date < (p_to + interval '1 month')
               group by 1, 2) t), '[]'),
    'bottles', coalesce((
      select jsonb_agg(jsonb_build_object('period', period, 'paid', paid, 'entries', entries) order by period)
        from (select date_trunc('month', b.sale_date)::date as period, sum(b.paid_amount)::numeric(14,2) as paid, count(*) as entries
                from public.bottle_sales b
               where b.sale_date >= p_from and b.sale_date < (p_to + interval '1 month')
               group by 1) t), '[]'));
end $$;
revoke execute on function public.fin_cross_check_sources(date, date) from public, anon, service_role;
grant execute on function public.fin_cross_check_sources(date, date) to authenticated;

insert into public.fin_settings (key, value)
values ('cross_checks', '{"sales_gls": ["4100", "4105"], "dsp_entity": "DSP", "dsp_gl": "4301"}')
on conflict (key) do nothing;
