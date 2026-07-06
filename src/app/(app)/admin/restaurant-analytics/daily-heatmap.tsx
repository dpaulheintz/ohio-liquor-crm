'use client';

import { fmtMoney, monthLabelFull } from './lib';

// ─── Data contract ────────────────────────────────────────────────────────────

export interface HeatmapProps {
  month: string;                       // 'YYYY-MM' currently shown
  monthOptions: string[];              // available months (ascending)
  onSelectMonth: (m: string) => void;
  // day-of-month (1..31) → revenue; absent key = no data for that day
  dayRevenue: Record<number, number>;
  maxRevenue: number;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ─── Main ─────────────────────────────────────────────────────────────────────

export function DailyHeatmap({ month, monthOptions, onSelectMonth, dayRevenue, maxRevenue }: HeatmapProps) {
  const year = Number(month.slice(0, 4));
  const mon = Number(month.slice(5, 7)); // 1-indexed
  const firstWeekday = new Date(year, mon - 1, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(year, mon, 0).getDate();

  // Build a flat cell list: leading blanks then day cells.
  const cells: Array<{ day: number | null }> = [];
  for (let i = 0; i < firstWeekday; i++) cells.push({ day: null });
  for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d });

  function cellStyle(day: number): { background: string; color: string; border: string } {
    const rev = dayRevenue[day];
    if (rev == null) {
      // No data for this day (closed / not synced)
      return { background: 'transparent', color: '#c4c4c4', border: '1px dashed #e2e2e2' };
    }
    const intensity = maxRevenue > 0 ? rev / maxRevenue : 0;
    const opacity = 0.14 + 0.86 * intensity;
    return {
      background: `rgba(197,165,114,${opacity.toFixed(3)})`,
      color: intensity > 0.55 ? '#3a2e18' : '#57534e',
      border: '1px solid transparent',
    };
  }

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">
          Daily Revenue — {monthLabelFull(month)}
        </h3>
        <select
          value={month}
          onChange={(e) => onSelectMonth(e.target.value)}
          className="bg-white border rounded px-2 py-1 text-xs text-foreground focus:outline-none focus:border-primary/60"
        >
          {[...monthOptions].reverse().map((m) => (
            <option key={m} value={m}>{monthLabelFull(m)}</option>
          ))}
        </select>
      </div>

      {/* Weekday header */}
      <div className="grid grid-cols-7 gap-1.5 mb-1.5">
        {WEEKDAYS.map((w) => (
          <div key={w} className="text-center text-[10px] uppercase tracking-widest text-muted-foreground">
            {w}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-1.5">
        {cells.map((c, i) => {
          if (c.day == null) return <div key={`b${i}`} />;
          const rev = dayRevenue[c.day];
          const style = cellStyle(c.day);
          return (
            <div
              key={c.day}
              title={rev != null ? `${monthLabelFull(month)} ${c.day} — ${fmtMoney(rev)}` : `${c.day} — no data`}
              className="aspect-square rounded-md flex flex-col items-center justify-center p-1 transition-transform hover:scale-[1.04]"
              style={{ background: style.background, border: style.border }}
            >
              <span className="text-[10px] font-medium leading-none" style={{ color: style.color }}>
                {c.day}
              </span>
              {rev != null && (
                <span className="text-[9px] font-mono leading-tight mt-0.5" style={{ color: style.color }}>
                  {rev >= 1000 ? `${(rev / 1000).toFixed(0)}k` : rev.toFixed(0)}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-4 flex items-center justify-end gap-2 text-[10px] text-muted-foreground">
        <span>Less</span>
        {[0.14, 0.35, 0.55, 0.75, 1].map((o) => (
          <span
            key={o}
            className="inline-block h-3 w-3 rounded-sm"
            style={{ background: `rgba(197,165,114,${o})` }}
          />
        ))}
        <span>More</span>
      </div>
    </div>
  );
}
