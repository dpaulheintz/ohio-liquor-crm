import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Copy, Download } from 'lucide-react';
import { getAudit, getMessages, getTasting } from '@/lib/ohlq-demo/server';
import { DEMO_BASE } from '@/lib/ohlq-demo/shared';
import { TastingDetail } from '@/components/ohlq-demo/tasting-detail';

export default async function TastingPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ submitted?: string }> }) {
  const { id } = await params;
  const { submitted } = await searchParams;
  const t = await getTasting(id);
  if (!t) notFound();
  const [audit, messages] = await Promise.all([getAudit('tasting', id), getMessages('tasting', id)]);
  return (
    <>
      <h1 className="ohlq-title" style={{ marginBottom: 8 }}>Tasting Application {t.ref_no}</h1>
      {submitted && (
        <div className="ohlq-card" style={{ borderTop: '5px solid #2c8a4b', marginBottom: 16 }}>
          <p className="ohlq-value" style={{ margin: 0 }}><b>Submitted.</b> The confirmation, with the completed LIQ-19-0004, is under Messages below. When Agency Operations approves or rejects it, that notice appears there too. (In the real system these would be emailed; the demo shows them on screen.)</p>
        </div>
      )}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16, justifyContent: 'center' }}>
        <a className="ohlq-btn ohlq-btn-outline" href={`${DEMO_BASE}/api/tastings/${t.id}/pdf`} target="_blank" rel="noreferrer"><Download aria-hidden /> PDF (LIQ-19-0004)</a>
        <Link className="ohlq-btn ohlq-btn-outline" href={`${DEMO_BASE}/tastings/new?from=${t.id}`}><Copy aria-hidden /> Duplicate for a new date</Link>
      </div>
      <TastingDetail t={t} audit={audit} messages={messages} />
    </>
  );
}
