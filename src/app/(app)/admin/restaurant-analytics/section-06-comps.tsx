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
    <div className="rounded-xl border border-zinc-800 bg-[#0a0a0a] px-4 py-3 flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-medium">{label}</span>
      <span className="text-2xl font-serif font-bold text-white leading-none">{value}</span>
      {sub && <span className="text-[10px] text-zinc-600">{sub}</span>}
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
      <div className="rounded-xl border border-zinc-800 bg-[#111] p-4">
        <h3 className="text-[10px] uppercase tracking-widest text-zinc-500 mb-3 font-medium">
          Breakdown
        </h3>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-zinc-800">
              <th className="px-3 py-2 text-left text-[10px] uppercase tracking-widest text-zinc-600 font-medium">Type</th>
              <th className="px-3 py-2 text-right text-[10px] uppercase tracking-widest text-zinc-600 font-medium">Amount</th>
              <th className="px-3 py-2 text-right text-[10px] uppercase tracking-widest text-zinc-600 font-medium">% of Sales</th>
              <th className="px-3 py-2 text-left text-[10px] uppercase tracking-widest text-zinc-600 font-medium hidden sm:table-cell">Notes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-900">
            {ROWS.map(({ label, value, pct, note }) => (
              <tr key={label} className="hover:bg-zinc-900/40 transition-colors">
                <td className="px-3 py-2.5 text-zinc-300 font-medium">{label}</td>
                <td className="px-3 py-2.5 text-right font-mono text-zinc-600">{value}</td>
                <td className="px-3 py-2.5 text-right font-mono text-zinc-600">{pct}</td>
                <td className="px-3 py-2.5 text-zinc-700 hidden sm:table-cell">{note}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-center text-[10px] text-zinc-700 uppercase tracking-widest">
          No data — connect Toast comp/void export to populate
        </p>
      </div>
    </div>
  );
}
