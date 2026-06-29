'use client';

// ─── Props ────────────────────────────────────────────────────────────────────

export interface Section06CompsProps {
  dateFrom: string;
  dateTo: string;
  selectedLocations: string[];
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatChip({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border bg-background px-4 py-3 flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">{label}</span>
      <span className="text-2xl font-serif font-bold text-white leading-none">{value}</span>
      {sub && <span className="text-[10px] text-muted-foreground">{sub}</span>}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function Section06Comps(_props: Section06CompsProps) {
  const ROWS = [
    { label: 'Total Comps',     value: '—', pct: '—', note: 'Manager comps, employee meals, etc.' },
    { label: 'Total Voids',     value: '—', pct: '—', note: 'Voided checks before payment' },
    { label: 'Discounts',       value: '—', pct: '—', note: 'Promotions, happy hour, etc.' },
    { label: 'Total Reductions',value: '—', pct: '—', note: 'Comps + voids + discounts combined' },
  ];

  return (
    <div className="space-y-4">
      {/* Summary chips */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatChip label="Total Comps"      value="—" sub="Period total" />
        <StatChip label="Comps % of Sales" value="—" sub="Industry target < 1%" />
        <StatChip label="Total Voids"      value="—" sub="Period total" />
        <StatChip label="Void % of Sales"  value="—" sub="Industry target < 2%" />
      </div>

      {/* Detail table */}
      <div className="rounded-xl border border bg-card p-4">
        <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground mb-3 font-medium">
          Breakdown
        </h3>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border">
              <th className="px-3 py-2 text-left text-[10px] uppercase tracking-widest text-muted-foreground font-medium">Type</th>
              <th className="px-3 py-2 text-right text-[10px] uppercase tracking-widest text-muted-foreground font-medium">Amount</th>
              <th className="px-3 py-2 text-right text-[10px] uppercase tracking-widest text-muted-foreground font-medium">% of Sales</th>
              <th className="px-3 py-2 text-left text-[10px] uppercase tracking-widest text-muted-foreground font-medium hidden sm:table-cell">Notes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-900">
            {ROWS.map(({ label, value, pct, note }) => (
              <tr key={label} className="hover:bg-white/40 transition-colors">
                <td className="px-3 py-2.5 text-foreground font-medium">{label}</td>
                <td className="px-3 py-2.5 text-right font-mono text-muted-foreground">{value}</td>
                <td className="px-3 py-2.5 text-right font-mono text-muted-foreground">{pct}</td>
                <td className="px-3 py-2.5 text-muted-foreground hidden sm:table-cell">{note}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-center text-[10px] text-muted-foreground uppercase tracking-widest">
          No data — connect Toast comp/void export to populate
        </p>
      </div>
    </div>
  );
}
