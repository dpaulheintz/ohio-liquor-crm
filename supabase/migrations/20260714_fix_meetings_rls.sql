-- Root cause of the "Failed to end meeting" bug: eos_meetings.rating was
-- declared INTEGER, but the meeting average rating (Math.round(avg*10)/10) is a
-- one-decimal value like 8.5. Writing a decimal into an integer column errors,
-- so ending a meeting with any fractional average failed. Widen to numeric.
ALTER TABLE eos_meetings ALTER COLUMN rating TYPE numeric USING rating::numeric;

-- Re-create RLS with an explicit WITH CHECK so UPDATE is unambiguously allowed
-- for the EOS user allowlist (previously WITH CHECK defaulted to USING).
DROP POLICY IF EXISTS "eos_users_allowed" ON eos_meetings;
CREATE POLICY "eos_users_allowed" ON eos_meetings
FOR ALL
USING (
  auth.jwt() ->> 'email' IN (
    'pheintzman@highbankco.com',
    'ahines@highbankco.com',
    'jfisher@highbankco.com',
    'jireland@highbankco.com',
    'msmith@highbankco.com',
    'ccarter@highbankco.com'
  )
)
WITH CHECK (
  auth.jwt() ->> 'email' IN (
    'pheintzman@highbankco.com',
    'ahines@highbankco.com',
    'jfisher@highbankco.com',
    'jireland@highbankco.com',
    'msmith@highbankco.com',
    'ccarter@highbankco.com'
  )
);

DROP POLICY IF EXISTS "eos_users_allowed" ON eos_meeting_ratings;
CREATE POLICY "eos_users_allowed" ON eos_meeting_ratings
FOR ALL
USING (
  auth.jwt() ->> 'email' IN (
    'pheintzman@highbankco.com',
    'ahines@highbankco.com',
    'jfisher@highbankco.com',
    'jireland@highbankco.com',
    'msmith@highbankco.com',
    'ccarter@highbankco.com'
  )
)
WITH CHECK (
  auth.jwt() ->> 'email' IN (
    'pheintzman@highbankco.com',
    'ahines@highbankco.com',
    'jfisher@highbankco.com',
    'jireland@highbankco.com',
    'msmith@highbankco.com',
    'ccarter@highbankco.com'
  )
);
