'use client';

// ─── Props ────────────────────────────────────────────────────────────────────

export interface Section07InsightsProps {
  dateFrom: string;
  dateTo: string;
  selectedLocations: string[];
}

// ─── Placeholder insight card shapes ─────────────────────────────────────────

const INSIGHT_SLOTS = [
  { icon: '📈', label: 'Trending Item',     hint: 'Top mover vs. prior week' },
  { icon: '👥', label: 'Busiest Day',        hint: 'Highest guest count in period' },
  { icon: '🥃', label: 'HB Spirit Sales',   hint: 'Our bottles sold across locations' },
  { icon: '⚡', label: 'Fastest Turn',       hint: 'Table with shortest avg visit' },
  { icon: '💰', label: 'Best Avg Check',     hint: 'Location with highest per-guest spend' },
  { icon: '🎉', label: 'Fun Fact',           hint: 'Auto-generated weekly highlight' },
];

// ─── Main component ───────────────────────────────────────────────────────────

export function Section07Insights(_props: Section07InsightsProps) {
  return (
    <div className="space-y-4">
      {/* Rotating insight cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {INSIGHT_SLOTS.map(({ icon, label, hint }) => (
          <div
            key={label}
            className="rounded-xl border border-zinc-800 bg-[#111] px-4 py-4 flex flex-col gap-2"
          >
            <span className="text-2xl leading-none">{icon}</span>
            <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-medium">
              {label}
            </span>
            <span className="text-base font-serif font-bold text-zinc-700 leading-snug">—</span>
            <span className="text-[10px] text-zinc-700 leading-relaxed">{hint}</span>
          </div>
        ))}
      </div>

      {/* Narrative / summary block */}
      <div className="rounded-xl border border-zinc-800 bg-[#111] p-5">
        <h3 className="text-[10px] uppercase tracking-widest text-zinc-500 mb-3 font-medium">
          Weekly Narrative
        </h3>
        <div className="rounded-lg border border-dashed border-zinc-800 px-5 py-6 flex flex-col items-center justify-center text-center gap-2 min-h-[80px]">
          <p className="text-xs text-zinc-700 max-w-md leading-relaxed">
            Auto-generated weekly summary will appear here once data is synced.
            This panel will highlight standout performance, anomalies, and
            actionable callouts across all three locations.
          </p>
        </div>
        <p className="mt-3 text-center text-[10px] text-zinc-700 uppercase tracking-widest">
          No data — connect Toast sync + optional AI narrative to populate
        </p>
      </div>
    </div>
  );
}
