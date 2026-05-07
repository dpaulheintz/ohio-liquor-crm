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

export interface SkuMonthlyRow {
  month: string;
  brand_code: string;
  product_name: string;
  brand_family: string;
  size: string;
  retail_bottles: number;
  retail_amount: number;
  wholesale_bottles: number;
  wholesale_amount: number;
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

// Full wholesale row — includes wholesaler identity fields for account leaderboard
export interface WholesaleFullRow {
  month: string;
  agency_id: string;
  agency_name: string | null;
  brand_code: string;
  brand_family: string;
  product_name: string;
  size: string;
  wholesaler_name: string | null;
  dba: string | null;
  bottles_sold: number;
  amount: number;
}

// Per-month row keyed by family + product + HB status — for channel split charts
export interface SplitRow {
  month: string;
  brand_family: string;
  product_name: string;
  is_hb_agency: boolean;
  hb_location: string | null; // 'Grandview' | 'Gahanna' | 'Westerville' | null
  retail_bottles: number;
  retail_amount: number;
  wholesale_bottles: number;
  wholesale_amount: number;
}

// Account group record — mirrors account_groups table
export interface AccountGroupData {
  id: string;
  group_name: string;
  match_terms: string[];
  match_columns: 'wholesaler' | 'dba' | 'both';
  color: string;
}

export interface SalesDashboardData {
  // Aggregated by month + brand_family (full history)
  monthly: MonthlyRow[];
  // Aggregated by month + product_name + brand_family (full history)
  products: ProductRow[];
  // Aggregated by month + brand_code (full history, for SKU leaderboard)
  skuMonthly: SkuMonthlyRow[];
  // Full monthly detail keyed by family+product+hb status (for channel split)
  splitRows: SplitRow[];
  // Last 6 months of wholesale_detail (for hot accounts)
  wholesaleRecent: WholesaleRecentRow[];
  // Full wholesale_detail history (for account leaderboard)
  wholesaleFull: WholesaleFullRow[];
  // Account group definitions (for grouping wholesale accounts)
  accountGroups: AccountGroupData[];
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
      'month, brand_code, brand_family, product_name, size, is_hb_agency, hb_location, retail_bottles, retail_amount, wholesale_bottles, wholesale_amount'
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

  // ── Aggregate by month + brand_code (SKU leaderboard) ────────────────────
  const skuMap = new Map<string, SkuMonthlyRow>();
  for (const r of rows) {
    const key = `${r.month}|${r.brand_code}`;
    const existing = skuMap.get(key);
    if (existing) {
      existing.retail_bottles += r.retail_bottles ?? 0;
      existing.retail_amount += r.retail_amount ?? 0;
      existing.wholesale_bottles += r.wholesale_bottles ?? 0;
      existing.wholesale_amount += r.wholesale_amount ?? 0;
    } else {
      skuMap.set(key, {
        month: r.month,
        brand_code: r.brand_code ?? '',
        product_name: r.product_name ?? '',
        brand_family: r.brand_family ?? 'Unknown',
        size: r.size ?? '',
        retail_bottles: r.retail_bottles ?? 0,
        retail_amount: r.retail_amount ?? 0,
        wholesale_bottles: r.wholesale_bottles ?? 0,
        wholesale_amount: r.wholesale_amount ?? 0,
      });
    }
  }
  const skuMonthly = Array.from(skuMap.values()).sort((a, b) =>
    a.month.localeCompare(b.month)
  );

  // ── Aggregate by month + brand_family + product_name + hb status ──────────
  // Used for the Retail vs Wholesale Split charts (channel split section)
  const splitMap = new Map<string, SplitRow>();
  for (const r of rows) {
    const hb = r.is_hb_agency ? '1' : '0';
    const loc = r.hb_location ?? '';
    const key = `${r.month}|${r.brand_family}|${r.product_name}|${hb}|${loc}`;
    const existing = splitMap.get(key);
    if (existing) {
      existing.retail_bottles += r.retail_bottles ?? 0;
      existing.retail_amount += r.retail_amount ?? 0;
      existing.wholesale_bottles += r.wholesale_bottles ?? 0;
      existing.wholesale_amount += r.wholesale_amount ?? 0;
    } else {
      splitMap.set(key, {
        month: r.month,
        brand_family: r.brand_family ?? 'Unknown',
        product_name: r.product_name ?? '',
        is_hb_agency: r.is_hb_agency ?? false,
        hb_location: r.hb_location ?? null,
        retail_bottles: r.retail_bottles ?? 0,
        retail_amount: r.retail_amount ?? 0,
        wholesale_bottles: r.wholesale_bottles ?? 0,
        wholesale_amount: r.wholesale_amount ?? 0,
      });
    }
  }
  const splitRows = Array.from(splitMap.values()).sort((a, b) =>
    a.month.localeCompare(b.month)
  );

  // ── Last updated ──────────────────────────────────────────────────────────
  const lastUpdated =
    monthly.length > 0 ? monthly[monthly.length - 1].month : null;

  // ── Fetch ALL wholesale_detail (used for both hot accounts and leaderboard) ─
  const { data: wData } = await supabase
    .from('wholesale_detail')
    .select(
      'month, agency_id, agency_name, brand_code, brand_family, product_name, size, wholesaler_name, dba, bottles_sold, amount'
    )
    .order('month', { ascending: true });

  const wholesaleFull: WholesaleFullRow[] = (wData ?? []).map((r) => ({
    month: r.month,
    agency_id: r.agency_id,
    agency_name: r.agency_name ?? null,
    brand_code: r.brand_code ?? '',
    brand_family: r.brand_family ?? 'Unknown',
    product_name: r.product_name ?? '',
    size: r.size ?? '',
    wholesaler_name: r.wholesaler_name ?? null,
    dba: r.dba ?? null,
    bottles_sold: r.bottles_sold ?? 0,
    amount: r.amount ?? 0,
  }));

  // Derive wholesaleRecent (last 6 months) for the hot accounts section
  const sixMonthsAgo = lastUpdated
    ? (() => {
        const d = new Date(lastUpdated + '-01');
        d.setMonth(d.getMonth() - 5);
        return d.toISOString().slice(0, 7);
      })()
    : '';
  const wholesaleRecent: WholesaleRecentRow[] = wholesaleFull
    .filter((r) => r.month >= sixMonthsAgo && r.month <= (lastUpdated ?? ''))
    .map((r) => ({
      month: r.month,
      agency_id: r.agency_id,
      agency_name: r.agency_name,
      brand_family: r.brand_family,
      product_name: r.product_name,
      bottles_sold: r.bottles_sold,
      amount: r.amount,
    }));

  // ── Fetch account groups ──────────────────────────────────────────────────
  const { data: groupsData } = await supabase
    .from('account_groups')
    .select('id, group_name, match_terms, match_columns, color')
    .order('group_name');

  const accountGroups: AccountGroupData[] = (groupsData ?? []).map((g) => ({
    id: g.id,
    group_name: g.group_name,
    match_terms: (g.match_terms as string[]) ?? [],
    match_columns: g.match_columns as 'wholesaler' | 'dba' | 'both',
    color: g.color,
  }));

  return {
    monthly,
    products,
    skuMonthly,
    splitRows,
    wholesaleRecent,
    wholesaleFull,
    accountGroups,
    lastUpdated,
  };
}
