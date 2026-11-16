'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { DEMO_BASE, addDays, fmtTime, type Tasting } from '@/lib/ohlq-demo/shared';
import { Section } from './ui';

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function shiftMonth(ym: string, n: number) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function TastingCalendar({ tastings, month, today }: { tastings: Tasting[]; month: string; today: string }) {
  const [agency, setAgency] = useState('');
  const [county, setCounty] = useState('');
  const [supplier, setSupplier] = useState('');
  const [showPending, setShowPending] = useState(true);
  const counties = useMemo(() => [...new Set(tastings.map((t) => t.agency_county).filter(Boolean) as string[])].sort(), [tastings]);
  const suppliers = useMemo(() => [...new Set(tastings.map((t) => t.supplier_name))].sort(), [tastings]);

  const q = agency.trim().toLowerCase();
  const shown = tastings.filter((t) => (showPending || t.status === 'approved')
    && (!q || t.agency_id.includes(q) || (t.agency_name ?? '').toLowerCase().includes(q) || (t.agency_city ?? '').toLowerCase().includes(q))
    && (!county || t.agency_county === county) && (!supplier || t.supplier_name === supplier));

  const [y, m] = month.split('-').map(Number);
  const firstDow = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const start = addDays(`${month}-01`, -firstDow);
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const label = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });

  return (
    <>
      <h1 className="ohlq-title">Statewide Tasting Calendar</h1>
      <Section icon={<CalendarDays aria-hidden />} title="Filters">
        <div className="grid gap-3 sm:grid-cols-4">
          <div><label className="ohlq-label" htmlFor="f-agency">Agency</label><input id="f-agency" className="ohlq-input" placeholder="Number, name or city" value={agency} onChange={(e) => setAgency(e.target.value)} /></div>
          <div><label className="ohlq-label" htmlFor="f-county">County</label>
            <select id="f-county" className="ohlq-input" value={county} onChange={(e) => setCounty(e.target.value)}><option value="">All counties</option>{counties.map((c) => <option key={c}>{c}</option>)}</select></div>
          <div><label className="ohlq-label" htmlFor="f-supplier">Supplier</label>
            <select id="f-supplier" className="ohlq-input" value={supplier} onChange={(e) => setSupplier(e.target.value)}><option value="">All suppliers</option>{suppliers.map((s) => <option key={s}>{s}</option>)}</select></div>
          <label className="ohlq-value" style={{ display: 'flex', gap: 8, alignItems: 'center', paddingTop: 22 }}>
            <input type="checkbox" checked={showPending} onChange={(e) => setShowPending(e.target.checked)} style={{ width: 18, height: 18 }} /> Show pending too
          </label>
        </div>
      </Section>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '6px 0 10px' }}>
        <Link className="ohlq-btn ohlq-btn-outline ohlq-btn-sm" href={`${DEMO_BASE}/ops/calendar?m=${shiftMonth(month, -1)}`} aria-label="Previous month"><ChevronLeft aria-hidden /></Link>
        <h2 className="ohlq-cond" style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>{label}</h2>
        <Link className="ohlq-btn ohlq-btn-outline ohlq-btn-sm" href={`${DEMO_BASE}/ops/calendar?m=${shiftMonth(month, 1)}`} aria-label="Next month"><ChevronRight aria-hidden /></Link>
      </div>
      <div className="ohlq-cal" data-calendar>
        {DOW.map((d) => <div key={d} className="ohlq-cal-h">{d}</div>)}
        {days.map((d) => {
          const evs = shown.filter((t) => t.event_date === d).sort((a, b) => a.start_time.localeCompare(b.start_time));
          return (
            <div key={d} className={`ohlq-cal-d${d.slice(0, 7) !== month ? ' out' : ''}${d === today ? ' today' : ''}`}>
              <span className="dn">{Number(d.slice(8))}</span>
              {evs.map((t) => (
                <Link key={t.id} href={`${DEMO_BASE}/ops/tastings/${t.id}`} className={`ohlq-cal-ev${t.status === 'approved' ? '' : ' pending'}`}
                  title={`${t.ref_no} · ${t.supplier_name} · ${t.agency_name} #${t.agency_id}`}>
                  <b>{fmtTime(t.start_time).replace(':00', '')}</b> {t.agency_name} #{t.agency_id}
                  <span className="hidden sm:inline"><br />{t.supplier_name}</span>
                </Link>
              ))}
            </div>
          );
        })}
      </div>
      <p className="ohlq-help"><span className="ohlq-cal-ev" style={{ display: 'inline-block', margin: 0 }}>Approved</span> <span className="ohlq-cal-ev pending" style={{ display: 'inline-block', margin: 0 }}>Pending</span> · {shown.length} tastings match the filters.</p>
    </>
  );
}
