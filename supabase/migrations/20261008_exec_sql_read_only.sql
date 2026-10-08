-- exec_sql was executable by anon/authenticated (Supabase grants EXECUTE to those
-- roles directly, so the original REVOKE ... FROM PUBLIC had no effect), and its
-- EXECUTE accepted multiple statements, allowing arbitrary writes as the owner.

create or replace function public.exec_sql(query_text text)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  result json;
begin
  -- Read-only for the rest of this transaction: injected statements
  -- (e.g. "...) t; drop table x; ...") and writing functions fail.
  -- Postgres refuses to switch back to read-write once a query has run.
  set local transaction_read_only = on;

  execute format('SELECT json_agg(t) FROM (%s) AS t', query_text)
    into result;
  return coalesce(result, '[]'::json);
end;
$function$;

revoke all on function public.exec_sql(text) from public, anon, authenticated;
grant execute on function public.exec_sql(text) to service_role;
