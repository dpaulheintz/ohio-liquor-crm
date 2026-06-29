/**
 * Shared constants, formatters, and components for the Sales Dashboard sections.
 * All section components import from here to eliminate duplication.
 */

import type { AccountGroupData } from '@/app/actions/sales-dashboard';

// ─── Constants ────────────────────────────────────────────────────────────────

export const FAMILY_COLORS: Record<string, string> = {
  Vodka: '#3b82f6',
  '(614) Vodka': '#06b6d4',
  Gin: '#22c55e',
  'Whiskey War': '#C5A572',
  Midnight: '#8b5cf6',
  'Midnight (Discontinued)': '#7c3aed',
  Bourbon: '#f97316',
  RTD: '#ec4899',
  Misc: '#a78bfa',
  Unknown: '#6b7280',
};

export const FAMILY_COLOR_DEFAULT = '#94a3b8';
export const GOLD = '#C5A572';
export const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ─── Formatters ───────────────────────────────────────────────────────────────

export function fmtDollar(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(1)}k`;
  return `$${n.toFixed(0)}`;
}

export function fmtBottles(n: number): string {
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString();
}

// ─── Month helpers ────────────────────────────────────────────────────────────

/** Build an array of "YYYY-MM" strings from `from` to `to` inclusive. */
export function eachMonth(from: string, to: string): string[] {
  const months: string[] = [];
  let [y, m] = from.split('-').map(Number);
  const [ey, em] = to.split('-').map(Number);
  while (y < ey || (y === ey && m <= em)) {
    months.push(`${y}-${String(m).padStart(2, '0')}`);
    if (++m > 12) { m = 1; y++; }
  }
  return months;
}

/** "YYYY-MM" → "Jan '25" */
export function fmtMonthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

// ─── Account helpers ──────────────────────────────────────────────────────────

export function isHighBank(wholesaler: string | null, dba: string | null): boolean {
  const w = (wholesaler ?? '').toUpperCase();
  const d = (dba ?? '').toUpperCase();
  return w.includes('HIGH BANK') || d.includes('HIGH BANK');
}

export function resolveAccount(
  wholesaler: string | null,
  dba: string | null,
  groups: AccountGroupData[]
): { key: string; displayName: string; groupColor?: string } {
  const wl = (wholesaler ?? '').toLowerCase();
  const dl = (dba ?? '').toLowerCase();
  for (const group of groups) {
    const hit = (text: string) =>
      group.match_terms.some((term) => text.includes(term.toLowerCase()));
    const matched =
      group.match_columns === 'wholesaler' ? hit(wl) :
      group.match_columns === 'dba'        ? hit(dl) :
      hit(wl) || hit(dl);
    if (matched) return { key: `group::${group.id}`, displayName: group.group_name, groupColor: group.color };
  }
  const name = wholesaler?.trim() || dba?.trim() || 'Unknown Account';
  return { key: `raw::${name}`, displayName: name };
}

// ─── Shared UI components ─────────────────────────────────────────────────────

export function KpiCard({
  label, value, sub, badge,
}: {
  label: string;
  value: string;
  sub?: string;
  badge?: { label: string; up: boolean } | null;
}) {
  return (
    <div className="rounded-xl border border bg-card px-5 py-4 flex flex-col gap-1.5">
      <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">{label}</span>
      <span className="text-3xl font-serif font-bold text-foreground leading-none">{value}</span>
      {badge && (
        <span className={`text-xs font-mono ${badge.up ? 'text-emerald-400' : 'text-red-400'}`}>
          {badge.label}
        </span>
      )}
      {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function ChartTip({ active, payload, label, fmt }: { active?: boolean; payload?: any[]; label?: string; fmt?: (v: number) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-zinc-700 bg-[#1C1C1C] px-3 py-2 text-xs shadow-xl min-w-[130px]">
      {label && <p className="text-white/60 mb-1.5 font-medium border-b border-zinc-700 pb-1">{label}</p>}
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      {payload.map((p: any) => (
        <p key={p.name} className="flex justify-between gap-3">
          <span style={{ color: p.color ?? p.fill }} className="truncate">{p.name}</span>
          <span className="font-mono font-semibold text-white">
            {fmt ? fmt(p.value ?? 0) : (p.value ?? 0).toLocaleString()}
          </span>
        </p>
      ))}
    </div>
  );
}
