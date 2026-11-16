import Link from 'next/link';
import { Download } from 'lucide-react';
import { getOpsData } from '@/lib/ohlq-demo/server';
import { DEMO_BASE, fmtCents, fmtDate, fmtDateTime } from '@/lib/ohlq-demo/shared';
import { FlagChips, SaleStatusChip } from '@/components/ohlq-demo/ui';
import { RowLink } from '@/components/ohlq-demo/row-link';
import { QueueTabs } from '@/components/ohlq-demo/queue-tabs';

export default async function OpsWholesaleQueue({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const tab = (await searchParams).tab === 'history' ? 'history' : 'open';
  const { sales } = await getOpsData();
  const open = sales.filter((s) => s.status === 'submitted').sort((a, b) => (a.submitted_at ?? '').localeCompare(b.submitted_at ?? ''));
  const history = sales.filter((s) => s.status !== 'submitted').sort((a, b) => (b.updated_at ?? '').localeCompare(a.updated_at ?? ''));
  const rows = tab === 'open' ? open : history;
  return (
    <>
      <h1 className="ohlq-title">Direct Wholesale Sales</h1>
      <QueueTabs base={`${DEMO_BASE}/ops/wholesale`} tab={tab} counts={[open.length, history.length]} />
      <div className="ohlq-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
          <span className="ohlq-value">Showing {rows.length} {tab === 'open' ? 'submissions waiting to be processed' : 'processed or returned submissions'}</span>
          <a className="ohlq-btn" href={`${DEMO_BASE}/api/ops/wholesale-csv`} data-export-csv><Download aria-hidden /> CSV of processed sales</a>
        </div>
        <p className="ohlq-help" style={{ marginTop: 0, marginBottom: 12 }}>The CSV goes straight into OHLQ&rsquo;s system — no retyping.</p>
        <div className="ohlq-table-wrap">
          <table className="ohlq-table" data-ops-wholesale>
            <thead><tr><th>Ref</th><th>Submitted</th><th>Supplier</th><th>Customer / Permit</th><th>Sales date</th><th className="num">Total</th><th>Checks</th><th>Status</th></tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={8} style={{ textAlign: 'center' }}>No data available in table</td></tr>}
              {rows.map((s) => (
                <RowLink key={s.id} href={`${DEMO_BASE}/ops/wholesale/${s.id}`}>
                  <td><Link href={`${DEMO_BASE}/ops/wholesale/${s.id}`} style={{ color: 'var(--ohlq-red)' }}>{s.ref_no}</Link></td>
                  <td style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(s.submitted_at)}</td>
                  <td>{s.supplier_name}</td>
                  <td>{s.customer_dba || s.customer_name}<div className="ohlq-help" style={{ marginTop: 0 }}>{s.permit_number}</div></td>
                  <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(s.sales_date)}</td>
                  <td className="num">{fmtCents(s.total_cents)}</td>
                  <td><FlagChips flags={s.flags} muted={s.status !== 'submitted'} /></td>
                  <td><SaleStatusChip status={s.status} /></td>
                </RowLink>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
