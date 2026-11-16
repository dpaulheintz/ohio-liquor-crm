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

/** Shown wherever the demo sends an email or text. */
export function DemoDelivered({ to }: { to?: string }) {
  return <span className="ohlq-help" style={{ display: 'inline' }}>(Demo: delivered to Paul{to ? ` instead of ${to}` : ''})</span>;
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
