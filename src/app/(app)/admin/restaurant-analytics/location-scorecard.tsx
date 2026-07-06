'use client';

import { GOLD, fmtMoney, fmtCheck, fmtInt, type LocationName } from './lib';

// ─── Data contract ────────────────────────────────────────────────────────────

export interface LocationStat {
  location: LocationName;
  revenue: number;
  guests: number;
  avgCheck: number;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function LocationScorecard({ stats }: { stats: LocationStat[] }) {
  const ranked = [...stats].sort((a, b) => b.revenue - a.revenue);
  const topRevenue = ranked[0]?.revenue ?? 0;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      {ranked.map((s, i) => {
        const share = topRevenue > 0 ? (s.revenue / topRevenue) * 100 : 0;
        return (
          <div key={s.location} className="rounded-xl border bg-card p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="font-serif text-base font-semibold text-foreground">{s.location}</span>
              <span
                className="flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold font-mono"
                style={{
                  background: i === 0 ? GOLD : 'var(--muted, #f1f1f1)',
                  color: i === 0 ? '#000' : '#71717a',
                }}
              >
                {i + 1}
              </span>
            </div>

            <div>
              <span className="text-2xl font-serif font-bold text-foreground leading-none">
                {fmtMoney(s.revenue)}
              </span>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full" style={{ width: `${share}%`, background: GOLD }} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <div className="flex flex-col">
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Guests</span>
                <span className="font-mono text-sm text-foreground">{fmtInt(s.guests)}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Avg Check</span>
                <span className="font-mono text-sm text-foreground">
                  {s.guests > 0 ? fmtCheck(s.avgCheck) : '—'}
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
