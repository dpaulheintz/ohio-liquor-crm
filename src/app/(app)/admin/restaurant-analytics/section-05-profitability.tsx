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
        <div className="rounded-xl border border-zinc-800 bg-[#111] p-4">
          <h3 className="text-[10px] uppercase tracking-widest text-zinc-500 mb-3 font-medium">
            Most Profitable Items
          </h3>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-zinc-800">
                <th className="px-2 py-2 text-left text-[10px] uppercase tracking-widest text-zinc-600 font-medium">#</th>
                <th className="px-2 py-2 text-left text-[10px] uppercase tracking-widest text-zinc-600 font-medium">Item</th>
                <th className="px-2 py-2 text-right text-[10px] uppercase tracking-widest text-zinc-600 font-medium">Total Profit</th>
                <th className="px-2 py-2 text-right text-[10px] uppercase tracking-widest text-zinc-600 font-medium">Qty</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-900">
              {EMPTY_ROWS.map(({ rank }) => (
                <tr key={rank} className="hover:bg-zinc-900/40 transition-colors">
                  <td className="px-2 py-2.5 text-zinc-700 font-mono">{rank}</td>
                  <td className="px-2 py-2.5 text-zinc-700">—</td>
                  <td className="px-2 py-2.5 text-right font-mono text-zinc-700">—</td>
                  <td className="px-2 py-2.5 text-right font-mono text-zinc-700">—</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-center text-[10px] text-zinc-700 uppercase tracking-widest">
            No data
          </p>
        </div>

        {/* Highest Margin % */}
        <div className="rounded-xl border border-zinc-800 bg-[#111] p-4">
          <h3 className="text-[10px] uppercase tracking-widest text-zinc-500 mb-3 font-medium">
            Highest Margin %
          </h3>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-zinc-800">
                <th className="px-2 py-2 text-left text-[10px] uppercase tracking-widest text-zinc-600 font-medium">#</th>
                <th className="px-2 py-2 text-left text-[10px] uppercase tracking-widest text-zinc-600 font-medium">Item</th>
                <th className="px-2 py-2 text-right text-[10px] uppercase tracking-widest text-zinc-600 font-medium">Margin %</th>
                <th className="px-2 py-2 text-right text-[10px] uppercase tracking-widest text-zinc-600 font-medium">Price</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-900">
              {EMPTY_ROWS.map(({ rank }) => (
                <tr key={rank} className="hover:bg-zinc-900/40 transition-colors">
                  <td className="px-2 py-2.5 text-zinc-700 font-mono">{rank}</td>
                  <td className="px-2 py-2.5 text-zinc-700">—</td>
                  <td className="px-2 py-2.5 text-right font-mono text-zinc-700">—</td>
                  <td className="px-2 py-2.5 text-right font-mono text-zinc-700">—</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-center text-[10px] text-zinc-700 uppercase tracking-widest">
            No data
          </p>
        </div>
      </div>

      {/* Category Leaders sub-panel */}
      <div className="rounded-xl border border-zinc-800 bg-[#111] p-4">
        <h3 className="text-[10px] uppercase tracking-widest text-zinc-500 mb-3 font-medium">
          Category Leaders
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {CATEGORY_SLOTS.map((slot) => (
            <div key={slot} className="rounded-lg border border-zinc-800/60 bg-[#0a0a0a] px-3 py-3 flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-widest text-zinc-600 font-medium">{slot}</span>
              <span className="text-sm font-serif font-semibold text-zinc-700 leading-snug">—</span>
              <span className="text-[10px] font-mono text-zinc-700">— sold · —% margin</span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-center text-[10px] text-zinc-700 uppercase tracking-widest">
          No data — connect menu_items + daily_item_sales to populate
        </p>
      </div>
    </div>
  );
}
