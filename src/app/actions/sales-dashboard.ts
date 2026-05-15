'use server';

import { createAdminClient } from '@/lib/supabase/server';

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

// Per-agency × SKU × month retail row — for agency ranking by SKU feature
export interface AgencySkuRow {
  month: string;
  brand_code: string;
  product_name: string;
  brand_family: string;
  size: string;
  agency_id: string;
  agency_name: string | null;
  retail_bottles: number;
  retail_amount: number;
}

// Per-month wholesale split — HB bar vs external — for wholesale donut chart
export interface WholesaleSplitRow {
  month: string;
  hb_amount: number;
  hb_bottles: number;
  outside_amount: number;
  outside_bottles: number;
}

export interface SalesDashboardData {
  monthly: MonthlyRow[];
  products: ProductRow[];       // kept for interface compat (currently unused in UI)
  skuMonthly: SkuMonthlyRow[];
  splitRows: SplitRow[];
  wholesaleRecent: WholesaleRecentRow[];
  wholesaleFull: WholesaleFullRow[];
  accountGroups: AccountGroupData[];
  agencySkuMonthly: AgencySkuRow[];
  wholesaleSplit: WholesaleSplitRow[];
  lastUpdated: string | null;
}

// ─── Server action ────────────────────────────────────────────────────────────

