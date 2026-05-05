-- =============================================
-- Tastings table
-- =============================================
CREATE TABLE tastings (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  agency_id     uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  date          date NOT NULL,
  start_time    time NOT NULL,
  end_time      time NOT NULL,
  city          text,
  status        text NOT NULL DEFAULT 'needs_staff'
                  CHECK (status IN ('needs_staff','scheduled','staffed','completed','cancelled')),
  staff_category text
                  CHECK (staff_category IN ('DBC','HB Internal Staff','HB Sales Team')),
  staff_person  text,
  notes         text,
  report_url    text,
  created_by    uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at    timestamptz DEFAULT now() NOT NULL,
  updated_at    timestamptz DEFAULT now() NOT NULL
);

CREATE TRIGGER tastings_updated_at
  BEFORE UPDATE ON tastings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================
-- Row Level Security
-- =============================================
ALTER TABLE tastings ENABLE ROW LEVEL SECURITY;

-- Admins: full access
CREATE POLICY "admins_all_tastings" ON tastings
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- Reps: read tastings for agencies they own
CREATE POLICY "reps_read_tastings" ON tastings
  FOR SELECT TO authenticated
  USING (
    is_approved() AND EXISTS (
      SELECT 1 FROM accounts
      WHERE accounts.id = tastings.agency_id
        AND accounts.owner_rep_id = auth.uid()
    )
  );

-- =============================================
-- Storage bucket: visit-reports
-- =============================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'visit-reports',
  'visit-reports',
  false,
  20971520,  -- 20 MB
  ARRAY['application/pdf','image/jpeg','image/png','image/webp']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "admins_upload_reports" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'visit-reports' AND is_admin());

CREATE POLICY "admins_update_reports" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'visit-reports' AND is_admin());

CREATE POLICY "admins_delete_reports" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'visit-reports' AND is_admin());

CREATE POLICY "authenticated_read_reports" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'visit-reports' AND is_approved());
