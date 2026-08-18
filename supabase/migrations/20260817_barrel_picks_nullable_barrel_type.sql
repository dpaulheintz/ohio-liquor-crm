-- Allow NULL barrel_type, is_half_barrel, price_per_bottle, expected_yield
-- for barrel picks where the barrel type has not yet been decided.

ALTER TABLE barrel_picks ALTER COLUMN barrel_type DROP NOT NULL;
ALTER TABLE barrel_picks ALTER COLUMN is_half_barrel DROP NOT NULL;
ALTER TABLE barrel_picks ALTER COLUMN price_per_bottle DROP NOT NULL;
ALTER TABLE barrel_picks ALTER COLUMN expected_yield DROP NOT NULL;
