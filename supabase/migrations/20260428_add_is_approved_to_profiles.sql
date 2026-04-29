-- Add is_approved column to profiles.
-- The application code has referenced this column since the multi-tenant
-- refactor but it was never added to the schema, causing PostgREST errors
-- in getOrgDetail(), getAllUsers(), approveUser(), and createOrganization().

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_approved boolean NOT NULL DEFAULT false;

-- Backfill: anyone already promoted to rep or admin is implicitly approved.
UPDATE profiles
  SET is_approved = true
  WHERE role IN ('rep', 'admin');
