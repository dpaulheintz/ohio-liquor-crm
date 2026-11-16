import { CalendarClock, ClipboardList, History, PenLine, UserRound, Wine } from 'lucide-react';
import { APPLICANT_TYPES, fmtDate, fmtDateTime, fmtTime, type AuditEntry, type Tasting } from '@/lib/ohlq-demo/shared';
import { SignatureView } from './signature-pad';
import { Section, TastingStatusChip } from './ui';
import { AuditList } from './sale-workspace';

export function TastingDetail({ t, audit }: { t: Tasting; audit: AuditEntry[] }) {
  return (
    <>
      <Section icon={<CalendarClock aria-hidden />} title="Tasting Event Information" right={<TastingStatusChip status={t.status} />}>
        <dl className="ohlq-kv">
          <dt>Agency</dt><dd><b>#{t.agency_id}</b> {t.agency_name}<br /><span className="ohlq-muted">{t.agency_address}, {t.agency_city}, OH {t.agency_zip}{t.agency_county ? ` · ${t.agency_county}` : ''}</span></dd>
          <dt>Date &amp; time</dt><dd>{fmtDate(t.event_date, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}, {fmtTime(t.start_time)}–{fmtTime(t.end_time)}</dd>
          <dt>Permission granted by</dt><dd>{t.staff_granted}</dd>
          <dt>Supplier</dt><dd>{t.supplier_name}</dd>
          <dt>Filed</dt><dd>{fmtDateTime(t.submitted_at)}</dd>
          {t.decided_at && <><dt>Decision</dt><dd><TastingStatusChip status={t.status} /> {fmtDateTime(t.decided_at)}{t.decision_note && t.decision_note !== 'Approved' ? <> — {t.decision_note}</> : null}</dd></>}
        </dl>
      </Section>
      <Section icon={<UserRound aria-hidden />} title="Individual Conducting the Tasting">
        <dl className="ohlq-kv">
          <dt>Name</dt><dd>{t.conductor_name}</dd>
          <dt>Solicitor registration</dt><dd>{t.solicitor_reg_no}{t.reg_expires ? ` · expires ${fmtDate(t.reg_expires)}` : ''}</dd>
          <dt>Applicant is a</dt><dd>{APPLICANT_TYPES.find((a) => a.value === t.applicant_type)?.label}{t.applicant_type === 'trade_marketing' ? (t.training_confirmed ? ' · ORC 4301.253 training confirmed' : ' · training NOT confirmed') : ''}</dd>
        </dl>
      </Section>
      <Section icon={<Wine aria-hidden />} title={`Products to Be Sampled (${t.products.length})`}>
        <ul style={{ margin: 0, paddingLeft: 18 }} className="ohlq-value">{t.products.map((p) => <li key={p.code}><b>{p.code}</b> {p.name}</li>)}</ul>
      </Section>
      <Section icon={<ClipboardList aria-hidden />} title="Applicant">
        <dl className="ohlq-kv">
          <dt>Employer</dt><dd>{t.employer}</dd>
          <dt>Phone</dt><dd>{t.phone || '—'}</dd>
          <dt>Fax</dt><dd>{t.fax || '—'}</dd>
          <dt>Email</dt><dd>{t.email || '—'}</dd>
        </dl>
      </Section>
      <Section icon={<PenLine aria-hidden />} title="Signature of Applicant">
        <div style={{ border: '1px solid #e3e3e3', padding: 10, background: '#fffefb', maxWidth: 360 }}>
          <SignatureView sig={t.applicant_signature} width={260} />
          <div className="ohlq-value" style={{ borderTop: '1px solid #ccc', marginTop: 4, paddingTop: 4 }}>{t.applicant_signer_name}</div>
          <div className="ohlq-help" style={{ marginTop: 0 }}>Signed electronically {fmtDateTime(t.signed_at)}</div>
        </div>
      </Section>
      {audit.length > 0 && <Section icon={<History aria-hidden />} title="History" defaultOpen={false}><AuditList audit={audit} /></Section>}
    </>
  );
}
