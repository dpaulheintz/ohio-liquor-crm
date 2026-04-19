alter table public.visit_logs
  add column if not exists kpi_quantity integer
  check (kpi_quantity is null or (kpi_quantity >= 1 and kpi_quantity <= 99));
