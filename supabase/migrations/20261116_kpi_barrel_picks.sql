-- KPI type "Barrel Pick": a rep logs a barrel pick on a visit like any other KPI.
-- Payout depends on the barrel type (rates live in src/lib/kpi-payouts.ts and the iOS app):
--   Barrel Select / Cigar Cask / Double Double Oaked → $500 full, $250 half
--   Double Oaked                                    → $300 full, $150 half
-- Sold/Unsold doesn't apply; the existing visit_kpis_default_sold_status trigger fills 'sold'.
-- This is only the rep's KPI — nothing is created in the Barrel Picks module.

alter table public.visit_kpis drop constraint visit_kpis_kpi_type_check;
alter table public.visit_kpis add constraint visit_kpis_kpi_type_check
  check (kpi_type in ('Display', 'Menu', 'Feature', 'Event', 'Barrel Pick'));

alter table public.visit_kpis
  add column barrel_type text
    constraint visit_kpis_barrel_type_check
    check (barrel_type is null or barrel_type in ('Barrel Select', 'Cigar Cask', 'Double Double Oaked', 'Double Oaked')),
  add column is_half_barrel boolean not null default false;

-- A Barrel Pick must say which barrel; other KPI types never carry barrel fields.
alter table public.visit_kpis add constraint visit_kpis_barrel_pick_fields_check
  check (
    case when kpi_type = 'Barrel Pick'
      then barrel_type is not null
      else barrel_type is null and is_half_barrel = false
    end
  );

comment on column public.visit_kpis.barrel_type is
  'Barrel Pick KPIs only: Barrel Select | Cigar Cask | Double Double Oaked | Double Oaked (required when kpi_type = ''Barrel Pick'').';
comment on column public.visit_kpis.is_half_barrel is
  'Barrel Pick KPIs only: true = half barrel, paid at half the full-barrel rate.';
