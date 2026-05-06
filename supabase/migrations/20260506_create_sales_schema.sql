-- =============================================
-- Table 1: sales_monthly
-- =============================================
CREATE TABLE sales_monthly (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  month            text NOT NULL,
  agency_id        text NOT NULL,
  agency_name      text,
  district         text,
  vendor           text,
  brand_code       text NOT NULL,
  product_name     text,
  category         text,
  brand_family     text,
  sub_product      text,
  size             text,
  is_hb_agency     boolean NOT NULL DEFAULT false,
  hb_location      text,
  retail_bottles   integer,
  retail_amount    numeric,
  wholesale_bottles integer,
  wholesale_amount  numeric,
  UNIQUE (month, agency_id, brand_code)
);

CREATE INDEX idx_sales_monthly_month        ON sales_monthly (month);
CREATE INDEX idx_sales_monthly_agency_id    ON sales_monthly (agency_id);
CREATE INDEX idx_sales_monthly_brand_code   ON sales_monthly (brand_code);
CREATE INDEX idx_sales_monthly_brand_family ON sales_monthly (brand_family);

ALTER TABLE sales_monthly ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins_all_sales_monthly" ON sales_monthly
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- =============================================
-- Table 2: wholesale_detail
-- =============================================
CREATE TABLE wholesale_detail (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  month            text NOT NULL,
  agency_id        text NOT NULL,
  agency_name      text,
  district         text,
  vendor           text,
  brand_code       text NOT NULL,
  product_name     text,
  category         text,
  brand_family     text,
  sub_product      text,
  size             text,
  is_hb_agency     boolean NOT NULL DEFAULT false,
  hb_location      text,
  permit_number    text NOT NULL,
  wholesaler_name  text,
  dba              text,
  bottles_sold     integer,
  amount           numeric,
  UNIQUE (month, agency_id, brand_code, permit_number)
);

CREATE INDEX idx_wholesale_detail_month        ON wholesale_detail (month);
CREATE INDEX idx_wholesale_detail_agency_id    ON wholesale_detail (agency_id);
CREATE INDEX idx_wholesale_detail_brand_code   ON wholesale_detail (brand_code);
CREATE INDEX idx_wholesale_detail_brand_family ON wholesale_detail (brand_family);

ALTER TABLE wholesale_detail ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins_all_wholesale_detail" ON wholesale_detail
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- =============================================
-- Table 3: account_groups
-- =============================================
CREATE TABLE account_groups (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  group_name    text NOT NULL,
  match_terms   text[] NOT NULL DEFAULT '{}',
  match_columns text NOT NULL CHECK (match_columns IN ('wholesaler', 'dba', 'both')),
  color         text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE account_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins_all_account_groups" ON account_groups
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());
