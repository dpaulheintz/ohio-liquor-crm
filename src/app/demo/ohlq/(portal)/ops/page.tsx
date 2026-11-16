import Link from 'next/link';
import { Activity, ClipboardCheck, Gauge, Wine } from 'lucide-react';
import { db, getOpsData } from '@/lib/ohlq-demo/server';
import { DEMO_BASE, dateET, fmtDateTime, todayET } from '@/lib/ohlq-demo/shared';
import { Section } from '@/components/ohlq-demo/ui';

export default async function OpsDashboard() {
  const { sales, tastings } = await getOpsData();
  const month = todayET().slice(0, 7);
  const inMonth = (iso: string | null) => !!iso && dateET(iso).slice(0, 7) === month;
  const pendingSales = sales.filter((s) => s.status === 'submitted');
  const pendingTastings = tastings.filter((t) => t.status === 'submitted');
  const flagged = pendingSales.filter((s) => s.flags.length).length + pendingTastings.filter((t) => t.flags.length).length;
  const processedSales = sales.filter((s) => s.status === 'processed' && inMonth(s.processed_at)).length;
  const decidedTastings = tastings.filter((t) => t.status !== 'submitted' && inMonth(t.decided_at)).length;
  const signatures = sales.filter((s) => inMonth(s.customer_signed_at)).length + sales.filter((s) => inMonth(s.a3a_signed_at)).length + tastings.filter((t) => inMonth(t.signed_at)).length;
  const lineItems = sales.filter((s) => inMonth(s.submitted_at)).reduce((n, s) => n + s.lines.length, 0);
  const turn = sales.filter((s) => s.processed_at && s.submitted_at).map((s) => (Date.parse(s.processed_at!) - Date.parse(s.submitted_at!)) / 3.6e6);
  const avgTurn = turn.length ? turn.reduce((a, b) => a + b, 0) / turn.length : null;
  const { data: activity } = await db().from('ohlq_demo_audit').select('id, entity_type, entity_id, actor, action, detail, created_at').order('created_at', { ascending: false }).limit(10);

  const stat = (n: number | string, l: string, href?: string, cls = '') => (
    <div className={`ohlq-stat ${cls}`}>
      <div className="n">{n}</div>
      <div className="l">{href ? <Link href={href} style={{ color: 'inherit' }}>{l} →</Link> : l}</div>
    </div>
  );

  return (
    <>
      <h1 className="ohlq-title">Agency Operations</h1>
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4" style={{ marginBottom: 18 }}>
        {stat(pendingSales.length, 'Wholesale sales to process', `${DEMO_BASE}/ops/wholesale`)}
        {stat(pendingTastings.length, 'Tasting applications pending', `${DEMO_BASE}/ops/tastings`)}
        {stat(flagged, 'Pending items flagged', undefined, 'gold')}
        {stat(processedSales + decidedTastings, 'Processed this month', undefined, 'green')}
      </div>
      <Section icon={<Gauge aria-hidden />} title="Time saved">
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          {stat(0, 'Forms retyped this month', undefined, 'green')}
          {stat(lineItems, 'Line items received as data (no keying)', undefined, 'green')}
          {stat(signatures, 'Signatures captured electronically', undefined, 'green')}
          {stat(avgTurn == null ? '—' : avgTurn < 48 ? `${Math.round(avgTurn)} h` : `${(avgTurn / 24).toFixed(1)} d`, 'Avg. submit → processed', undefined, 'green')}
        </div>
        <p className="ohlq-help">Every price is checked against the price book and every tasting against the 10-business-day and 2-hour rules before it reaches this queue.</p>
      </Section>
      <div className="grid gap-4 md:grid-cols-2">
        <Section icon={<ClipboardCheck aria-hidden />} title="Next wholesale sales">
          {pendingSales.length === 0 ? <p className="ohlq-value">Queue is clear.</p> : (
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 8 }} className="ohlq-value">
              {pendingSales.slice(0, 5).map((s) => (
                <li key={s.id}><Link href={`${DEMO_BASE}/ops/wholesale/${s.id}`} style={{ color: 'var(--ohlq-red)' }}>{s.ref_no}</Link> {s.customer_dba || s.customer_name}
                  {s.flags.length ? <span className="ohlq-chip chip-flag" style={{ marginLeft: 6 }}>⚑ {s.flags.length}</span> : <span className="ohlq-chip chip-ok" style={{ marginLeft: 6 }}>✓</span>}</li>
              ))}
            </ul>
          )}
        </Section>
        <Section icon={<Wine aria-hidden />} title="Next tasting applications">
          {pendingTastings.length === 0 ? <p className="ohlq-value">Queue is clear.</p> : (
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 8 }} className="ohlq-value">
              {pendingTastings.slice(0, 5).map((t) => (
                <li key={t.id}><Link href={`${DEMO_BASE}/ops/tastings/${t.id}`} style={{ color: 'var(--ohlq-red)' }}>{t.ref_no}</Link> {t.agency_name} #{t.agency_id}
                  {t.flags.length ? <span className="ohlq-chip chip-flag" style={{ marginLeft: 6 }}>⚑ {t.flags.length}</span> : <span className="ohlq-chip chip-ok" style={{ marginLeft: 6 }}>✓</span>}</li>
              ))}
            </ul>
          )}
        </Section>
      </div>
      <Section icon={<Activity aria-hidden />} title="Recent activity" defaultOpen={false}>
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 8 }}>
          {(activity ?? []).map((a) => (
            <li key={a.id} className="ohlq-value" style={{ fontSize: 15 }}><span className="ohlq-help" style={{ display: 'inline' }}>{fmtDateTime(a.created_at)}</span> · <b>{a.action}</b> — {a.actor}{a.detail ? <span className="ohlq-muted"> · {a.detail}</span> : null}</li>
          ))}
        </ul>
      </Section>
    </>
  );
}
