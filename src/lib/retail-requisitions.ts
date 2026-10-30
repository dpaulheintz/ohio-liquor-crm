// Shared (client + server) types and helpers for Retail Requisitions.

import { formatFileDate } from '@/lib/wholesale-forms';

export const RETAIL_REQ_PATH = '/admin/retail-requisitions';

export const REQ_LOCATIONS = ['Grandview', 'Gahanna', 'Westerville'] as const;
export const REQ_PURPOSES = ['Sales', 'Batch', 'Bar', 'Retail'] as const;
export type ReqLocation = (typeof REQ_LOCATIONS)[number];
export type ReqPurpose = (typeof REQ_PURPOSES)[number];
export type ReqStatus = 'draft' | 'final';

export interface RetailReqProduct {
  id: string;
  sku: string;
  description: string;
  sort_order: number;
  active: boolean;
}

export interface RetailReqLine {
  id: string;
  product_id: string | null;
  sku: string;
  description: string;
  quantity: number;
  sort_order: number;
}

export interface RetailRequisition {
  id: string;
  location: ReqLocation;
  purpose: ReqPurpose;
  req_date: string;
  status: ReqStatus;
  requested_by_name: string | null;
  notes: string | null;
  sent_at: string | null;
  sent_to: string[] | null;
  created_at: string;
  updated_at: string;
  total_items: number;
  lines: RetailReqLine[];
}

export type RetailRequisitionSummary = Omit<RetailRequisition, 'lines'>;

function shortDate(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return `${m}/${d}/${String(y).slice(-2)}`;
}

/** "HBD Retail Requisition GRANDVIEW SALES 10.28.26.pdf" */
export function requisitionFileName(r: Pick<RetailRequisition, 'location' | 'purpose' | 'req_date'>): string {
  return `HBD Retail Requisition ${r.location.toUpperCase()} ${r.purpose.toUpperCase()} ${formatFileDate(r.req_date)}.pdf`;
}

/** "Retail Requisition – Grandview – Sales – 10/28/26 – 6 items" */
export function requisitionEmailSubject(r: Pick<RetailRequisition, 'location' | 'purpose' | 'req_date' | 'total_items'>): string {
  return `Retail Requisition – ${r.location} – ${r.purpose} – ${shortDate(r.req_date)} – ${r.total_items} item${r.total_items === 1 ? '' : 's'}`;
}

export function formatSentDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit', timeZone: 'America/New_York' });
}
