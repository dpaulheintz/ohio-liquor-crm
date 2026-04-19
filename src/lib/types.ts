// Database types matching the Supabase schema

export type UserRole = 'pending' | 'rep' | 'admin';
export type AccountType = 'agency' | 'wholesale';
export type AccountStatus = 'prospect' | 'customer';
export type DataSourceType = 'annual_summary' | 'wholesale';
export type UploadStatus = 'pending' | 'processed' | 'deleted';
export type MatchStatusType = 'matched' | 'unmatched' | 'pending_approval';

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  is_approved: boolean;
  created_at: string;
  updated_at: string;
}

export interface Account {
  id: string;
  type: AccountType;
  agency_id: string | null;
  permit_number: string | null;
  display_name: string;
  legal_name: string | null;
  district: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  phone: string | null;
  delivery_day: string | null;
  warehouse: string | null;
  linked_agency_name: string | null;
  linked_agency_id: string | null;
  status: AccountStatus;
  owner_rep_id: string | null;
  needs_review: boolean;
  created_at: string;
  updated_at: string;
  // Joined fields
  owner_rep?: Profile;
  contacts?: Contact[];
  visit_logs?: VisitLog[];
  last_visited_at?: string | null;
}

export interface Contact {
  id: string;
  name: string;
  account_id: string;
  phone: string | null;
  email: string | null;
  title_role: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  account?: Account;
}

export const KPI_OPTIONS = ['Display', 'Menu', 'Feature', 'Event'] as const;
export type KpiType = typeof KPI_OPTIONS[number];

export interface VisitLog {
  id: string;
  account_id: string;
  rep_id: string;
  visited_at: string;
  notes: string | null;
  kpi: string | null;
  kpi_quantity: number | null;
  created_at: string;
  // Joined
  account?: Account;
  rep?: Profile;
  visit_photos?: VisitPhoto[];
}

export interface VisitPhoto {
  id: string;
  visit_id: string;
  photo_url: string;
  caption: string | null;
  sort_order: number;
  created_at: string;
}

export interface UploadBatch {
  id: string;
  uploaded_by: string;
  data_source: DataSourceType;
  upload_period: string;
  file_name: string | null;
  row_count: number;
  matched_count: number;
  unmatched_count: number;
  status: UploadStatus;
  created_at: string;
  // Joined
  uploader?: Profile;
}

export interface SalesData {
  id: string;
  upload_batch_id: string;
  data_source: DataSourceType;
  district: string | null;
  agency_id: string | null;
  agency_name: string | null;
  permit_number: string | null;
  wholesaler: string | null;
  doing_business_as: string | null;
  vendor: string | null;
  brand: string | null;
  product_name: string | null;
  category: string | null;
  retail_bottles_sold: number | null;
  retail_amount: number | null;
  retail_tax: number | null;
  wholesale_bottles_sold: number | null;
  wholesale_amount: number | null;
  wholesale_tax: number | null;
  upload_period: string | null;
  matched_account_id: string | null;
  match_status: MatchStatusType;
  created_at: string;
  // Joined
  matched_account?: Account;
}
