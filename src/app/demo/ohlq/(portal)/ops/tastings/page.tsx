import Link from 'next/link';
import { CalendarDays } from 'lucide-react';
import { getOpsData } from '@/lib/ohlq-demo/server';
import { DEMO_BASE, fmtDate, fmtDateTime, fmtTime } from '@/lib/ohlq-demo/shared';
import { FlagChips, TastingStatusChip } from '@/components/ohlq-demo/ui';
import { RowLink } from '@/components/ohlq-demo/row-link';
import { QueueTabs } from '@/components/ohlq-demo/queue-tabs';

export default async function OpsTastingQueue({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const tab = (await searchParams).tab === 'history' ? 'history' : 'open';
  const { tastings } = await getOpsData();
  const open = tastings.filter((t) => t.status === 'submitted').sort((a, b) => a.event_date.localeCompare(b.event_date));
  const history = tastings.filter((t) => t.status !== 'submitted').sort((a, b) => (b.decided_at ?? '').localeCompare(a.decided_at ?? ''));
  const rows = tab === 'open' ? open : history;
  return (
    <>
      <h1 className="ohlq-title">Tasting Applications</h1>
      <QueueTabs base={`${DEMO_BASE}/ops/tastings`} tab={tab} counts={[open.length, history.length]} />
      <div className="ohlq-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
          <span className="ohlq-value">Showing {rows.length} {tab === 'open' ? 'applications awaiting a decision' : 'decided applications'}</span>
          <Link className="ohlq-btn ohlq-btn-outline" href={`${DEMO_BASE}/ops/calendar`}><CalendarDays aria-hidden /> Statewide calendar</Link>
        </div>
        <div className="ohlq-table-wrap">
          <table className="ohlq-table" data-ops-tastings>
            <thead><tr><th>Ref</th><th>Event</th><th>Agency</th><th>Supplier</th><th>Filed</th><th>Checks</th><th>Status</th></tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center' }}>No data available in table</td></tr>}
              {rows.map((t) => (
                <RowLink key={t.id} href={`${DEMO_BASE}/ops/tastings/${t.id}`}>
                  <td><Link href={`${DEMO_BASE}/ops/tastings/${t.id}`} style={{ color: 'var(--ohlq-red)' }}>{t.ref_no}</Link></td>
                  <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(t.event_date, { weekday: 'short', month: 'short', day: 'numeric' })}<div className="ohlq-help" style={{ marginTop: 0 }}>{fmtTime(t.start_time)}–{fmtTime(t.end_time)}</div></td>
                  <td>#{t.agency_id} {t.agency_name}<div className="ohlq-help" style={{ marginTop: 0 }}>{t.agency_city}{t.agency_county ? ` · ${t.agency_county}` : ''}</div></td>
                  <td>{t.supplier_name}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(t.submitted_at)}</td>
                  <td><FlagChips flags={t.flags} muted={t.status !== 'submitted'} /></td>
                  <td><TastingStatusChip status={t.status} /></td>
                </RowLink>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
