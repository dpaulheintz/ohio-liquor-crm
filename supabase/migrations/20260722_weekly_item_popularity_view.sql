-- Per-week, per-location, per-item quantity + revenue, for the Restaurant
-- Dashboard Fun Facts "Most Popular Item" metric. Aggregated server-side so the
-- dashboard only pulls the handful of rows for the week it needs (filter on
-- week_start).
CREATE OR REPLACE VIEW weekly_item_popularity AS
SELECT date_trunc('week', dis.business_date)::date AS week_start,
       dis.location_id,
       mi.name AS item_name,
       SUM(dis.quantity_sold)  AS qty,
       SUM(dis.gross_revenue)  AS revenue
FROM daily_item_sales dis
JOIN menu_items mi ON mi.id = dis.menu_item_id
WHERE mi.name IS NOT NULL AND mi.name <> ''
GROUP BY 1, 2, 3;
