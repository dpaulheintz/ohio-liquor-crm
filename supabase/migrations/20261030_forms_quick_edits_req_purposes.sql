-- Retail Requisitions: only Sales and Retail. The one Bar requisition created before this change
-- keeps its purpose as requested, so the check exempts rows created up to that moment. A plain
-- NOT VALID constraint would not do: it would block every later update to that row, including
-- logging a resend. Once that row is reclassified or deleted, drop the created_at clause.
alter table public.retail_requisitions drop constraint retail_requisitions_purpose_check;
alter table public.retail_requisitions add constraint retail_requisitions_purpose_check
  check (purpose in ('Sales', 'Retail') or created_at <= timestamptz '2026-10-30 14:05:25.647046+00');
