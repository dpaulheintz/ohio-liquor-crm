-- Sales Dashboard: stop get_dashboard_data() timing out.
--
-- The dashboard fetches everything in one RPC. As months were added the result grew to 9.5 MB and the
-- call took ~3 s alone (more under load), against the 8 s statement_timeout that PostgREST applies to
-- signed-in users. After the October 2026 load it was cancelled ("canceling statement due to statement
-- timeout") and the page threw a server error.
--
-- 70% of the payload was agency_sku_monthly (26k objects, each repeating ten key names plus the SKU and
-- agency names). It is now sent as dictionaries + positional rows:
--   { "skus":     [[brand_code, product_name, brand_family, size], ...],
--     "agencies": [[agency_id, agency_name], ...],
--     "rows":     [[month, sku_idx, agency_idx, is_hb_agency, retail_bottles, retail_amount], ...] }
-- The values are identical (decoded in src/app/actions/sales-dashboard.ts); only the encoding changes.
-- Every other key is unchanged. Result: ~6.8 MB -> ~1.0 MB for that block, ~9.5 MB -> ~3.8 MB overall.

create or replace function public.get_dashboard_data()
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
begin
  return jsonb_build_object(
    'monthly', (
      select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb)
      from (
        select month, brand_family,
          sum(retail_bottles)::int as retail_bottles, sum(retail_amount) as retail_amount,
          sum(wholesale_bottles)::int as wholesale_bottles, sum(wholesale_amount) as wholesale_amount
        from sales_monthly group by month, brand_family order by month
      ) t
    ),
    'sku_monthly', (
      select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb)
      from (
        select month, brand_code, max(product_name) as product_name, max(brand_family) as brand_family,
          max(size) as size, sum(retail_bottles)::int as retail_bottles, sum(retail_amount) as retail_amount,
          sum(wholesale_bottles)::int as wholesale_bottles, sum(wholesale_amount) as wholesale_amount
        from sales_monthly group by month, brand_code order by month
      ) t
    ),
    'split_rows', (
      select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb)
      from (
        select month, brand_family, product_name, is_hb_agency, hb_location,
          sum(retail_bottles)::int as retail_bottles, sum(retail_amount) as retail_amount,
          sum(wholesale_bottles)::int as wholesale_bottles, sum(wholesale_amount) as wholesale_amount
        from sales_monthly group by month, brand_family, product_name, is_hb_agency, hb_location order by month
      ) t
    ),
    'wholesale', (
      select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb)
      from (
        select month, agency_id, agency_name, brand_code, brand_family, product_name,
          size, wholesaler_name, dba, bottles_sold, amount
        from wholesale_detail
        where not is_hb_transient
        order by month
      ) t
    ),
    'account_groups', (
      select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb)
      from (
        select id, group_name, match_terms, match_columns, color, is_brewery
        from account_groups order by group_name
      ) t
    ),
    'agency_sku_monthly', (
      with agency_rows as (
        select month, brand_code, product_name, brand_family, size, agency_id, agency_name,
          bool_or(is_hb_agency) as is_hb_agency,
          sum(retail_bottles)::int as retail_bottles, sum(retail_amount) as retail_amount
        from sales_monthly
        where retail_bottles > 0
        group by month, brand_code, product_name, brand_family, size, agency_id, agency_name
      ), ranked as (
        select month, is_hb_agency, retail_bottles, retail_amount,
          brand_code, product_name, brand_family, size, agency_id, agency_name,
          dense_rank() over (order by brand_code, product_name, brand_family, size) - 1 as s,
          dense_rank() over (order by agency_id, agency_name) - 1 as a
        from agency_rows
      )
      select jsonb_build_object(
        'skus', (
          select coalesce(jsonb_agg(jsonb_build_array(brand_code, product_name, brand_family, size) order by s), '[]'::jsonb)
          from (select distinct on (s) s, brand_code, product_name, brand_family, size from ranked order by s) d
        ),
        'agencies', (
          select coalesce(jsonb_agg(jsonb_build_array(agency_id, agency_name) order by a), '[]'::jsonb)
          from (select distinct on (a) a, agency_id, agency_name from ranked order by a) d
        ),
        'rows', (
          select coalesce(jsonb_agg(jsonb_build_array(month, s, a, is_hb_agency, retail_bottles, retail_amount) order by month), '[]'::jsonb)
          from ranked
        )
      )
    ),
    'wholesale_monthly_split', (
      select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb)
      from (
        select
          month,
          sum(case when is_hb_transient then amount else 0 end) as hb_amount,
          sum(case when is_hb_transient then bottles_sold else 0 end)::int as hb_bottles,
          sum(case when not is_hb_transient then amount else 0 end) as outside_amount,
          sum(case when not is_hb_transient then bottles_sold else 0 end)::int as outside_bottles
        from wholesale_detail
        group by month
        order by month
      ) t
    )
  );
end;
$function$;

-- Same access as before (anon has no access; signed-in users and the service role can call it).
revoke execute on function public.get_dashboard_data() from public, anon;
grant execute on function public.get_dashboard_data() to authenticated, service_role;
