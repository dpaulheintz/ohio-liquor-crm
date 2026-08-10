-- TRANSIENT account resolution for wholesale data.
--
-- When High Bank's own agency sells to an outside account, Ohio's export puts
-- 'HIGH BANK DISTILLERY LLC TRANSIENT' in wholesaler_name and the real customer
-- in dba. Matching on wholesaler_name alone therefore hid those sales or lumped
-- them under High Bank (1,258 of 7,223 rows across all history).
--
-- Resolution happens in a VIEW so the raw table is never mutated and
-- re-ingestion stays idempotent.

DROP VIEW IF EXISTS wholesale_detail_resolved;

CREATE VIEW wholesale_detail_resolved AS
WITH resolved AS (
  SELECT wd.*,
         CASE
           WHEN wd.wholesaler_name ILIKE '%TRANSIENT%'
             THEN COALESCE(NULLIF(TRIM(wd.dba), ''), TRIM(wd.wholesaler_name))
           WHEN COALESCE(TRIM(wd.wholesaler_name), '') <> ''
             THEN TRIM(wd.wholesaler_name)
           ELSE COALESCE(NULLIF(TRIM(wd.dba), ''), 'Unknown Account')
         END AS effective_account_name,
         (wd.wholesaler_name ILIKE '%TRANSIENT%') AS is_transient
  FROM wholesale_detail wd
)
-- is_high_bank derives from the RESOLVED name, not a raw OR across both columns.
-- The old rule (wholesaler ILIKE '%HIGH BANK%' OR dba ILIKE '%HIGH BANK%') marked
-- every transient row as an HB sale because the transient string itself contains
-- 'HIGH BANK'. Resolving first fixes both directions:
--   transient + dba 'DBA HIGH BANK DISTILLERY' -> still HB
--   transient + dba 'Columbus Zoo'             -> external (the fix)
SELECT r.*, (r.effective_account_name ILIKE '%HIGH BANK%') AS is_high_bank
FROM resolved r;

COMMENT ON VIEW wholesale_detail_resolved IS
  'wholesale_detail plus effective_account_name (TRANSIENT rows resolve to dba), '
  'is_transient, and is_high_bank derived from the RESOLVED name. Raw table never mutated.';

-- Allow account groups to match on the resolved name; default for NEW groups.
-- Existing rows keep whatever match_columns they already have.
ALTER TABLE account_groups DROP CONSTRAINT IF EXISTS account_groups_match_columns_check;
ALTER TABLE account_groups ADD CONSTRAINT account_groups_match_columns_check
  CHECK (match_columns = ANY (ARRAY['wholesaler'::text, 'dba'::text, 'both'::text, 'effective'::text]));
ALTER TABLE account_groups ALTER COLUMN match_columns SET DEFAULT 'effective';

-- Warped Wing already existed as a group ('Warped Wing', match_columns 'both').
-- Updated in place rather than creating a duplicate that would match the same
-- rows ambiguously.
UPDATE account_groups
SET group_name = 'Warped Wing Brewing', match_columns = 'effective'
WHERE match_terms @> ARRAY['warped wing'] AND group_name <> 'Warped Wing Brewing';
