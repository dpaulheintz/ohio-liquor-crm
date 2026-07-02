DO $$
DECLARE
  t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'eos_scorecard_metrics','eos_scorecard_entries','eos_barrels',
    'eos_barrel_milestones','eos_todos','eos_opportunities',
    'eos_headlines','eos_meetings','eos_meeting_notes'
  ])
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS eos_admins_only ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS eos_users_allowed ON %I', t);
    EXECUTE format(
      'CREATE POLICY eos_users_allowed ON %I FOR ALL USING (
        auth.jwt() ->> ''email'' IN (
          ''pheintzman@highbankco.com'',
          ''ahines@highbankco.com'',
          ''jfisher@highbankco.com'',
          ''jireland@highbankco.com'',
          ''msmith@highbankco.com'',
          ''ccarter@highbankco.com''
        )
      )', t
    );
  END LOOP;
END $$;
