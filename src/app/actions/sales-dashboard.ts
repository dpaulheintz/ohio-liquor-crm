'use server';

import { createClient } from '@/lib/supabase/server';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MonthlyRow {
  month: string;         // YYYY-MM
  brand_family: string;
  retail_bottles: number;
  retail_amount: number;
  wholesale_bottles: number;
  wholesale_amount: number;
}

export interface ProductRow {
  month: string;
  brand_family: string;
  product_name: string;
  bottles: number;
  revenue: number;
}

export interface WholesaleRecentRow {
  month: string;
  agency_id: string;
  agency_name: string | null;
  brand_family: string;
  product_name: string;
  bottles_sold: number;
  amount: number;
}

export interface SalesDashboardData {
  // Aggregated by month + brand_family (full history)
  monthly: MonthlyRow[];
  // Aggregated by month + product_name + brand_family (full history)
  products: ProductRow[];
  // Last 6 months of wholesale_detail (for hot accounts)
  wholesaleRecent: WholesaleRecentRow[];
  // Most recent month loaded in DB
  lastUpdated: string | null;
}

// ─── Server action ────────────────────────────────────────────────────────────

export async function getSalesDashboardData(): Promise<SalesDashboardData> {
  const supabase = await createClient();

  // Fetch all sales_monthly rows (columns we need for aggregation)
  const { data: rawSales, error: salesErr } = await supabase
    .from('sales_monthly')
    .select(
      'month, brand_family, product_name, retail_bottles, retail_amount, wholesale_bottles, wholesale_amount'
    )
    .order('month', { ascending: true });
  if (salesErr) throw salesErr;

  const rows = rawSales ?? [];

  // ── Aggregate by month + brand_family ────────────────────────────────────
  const monthlyMap = new Map<string, MonthlyRow>();
  for (const r of rows) {
    const key = `${r.month}|${r.brand_family}`;
    const existing = monthlyMap.get(key);
    if (existing) {
      existing.retail_bottles += r.retail_bottles ?? 0;
      existing.retail_amount += r.retail_amount ?? 0;
      existing.wholesale_bottles += r.wholesale_bottles ?? 0;
      existing.wholesale_amount += r.wholesale_amount ?? 0;
    } else {
      monthlyMap.set(key, {
        month: r.month,
        brand_family: r.brand_family,
        retail_bottles: r.retail_bottles ?? 0,
        retail_amount: r.retail_amount ?? 0,
        wholesale_bottles: r.wholesale_bottles ?? 0,
        wholesale_amount: r.wholesale_amount ?? 0,
      });
    }
  }
  const monthly = Array.from(monthlyMap.values()).sort((a, b) =>
    a.month.localeCompare(b.month)
  );

  // ── Aggregate by month + product_name + brand_family ─────────────────────
  const productMap = new Map<string, ProductRow>();
  for (const r of rows) {
    const key = `${r.month}|${r.brand_family}|${r.product_name}`;
    const existing = productMap.get(key);
    const rev = (r.retail_amount ?? 0) + (r.wholesale_amount ?? 0);
    const bot = (r.retail_bottles ?? 0) + (r.wholesale_bottles ?? 0);
    if (existing) {
      existing.bottles += bot;
      existing.revenue += rev;
    } else {
      productMap.set(key, {
        month: r.month,
        brand_family: r.brand_family,
        product_name: r.product_name,
        bottles: bot,
        revenue: rev,
      });
    }
  }
  const products = Array.from(productMap.values()).sort((a, b) =>
    a.month.localeCompare(b.month)
  );

  // ── Last updated ──────────────────────────────────────────────────────────
  const lastUpdated =
    monthly.length > 0 ? monthly[monthly.length - 1].month : null;

  // ── Last 6 months wholesale (for hot accounts) ────────────────────────────
  let wholesaleRecent: WholesaleRecentRow[] = [];
  if (lastUpdated) {
    // Compute 6 months before lastUpdated
    const d = new Date(lastUpdated + '-01');
    d.setMonth(d.getMonth() - 5);
    const sixMonthsAgo = d.toISOString().slice(0, 7);

    const { data: wData } = await supabase
      .from('wholesale_detail')
      .select('month, agency_id, agency_name, brand_family, product_name, bottles_sold, amount')
      .gte('month', sixMonthsAgo)
      .lte('month', lastUpdated);

    wholesaleRecent = ((wData ?? []) as WholesaleRecentRow[]).map((r) => ({
      ...r,
      bottles_sold: r.bottles_sold ?? 0,
      amount: r.amount ?? 0,
    }));
  }

  return { monthly, products, wholesaleRecent, lastUpdated };
}
