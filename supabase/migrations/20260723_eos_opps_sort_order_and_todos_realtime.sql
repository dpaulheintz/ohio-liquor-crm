-- Opportunities drag-to-reorder: persisted ordering column.
ALTER TABLE eos_opportunities ADD COLUMN IF NOT EXISTS sort_order integer;

-- Backfill existing rows by creation order so the initial order is stable.
WITH ordered AS (
  SELECT id, row_number() OVER (ORDER BY created_at) AS rn FROM eos_opportunities
)
UPDATE eos_opportunities e
SET sort_order = o.rn
FROM ordered o
WHERE e.id = o.id AND e.sort_order IS NULL;

-- Real-time To-Dos in the meeting runner. FULL replica identity so UPDATE/DELETE
-- events carry enough row data; add the table to the realtime publication if it
-- isn't already a member.
ALTER TABLE eos_todos REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public' AND tablename = 'eos_todos'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE eos_todos;
  END IF;
END $$;
