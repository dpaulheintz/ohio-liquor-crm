-- Per-person meeting ratings table
CREATE TABLE eos_meeting_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID REFERENCES eos_meetings(id) ON DELETE CASCADE,
  person_name TEXT NOT NULL,
  person_email TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 10),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(meeting_id, person_email)
);

ALTER TABLE eos_meeting_ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "eos_users_allowed" ON eos_meeting_ratings FOR ALL USING (
  auth.jwt() ->> 'email' IN (
    'pheintzman@highbankco.com',
    'ahines@highbankco.com',
    'jfisher@highbankco.com',
    'jireland@highbankco.com',
    'msmith@highbankco.com',
    'ccarter@highbankco.com'
  )
);
