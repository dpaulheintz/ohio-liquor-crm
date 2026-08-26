export const BARREL_TYPES = ['Double Oaked', 'Double Double Oaked', 'Cigar Cask', 'Barrel Select', 'TBD'] as const;
export type BarrelType = typeof BARREL_TYPES[number];

export const CUSTOMER_TYPES = ['Corporation', 'Influencer', 'Nonprofit', 'Wholesale Account', 'Other'] as const;
export type CustomerType = typeof CUSTOMER_TYPES[number];

export const PIPELINE_STAGES = [
  'prospect', 'scheduled', 'picked', 'in_production',
  'ready_for_delivery', 'delivered', 'completed', 'cancelled',
] as const;
export type PipelineStage = typeof PIPELINE_STAGES[number];

export const CHECKLIST_STEPS = [
  'CRF Submitted',
  'Label Proof Received',
  'Label Approved by Customer',
  'Labels Ordered',
  'Labels Arrived',
  'Bottling Scheduled',
  'Bottling Complete',
  'Invoiced',
  'Payment Received',
  'Delivery Scheduled',
  'Delivered',
] as const;

export const BARREL_DEFAULTS: Record<BarrelType, {
  price: number | null;
  fullYield: number | null;
  halfYield: number | null;
}> = {
  'Double Oaked':        { price: 74.99,  fullYield: 280, halfYield: 140 },
  'Double Double Oaked': { price: 104.99, fullYield: 250, halfYield: 125 },
  'Cigar Cask':          { price: 104.99, fullYield: 250, halfYield: null },
  'Barrel Select':       { price: 114.99, fullYield: 250, halfYield: null },
  'TBD':                 { price: null,   fullYield: null, halfYield: null },
};

export interface BarrelPick {
  id: string;
  customer_name: string;
  customer_type: CustomerType;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  barrel_type: BarrelType | null;
  is_half_barrel: boolean | null;
  price_per_bottle: number | null;
  expected_yield: number | null;
  actual_yield: number | null;
  total_value: number | null;
  status: PipelineStage;
  pick_date: string | null;
  barrel_selected: string | null;
  bottling_date: string | null;
  delivery_date: string | null;
  rep_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  rep?: { id: string; full_name: string | null; email: string } | null;
  creator?: { id: string; full_name: string | null } | null;
  checklist?: ChecklistItem[];
  notes?: BarrelPickNote[];
}

export interface ChecklistItem {
  id: string;
  barrel_pick_id: string;
  step: string;
  status: 'not_started' | 'in_progress' | 'completed';
  completed_at: string | null;
  completed_by: string | null;
  notes: string | null;
  completer?: { full_name: string | null } | null;
}

export interface BarrelPickNote {
  id: string;
  barrel_pick_id: string;
  author_id: string;
  content: string;
  created_at: string;
  author?: { full_name: string | null } | null;
}
