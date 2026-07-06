-- =============================================
-- MarginEdge cost integration tables
-- Populated by /api/sync-marginedge from the MarginEdge public API.
-- NOTE: the public API exposes invoice (purchase) data, not computed COGS.
-- daily_costs therefore holds a PURCHASE-BASED PROXY, not true COGS.
-- =============================================

-- Table 1: daily_costs — per-day purchase-based cost proxy
CREATE TABLE daily_costs (
  id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  location_id    uuid NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  date           date NOT NULL,
  food_cost      numeric,           -- invoice purchases allocated to the day (food+bev)
  food_cost_pct  numeric,           -- food_cost as % of that day's revenue
  cogs_total     numeric,           -- total purchases for the day (proxy for COGS)
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (location_id, date)
);

ALTER TABLE daily_costs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins_all_daily_costs" ON daily_costs
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE INDEX idx_daily_costs_location_date ON daily_costs (location_id, date);

-- Table 2: invoice_summary — per-month invoice spend, split food vs beverage
CREATE TABLE invoice_summary (
  id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  location_id    uuid NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  month          text NOT NULL,     -- 'YYYY-MM'
  total_invoices numeric,
  food_invoices  numeric,
  bev_invoices   numeric,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (location_id, month)
);

ALTER TABLE invoice_summary ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins_all_invoice_summary" ON invoice_summary
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE INDEX idx_invoice_summary_location_month ON invoice_summary (location_id, month);
