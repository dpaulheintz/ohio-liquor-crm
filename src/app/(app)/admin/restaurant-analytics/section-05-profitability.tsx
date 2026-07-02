'use client';

// ─── Props ────────────────────────────────────────────────────────────────────

export interface Section05ProfitabilityProps {
  dateFrom: string;
  dateTo: string;
  selectedLocations: string[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const EMPTY_ROWS = Array.from({ length: 5 }, (_, i) => ({ rank: i + 1 }));

const CATEGORY_SLOTS = [
  'Top Appetizer',
  'Top Cocktail',
  'Top Entrée',
  'Top Dessert',
  'Top Non-Alcoholic',
];

// ─── Main component ───────────────────────────────────────────────────────────

export function Section05Profitability(_props: Section05ProfitabilityProps) {
  return (
    <div className="space-y-4">
      {/* Two side-by-side tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Most Profitable Items */}
        <div className="rounded-xl border border bg-card p-4">
          <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground mb-3 font-medium">
            Most Profitable Items
          </h3>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border">
                <th className="px-2 py-2 text-left text-[10px] uppercase tracking-widest text-muted-foreground font-medium">#</th>
                <th className="px-2 py-2 text-left text-[10px] uppercase tracking-widest text-muted-foreground font-medium">Item</th>
                <th className="px-2 py-2 text-right text-[10px] uppercase tracking-widest text-muted-foreground font-medium">Total Profit</th>
                <th className="px-2 py-2 text-right text-[10px] uppercase tracking-widest text-muted-foreground font-medium">Qty</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-900">
              {EMPTY_ROWS.map(({ rank }) => (
                <tr key={rank} className="hover:bg-white/40 transition-colors">
                  <td className="px-2 py-2.5 text-muted-foreground font-mono">{rank}</td>
                  <td className="px-2 py-2.5 text-muted-foreground">—</td>
                  <td className="px-2 py-2.5 text-right font-mono text-muted-foreground">—</td>
                  <td className="px-2 py-2.5 text-right font-mono text-muted-foreground">—</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-center text-[10px] text-muted-foreground uppercase tracking-widest">
            No data
          </p>
        </div>

        {/* Highest Margin % */}
        <div className="rounded-xl border border bg-card p-4">
          <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground mb-3 font-medium">
            Highest Margin %
          </h3>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border">
                <th className="px-2 py-2 text-left text-[10px] uppercase tracking-widest text-muted-foreground font-medium">#</th>
                <th className="px-2 py-2 text-left text-[10px] uppercase tracking-widest text-muted-foreground font-medium">Item</th>
                <th className="px-2 py-2 text-right text-[10px] uppercase tracking-widest text-muted-foreground font-medium">Margin %</th>
                <th className="px-2 py-2 text-right text-[10px] uppercase tracking-widest text-muted-foreground font-medium">Price</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-900">
              {EMPTY_ROWS.map(({ rank }) => (
                <tr key={rank} className="hover:bg-white/40 transition-colors">
                  <td className="px-2 py-2.5 text-muted-foreground font-mono">{rank}</td>
                  <td className="px-2 py-2.5 text-muted-foreground">—</td>
                  <td className="px-2 py-2.5 text-right font-mono text-muted-foreground">—</td>
                  <td className="px-2 py-2.5 text-right font-mono text-muted-foreground">—</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-center text-[10px] text-muted-foreground uppercase tracking-widest">
            No data
          </p>
        </div>
      </div>

      {/* Category Leaders sub-panel */}
      <div className="rounded-xl border border bg-card p-4">
        <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground mb-3 font-medium">
          Category Leaders
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {CATEGORY_SLOTS.map((slot) => (
            <div key={slot} className="rounded-lg border border/60 bg-background px-3 py-3 flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">{slot}</span>
              <span className="text-sm font-serif font-semibold text-muted-foreground leading-snug">—</span>
              <span className="text-[10px] font-mono text-muted-foreground">— sold · —% margin</span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-center text-[10px] text-muted-foreground uppercase tracking-widest">
          No data — connect menu_items + daily_item_sales to populate
        </p>
      </div>
    </div>
  );
}
