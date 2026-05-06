'use server';

import { createClient } from '@/lib/supabase/server';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SalesRowInput {
  month: string;
  agency_id: string;
  agency_name: string | null;
  district: string | null;
  vendor: string | null;
  brand_code: string;
  product_name: string;
  category: string | null;
  brand_family: string;
  sub_product: string | null;
  size: string;
  is_hb_agency: boolean;
  hb_location: string | null;
  retail_bottles: number | null;
  retail_amount: number | null;
  wholesale_bottles: number | null;
  wholesale_amount: number | null;
}

export interface WholesaleRowInput {
  month: string;
  agency_id: string;
  agency_name: string | null;
  district: string | null;
  vendor: string | null;
  brand_code: string;
  product_name: string;
  category: string | null;
  brand_family: string;
  sub_product: string | null;
  size: string;
  is_hb_agency: boolean;
  hb_location: string | null;
  permit_number: string;
  wholesaler_name: string | null;
  dba: string | null;
  bottles_sold: number | null;
  amount: number | null;
}

export interface SalesHealth {
  months: string[];
  gaps: string[];
  unknownCodes: Record<string, { product_name: string; count: number }>;
  lastMonth: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CHUNK = 500;

async function chunkUpsert<T extends object>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  table: string,
  rows: T[],
  onConflict: string
) {
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const { error } = await supabase
      .from(table)
      .upsert(chunk, { onConflict, ignoreDuplicates: false });
    if (error) throw new Error(`${table} upsert failed: ${error.message}`);
  }
}

// ─── Actions ──────────────────────────────────────────────────────────────────

export async function upsertSalesRows(rows: SalesRowInput[]) {
  if (rows.length === 0) return { count: 0 };
  const supabase = await createClient();
  await chunkUpsert(supabase, 'sales_monthly', rows, 'month,agency_id,brand_code');
  return { count: rows.length };
}

export async function upsertWholesaleRows(rows: WholesaleRowInput[]) {
  if (rows.length === 0) return { count: 0 };
  const supabase = await createClient();
  await chunkUpsert(supabase, 'wholesale_detail', rows, 'month,agency_id,brand_code,permit_number');
  return { count: rows.length };
}

export async function getSalesHealth(): Promise<SalesHealth> {
  const supabase = await createClient();

  // All distinct months
  const { data: monthRows, error: mErr } = await supabase
    .from('sales_monthly')
    .select('month')
    .order('month', { ascending: true });
  if (mErr) throw mErr;

  const months = [...new Set((monthRows ?? []).map((r: { month: string }) => r.month))].sort() as string[];

  // Detect gaps
  const gaps: string[] = [];
  for (let i = 1; i < months.length; i++) {
    const prev = new Date(months[i - 1] + '-01');
    const curr = new Date(months[i] + '-01');
    const expected = new Date(prev);
    expected.setMonth(expected.getMonth() + 1);
    if (curr.getTime() !== expected.getTime()) {
      gaps.push(`${months[i - 1]} → ${months[i]}`);
    }
  }

  // Unrecognized brand codes
  const { data: unknownRows, error: uErr } = await supabase
    .from('sales_monthly')
    .select('brand_code, product_name')
    .eq('brand_family', 'Unknown');
  if (uErr) throw uErr;

  const unknownCodes: Record<string, { product_name: string; count: number }> = {};
  for (const row of unknownRows ?? []) {
    if (!unknownCodes[row.brand_code]) {
      unknownCodes[row.brand_code] = { product_name: row.product_name, count: 0 };
    }
    unknownCodes[row.brand_code].count++;
  }

  return {
    months,
    gaps,
    unknownCodes,
    lastMonth: months[months.length - 1] ?? null,
  };
}
