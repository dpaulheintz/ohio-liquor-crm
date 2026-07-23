-- Invoice-based prime cost views (Restaurant Dashboard Part 1).
--
-- COGS comes from daily_costs.cogs_total, which reconciles exactly with
-- invoice_summary food + bev + unclassified (unclassified IS included, per the
-- earlier prime-cost fix). Revenue + labor come from daily_sales. A FULL OUTER
-- JOIN ensures a week/month with sales but no invoice delivery (or vice versa)
-- never silently disappears from the series; the missing side COALESCEs to 0.
--
-- Restricted to the restaurant locations that carry MarginEdge costs (PO BOX 21
-- has no daily_costs, so it is excluded to keep revenue and COGS on the same
-- location set). location_id IS NULL = all locations combined.

DROP VIEW IF EXISTS weekly_prime_cost;
CREATE VIEW weekly_prime_cost AS
WITH cost_locs AS (SELECT DISTINCT location_id FROM daily_costs),
ds AS (
  SELECT date_trunc('week', business_date)::date AS wk, location_id,
         SUM(total_revenue) AS revenue, SUM(labor_cost) AS labor
  FROM daily_sales
  WHERE location_id IN (SELECT location_id FROM cost_locs)
  GROUP BY 1, 2
),
dc AS (
  SELECT date_trunc('week', date)::date AS wk, location_id, SUM(cogs_total) AS cogs
  FROM daily_costs GROUP BY 1, 2
),
joined AS (
  SELECT COALESCE(ds.wk, dc.wk) AS week_start,
         COALESCE(ds.location_id, dc.location_id) AS location_id,
         COALESCE(dc.cogs, 0) AS cogs,
         COALESCE(ds.labor, 0) AS labor,
         COALESCE(ds.revenue, 0) AS revenue
  FROM ds FULL OUTER JOIN dc ON ds.wk = dc.wk AND ds.location_id = dc.location_id
),
per_loc AS (
  SELECT week_start, location_id, cogs, labor, revenue FROM joined
),
combined AS (
  SELECT week_start, NULL::uuid AS location_id,
         SUM(cogs) AS cogs, SUM(labor) AS labor, SUM(revenue) AS revenue
  FROM joined GROUP BY week_start
),
u AS (SELECT * FROM per_loc UNION ALL SELECT * FROM combined)
SELECT week_start, location_id,
       ROUND(cogs, 2)    AS weekly_cogs,
       ROUND(labor, 2)   AS weekly_labor,
       ROUND(revenue, 2) AS weekly_revenue,
       CASE WHEN revenue > 0
            THEN ROUND((cogs + labor) / revenue * 100, 1)
            ELSE NULL END AS prime_cost_pct
FROM u;

DROP VIEW IF EXISTS monthly_prime_cost;
CREATE VIEW monthly_prime_cost AS
WITH cost_locs AS (SELECT DISTINCT location_id FROM daily_costs),
ds AS (
  SELECT date_trunc('month', business_date)::date AS mo, location_id,
         SUM(total_revenue) AS revenue, SUM(labor_cost) AS labor
  FROM daily_sales
  WHERE location_id IN (SELECT location_id FROM cost_locs)
  GROUP BY 1, 2
),
dc AS (
  SELECT date_trunc('month', date)::date AS mo, location_id, SUM(cogs_total) AS cogs
  FROM daily_costs GROUP BY 1, 2
),
joined AS (
  SELECT COALESCE(ds.mo, dc.mo) AS month_start,
         COALESCE(ds.location_id, dc.location_id) AS location_id,
         COALESCE(dc.cogs, 0) AS cogs,
         COALESCE(ds.labor, 0) AS labor,
         COALESCE(ds.revenue, 0) AS revenue
  FROM ds FULL OUTER JOIN dc ON ds.mo = dc.mo AND ds.location_id = dc.location_id
),
per_loc AS (
  SELECT month_start, location_id, cogs, labor, revenue FROM joined
),
combined AS (
  SELECT month_start, NULL::uuid AS location_id,
         SUM(cogs) AS cogs, SUM(labor) AS labor, SUM(revenue) AS revenue
  FROM joined GROUP BY month_start
),
u AS (SELECT * FROM per_loc UNION ALL SELECT * FROM combined)
SELECT month_start, location_id,
       ROUND(cogs, 2)    AS monthly_cogs,
       ROUND(labor, 2)   AS monthly_labor,
       ROUND(revenue, 2) AS monthly_revenue,
       CASE WHEN revenue > 0
            THEN ROUND((cogs + labor) / revenue * 100, 1)
            ELSE NULL END AS prime_cost_pct
FROM u;
