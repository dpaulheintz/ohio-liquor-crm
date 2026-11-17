'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Building2, CalendarClock, ClipboardList, PenLine, Send, UserRound, Wine } from 'lucide-react';
import { submitTasting } from '@/app/demo/ohlq/actions';
import {
  APPLICANT_TYPES, DEMO_BASE, ORC_4301_253_ITEMS, TASTING_MAX_MINUTES, earliestTastingDate, fmtDate, fmtShortDay, minutesOf, todayET,
  type Agency, type ApplicantType, type Product, type Signature, type Tasting,
} from '@/lib/ohlq-demo/shared';
import { SignaturePad } from './signature-pad';
import { DemoNotSent, Field, Section } from './ui';

export interface ApplicantProfile {
  employer?: string; phone?: string; fax?: string; email?: string; conductor_name?: string; solicitor_reg_no?: string;
  reg_expires?: string; applicant_type?: ApplicantType; signer_name?: string;
}

export function TastingForm({ agencies, products, profile, from }: { agencies: Agency[]; products: Product[]; profile: ApplicantProfile; from: Tasting | null }) {
  const router = useRouter();
  const today = todayET();
  const earliest = earliestTastingDate(today);

  const [agencyId, setAgencyId] = useState(from?.agency_id ?? '');
  const agency = agencies.find((a) => a.id === agencyId) ?? null;
  const [staff, setStaff] = useState(from?.staff_granted ?? '');
  const [date, setDate] = useState('');
  const [start, setStart] = useState(from ? from.start_time.slice(0, 5) : '');
  const [end, setEnd] = useState(from ? from.end_time.slice(0, 5) : '');
  const [conductor, setConductor] = useState(from?.conductor_name ?? profile.conductor_name ?? '');
  const [regNo, setRegNo] = useState(from?.solicitor_reg_no ?? profile.solicitor_reg_no ?? '');
  const [regExp, setRegExp] = useState(from?.reg_expires ?? profile.reg_expires ?? '');
  const [type, setType] = useState<ApplicantType | ''>(from?.applicant_type ?? profile.applicant_type ?? '');
  const [training, setTraining] = useState(from?.training_confirmed ?? false);
  const [codes, setCodes] = useState<string[]>(from?.products.map((p) => p.code) ?? []);
  const [employer, setEmployer] = useState(from?.employer ?? profile.employer ?? 'High Bank Distillery');
  const [phone, setPhone] = useState(from?.phone ?? profile.phone ?? '614-826-5247');
  const [fax, setFax] = useState(from?.fax ?? profile.fax ?? '');
  const [email, setEmail] = useState(from?.email ?? profile.email ?? 'pheintzman@highbankco.com');
  const [sig, setSig] = useState<Signature | null>(null);
  const [signer, setSigner] = useState(profile.signer_name ?? '');
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);
  const [serverErr, setServerErr] = useState('');

  const dateErr = date && date < earliest ? `Too soon — tastings must be filed at least 10 business days ahead. Earliest allowed: ${fmtShortDay(earliest)}.` : '';
  const dur = start && end ? minutesOf(end) - minutesOf(start) : null;
  const timeErr = dur === null ? '' : dur <= 0 ? 'The event must end after it begins, on the same day.' : dur > TASTING_MAX_MINUTES ? `That’s ${(dur / 60).toFixed(1).replace('.0', '')} hours — a tasting can last no more than 2 hours.` : '';
  const regWarn = regExp && date && regExp < date ? `This registration expires ${fmtDate(regExp)}, before the event on ${fmtDate(date)}. Renew it or OHLQ will flag the application.` : '';

  const missing = [
    !agency && 'agency', !staff.trim() && 'agency staff who granted permission', !date && 'event date', (!start || !end) && 'start and end times',
    !conductor.trim() && 'individual conducting the tasting', !regNo.trim() && 'solicitor registration number', !type && 'applicant type',
    type === 'trade_marketing' && !training && 'ORC 4301.253 training confirmation', codes.length === 0 && 'products to be sampled',
    !employer.trim() && 'employer', !sig && 'signature', !signer.trim() && 'typed name',
  ].filter(Boolean) as string[];
  const valid = missing.length === 0 && !dateErr && !timeErr;

  async function submit() {
    setTried(true);
    if (!valid || !agency || !type || !sig) return;
    setBusy(true);
    const r = await submitTasting({
      agency_id: agency.id, staff_granted: staff, event_date: date, start_time: start, end_time: end, conductor_name: conductor,
      solicitor_reg_no: regNo, reg_expires: regExp, applicant_type: type, training_confirmed: training, product_codes: codes,
      employer, phone, fax, email, signature: sig, signer_name: signer,
    });
    setBusy(false);
    if (!r.ok) { setServerErr(r.error); return; }
    toast.success('Application submitted — confirmation shown under Messages (not sent in the demo)');
    router.push(`${DEMO_BASE}/tastings/${r.id}?submitted=1`);
  }

  return (
    <>
      <h1 className="ohlq-title" style={{ marginBottom: 4 }}>New Tasting Application</h1>
      <p className="ohlq-help" style={{ textAlign: 'center', marginBottom: 18 }}>
        Application to Conduct a Spirituous Liquor Tasting at a Contract Liquor Agency (LIQ-19-0004){from ? ` · copied from ${from.ref_no} — pick a new date` : ''}
      </p>

      <Section icon={<Building2 aria-hidden />} title="Contract Liquor Agency">
        <AgencyPicker agencies={agencies} value={agency} onPick={(a) => setAgencyId(a.id)} />
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_70px_110px]" style={{ marginTop: 12 }}>
          <Field label="Agency Name"><input className="ohlq-input" readOnly value={agency?.name ?? ''} /></Field>
          <Field label="Agency Address"><input className="ohlq-input" readOnly value={agency?.address ?? ''} /></Field>
          <Field label="State"><input className="ohlq-input" readOnly value={agency ? 'OH' : ''} /></Field>
          <Field label="ZIP"><input className="ohlq-input" readOnly value={agency?.zip ?? ''} /></Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2" style={{ marginTop: 12 }}>
          <Field label="City"><input className="ohlq-input" readOnly value={agency?.city ?? ''} /></Field>
          <Field label="Name of agency staff who granted permission" htmlFor="staff" error={tried && !staff.trim() ? 'Required' : null}>
            <input id="staff" className="ohlq-input" value={staff} onChange={(e) => setStaff(e.target.value)} />
          </Field>
        </div>
      </Section>

      <Section icon={<CalendarClock aria-hidden />} title="Date & Time">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Date event begins and ends" htmlFor="ev-date" help={<>Earliest allowed: <b>{fmtShortDay(earliest)}</b> (10 business days, skipping weekends and Ohio holidays)</>} error={dateErr || (tried && !date ? 'Choose a date' : null)}>
            <input id="ev-date" className="ohlq-input" type="date" min={earliest} value={date} onChange={(e) => setDate(e.target.value)} data-event-date />
          </Field>
          <Field label="Time event begins" htmlFor="ev-start"><input id="ev-start" className="ohlq-input" type="time" step={900} value={start} onChange={(e) => setStart(e.target.value)} /></Field>
          <Field label="Time event ends" htmlFor="ev-end" help="No more than two hours, same day." error={timeErr || (tried && (!start || !end) ? 'Enter both times' : null)}>
            <input id="ev-end" className="ohlq-input" type="time" step={900} value={end} onChange={(e) => setEnd(e.target.value)} />
          </Field>
        </div>
        {dur !== null && !timeErr && <p className="ohlq-help">Duration: {Math.floor(dur / 60)}h {dur % 60 ? `${dur % 60}m` : ''}</p>}
        <p className="ohlq-help">The paper form labels both times &ldquo;Time Event Begins&rdquo; — fixed here.</p>
      </Section>

      <Section icon={<UserRound aria-hidden />} title="Individual Conducting the Tasting">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Name" htmlFor="cond"><input id="cond" className="ohlq-input" value={conductor} onChange={(e) => setConductor(e.target.value)} /></Field>
          <Field label="Solicitor registration number" htmlFor="reg"><input id="reg" className="ohlq-input" value={regNo} onChange={(e) => setRegNo(e.target.value)} /></Field>
          <Field label="Registration expires" htmlFor="regexp"><input id="regexp" className="ohlq-input" type="date" value={regExp} onChange={(e) => setRegExp(e.target.value)} /></Field>
        </div>
        {regWarn && <p className="ohlq-warn">{regWarn}</p>}
        <div style={{ marginTop: 16 }}>
          <span className="ohlq-label">Applicant is a</span>
          <div style={{ display: 'grid', gap: 8 }}>
            {APPLICANT_TYPES.map((t) => (
              <label key={t.value} className="ohlq-value" style={{ display: 'flex', gap: 10, alignItems: 'center', cursor: 'pointer' }}>
                <input type="radio" name="applicant" checked={type === t.value} onChange={() => setType(t.value)} style={{ width: 20, height: 20 }} /> {t.label}
              </label>
            ))}
          </div>
          {tried && !type && <p className="ohlq-error">Choose one</p>}
          <div style={{ marginTop: 12, padding: 12, background: '#fafafa', border: '1px solid #eee', opacity: type === 'trade_marketing' ? 1 : 0.7 }}>
            <p className="ohlq-cond" style={{ margin: '0 0 6px', fontSize: 15 }}>ORC 4301.253 training program</p>
            <p className="ohlq-help" style={{ marginTop: 0 }}>A training program that includes the following:</p>
            <ul style={{ margin: '6px 0 0', paddingLeft: 18, font: '14px/1.45 var(--ohlq-serif)' }}>{ORC_4301_253_ITEMS.map((i) => <li key={i}>{i}</li>)}</ul>
            {type === 'trade_marketing' && (
              <label className="ohlq-value" style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 10, cursor: 'pointer' }}>
                <input type="checkbox" checked={training} onChange={(e) => setTraining(e.target.checked)} style={{ width: 20, height: 20, flexShrink: 0, marginTop: 2 }} />
                <span>The applicant has successfully completed a training program described in ORC 4301.253 covering all four items above.</span>
              </label>
            )}
            {tried && type === 'trade_marketing' && !training && <p className="ohlq-error">Required for trade marketing professionals</p>}
          </div>
        </div>
      </Section>

      <Section icon={<Wine aria-hidden />} title="Products to Be Sampled">
        <ProductMultiSelect products={products} value={codes} onChange={setCodes} />
        {tried && codes.length === 0 && <p className="ohlq-error">Choose at least one product</p>}
      </Section>

      <Section icon={<ClipboardList aria-hidden />} title="Applicant Contact">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name of employer"><input className="ohlq-input" value={employer} onChange={(e) => setEmployer(e.target.value)} /></Field>
          <Field label="Phone number"><input className="ohlq-input" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
          <Field label="Fax number"><input className="ohlq-input" type="tel" value={fax} onChange={(e) => setFax(e.target.value)} /></Field>
          <Field label="Email address" help={<DemoNotSent />}><input className="ohlq-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        </div>
        <p className="ohlq-help">Saved to your applicant profile and filled in next time.</p>
      </Section>

      <Section icon={<PenLine aria-hidden />} title="Signature of Applicant">
        <SignaturePad onChange={setSig} />
        <div style={{ maxWidth: 360, marginTop: 10 }}>
          <Field label="Typed name" htmlFor="tasting-signer" error={tried && !signer.trim() ? 'Required' : null}><input id="tasting-signer" className="ohlq-input" value={signer} onChange={(e) => setSigner(e.target.value)} /></Field>
        </div>
      </Section>

      {tried && missing.length > 0 && <p className="ohlq-error" role="alert" style={{ fontSize: 16 }}>Still needed: {missing.join(', ')}.</p>}
      {serverErr && <p className="ohlq-error" role="alert" style={{ fontSize: 16 }}>{serverErr}</p>}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 24 }}>
        <button type="button" className="ohlq-btn" onClick={submit} disabled={busy || (tried && !valid)}><Send aria-hidden /> {busy ? 'Submitting…' : 'Submit application'}</button>
        <span className="ohlq-help" style={{ alignSelf: 'center', margin: 0 }}>You&rsquo;ll get a confirmation with the completed LIQ-19-0004. <DemoNotSent /></span>
      </div>
    </>
  );
}

