-- Remove multi-tenant scaffold — revert to single-tenant High Bank CRM
-- Drops organizations/organization_members tables, org columns, is_super_admin,
-- the get_my_org_id/is_super_admin helpers, and replaces all RLS policies
-- with simple approved/admin checks.

-- 1. Drop org-aware RLS policies
DROP POLICY IF EXISTS accounts_select    ON accounts;
DROP POLICY IF EXISTS accounts_insert    ON accounts;
DROP POLICY IF EXISTS accounts_update    ON accounts;
DROP POLICY IF EXISTS accounts_delete    ON accounts;

DROP POLICY IF EXISTS contacts_select    ON contacts;
DROP POLICY IF EXISTS contacts_insert    ON contacts;
DROP POLICY IF EXISTS contacts_update    ON contacts;
DROP POLICY IF EXISTS contacts_delete    ON contacts;

DROP POLICY IF EXISTS visits_select      ON visit_logs;
DROP POLICY IF EXISTS visits_insert      ON visit_logs;
DROP POLICY IF EXISTS visits_update      ON visit_logs;

DROP POLICY IF EXISTS visit_photos_select ON visit_photos;
DROP POLICY IF EXISTS visit_photos_insert ON visit_photos;
DROP POLICY IF EXISTS visit_photos_delete ON visit_photos;

DROP POLICY IF EXISTS assignments_select  ON assignments;
DROP POLICY IF EXISTS assignments_insert  ON assignments;
DROP POLICY IF EXISTS assignments_update  ON assignments;
DROP POLICY IF EXISTS assignments_delete  ON assignments;

DROP POLICY IF EXISTS profiles_select        ON profiles;
DROP POLICY IF EXISTS profiles_update_admin  ON profiles;
DROP POLICY IF EXISTS profiles_update_own    ON profiles;

-- 2. Drop organization tables (CASCADE removes FK constraints elsewhere)
DROP TABLE IF EXISTS organization_members CASCADE;
DROP TABLE IF EXISTS organizations         CASCADE;

-- 3. Drop org columns
ALTER TABLE profiles    DROP COLUMN IF EXISTS organization_id;
ALTER TABLE profiles    DROP COLUMN IF EXISTS is_super_admin;
ALTER TABLE accounts    DROP COLUMN IF EXISTS organization_id;
ALTER TABLE contacts    DROP COLUMN IF EXISTS organization_id;
ALTER TABLE visit_logs  DROP COLUMN IF EXISTS organization_id;
ALTER TABLE assignments DROP COLUMN IF EXISTS organization_id;

-- 4. Drop multi-tenant helper functions
DROP FUNCTION IF EXISTS get_my_org_id()  CASCADE;
DROP FUNCTION IF EXISTS is_super_admin() CASCADE;

-- 5. Simplified handle_new_user trigger
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name, role, is_approved)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NULL),
    'pending',
    false
  );
  RETURN NEW;
END;
$$;

-- 6. Simple single-tenant RLS policies

CREATE POLICY accounts_select ON accounts FOR SELECT USING (is_approved());
CREATE POLICY accounts_insert ON accounts FOR INSERT WITH CHECK (is_approved());
CREATE POLICY accounts_update ON accounts FOR UPDATE
  USING (is_approved()) WITH CHECK (is_approved());
CREATE POLICY accounts_delete ON accounts FOR DELETE USING (is_admin());

CREATE POLICY contacts_select ON contacts FOR SELECT USING (is_approved());
CREATE POLICY contacts_insert ON contacts FOR INSERT WITH CHECK (is_approved());
CREATE POLICY contacts_update ON contacts FOR UPDATE
  USING (is_approved()) WITH CHECK (is_approved());
CREATE POLICY contacts_delete ON contacts FOR DELETE USING (is_approved());

CREATE POLICY visits_select ON visit_logs FOR SELECT USING (is_approved());
CREATE POLICY visits_insert ON visit_logs FOR INSERT WITH CHECK (is_approved());
CREATE POLICY visits_update ON visit_logs FOR UPDATE
  USING  (is_approved() AND (rep_id = auth.uid() OR is_admin()))
  WITH CHECK (is_approved() AND (rep_id = auth.uid() OR is_admin()));

CREATE POLICY visit_photos_select ON visit_photos FOR SELECT USING (is_approved());
CREATE POLICY visit_photos_insert ON visit_photos FOR INSERT WITH CHECK (
  is_approved() AND EXISTS (
    SELECT 1 FROM visit_logs vl
    WHERE vl.id = visit_photos.visit_id
      AND (vl.rep_id = auth.uid() OR is_admin())
  )
);
CREATE POLICY visit_photos_delete ON visit_photos FOR DELETE USING (
  is_admin() OR EXISTS (
    SELECT 1 FROM visit_logs vl
    WHERE vl.id = visit_photos.visit_id AND vl.rep_id = auth.uid()
  )
);

CREATE POLICY assignments_select ON assignments FOR SELECT
  USING (is_approved() AND (assigned_to = auth.uid() OR is_admin()));
CREATE POLICY assignments_insert ON assignments FOR INSERT WITH CHECK (is_admin());
CREATE POLICY assignments_update ON assignments FOR UPDATE
  USING  (is_admin() OR assigned_to = auth.uid())
  WITH CHECK (is_admin() OR assigned_to = auth.uid());
CREATE POLICY assignments_delete ON assignments FOR DELETE USING (is_admin());

CREATE POLICY profiles_select ON profiles FOR SELECT
  USING (id = auth.uid() OR is_approved());
CREATE POLICY profiles_update_own ON profiles FOR UPDATE
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY profiles_update_admin ON profiles FOR UPDATE
  USING (is_admin()) WITH CHECK (is_admin());
