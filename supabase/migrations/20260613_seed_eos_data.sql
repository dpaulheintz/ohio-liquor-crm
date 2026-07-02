-- Seed EOS barrels for Q2 2026
INSERT INTO eos_barrels (id, title, barrel_type, status, owner_name, owner_email, quarter, created_by) VALUES
  (gen_random_uuid(), 'Westerville Lunch',                        'company',    'complete',  'Charles Carter', 'ccarter@highbankco.com',    'Q2 2026', 'pheintzman@highbankco.com'),
  (gen_random_uuid(), 'Tips',                                      'company',    'on_track',  'Jeff Ireland',   'jireland@highbankco.com',   'Q2 2026', 'pheintzman@highbankco.com'),
  (gen_random_uuid(), 'Food Vendor Implementation',                'individual', 'on_track',  'Charles Carter', 'ccarter@highbankco.com',    'Q2 2026', 'pheintzman@highbankco.com'),
  (gen_random_uuid(), 'Service Vendor Review',                     'individual', 'off_track', 'Charles Carter', 'ccarter@highbankco.com',    'Q2 2026', 'pheintzman@highbankco.com'),
  (gen_random_uuid(), 'Communicate and Execute Barrel Room Events','individual', 'on_track',  'Jenna Fisher',   'jfisher@highbankco.com',    'Q2 2026', 'pheintzman@highbankco.com'),
  (gen_random_uuid(), 'Offsite Quarterly',                         'individual', 'on_track',  'Paul Heintzman', 'pheintzman@highbankco.com', 'Q2 2026', 'pheintzman@highbankco.com');

-- Seed EOS todos
INSERT INTO eos_todos (id, title, owner_name, owner_email, due_date, completed, created_by) VALUES
  (gen_random_uuid(), 'Update summer menu pricing',                  'Paul Heintzman', 'pheintzman@highbankco.com', '2026-06-20', false, 'pheintzman@highbankco.com'),
  (gen_random_uuid(), 'Complete TIPS certification renewals',        'Jeff Ireland',   'jireland@highbankco.com',   '2026-06-27', false, 'pheintzman@highbankco.com'),
  (gen_random_uuid(), 'Submit food vendor contracts for review',     'Charles Carter', 'ccarter@highbankco.com',    '2026-06-20', false, 'pheintzman@highbankco.com'),
  (gen_random_uuid(), 'Finalize 4th of July staffing schedule',      'Adam Hines',     'ahines@highbankco.com',     '2026-07-01', false, 'pheintzman@highbankco.com'),
  (gen_random_uuid(), 'Design barrel room event materials',          'Jenna Fisher',   'jfisher@highbankco.com',    '2026-06-30', false, 'pheintzman@highbankco.com'),
  (gen_random_uuid(), 'Distribute updated cleaning checklist',       'Adam Hines',     'ahines@highbankco.com',     '2026-06-25', false, 'pheintzman@highbankco.com'),
  (gen_random_uuid(), 'Schedule Q3 offsite planning session',        'Michael Smith',  'msmith@highbankco.com',     '2026-07-07', false, 'pheintzman@highbankco.com');

-- Seed EOS opportunities
INSERT INTO eos_opportunities (id, title, status, priority, term, owner_name, owner_email, created_by, created_at) VALUES
  (gen_random_uuid(), 'All day happy hour for 4th of July', 'open',   'medium', 'short', 'Charles Carter', 'ccarter@highbankco.com',    'pheintzman@highbankco.com', '2026-06-10T00:00:00Z'),
  (gen_random_uuid(), 'TIPS update',                        'solved',  'medium', 'short', 'Jeff Ireland',   'jireland@highbankco.com',   'pheintzman@highbankco.com', '2026-06-10T00:00:00Z'),
  (gen_random_uuid(), 'Cleaning expectations',              'open',   'medium', 'short', 'Adam Hines',     'ahines@highbankco.com',     'pheintzman@highbankco.com', '2026-06-10T00:00:00Z');
