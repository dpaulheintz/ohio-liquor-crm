-- Add unclassified_invoices to invoice_summary so total_invoices always
-- reconciles as food_invoices + bev_invoices + unclassified_invoices.
-- "Unclassified" = invoices whose vendor name didn't match the food/bev
-- keyword classifier; per business decision, unclassified spend is treated
-- as food-equivalent cost in the prime-cost calculation (safest assumption —
-- unclassified is overwhelmingly food/bev, not true non-COGS overhead).
ALTER TABLE invoice_summary ADD COLUMN unclassified_invoices numeric;
