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

-- ─── Account groups (reviewed and approved 2026-08-10) ───────────────────────
-- New groups consolidating TRANSIENT dba variants (typos, address suffixes and
-- casing differences all collapse via partial ILIKE matching on the resolved name).
INSERT INTO account_groups (group_name, match_terms, match_columns, color, is_brewery)
VALUES
  ('Greater Columbus Arts Council',        ARRAY['greater columbus arts'],                                        'effective', '#4f46e5', false),
  ('Marcella''s',                          ARRAY['marcella'],                                                     'effective', '#059669', false),
  ('The Derby',                            ARRAY['derby'],                                                        'effective', '#ca8a04', false),
  ('Barrel Room',                          ARRAY['barrel room'],                                                  'effective', '#db2777', false),
  ('Columbus Zoo',                         ARRAY['columbus zoo'],                                                 'effective', '#2563eb', false),
  ('Pelotonia',                            ARRAY['peletonia','pelotonia'],                                        'effective', '#16a34a', false),
  ('Gahanna Convention & Visitors Bureau', ARRAY['gahanna convention'],                                           'effective', '#9f1239', false),
  ('North Canton Chamber of Commerce',     ARRAY['canton chamber','canton area chamber'],                         'effective', '#7c2d12', false),
  ('Franklin Park Conservatory',           ARRAY['franklin park'],                                                'effective', '#1d4ed8', false),
  ('Columbus Metropolitan Library',        ARRAY['columbus metropolitan library','columbus library book festival'],'effective','#4d7c0f', false)
ON CONFLICT DO NOTHING;

-- Switch every existing group to 'effective' EXCEPT Elliot's.
-- Elliot's trades under holding-company wholesaler names (MJ SARAP, SARAGER LLC,
-- RAMM PARTNERSHIP) with the brand only in the dba — a NON-transient dba-identity
-- pattern that effective_account_name does not cover. Switching it would drop 229
-- rows / ~$55k. Verified it already captures all 4 of its transient rows via 'both'.
UPDATE account_groups SET match_columns = 'effective'
WHERE group_name <> 'Elliot''s' AND match_columns <> 'effective';
