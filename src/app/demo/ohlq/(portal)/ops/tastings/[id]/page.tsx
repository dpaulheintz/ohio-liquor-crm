import { notFound } from 'next/navigation';
import { Download, ShieldCheck } from 'lucide-react';
import { getAudit, getOpsData } from '@/lib/ohlq-demo/server';
import { DEMO_BASE } from '@/lib/ohlq-demo/shared';
import { FlagList, Section } from '@/components/ohlq-demo/ui';
import { TastingDetail } from '@/components/ohlq-demo/tasting-detail';
import { OpsTastingActions } from '@/components/ohlq-demo/ops-actions';

export default async function OpsTastingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { tastings } = await getOpsData();
  const t = tastings.find((x) => x.id === id);
  if (!t) notFound();
  const audit = await getAudit('tasting', id);
  return (
    <>
      <h1 className="ohlq-title" style={{ marginBottom: 12 }}>Tasting Application {t.ref_no}</h1>
      <Section icon={<ShieldCheck aria-hidden />} title="Automatic checks">
        <FlagList flags={t.flags} />
        {t.status === 'submitted' && <OpsTastingActions id={t.id} refNo={t.ref_no} />}
        <a className="ohlq-btn ohlq-btn-outline ohlq-btn-sm" style={{ marginTop: 12 }} href={`${DEMO_BASE}/api/tastings/${t.id}/pdf`} target="_blank" rel="noreferrer"><Download aria-hidden /> PDF (LIQ-19-0004)</a>
      </Section>
      <TastingDetail t={t} audit={audit} />
    </>
  );
}
