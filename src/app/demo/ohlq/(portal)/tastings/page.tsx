import Link from 'next/link';
import { Plus, Wine } from 'lucide-react';
import { getTastings } from '@/lib/ohlq-demo/server';
import { DEMO_BASE, PARTNER, fmtDate, fmtTime } from '@/lib/ohlq-demo/shared';
import { Section, TastingStatusChip } from '@/components/ohlq-demo/ui';
import { RowLink } from '@/components/ohlq-demo/row-link';

export default async function TastingList() {
  const rows = (await getTastings()).filter((t) => t.supplier_name === PARTNER.name).sort((a, b) => b.submitted_at.localeCompare(a.submitted_at));
  return (
    <>
      <h1 className="ohlq-title">Tasting Applications</h1>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <p className="ohlq-help" style={{ margin: 0, maxWidth: 640 }}>
          File LIQ-19-0004 tasting applications online. The 10-business-day notice and 2-hour limit are checked as you type, and you&rsquo;re emailed when OHLQ decides.
        </p>
        <Link href={`${DEMO_BASE}/tastings/new`} className="ohlq-btn"><Plus aria-hidden /> New Tasting Application</Link>
      </div>
      <Section icon={<Wine aria-hidden />} title={`Applications (${rows.length})`}>
        <div className="ohlq-table-wrap">
          <table className="ohlq-table">
            <thead><tr><th>Ref</th><th>Event</th><th>Agency</th><th>Conductor</th><th>Status</th><th /></tr></thead>
            <tbody>
              {rows.map((t) => (
                <RowLink key={t.id} href={`${DEMO_BASE}/tastings/${t.id}`}>
                  <td><Link href={`${DEMO_BASE}/tastings/${t.id}`} style={{ color: 'var(--ohlq-red)' }}>{t.ref_no}</Link></td>
                  <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(t.event_date, { weekday: 'short', month: 'short', day: 'numeric' })}<div className="ohlq-help" style={{ marginTop: 0 }}>{fmtTime(t.start_time)}–{fmtTime(t.end_time)}</div></td>
                  <td>#{t.agency_id} {t.agency_name}<div className="ohlq-help" style={{ marginTop: 0 }}>{t.agency_city}</div></td>
                  <td>{t.conductor_name}</td>
                  <td><TastingStatusChip status={t.status} /></td>
                  <td><Link href={`${DEMO_BASE}/tastings/new?from=${t.id}`} className="ohlq-linkbtn">Duplicate</Link></td>
                </RowLink>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </>
  );
}
