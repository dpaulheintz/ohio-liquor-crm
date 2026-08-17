-- Barrel picks pipeline: customer barrel selections, checklist tracking, notes

CREATE TABLE barrel_picks (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name   text NOT NULL,
  customer_type   text NOT NULL CHECK (customer_type IN ('Corporation','Influencer','Nonprofit','Wholesale Account','Other')),
  contact_name    text,
  contact_email   text,
  contact_phone   text,
  barrel_type     text NOT NULL CHECK (barrel_type IN ('Double Oaked','Double Double Oaked','Cigar Cask','Barrel Select')),
  is_half_barrel  boolean NOT NULL DEFAULT false,
  price_per_bottle numeric NOT NULL,
  expected_yield   integer NOT NULL,
  actual_yield     integer,
  total_value      numeric GENERATED ALWAYS AS (
    COALESCE(actual_yield, expected_yield) * price_per_bottle
  ) STORED,
  status          text NOT NULL DEFAULT 'prospect'
    CHECK (status IN ('prospect','scheduled','picked','in_production','ready_for_delivery','delivered','completed','cancelled')),
  pick_date       date,
  barrel_selected text,
  bottling_date   date,
  delivery_date   date,
  rep_id          uuid REFERENCES profiles(id),
  created_by      uuid NOT NULL REFERENCES profiles(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_barrel_picks_status ON barrel_picks(status);
CREATE INDEX idx_barrel_picks_rep ON barrel_picks(rep_id);

CREATE TABLE barrel_pick_checklist (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  barrel_pick_id  uuid NOT NULL REFERENCES barrel_picks(id) ON DELETE CASCADE,
  step            text NOT NULL,
  status          text NOT NULL DEFAULT 'not_started'
    CHECK (status IN ('not_started','in_progress','completed')),
  completed_at    timestamptz,
  completed_by    uuid REFERENCES profiles(id),
  notes           text
);

CREATE INDEX idx_barrel_pick_checklist_pick ON barrel_pick_checklist(barrel_pick_id);

CREATE TABLE barrel_pick_notes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  barrel_pick_id  uuid NOT NULL REFERENCES barrel_picks(id) ON DELETE CASCADE,
  author_id       uuid NOT NULL REFERENCES profiles(id),
  content         text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_barrel_pick_notes_pick ON barrel_pick_notes(barrel_pick_id);

CREATE OR REPLACE FUNCTION barrel_picks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_barrel_picks_updated_at
  BEFORE UPDATE ON barrel_picks
  FOR EACH ROW EXECUTE FUNCTION barrel_picks_updated_at();

ALTER TABLE barrel_picks ENABLE ROW LEVEL SECURITY;
ALTER TABLE barrel_pick_checklist ENABLE ROW LEVEL SECURITY;
ALTER TABLE barrel_pick_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY barrel_picks_admin ON barrel_picks
  FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY barrel_pick_checklist_admin ON barrel_pick_checklist
  FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY barrel_pick_notes_admin ON barrel_pick_notes
  FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY barrel_picks_rep_read ON barrel_picks
  FOR SELECT USING (rep_id = auth.uid());
CREATE POLICY barrel_pick_checklist_rep_read ON barrel_pick_checklist
  FOR SELECT USING (EXISTS (SELECT 1 FROM barrel_picks WHERE id = barrel_pick_id AND rep_id = auth.uid()));
CREATE POLICY barrel_pick_notes_rep_read ON barrel_pick_notes
  FOR SELECT USING (EXISTS (SELECT 1 FROM barrel_picks WHERE id = barrel_pick_id AND rep_id = auth.uid()));
