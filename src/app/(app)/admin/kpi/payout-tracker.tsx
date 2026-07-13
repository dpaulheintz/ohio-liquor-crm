'use client';

import { useMemo, useState } from 'react';
import { Trophy } from 'lucide-react';
import type { KpiEventRow } from '@/app/actions/kpi';
import {
  computePayouts, listQuarterOptions, currentQuarterOption, fmtPayout,
  type QuarterOption,
} from '@/lib/kpi-payouts';

// ─── Constants ────────────────────────────────────────────────────────────────

const GOLD = '#C5A572';
const KPI_TYPES = ['Menu', 'Feature', 'Event', 'Display'] as const;
const KPI_COLORS: Record<string, string> = {
  Display: GOLD, Menu: '#60a5fa', Feature: '#34d399', Event: '#f472b6',
};

function quarterKey(q: QuarterOption): string { return `${q.year}-Q${q.quarter}`; }

// ─── Main ─────────────────────────────────────────────────────────────────────

export function PayoutTracker({ kpiEvents }: { kpiEvents: KpiEventRow[] }) {
  const payoutMap = useMemo(() => computePayouts(kpiEvents), [kpiEvents]);
  const quarterOptions = useMemo(() => listQuarterOptions(kpiEvents), [kpiEvents]);
  const [selectedKey, setSelectedKey] = useState<string>(() => quarterKey(currentQuarterOption()));

  const selected = quarterOptions.find(q => quarterKey(q) === selectedKey) ?? quarterOptions[0] ?? currentQuarterOption();
  const isCurrentQuarter = selectedKey === quarterKey(currentQuarterOption());

  const quarterEvents = useMemo(
    () => kpiEvents.filter(e => {
      const d = e.visited_at.slice(0, 10);
      return d >= selected.from && d <= selected.to;
    }),
    [kpiEvents, selected],
  );

  const repPayouts = useMemo(() => {
    const map = new Map<string, { repId: string; name: string; total: number; byType: Record<string, number> }>();
    for (const e of quarterEvents) {
      const payout = payoutMap.get(e.id) ?? 0;
      if (!map.has(e.rep_id)) {
        map.set(e.rep_id, { repId: e.rep_id, name: e.rep_name || e.rep_email, total: 0, byType: { Menu: 0, Feature: 0, Event: 0, Display: 0 } });
      }
      const r = map.get(e.rep_id)!;
      r.total += payout;
      r.byType[e.kpi] = (r.byType[e.kpi] ?? 0) + payout;
    }
    return [...map.values()].sort((a, b) => b.total - a.total);
  }, [quarterEvents, payoutMap]);

  const teamTotal = useMemo(() => repPayouts.reduce((s, r) => s + r.total, 0), [repPayouts]);
  const topTotal = repPayouts[0]?.total ?? 0;

  return (
    <div className="bg-white border border rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Trophy className="h-4 w-4" style={{ color: GOLD }} />
          <p className="text-sm font-semibold text-foreground">
            {isCurrentQuarter ? 'Quarter-to-Date Payouts' : 'Quarterly Payouts'}
          </p>
          <span className="text-xs text-muted-foreground">
            {fmtPayout(teamTotal)} earned across {repPayouts.length || 0} rep{repPayouts.length === 1 ? '' : 's'}
          </span>
        </div>
        <select
          value={selectedKey}
          onChange={e => setSelectedKey(e.target.value)}
          className="h-8 bg-muted border border rounded px-2 text-xs text-foreground"
        >
          {quarterOptions.map(q => (
            <option key={quarterKey(q)} value={quarterKey(q)}>
              {q.label}{quarterKey(q) === quarterKey(currentQuarterOption()) ? ' (current)' : ''}
            </option>
          ))}
        </select>
      </div>

      <div className="p-4">
        {repPayouts.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No KPI payouts logged for {selected.label}.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {repPayouts.map((r, i) => {
              const share = topTotal > 0 ? (r.total / topTotal) * 100 : 0;
              return (
                <div
                  key={r.repId}
                  className="rounded-xl border border p-4 flex flex-col gap-3"
                  style={i === 0 ? { borderColor: `${GOLD}80`, background: `${GOLD}0d` } : undefined}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-foreground truncate">{r.name}</span>
                    {i === 0 && r.total > 0 && <Trophy className="h-4 w-4 shrink-0" style={{ color: GOLD }} />}
                  </div>

                  <div>
                    <span className="text-3xl font-bold tabular-nums" style={{ color: i === 0 ? GOLD : undefined }}>
                      {fmtPayout(r.total)}
                    </span>
                    <div className="mt-2 h-1.5 w-full rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${share}%`, background: GOLD }} />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 pt-1 border-t border">
                    {KPI_TYPES.map(t => (
                      <div key={t} className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-1.5 text-muted-foreground">
                          <span className="h-1.5 w-1.5 rounded-full" style={{ background: KPI_COLORS[t] }} />
                          {t}s
                        </span>
                        <span className="font-mono text-foreground">{fmtPayout(r.byType[t] ?? 0)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
