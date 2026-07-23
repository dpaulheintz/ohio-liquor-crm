'use client';

import { useMemo } from 'react';
import {
  UtensilsCrossed, CalendarCheck, ArrowUpDown, Trophy, Users, type LucideIcon,
} from 'lucide-react';
import {
  LOCATIONS, LOCATION_COLORS, GOLD, fmtMoney, fmtInt,
  mondayOf, shiftDay, weekLabel, DOW_NAMES, dowOf,
  type DailyRow, type ItemWeekRow, type LocationName,
} from './lib';

interface Fact {
  icon: LucideIcon;
  color: string;
  label: string;
  value: string;
  detail: string;
}

export function FunFacts({
  rows, itemWeeks, dataThrough,
}: { rows: DailyRow[]; itemWeeks: ItemWeekRow[]; dataThrough: string | null }) {
  const today = dataThrough ?? rows.reduce((mx, r) => (r.date > mx ? r.date : mx), rows[0]?.date ?? '');

  const { facts, weekRangeLabel } = useMemo(() => {
    if (!today) return { facts: [] as Fact[], weekRangeLabel: '' };

    // Last COMPLETE week (the current week is partial).
    const weekStart = shiftDay(mondayOf(today), -7);
    const weekEnd = shiftDay(weekStart, 6);
    const inWeek = (d: string) => d >= weekStart && d <= weekEnd;

    // Combined daily revenue + per-location revenue for the target week.
    const byDay = new Map<string, number>();
    const byLoc = new Map<LocationName, number>();
    for (const r of rows) {
      if (!inWeek(r.date)) continue;
      byDay.set(r.date, (byDay.get(r.date) ?? 0) + r.total);
      byLoc.set(r.location, (byLoc.get(r.location) ?? 0) + r.total);
    }

    // Best single day.
    let bestDay = ''; let bestDayRev = -1;
    for (const [d, v] of byDay) if (v > bestDayRev) { bestDayRev = v; bestDay = d; }

    // Biggest day-over-day swing (consecutive calendar days within the week).
    const ordered = [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    let swing = 0; let swingFrom = ''; let swingTo = ''; let swingDelta = 0;
    for (let i = 1; i < ordered.length; i++) {
      const d = ordered[i][1] - ordered[i - 1][1];
      if (Math.abs(d) > Math.abs(swing)) { swing = d; swingFrom = ordered[i - 1][0]; swingTo = ordered[i][0]; swingDelta = d; }
    }

    // Top location of the week.
    let topLoc: LocationName | null = null; let topLocRev = -1;
    for (const loc of LOCATIONS) {
      const v = byLoc.get(loc) ?? 0;
      if (v > topLocRev) { topLocRev = v; topLoc = loc; }
    }

    // Most popular item (by quantity) that week, summed across locations.
    const itemQty = new Map<string, number>();
    for (const it of itemWeeks) {
      if (it.weekStart !== weekStart) continue;
      itemQty.set(it.itemName, (itemQty.get(it.itemName) ?? 0) + it.qty);
    }
    let topItem = ''; let topItemQty = 0;
    for (const [name, q] of itemQty) if (q > topItemQty) { topItemQty = q; topItem = name; }

    // Guest count year-to-date (running milestone).
    const yr = today.slice(0, 4);
    let guestsYtd = 0;
    for (const r of rows) if (r.date.slice(0, 4) === yr && r.date <= today) guestsYtd += r.guests;

    const dayName = (d: string) => (d ? DOW_NAMES[dowOf(d)] : '');

    const facts: Fact[] = [
      {
        icon: UtensilsCrossed, color: GOLD,
        label: 'Most Popular Item',
        value: topItem || '—',
        detail: topItem ? `${fmtInt(topItemQty)} sold across all locations` : 'No item sales recorded',
      },
      {
        icon: CalendarCheck, color: '#10b981',
        label: 'Best Single Day',
        value: bestDay ? dayName(bestDay) : '—',
        detail: bestDay ? `${fmtMoney(bestDayRev)} in sales` : 'No sales recorded',
      },
      {
        icon: ArrowUpDown, color: '#3b82f6',
        label: 'Biggest Day-over-Day Swing',
        value: swingFrom ? `${swingDelta >= 0 ? '+' : '−'}${fmtMoney(Math.abs(swingDelta))}` : '—',
        detail: swingFrom ? `${dayName(swingFrom)} → ${dayName(swingTo)}` : 'Not enough days',
      },
      {
        icon: Trophy, color: topLoc ? LOCATION_COLORS[topLoc] : '#a855f7',
        label: 'Top Location of the Week',
        value: topLoc ?? '—',
        detail: topLoc ? `${fmtMoney(topLocRev)} in sales` : 'No sales recorded',
      },
      {
        icon: Users, color: '#a855f7',
        label: `Guests in ${yr} (YTD)`,
        value: fmtInt(guestsYtd),
        detail: 'Guests served year-to-date',
      },
    ];

    return { facts, weekRangeLabel: `Week of ${weekLabel(weekStart)} – ${weekLabel(weekEnd)}` };
  }, [rows, itemWeeks, today]);

  if (facts.length === 0) return null;

  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="flex items-baseline justify-between mb-4 flex-wrap gap-2">
        <h3 className="font-serif text-base font-semibold text-foreground">This Week&apos;s Fun Facts</h3>
        <span className="text-[11px] font-mono text-muted-foreground">{weekRangeLabel}</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {facts.map((f) => {
          const Icon = f.icon;
          return (
            <div key={f.label} className="rounded-lg border bg-background p-4 flex flex-col gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-full" style={{ background: `${f.color}1f` }}>
                <Icon className="h-5 w-5" style={{ color: f.color }} />
              </div>
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium leading-tight">{f.label}</span>
              <span className="font-serif text-lg font-bold text-foreground leading-tight break-words">{f.value}</span>
              <span className="text-xs text-muted-foreground leading-snug">{f.detail}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
