export type FileKind = 'payroll_export' | 'time_entries';
export type RunStatus = 'draft' | 'in_review' | 'approved' | 'exported';
export type Severity = 'blocker' | 'warning';
export type LineSource = 'toast' | 'manual_adjustment';

export const CANONICAL_FIELDS = [
  'employee_name', 'first_name', 'last_name', 'employee_id', 'job_title', 'location', 'work_date',
  'regular_hours', 'overtime_hours', 'total_hours', 'rate', 'regular_pay', 'overtime_pay',
  'cc_tips', 'cash_tips', 'gratuity',
] as const;
export type CanonicalField = (typeof CANONICAL_FIELDS)[number];

export const FIELD_LABELS: Record<CanonicalField, string> = {
  employee_name: 'Employee name',
  first_name: 'First name',
  last_name: 'Last name',
  employee_id: 'Toast employee ID',
  job_title: 'Job title',
  location: 'Location',
  work_date: 'Date (time entries)',
  regular_hours: 'Regular hours',
  overtime_hours: 'Overtime hours',
  total_hours: 'Total hours',
  rate: 'Hourly rate',
  regular_pay: 'Regular pay',
  overtime_pay: 'Overtime pay',
  cc_tips: 'Non-cash tips',
  cash_tips: 'Declared cash tips',
  gratuity: 'Gratuity / service charge',
};

/** field → source header text */
export type ColumnMapping = Partial<Record<CanonicalField, string>>;

export interface Totals {
  regHh: number;
  otHh: number;
  regPayCents: number;
  otPayCents: number;
  cctipsCents: number;
  cashtipsCents: number;
  gratCents: number;
}

export interface SourceRow {
  rowNumber: number;
  toastName: string;
  toastEmployeeId: string | null;
  jobTitle: string | null;
  locationText: string | null;
  workDate: string | null;
  regHh: number;
  otHh: number;
  rateCents: number | null;
  regPayCents: number | null;
  otPayCents: number | null;
  cctipsCents: number;
  cashtipsCents: number;
  gratCents: number;
  issues: string[];
}

export interface ParsedFile {
  headers: string[];
  headerRowIndex: number;
  kind: FileKind;
  mapping: ColumnMapping;
  signature: string;
  rows: SourceRow[];
  control: Totals | null;
  dropped: string[];
  locationValues: string[];
}

export interface PayrollSettings {
  pay_frequency: 'weekly' | 'biweekly' | 'semimonthly';
  workweek_start_dow: number;
  next_period_start: string | null;
  min_wage_cents: number;
  tipped_cash_wage_cents: number;
  ot_threshold_hh: number;
  alert_weekly_hours_hh: number;
  alert_tips_cents: number;
  big_change_pct: number;
  big_change_min_cents: number;
}

export interface PayrollLocation {
  id: string;
  name: string;
  toast_location_name: string | null;
  paycom_location_code: string | null;
  paycom_department_code: string | null;
  active: boolean;
  sort_order: number;
}

export interface PayrollEmployee {
  id: string;
  toast_name: string;
  toast_employee_id: string | null;
  paycom_employee_code: string | null;
  first_name: string | null;
  last_name: string | null;
  primary_location_id: string | null;
  active: boolean;
  notes: string | null;
}

export interface JobMapping {
  id: string;
  location_id: string | null;
  toast_job_title: string;
  paycom_department_code: string | null;
  paycom_position_code: string | null;
  is_tipped: boolean;
  notes: string | null;
}

export interface Paycode {
  id: string;
  earning_type: string;
  paycom_earning_code: string | null;
  description: string | null;
  kind: 'hours' | 'amount';
  manual_only: boolean;
  sort_order: number;
}

export interface TemplateColumn {
  header: string;
  source: OutputSource;
}

export const OUTPUT_SOURCES = [
  'employee_code', 'last_name', 'first_name', 'earning_code', 'hours', 'rate', 'amount',
  'department', 'position', 'location', 'period_start', 'period_end', 'toast_name', 'job_title', 'blank',
] as const;
export type OutputSource = (typeof OUTPUT_SOURCES)[number];

export interface OutputTemplate {
  name: string;
  file_type: 'csv' | 'xlsx';
  date_format: string;
  include_rate: boolean;
  columns: TemplateColumn[];
  key_columns: string[];
}

/** A payroll line (one per employee × job × location × earning code × rate). */
export interface PayLine {
  id?: string;
  employeeId: string | null;
  toastName: string;
  toastEmployeeId: string | null;
  locationId: string | null;
  jobTitle: string | null;
  earningType: string;
  hoursHh: number;
  rateCents: number | null;
  amountCents: number;
  source: LineSource;
  adjustmentReason?: string | null;
  editedAt?: string | null;
}

export interface Flag {
  key: string;
  type: string;
  severity: Severity;
  message: string;
  toastName?: string | null;
  locationId?: string | null;
  details?: Record<string, unknown>;
}

export interface LocationSummary {
  locationId: string | null;
  employees: number;
  regHh: number;
  otHh: number;
  tipsCents: number;
  gratCents: number;
  grossCents: number;
  control: Totals | null;
}
