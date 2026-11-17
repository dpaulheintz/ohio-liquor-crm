-- OHLQ Ops concept demo (/demo/ohlq): Direct Wholesale Sales (A-3a) + Tasting Applications (LIQ-19-0004).
-- Sample data only. Every table is RLS-on with NO policies: only the service role (server routes and
-- server actions behind the demo access code) can read or write. Nothing here touches a CRM table;
-- the demo reads ohlq_products and agency rows of accounts read-only.

create table public.ohlq_demo_customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  dba text,
  phone text,
  address text,
  city text,
  state text not null default 'OH',
  zip text,
  county text,
  is_f2 boolean not null default false,
  permit_number text not null unique,
  -- true = on the state's permit file (seeded); customers a supplier adds are unverified → flagged for Ops
  permit_verified boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.ohlq_demo_wholesale_sales (
  id uuid primary key default gen_random_uuid(),
  ref_no text not null unique,
  supplier_name text not null default 'High Bank Distillery',
  status text not null default 'draft'
    check (status in ('draft', 'awaiting_customer', 'signed', 'submitted', 'processed', 'returned')),
  customer_id uuid references public.ohlq_demo_customers(id) on delete set null,
  -- customer snapshot as entered on the form
  customer_name text, customer_dba text, customer_phone text, customer_address text,
  customer_city text, customer_state text, customer_zip text, customer_county text,
  is_f2 boolean not null default false, permit_number text,
  sales_date date not null,
  subtotal_cents bigint not null default 0,
  sin_tax_cents bigint not null default 0,
  sin_tax_note text,
  total_cents bigint not null default 0,
  -- signatures: vector strokes {w, h, strokes: [[[x, y], ...], ...]}
  a3a_signature jsonb, a3a_signer_name text, a3a_signer_title text, a3a_signed_at timestamptz, a3a_device text,
  customer_signature jsonb, customer_signer_name text, customer_signed_at timestamptz, customer_device text,
  customer_consent boolean not null default false,
  sign_token text unique,
  sign_method text check (sign_method in ('email', 'sms', 'in_person')),
  sign_sent_to text,
  sign_sent_at timestamptz,
  submitted_at timestamptz,
  processed_at timestamptz,
  return_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ohlq_demo_wholesale_lines (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.ohlq_demo_wholesale_sales(id) on delete cascade,
  brand_code text not null,
  description text not null,
  size_label text,
  volume_l numeric,
  price_cents integer not null check (price_cents >= 0),
  quantity integer not null check (quantity > 0),
  line_total_cents bigint not null,
  sort_order integer not null default 0
);
create index ohlq_demo_wholesale_lines_sale_idx on public.ohlq_demo_wholesale_lines (sale_id, sort_order);

create table public.ohlq_demo_tastings (
  id uuid primary key default gen_random_uuid(),
  ref_no text not null unique,
  supplier_name text not null default 'High Bank Distillery',
  status text not null default 'submitted' check (status in ('submitted', 'approved', 'rejected')),
  agency_id text not null,
  agency_name text, agency_address text, agency_city text, agency_state text not null default 'OH',
  agency_zip text, agency_county text,
  staff_granted text,
  event_date date not null,
  start_time time not null,
  end_time time not null,
  conductor_name text,
  solicitor_reg_no text,
  reg_expires date,
  applicant_type text check (applicant_type in ('solicitor', 'broker', 'trade_marketing')),
  training_confirmed boolean not null default false,
  products jsonb not null default '[]'::jsonb, -- [{code, name}]
  employer text, phone text, fax text, email text,
  applicant_signature jsonb, applicant_signer_name text, signed_at timestamptz,
  submitted_at timestamptz not null default now(),
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now()
);
create index ohlq_demo_tastings_agency_idx on public.ohlq_demo_tastings (agency_id, event_date);

-- Applicant profile (pre-fills the next tasting application) + demo config (SIN tax counties)
create table public.ohlq_demo_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create table public.ohlq_demo_audit (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('wholesale', 'tasting', 'demo')),
  entity_id uuid,
  actor text not null,
  action text not null,
  detail text,
  created_at timestamptz not null default now()
);
create index ohlq_demo_audit_entity_idx on public.ohlq_demo_audit (entity_type, entity_id, created_at);

-- Every demo email/text: what address was typed vs. where it really went (always Paul)
create table public.ohlq_demo_messages (
  id uuid primary key default gen_random_uuid(),
  channel text not null default 'email',
  requested_to text,
  delivered_to text not null,
  subject text not null,
  status text not null default 'sent', -- sent | not_configured | failed
  error text,
  created_at timestamptz not null default now()
);

alter table public.ohlq_demo_customers enable row level security;
alter table public.ohlq_demo_wholesale_sales enable row level security;
alter table public.ohlq_demo_wholesale_lines enable row level security;
alter table public.ohlq_demo_tastings enable row level security;
alter table public.ohlq_demo_settings enable row level security;
alter table public.ohlq_demo_audit enable row level security;
alter table public.ohlq_demo_messages enable row level security;

revoke all on public.ohlq_demo_customers, public.ohlq_demo_wholesale_sales, public.ohlq_demo_wholesale_lines,
  public.ohlq_demo_tastings, public.ohlq_demo_settings, public.ohlq_demo_audit, public.ohlq_demo_messages
  from anon, authenticated;

-- 2026-11-17: keep the SMTP server's answer for each demo email (proof of delivery to Paul)
alter table public.ohlq_demo_messages add column if not exists provider_response text;