export async function getSalesDashboardData(): Promise<SalesDashboardData> {
  // One RPC call to get_dashboard_data() — a SECURITY DEFINER Postgres function
  // that aggregates everything server-side and returns a single JSON object.
  // This completely avoids the PostgREST max_rows cap (21k raw rows → one blob).
  const supabase = createAdminClient();

  const { data, error } = await supabase.rpc('get_dashboard_data');
  if (error) throw new Error(`Dashboard RPC failed: ${error.message}`);
  if (!data) throw new Error('Dashboard RPC returned no data');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = data as any;

  // ── monthly (month × brand_family) ───────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const monthly: MonthlyRow[] = (d.monthly ?? []).map((r: any) => ({
    month:              String(r.month),
    brand_family:       String(r.brand_family ?? 'Unknown'),
    retail_bottles:     Number(r.retail_bottles ?? 0),
    retail_amount:      Number(r.retail_amount ?? 0),
    wholesale_bottles:  Number(r.wholesale_bottles ?? 0),
    wholesale_amount:   Number(r.wholesale_amount ?? 0),
  })).sort((a: MonthlyRow, b: MonthlyRow) => a.month.localeCompare(b.month));

  // ── skuMonthly (month × brand_code) ──────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const skuMonthly: SkuMonthlyRow[] = (d.sku_monthly ?? []).map((r: any) => ({
    month:              String(r.month),
    brand_code:         String(r.brand_code ?? ''),
    product_name:       String(r.product_name ?? ''),
    brand_family:       String(r.brand_family ?? 'Unknown'),
    size:               String(r.size ?? ''),
    retail_bottles:     Number(r.retail_bottles ?? 0),
    retail_amount:      Number(r.retail_amount ?? 0),
    wholesale_bottles:  Number(r.wholesale_bottles ?? 0),
    wholesale_amount:   Number(r.wholesale_amount ?? 0),
  })).sort((a: SkuMonthlyRow, b: SkuMonthlyRow) => a.month.localeCompare(b.month));

  // ── splitRows (month × family × product × HB flags) ──────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const splitRows: SplitRow[] = (d.split_rows ?? []).map((r: any) => ({
    month:              String(r.month),
    brand_family:       String(r.brand_family ?? 'Unknown'),
    product_name:       String(r.product_name ?? ''),
    is_hb_agency:       Boolean(r.is_hb_agency),
    hb_location:        r.hb_location ? String(r.hb_location) : null,
    retail_bottles:     Number(r.retail_bottles ?? 0),
    retail_amount:      Number(r.retail_amount ?? 0),
    wholesale_bottles:  Number(r.wholesale_bottles ?? 0),
    wholesale_amount:   Number(r.wholesale_amount ?? 0),
  })).sort((a: SplitRow, b: SplitRow) => a.month.localeCompare(b.month));

  // ── wholesaleFull ─────────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const wholesaleFull: WholesaleFullRow[] = (d.wholesale ?? []).map((r: any) => ({
    month:            String(r.month),
    agency_id:        String(r.agency_id),
    agency_name:      r.agency_name ? String(r.agency_name) : null,
    brand_code:       String(r.brand_code ?? ''),
    brand_family:     String(r.brand_family ?? 'Unknown'),
    product_name:     String(r.product_name ?? ''),
    size:             String(r.size ?? ''),
    wholesaler_name:  r.wholesaler_name ? String(r.wholesaler_name) : null,
    dba:              r.dba ? String(r.dba) : null,
    bottles_sold:     Number(r.bottles_sold ?? 0),
    amount:           Number(r.amount ?? 0),
  })).sort((a: WholesaleFullRow, b: WholesaleFullRow) => a.month.localeCompare(b.month));

  // ── lastUpdated ───────────────────────────────────────────────────────────
  const lastUpdated = monthly.length > 0 ? monthly[monthly.length - 1].month : null;

  // ── wholesaleRecent (last 6 months) ───────────────────────────────────────
  const sixMonthsAgo = lastUpdated
    ? (() => {
        const d2 = new Date(lastUpdated + '-01');
        d2.setMonth(d2.getMonth() - 5);
        return d2.toISOString().slice(0, 7);
      })()
    : '';
  const wholesaleRecent: WholesaleRecentRow[] = wholesaleFull
    .filter((r) => r.month >= sixMonthsAgo && r.month <= (lastUpdated ?? ''))
    .map((r) => ({
      month:        r.month,
      agency_id:    r.agency_id,
      agency_name:  r.agency_name,
      brand_family: r.brand_family,
      product_name: r.product_name,
      bottles_sold: r.bottles_sold,
      amount:       r.amount,
    }));

  // ── accountGroups ─────────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const accountGroups: AccountGroupData[] = (d.account_groups ?? []).map((g: any) => ({
    id:             String(g.id),
    group_name:     String(g.group_name),
    match_terms:    (g.match_terms as string[]) ?? [],
    match_columns:  g.match_columns as 'wholesaler' | 'dba' | 'both',
    color:          String(g.color),
  }));

  // ── agencySkuMonthly (month × brand_code × agency) ───────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const agencySkuMonthly: AgencySkuRow[] = (d.agency_sku_monthly ?? []).map((r: any) => ({
    month:          String(r.month),
    brand_code:     String(r.brand_code ?? ''),
    product_name:   String(r.product_name ?? ''),
    brand_family:   String(r.brand_family ?? 'Unknown'),
    size:           String(r.size ?? ''),
    agency_id:      String(r.agency_id ?? ''),
    agency_name:    r.agency_name ? String(r.agency_name) : null,
    retail_bottles: Number(r.retail_bottles ?? 0),
    retail_amount:  Number(r.retail_amount ?? 0),
  })).sort((a: AgencySkuRow, b: AgencySkuRow) => a.month.localeCompare(b.month));

  // ── wholesaleSplit (month → hb vs outside wholesale) ─────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const wholesaleSplit: WholesaleSplitRow[] = (d.wholesale_monthly_split ?? []).map((r: any) => ({
    month:           String(r.month),
    hb_amount:       Number(r.hb_amount ?? 0),
    hb_bottles:      Number(r.hb_bottles ?? 0),
    outside_amount:  Number(r.outside_amount ?? 0),
    outside_bottles: Number(r.outside_bottles ?? 0),
  })).sort((a: WholesaleSplitRow, b: WholesaleSplitRow) => a.month.localeCompare(b.month));

  // products kept for interface compat — derive from monthly (not displayed currently)
  const products: ProductRow[] = [];

  return {
    monthly,
    products,
    skuMonthly,
    splitRows,
    wholesaleRecent,
    wholesaleFull,
    accountGroups,
    agencySkuMonthly,
    wholesaleSplit,
    lastUpdated,
  };
}
