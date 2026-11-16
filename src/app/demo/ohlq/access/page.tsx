import { AccessForm } from './access-form';

export default async function AccessPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const configured = !!process.env.OHLQ_DEMO_CODE;
  return (
    <main style={{ minHeight: 'calc(100dvh - 26px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div className="ohlq-card" style={{ width: '100%', maxWidth: 420, borderTop: '5px solid var(--ohlq-red)' }}>
        <h1 className="ohlq-cond" style={{ fontSize: 26, fontWeight: 600, margin: '0 0 4px' }}>Enter demo access code</h1>
        <p className="ohlq-help" style={{ marginBottom: 16 }}>
          A concept demo of Direct Wholesale Sales and Tasting Applications for the OHLQ partner portal, prepared by High Bank Distillery.
        </p>
        {configured ? <AccessForm next={next ?? ''} /> : (
          <p className="ohlq-warn">The demo access code isn&rsquo;t set up on this server yet (OHLQ_DEMO_CODE).</p>
        )}
      </div>
    </main>
  );
}
