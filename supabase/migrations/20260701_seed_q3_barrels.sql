-- Seed Q3 2026 barrels

INSERT INTO eos_barrels (id, title, barrel_type, owner_name, owner_email, status, quarter, due_date)
VALUES

-- Company Barrels
(gen_random_uuid(), 'Warehouse organized and process in place for monthly/weekly organization and cleaning and map created',
 'company', 'Mike Smith', 'msmith@highbankco.com', 'not_started', 'Q3 2026', '2026-09-30'),

(gen_random_uuid(), 'Menu rollout process created and approved by L10',
 'company', 'Jenna Fisher', 'jfisher@highbankco.com', 'not_started', 'Q3 2026', '2026-09-30'),

(gen_random_uuid(), 'Employee onboarding launched and scheduled monthly',
 'company', 'Charles Carter', 'ccarter@highbankco.com', 'not_started', 'Q3 2026', '2026-09-30'),

(gen_random_uuid(), 'Toast Retail integrated in all 3 stores and FBA and inventory audit monthly/weekly',
 'company', 'Paul Heintzman', 'pheintzman@highbankco.com', 'not_started', 'Q3 2026', '2026-09-30'),

(gen_random_uuid(), 'OSU game day watch strategy implemented and scheduled events',
 'company', 'Adam Hines', 'ahines@highbankco.com', 'not_started', 'Q3 2026', '2026-09-30'),

-- Individual Barrels
(gen_random_uuid(), 'Website sales page Seelbachs + Printful',
 'individual', 'Adam Hines', 'ahines@highbankco.com', 'not_started', 'Q3 2026', '2026-09-30'),

(gen_random_uuid(), 'Cocktail competition',
 'individual', 'Paul Heintzman', 'pheintzman@highbankco.com', 'not_started', 'Q3 2026', '2026-09-30'),

(gen_random_uuid(), 'TIPS',
 'individual', 'Jeff Ireland', 'jireland@highbankco.com', 'not_started', 'Q3 2026', '2026-09-30'),

(gen_random_uuid(), 'Maintenance log and Toast log',
 'individual', 'Paul Heintzman', 'pheintzman@highbankco.com', 'not_started', 'Q3 2026', '2026-09-30'),

(gen_random_uuid(), 'HR Audit review and strategy',
 'individual', 'Jeff Ireland', 'jireland@highbankco.com', 'not_started', 'Q3 2026', '2026-09-30'),

(gen_random_uuid(), 'Create guest experience audit',
 'individual', 'Charles Carter', 'ccarter@highbankco.com', 'not_started', 'Q3 2026', '2026-09-30'),

(gen_random_uuid(), 'AI integration - full tech stack review completed across all management teams and plan presented to L10 with potential AI projects and cost savings documented',
 'individual', 'Paul Heintzman', 'pheintzman@highbankco.com', 'not_started', 'Q3 2026', '2026-09-30');
