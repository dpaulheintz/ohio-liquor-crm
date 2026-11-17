'use client';

import { useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { SALE_STATUS_LABEL, TASTING_STATUS_LABEL, type Flag, type SaleStatus, type TastingStatus } from '@/lib/ohlq-demo/shared';

/** Red section header bar with a white icon, and a collapsible white card beneath (ops.ohlq.com style). */
export function Section({ icon, title, children, defaultOpen = true, right }: { icon: ReactNode; title: string; children: ReactNode; defaultOpen?: boolean; right?: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="ohlq-section">
      <button type="button" className="ohlq-section-bar" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {icon}
        <span>{title}</span>
        {right && <span style={{ marginLeft: 'auto', fontSize: 14 }} onClick={(e) => e.stopPropagation()}>{right}</span>}
        <ChevronDown className="chev" aria-hidden style={right ? { marginLeft: 12 } : undefined} />
      </button>
      {open && <div className="ohlq-card">{children}</div>}
    </section>
  );
}

const SALE_CHIP: Record<SaleStatus, string> = {
  draft: 'chip-draft', awaiting_customer: 'chip-awaiting', signed: 'chip-signed', submitted: 'chip-submitted', processed: 'chip-processed', returned: 'chip-returned',
};

export function SaleStatusChip({ status }: { status: SaleStatus }) {
  return <span className={`ohlq-chip ${SALE_CHIP[status]}`}>{SALE_STATUS_LABEL[status]}</span>;
}

export function TastingStatusChip({ status }: { status: TastingStatus }) {
  const cls = status === 'approved' ? 'chip-approved' : status === 'rejected' ? 'chip-rejected' : 'chip-submitted';
  return <span className={`ohlq-chip ${cls}`}>{TASTING_STATUS_LABEL[status]}</span>;
}

export function FlagChips({ flags, muted = false }: { flags: Flag[]; muted?: boolean }) {
  if (!flags.length) return <span className="ohlq-chip chip-ok">✓ No flags</span>;
  const unique = [...new Map(flags.map((f) => [f.label, f])).values()];
  return (
    <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 4, opacity: muted ? 0.6 : 1 }}>
      {unique.map((f) => <span key={f.label} className="ohlq-chip chip-flag" title={f.detail}>⚑ {f.label}</span>)}
    </span>
  );
}

export function FlagList({ flags }: { flags: Flag[] }) {
  if (!flags.length) return <p className="ohlq-value" style={{ color: '#1e6b34' }}>✓ Passed every automatic check.</p>;
  return (
    <ul style={{ margin: 0, paddingLeft: 0, listStyle: 'none', display: 'grid', gap: 6 }}>
      {flags.map((f, i) => (
        <li key={i} className="ohlq-warn" style={{ marginTop: 0 }}>
          <b className="ohlq-cond" style={{ fontWeight: 500 }}>⚑ {f.label}:</b> {f.detail}
        </li>
      ))}
    </ul>
  );
}

export function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="ohlq-dialog-backdrop" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <div className="ohlq-dialog" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <h3 style={{ flex: 1 }}>{title}</h3>
          <button type="button" className="ohlq-linkbtn" onClick={onClose} aria-label="Close">Close ✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Shown wherever the real system would send an email or text. */
export function DemoNotSent() {
  return <span className="ohlq-help" style={{ display: 'inline' }}>(Demo: shown on screen, not sent)</span>;
}

export interface MessageRow {
  id: string;
  channel: 'email' | 'sms';
  requested_to: string | null;
  subject: string;
  body_html: string | null;
  links: { label: string; href: string }[];
  created_at: string;
}

/** The messages the demo would have emailed or texted, readable right on the page. */
export function MessageLog({ messages }: { messages: MessageRow[] }) {
  if (!messages.length) return <p className="ohlq-value ohlq-muted" style={{ margin: 0 }}>No messages yet.</p>;
  return (
    <div style={{ display: 'grid', gap: 10 }} data-message-log>
      <p className="ohlq-help" style={{ margin: 0 }}>In the real system these would be emailed or texted. In this demo they&rsquo;re only shown here.</p>
      {messages.map((m, i) => (
        <details key={m.id} open={i === 0} style={{ border: '1px solid #e3e3e3', background: '#fff' }}>
          <summary style={{ cursor: 'pointer', padding: '10px 12px', font: '15px/1.35 var(--ohlq-serif)', listStyle: 'revert' }}>
            <b>{m.subject}</b>
            <span className="ohlq-help" style={{ display: 'block', marginTop: 2 }}>
              {m.channel === 'sms' ? 'Text' : 'Email'} to {m.requested_to || '—'} · {new Date(m.created_at).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} ET
            </span>
          </summary>
          <div style={{ borderTop: '1px solid #eee', padding: 12 }}>
            {m.body_html && (
              <iframe title={m.subject} sandbox="" srcDoc={`<!doctype html><meta charset="utf-8"><body style="margin:0">${m.body_html}</body>`}
                style={{ width: '100%', height: 230, border: 0, background: '#fff' }} />
            )}
            {m.links.length > 0 && (
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 8 }}>
                {m.links.map((l) => <a key={l.href} href={l.href} target="_blank" rel="noreferrer" className="ohlq-btn ohlq-btn-outline ohlq-btn-sm">{l.label}</a>)}
              </div>
            )}
          </div>
        </details>
      ))}
    </div>
  );
}

export function Field({ label, children, help, error, htmlFor }: { label: string; children: ReactNode; help?: ReactNode; error?: string | null; htmlFor?: string }) {
  return (
    <div>
      <label className="ohlq-label" htmlFor={htmlFor}>{label}</label>
      {children}
      {help && <div className="ohlq-help">{help}</div>}
      {error && <div className="ohlq-error" role="alert">{error}</div>}
    </div>
  );
}
