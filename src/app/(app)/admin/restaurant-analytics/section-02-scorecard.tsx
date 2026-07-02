'use client';

// ─── Props ────────────────────────────────────────────────────────────────────

export interface Section02ScorecardProps {
  dateFrom: string;
  dateTo: string;
  selectedLocations: string[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const LOCATIONS = ['Grandview', 'Gahanna', 'Westerville'] as const;

const METRICS = [
  { key: 'revenue',     label: 'F&B Revenue' },
  { key: 'labor_pct',   label: 'Labor %' },
  { key: 'avg_check',   label: 'Avg Check' },
  { key: 'guest_count', label: 'Guest Count' },
  { key: 'prime_cost',  label: 'Prime Cost %' },
] as const;

// ─── Main component ───────────────────────────────────────────────────────────

export function Section02Scorecard({ selectedLocations }: Section02ScorecardProps) {
  const visibleLocations = selectedLocations.length > 0
    ? LOCATIONS.filter((l) => selectedLocations.includes(l))
    : LOCATIONS;

  return (
    <div className="rounded-xl border border bg-card p-4">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border">
              <th className="px-3 py-2.5 text-left text-[10px] uppercase tracking-widest text-muted-foreground font-medium w-40">
                Metric
              </th>
              {visibleLocations.map((loc) => (
                <th key={loc} className="px-3 py-2.5 text-right text-[10px] uppercase tracking-widest text-muted-foreground font-medium">
                  {loc}
                </th>
              ))}
              {visibleLocations.length > 1 && (
                <th className="px-3 py-2.5 text-right text-[10px] uppercase tracking-widest text-muted-foreground font-medium">
                  Total
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-900">
            {METRICS.map(({ key, label }) => (
              <tr key={key} className="hover:bg-white/40 transition-colors">
                <td className="px-3 py-3 text-muted-foreground font-medium">{label}</td>
                {visibleLocations.map((loc) => (
                  <td key={loc} className="px-3 py-3 text-right font-mono text-muted-foreground">
                    —
                  </td>
                ))}
                {visibleLocations.length > 1 && (
                  <td className="px-3 py-3 text-right font-mono text-muted-foreground">—</td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-center text-[10px] text-muted-foreground uppercase tracking-widest">
        No data — connect Toast / MarginEdge sync to populate
      </p>
    </div>
  );
}
