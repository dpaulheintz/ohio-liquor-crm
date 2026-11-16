'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { SignaturePad } from '@/components/ohlq-demo/signature-pad';
import type { Signature } from '@/lib/ohlq-demo/shared';
import { signAsCustomer } from './actions';

export function SignForm({ token, inPerson, saleId }: { token: string; inPerson: boolean; saleId: string }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [sig, setSig] = useState<Signature | null>(null);
  const [consent, setConsent] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const ready = !!name.trim() && !!sig && consent;
  return (
    <section className="ohlq-card" style={{ borderTop: '5px solid var(--ohlq-red)' }} data-sign-form>
      <h2 className="ohlq-cond" style={{ fontSize: 22, fontWeight: 600, margin: '0 0 12px' }}>Customer signature</h2>
      <label className="ohlq-label" htmlFor="signer">Your full name</label>
      <input id="signer" className="ohlq-input" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="First and last name" />
      <div style={{ marginTop: 14 }}>
        <span className="ohlq-label">Draw your signature</span>
        <SignaturePad onChange={setSig} height={170} />
      </div>
      <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 12, font: '16px/1.35 var(--ohlq-serif)', cursor: 'pointer' }}>
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} style={{ width: 22, height: 22, marginTop: 1, flexShrink: 0 }} />
        <span>I agree to sign electronically. My electronic signature has the same effect as signing the paper A-3a form.</span>
      </label>
      {err && <p className="ohlq-error" role="alert">{err}</p>}
      <button type="button" className="ohlq-btn" style={{ width: '100%', marginTop: 14, minHeight: 52, fontSize: 19 }} disabled={!ready || busy}
        onClick={async () => {
          setBusy(true);
          const r = await signAsCustomer(token, { signature: sig!, name, consent });
          setBusy(false);
          if (!r.ok) { setErr(r.error); return; }
          if (inPerson) router.push(`/demo/ohlq/wholesale/${saleId}`);
          else router.refresh();
        }}>
        {busy ? 'Signing…' : 'Sign'}
      </button>
      <p className="ohlq-help">We record the time and the device you sign on.</p>
    </section>
  );
}
