'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Check, Undo2, X } from 'lucide-react';
import { decideTasting, processSale, returnSale } from '@/app/demo/ohlq/actions';
import { DemoDelivered } from './ui';

export function OpsSaleActions({ saleId, refNo }: { saleId: string; refNo: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<'idle' | 'return'>('idle');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  return (
    <div style={{ marginTop: 14, display: 'grid', gap: 10 }}>
      {mode === 'idle' ? (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" className="ohlq-btn" disabled={busy} onClick={async () => {
            setBusy(true);
            const r = await processSale(saleId);
            setBusy(false);
            if (!r.ok) { setErr(r.error); return; }
            toast.success(`${refNo} processed`);
            router.refresh();
          }}><Check aria-hidden /> {busy ? 'Processing…' : 'Process'}</button>
          <button type="button" className="ohlq-btn ohlq-btn-outline" onClick={() => setMode('return')}><Undo2 aria-hidden /> Return to supplier</button>
        </div>
      ) : (
        <div>
          <label className="ohlq-label" htmlFor="return-note">Note to the supplier</label>
          <textarea id="return-note" className="ohlq-input" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. 4281B was billed at last year’s price — please correct to $94.00 and resubmit." />
          <div style={{ display: 'flex', gap: 10, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <button type="button" className="ohlq-btn" disabled={busy || !note.trim()} onClick={async () => {
              setBusy(true);
              const r = await returnSale(saleId, note);
              setBusy(false);
              if (!r.ok) { setErr(r.error); return; }
              toast.success('Returned — supplier emailed (Demo: delivered to Paul)');
              router.refresh();
            }}>{busy ? 'Sending…' : 'Return & email supplier'}</button>
            <button type="button" className="ohlq-linkbtn" onClick={() => setMode('idle')}>Cancel</button>
            <DemoDelivered />
          </div>
        </div>
      )}
      {err && <p className="ohlq-error">{err}</p>}
    </div>
  );
}

export function OpsTastingActions({ id, refNo }: { id: string; refNo: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<'idle' | 'reject'>('idle');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const decide = async (d: 'approved' | 'rejected') => {
    setBusy(true);
    const r = await decideTasting(id, d, d === 'rejected' ? note : '');
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    toast.success(`${refNo} ${d} — applicant emailed (Demo: delivered to Paul)`);
    router.refresh();
  };
  return (
    <div style={{ marginTop: 14, display: 'grid', gap: 10 }}>
      {mode === 'idle' ? (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <button type="button" className="ohlq-btn" disabled={busy} onClick={() => decide('approved')}><Check aria-hidden /> {busy ? 'Saving…' : 'Approve'}</button>
          <button type="button" className="ohlq-btn ohlq-btn-outline" onClick={() => setMode('reject')}><X aria-hidden /> Reject</button>
          <span className="ohlq-help" style={{ margin: 0 }}>The applicant is emailed automatically <DemoDelivered />. This replaces the &ldquo;For Division Use Only&rdquo; box.</span>
        </div>
      ) : (
        <div>
          <label className="ohlq-label" htmlFor="reject-note">Reason for rejecting (required)</label>
          <textarea id="reject-note" className="ohlq-input" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Filed less than 10 business days before the event." />
          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            <button type="button" className="ohlq-btn" disabled={busy || !note.trim()} onClick={() => decide('rejected')}>{busy ? 'Saving…' : 'Reject & email applicant'}</button>
            <button type="button" className="ohlq-linkbtn" onClick={() => setMode('idle')}>Cancel</button>
          </div>
        </div>
      )}
      {err && <p className="ohlq-error">{err}</p>}
    </div>
  );
}