function AgencyPicker({ agencies, value, onPick }: { agencies: Agency[]; value: Agency | null; onPick: (a: Agency) => void }) {
  const [q, setQ] = useState(value ? value.id : '');
  const [open, setOpen] = useState(false);
  const term = q.trim().toLowerCase();
  const hits = useMemo(() => {
    if (!term) return [];
    const exact = agencies.filter((a) => a.id === term);
    const rest = agencies.filter((a) => a.id !== term && (a.id.startsWith(term) || a.name.toLowerCase().includes(term) || a.city.toLowerCase().includes(term)));
    return [...exact, ...rest].slice(0, 10);
  }, [agencies, term]);
  return (
    <div style={{ position: 'relative', maxWidth: 520 }}>
      <label className="ohlq-label" htmlFor="agency">Agency number (or search by name or city)</label>
      <input id="agency" className="ohlq-input" inputMode="search" autoComplete="off" placeholder="e.g. 30205 or Gahanna" value={q} data-agency-input
        onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => {
          setQ(e.target.value); setOpen(true);
          const exact = agencies.find((a) => a.id === e.target.value.trim());
          if (exact) onPick(exact);
        }}
        onKeyDown={(e) => { if (e.key === 'Enter' && hits[0]) { e.preventDefault(); onPick(hits[0]); setQ(hits[0].id); setOpen(false); } }} />
      {open && hits.length > 0 && (
        <ul role="listbox" style={{ position: 'absolute', zIndex: 20, left: 0, right: 0, background: '#fff', border: '1px solid #ccc', margin: 0, padding: 0, listStyle: 'none', maxHeight: 320, overflowY: 'auto', boxShadow: '0 6px 18px rgba(0,0,0,.12)' }}>
          {hits.map((a) => (
            <li key={a.id} role="option" aria-selected={value?.id === a.id}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { onPick(a); setQ(a.id); setOpen(false); }}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 12px', background: 'none', border: 0, borderBottom: '1px solid #f0f0f0', cursor: 'pointer', font: '15px var(--ohlq-serif)' }}>
                <b>#{a.id}</b> {a.name} <span className="ohlq-muted">· {a.address}, {a.city}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ProductMultiSelect({ products, value, onChange }: { products: Product[]; value: string[]; onChange: (v: string[]) => void }) {
  const [q, setQ] = useState('');
  const term = q.trim().toLowerCase();
  const shown = products.filter((p) => !term || p.code.toLowerCase().includes(term) || p.name.toLowerCase().includes(term));
  const toggle = (code: string) => onChange(value.includes(code) ? value.filter((c) => c !== code) : [...value, code]);
  return (
    <div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
        <input className="ohlq-input" style={{ maxWidth: 320 }} placeholder="Filter by code or name" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filter products" />
        <span className="ohlq-help" style={{ margin: 0 }}>{value.length} selected</span>
      </div>
      {value.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
          {value.map((c) => {
            const p = products.find((x) => x.code === c);
            return <button key={c} type="button" className="ohlq-chip chip-submitted" onClick={() => toggle(c)} aria-label={`Remove ${c}`} style={{ cursor: 'pointer' }}>{c} {p?.name} ✕</button>;
          })}
        </div>
      )}
      <div style={{ maxHeight: 280, overflowY: 'auto', border: '1px solid #e3e3e3' }}>
        {shown.map((p) => (
          <label key={p.code} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '9px 12px', borderBottom: '1px solid #f2f2f2', cursor: 'pointer', font: '15px var(--ohlq-serif)', background: value.includes(p.code) ? '#fbeeee' : undefined }}>
            <input type="checkbox" checked={value.includes(p.code)} onChange={() => toggle(p.code)} style={{ width: 18, height: 18 }} />
            <b style={{ minWidth: 56 }}>{p.code}</b><span>{p.name} <span className="ohlq-muted">{p.size}</span></span>
          </label>
        ))}
      </div>
    </div>
  );
}
