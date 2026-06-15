'use client';

import { useState, useCallback } from 'react';
import { Section01Revenue } from './section-01-revenue';
import type { Section01Data } from './section-01-revenue';
import { Section02Scorecard } from './section-02-scorecard';
import { Section03MenuMatrix } from './section-03-menu-matrix';
import { Section04PrimeCost } from './section-04-prime-cost';
import { Section05Profitability } from './section-05-profitability';
import { Section06Comps } from './section-06-comps';
import { Section07Insights } from './section-07-insights';

// ─── Constants ────────────────────────────────────────────────────────────────

const LOCATIONS = ['Grandview', 'Gahanna', 'Westerville', 'PO BOX 21'] as const;
type LocationName = (typeof LOCATIONS)[number];

type Preset =
  | 'today'
  | 'yesterday'
  | 'last7'
  | 'last30'
  | 'thisMonth'
  | 'lastMonth'
  | 'thisQuarter'
  | 'ytd'
  | 'custom';

const GOLD = '#C5A572';

// ─── Date helpers ─────────────────────────────────────────────────────────────

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function computeRange(preset: Preset): { from: string; to: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const today = toDateStr(now);

  switch (preset) {
    case 'today':
      return { from: today, to: today };
    case 'yesterday': {
      const yd = new Date(now); yd.setDate(yd.getDate() - 1);
      const s = toDateStr(yd);
      return { from: s, to: s };
    }
    case 'last7': {
      const d = new Date(now); d.setDate(d.getDate() - 6);
      return { from: toDateStr(d), to: today };
    }
    case 'last30': {
      const d = new Date(now); d.setDate(d.getDate() - 29);
      return { from: toDateStr(d), to: today };
    }
    case 'thisMonth':
      return { from: `${y}-${String(m + 1).padStart(2, '0')}-01`, to: today };
    case 'lastMonth': {
      const lm = new Date(y, m, 0);
      return {
        from: `${lm.getFullYear()}-${String(lm.getMonth() + 1).padStart(2, '0')}-01`,
        to: toDateStr(lm),
      };
    }
    case 'thisQuarter': {
      const qStart = new Date(y, Math.floor(m / 3) * 3, 1);
      return { from: toDateStr(qStart), to: today };
    }
    case 'ytd':
      return { from: `${y}-01-01`, to: today };
    case 'custom':
    default:
      return { from: `${y}-01-01`, to: today };
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeader({ num, title }: { num: string; title: string }) {
  return (
    <div className="flex items-center gap-4 mb-4">
      <span className="font-mono text-[10px] tracking-[0.2em] text-zinc-600 shrink-0">{num}</span>
      <h2 className="font-serif text-base font-semibold text-white tracking-wide">{title}</h2>
      <div className="flex-1 h-px" style={{ background: `linear-gradient(to right, ${GOLD}33, transparent)` }} />
    </div>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface RestaurantDashboardClientProps {
  section01Data: Section01Data;
}

// ─── Main component ───────────────────────────────────────────────────────────

export function RestaurantDashboardClient({ section01Data }: RestaurantDashboardClientProps) {
  const dataThrough = section01Data.dataThrough;
  // Date range state
  const [preset, setPreset] = useState<Preset>('custom');
  const [dateFrom, setDateFrom] = useState<string>(() => computeRange('custom').from);
  const [dateTo, setDateTo]     = useState<string>(() => computeRange('custom').to);

  // Location filter state — empty = All
  const [selectedLocations, setSelectedLocations] = useState<LocationName[]>([]);

  const applyPreset = useCallback((p: Preset) => {
    setPreset(p);
    if (p !== 'custom') {
      const { from, to } = computeRange(p);
      setDateFrom(from);
      setDateTo(to);
    }
  }, []);

  const toggleLocation = useCallback((loc: LocationName) => {
    setSelectedLocations((prev) =>
      prev.includes(loc) ? prev.filter((l) => l !== loc) : [...prev, loc]
    );
  }, []);

  const PRESETS: { key: Preset; label: string }[] = [
    { key: 'today',       label: 'Today' },
    { key: 'yesterday',   label: 'Yesterday' },
    { key: 'last7',       label: 'Last 7 Days' },
    { key: 'last30',      label: 'Last 30 Days' },
    { key: 'thisMonth',   label: 'This Month' },
    { key: 'lastMonth',   label: 'Last Month' },
    { key: 'thisQuarter', label: 'This Quarter' },
    { key: 'ytd',         label: 'YTD' },
    { key: 'custom',      label: 'Custom' },
  ];

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      {/* ── Page header ──────────────────────────────────────────────────────── */}
      <div className="border-b border-[#C5A572]/15 px-6 py-5">
        <div className="flex items-baseline justify-between flex-wrap gap-3">
          <div>
            <h1 className="font-serif text-2xl font-bold tracking-wide text-white">
              Restaurant Analytics
            </h1>
            <p className="text-xs text-zinc-500 mt-0.5 uppercase tracking-widest">
              High Bank Distillery — Operations Intelligence
            </p>
          </div>
          {dataThrough && (
            <span className="text-xs text-zinc-600 font-mono">
              Data through{' '}
              <span className="text-zinc-400">
                {new Date(dataThrough + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </span>
            </span>
          )}
        </div>
      </div>

      {/* ── Sticky controls ──────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-30 border-b border-[#C5A572]/15 bg-[#0a0a0a]/95 backdrop-blur-sm px-6 py-3 space-y-2.5">

        {/* Preset pills + Custom date pickers */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-medium shrink-0">Range</span>
          <div className="flex items-center gap-1 flex-wrap">
            {PRESETS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => applyPreset(key)}
                className={`rounded px-2.5 py-1 text-xs transition-colors font-medium ${
                  preset === key
                    ? 'bg-[#C5A572] text-black'
                    : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {preset === 'custom' && (
            <div className="flex items-center gap-2 text-xs">
              <input
                type="date"
                value={dateFrom}
                max={dateTo}
                onChange={(e) => setDateFrom(e.target.value)}
                className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-zinc-200 text-xs focus:outline-none focus:border-[#C5A572]/60"
              />
              <span className="text-zinc-600">→</span>
              <input
                type="date"
                value={dateTo}
                min={dateFrom}
                onChange={(e) => setDateTo(e.target.value)}
                className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-zinc-200 text-xs focus:outline-none focus:border-[#C5A572]/60"
              />
            </div>
          )}
        </div>

        {/* Location pills */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-medium shrink-0">Location</span>
          <button
            onClick={() => setSelectedLocations([])}
            className={`rounded px-2.5 py-0.5 text-xs transition-colors font-medium ${
              selectedLocations.length === 0
                ? 'bg-[#C5A572] text-black'
                : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
            }`}
          >
            All
          </button>
          {LOCATIONS.map((loc) => {
            const active = selectedLocations.includes(loc);
            return (
              <button
                key={loc}
                onClick={() => toggleLocation(loc)}
                className="rounded px-2.5 py-0.5 text-xs transition-all font-medium"
                style={{
                  backgroundColor: active ? GOLD + '28' : 'rgb(39,39,42)',
                  color: active ? GOLD : '#a1a1aa',
                  borderWidth: 1,
                  borderStyle: 'solid',
                  borderColor: active ? GOLD + '70' : 'transparent',
                }}
              >
                {loc}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Sections ─────────────────────────────────────────────────────────── */}
      <div className="px-6 py-6 space-y-8 max-w-screen-2xl mx-auto">

        {/* 01 — Revenue Overview (FIXED — does not reflow with date picker) */}
        <section>
          <SectionHeader num="01" title="Revenue Overview" />
          <Section01Revenue data={section01Data} />
        </section>

        {/* 02 — Location Scorecard (reflows) */}
        <section>
          <SectionHeader num="02" title="Location Scorecard" />
          <Section02Scorecard
            dateFrom={dateFrom}
            dateTo={dateTo}
            selectedLocations={selectedLocations}
          />
        </section>

        {/* 03 — Menu Engineering Matrix (reflows) */}
        <section>
          <SectionHeader num="03" title="Menu Engineering Matrix" />
          <Section03MenuMatrix
            dateFrom={dateFrom}
            dateTo={dateTo}
            selectedLocations={selectedLocations}
          />
        </section>

        {/* 04 — Prime Cost (reflows) */}
        <section>
          <SectionHeader num="04" title="Prime Cost" />
          <Section04PrimeCost
            dateFrom={dateFrom}
            dateTo={dateTo}
            selectedLocations={selectedLocations}
          />
        </section>

        {/* 05 — Profitability (reflows) */}
        <section>
          <SectionHeader num="05" title="Profitability" />
          <Section05Profitability
            dateFrom={dateFrom}
            dateTo={dateTo}
            selectedLocations={selectedLocations}
          />
        </section>

        {/* 06 — Comps & Voids (reflows) */}
        <section>
          <SectionHeader num="06" title="Comps &amp; Voids" />
          <Section06Comps
            dateFrom={dateFrom}
            dateTo={dateTo}
            selectedLocations={selectedLocations}
          />
        </section>

        {/* 07 — This Week at High Bank (reflows) */}
        <section>
          <SectionHeader num="07" title="This Week at High Bank" />
          <Section07Insights
            dateFrom={dateFrom}
            dateTo={dateTo}
            selectedLocations={selectedLocations}
          />
        </section>
      </div>
    </div>
  );
}
