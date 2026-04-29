// Database types matching the Supabase schema

export const MAX_PHOTOS = 5;

export type UserRole = 'pending' | 'rep' | 'admin';
export type AccountType = 'agency' | 'wholesale';
export type AccountStatus = 'prospect' | 'customer';

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

export type AssignmentStatus = 'pending' | 'completed';

export interface Assignment {
  id: string;
  account_id: string;
  assigned_to: string;
  assigned_by: string;
  notes: string | null;
  status: AssignmentStatus;
  created_at: string;
  completed_at: string | null;
  // Joined
  account?: Pick<Account, 'id' | 'display_name' | 'city' | 'type'>;
  rep?: Pick<Profile, 'id' | 'full_name' | 'email'>;
  assigner?: Pick<Profile, 'id' | 'full_name' | 'email'>;
}

export interface VisitPhoto {
  id: string;
  visit_id: string;
  photo_url: string;
  caption: string | null;
  sort_order: number;
  created_at: string;
}
