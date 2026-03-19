-- Add new columns to accounts table for agency/wholesale enhancements
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS delivery_day TEXT;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS warehouse TEXT;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS linked_agency_name TEXT;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS linked_agency_id TEXT;

-- Add KPI column to visit_logs table
ALTER TABLE visit_logs ADD COLUMN IF NOT EXISTS kpi TEXT;
