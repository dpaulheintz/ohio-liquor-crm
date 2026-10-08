'use client';

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { AlertCircle, Camera, Check, ChevronDown, Image as ImageIcon, Loader2, RotateCw, Star, Timer, Video, X } from 'lucide-react';
import { toast } from 'sonner';
import { submitSecretShopperVisit } from '@/app/actions/secret-shopper';
import {
  MEDIA_LIMITS,
  SECTIONS,
  SECTION_KEYS,
  SERVICE_TYPES,
  SHOPPER_LOCATIONS,
  sectionLabel,
  type SectionKey,
  type ServiceType,
  type ShopperLocation,
} from '@/lib/secret-shopper';
import { cn } from '@/lib/utils';
import { TicketTimer, type TimerState } from './ticket-timer';
import { useMediaUploads, type PersistedMedia, type UploadItem } from './use-media-uploads';

// ─── Draft persistence ────────────────────────────────────────────────────────

const DRAFT_KEY = 'hb-secret-shopper-draft-v1';
const DRAFT_MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

type SectionsState = Record<SectionKey, { rating: number | null; notes: string }>;

interface Draft {
  version: 1;
  visitId: string;
  location: ShopperLocation | '';
  visitDate: string;
  serviceType: ServiceType | '';
  sections: SectionsState;
  timer: TimerState;
  email: string;
  media: PersistedMedia[];
  savedAt: number;
}

function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function emptySections(): SectionsState {
  return Object.fromEntries(SECTION_KEYS.map((k) => [k, { rating: null, notes: '' }])) as SectionsState;
}

function emptyDraft(): Draft {
  return {
    version: 1,
    visitId: crypto.randomUUID(),
    location: '',
    visitDate: todayLocal(),
    serviceType: '',
    sections: emptySections(),
    timer: { orderPlacedAt: null, foodDeliveredAt: null, manualOpen: false, manualMinutes: '' },
    email: '',
    media: [],
    savedAt: Date.now(),
  };
}

function hasContent(d: Draft): boolean {
  return Boolean(
    d.location || d.serviceType || d.email || d.timer.orderPlacedAt || d.timer.manualMinutes || d.media.length
      || SECTION_KEYS.some((k) => d.sections[k].rating != null || d.sections[k].notes.trim()),
  );
}

function loadDraft(): { draft: Draft; restored: boolean } {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as Partial<Draft>;
      if (saved.version === 1 && saved.visitId && Date.now() - (saved.savedAt ?? 0) < DRAFT_MAX_AGE_MS) {
        const base = emptyDraft();
        const draft: Draft = {
          ...base,
          ...saved,
          sections: { ...base.sections, ...(saved.sections ?? {}) },
          timer: { ...base.timer, ...(saved.timer ?? {}) },
          media: Array.isArray(saved.media) ? saved.media : [],
        } as Draft;
        return { draft, restored: hasContent(draft) };
      }
    }
  } catch {
    // Unreadable storage (private mode, quota) — start fresh.
  }
  return { draft: emptyDraft(), restored: false };
}

function clearDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    // ignore
  }
}

// ─── Entry ────────────────────────────────────────────────────────────────────

const noopSubscribe = () => () => {};

export function SecretShopperForm() {
  // The draft lives in localStorage, so the form only mounts on the client.
  const isClient = useSyncExternalStore(noopSubscribe, () => true, () => false);
  if (!isClient) {
    return (
      <div className="min-h-dvh bg-background flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  return <DraftBoot />;
}

function DraftBoot() {
  const [boot, setBoot] = useState(() => ({ ...loadDraft(), key: 0 }));
  return (
    <FormBody
      key={boot.key}
      initial={boot.draft}
      restored={boot.restored}
      onStartOver={() => {
        clearDraft();
        setBoot((b) => ({ draft: emptyDraft(), restored: false, key: b.key + 1 }));
      }}
    />
  );
}

// ─── Form ─────────────────────────────────────────────────────────────────────

function FormBody({ initial, restored, onStartOver }: { initial: Draft; restored: boolean; onStartOver: () => void }) {
  const visitId = initial.visitId;
  const [location, setLocation] = useState<ShopperLocation | ''>(initial.location);
  const [visitDate, setVisitDate] = useState(initial.visitDate);
  const [serviceType, setServiceType] = useState<ServiceType | ''>(initial.serviceType);
  const [sections, setSections] = useState<SectionsState>(initial.sections);
  const [timer, setTimer] = useState<TimerState>(initial.timer);
  const [email, setEmail] = useState(initial.email);
  const [honeypot, setHoneypot] = useState('');
  const [openSection, setOpenSection] = useState<SectionKey | null>(() =>
    restored ? (SECTION_KEYS.find((k) => initial.sections[k].rating == null) ?? null) : 'outside',
  );
  const [showRestored, setShowRestored] = useState(restored);
  const [savedOnce, setSavedOnce] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [phase, setPhase] = useState<'idle' | 'waiting' | 'submitting'>('idle');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showFailedPrompt, setShowFailedPrompt] = useState(false);
  const [done, setDone] = useState<{ email: string; mediaDropped: number } | null>(null);

  const media = useMediaUploads(visitId, initial.media);

  // Autosave every change.
  useEffect(() => {
    if (done) return;
    const draft: Draft = {
      version: 1, visitId, location, visitDate, serviceType, sections, timer, email, media: media.persisted, savedAt: Date.now(),
    };
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
      setSavedOnce(true);
    } catch {
      // Storage full/blocked — the form still works, it just won't survive a reload.
    }
  }, [visitId, location, visitDate, serviceType, sections, timer, email, media.persisted, done]);

  const updateSection = useCallback((key: SectionKey, patch: Partial<{ rating: number | null; notes: string }>) => {
    setSections((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  }, []);

  function goToSection(key: SectionKey | null, scrollTargetId?: string) {
    setOpenSection(key);
    const id = scrollTargetId ?? (key ? `section-${key}` : null);
    if (id) setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  }

  const ratedCount = SECTION_KEYS.filter((k) => sections[k].rating != null).length;
  const timerRunning = timer.orderPlacedAt != null && timer.foodDeliveredAt == null;

  // ── Submit ──────────────────────────────────────────────────────────────────

  function validate(): Record<string, string> {
    const errs: Record<string, string> = {};
    if (!location) errs.location = 'Choose the location you visited.';
    if (!visitDate) errs.date = 'Enter the date of your visit.';
    if (!serviceType) errs.service = 'Choose Bar or Table service.';
    if (timer.manualOpen && timer.manualMinutes.trim()) {
      const m = Number(timer.manualMinutes);
      if (!Number.isFinite(m) || m <= 0 || m > 360) errs.food = 'Enter the ticket time in minutes (1–360).';
    }
    if (!EMAIL_RE.test(email.trim())) errs.email = 'Enter the email where we should send your gift card.';
    return errs;
  }

  const doSubmit = useCallback(async () => {
    setShowFailedPrompt(false);
    setPhase('submitting');
    setSubmitError(null);
    try {
      const manual = timer.manualOpen && timer.manualMinutes.trim() ? Number(timer.manualMinutes) : null;
      const res = await submitSecretShopperVisit({
        visit_id: visitId,
        location: location as ShopperLocation,
        visit_date: visitDate,
        service_type: serviceType as ServiceType,
        sections,
        order_placed_at: timer.orderPlacedAt,
        food_delivered_at: timer.foodDeliveredAt,
        manual_ticket_minutes: manual,
        shopper_email: email.trim(),
        honeypot,
        media: media.submission,
      });
      if (res.ok) {
        clearDraft();
        setDone({ email: email.trim(), mediaDropped: res.mediaDropped });
        window.scrollTo({ top: 0 });
      } else {
        setSubmitError(res.error);
      }
    } catch {
      setSubmitError('Couldn’t reach the server. Check your connection and tap Submit again — your review is saved on this phone.');
    } finally {
      setPhase('idle');
    }
  }, [visitId, location, visitDate, serviceType, sections, timer, email, honeypot, media.submission]);

  // Submit waits for in-flight uploads, then continues on its own.
  useEffect(() => {
    if (phase !== 'waiting' || media.inFlight > 0) return;
    if (media.failed > 0) {
      setPhase('idle');
      setShowFailedPrompt(true);
    } else {
      void doSubmit();
    }
  }, [phase, media.inFlight, media.failed, doSubmit]);

  function handleSubmit() {
    const errs = validate();
    setErrors(errs);
    const first = ['location', 'date', 'service', 'food', 'email'].find((k) => errs[k]);
    if (first) {
      if (first === 'food') setOpenSection('food');
      setTimeout(() => document.getElementById(first === 'food' ? 'section-food' : `field-${first}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60);
      return;
    }
    if (timerRunning && !window.confirm('Your ticket timer is still running. Submit without a ticket time?')) return;
    if (media.inFlight > 0) {
      setPhase('waiting');
      return;
    }
    if (media.failed > 0) {
      setShowFailedPrompt(true);
      return;
    }
    void doSubmit();
  }

  async function onPickFiles(files: FileList | null, section: SectionKey) {
    if (!files?.length) return;
    const rejected = await media.addFiles(Array.from(files), section);
    for (const msg of new Set(rejected)) toast.error(msg);
  }

  // ── Thank-you ───────────────────────────────────────────────────────────────

  if (done) {
    return (
      <div className="min-h-dvh bg-background flex flex-col items-center justify-center px-6 text-center">
        <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mb-5">
          <Check className="h-8 w-8 text-primary" />
        </div>
        <h1 className="font-serif text-3xl font-bold text-foreground mb-3">Thank you!</h1>
        <p className="text-base text-muted-foreground max-w-sm">
          Your review has been submitted. Your $25 gift card will be sent to <span className="font-medium text-foreground">{done.email}</span>.
        </p>
        {done.mediaDropped > 0 && (
          <p className="mt-4 text-sm text-muted-foreground max-w-sm">
            {done.mediaDropped} photo/video {done.mediaDropped === 1 ? 'file' : 'files'} couldn’t be attached, but your written review was saved.
          </p>
        )}
      </div>
    );
  }

  // ── Form ────────────────────────────────────────────────────────────────────

  const busy = phase !== 'idle';

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur-sm px-5 py-3">
        <div className="max-w-lg mx-auto flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-serif text-lg font-bold text-primary leading-tight">Restaurant Review</h1>
            <p className="text-[11px] text-muted-foreground">High Bank Distillery</p>
          </div>
          {timerRunning && timer.orderPlacedAt ? (
            <RunningTimerChip startedAt={timer.orderPlacedAt} onClick={() => goToSection('food')} />
          ) : (
            <div className="text-right shrink-0">
              <p className="text-xs font-semibold text-foreground">{ratedCount}/9 rated</p>
              <p className={cn('text-[11px] text-muted-foreground flex items-center justify-end gap-1 transition-opacity', savedOnce ? 'opacity-100' : 'opacity-0')}>
                <Check className="h-3 w-3" /> Saved on this phone
              </p>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 pt-4 pb-[calc(2.5rem+env(safe-area-inset-bottom))] space-y-4">
        {showRestored && (
          <div className="rounded-xl border bg-white px-4 py-3 flex items-start gap-3 text-sm">
            <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="font-medium">Draft restored</p>
              <p className="text-muted-foreground text-xs mt-0.5">
                Picking up where you left off.{' '}
                <button
                  type="button"
                  className="underline underline-offset-2"
                  onClick={() => { if (window.confirm('Discard this draft and start a new review?')) onStartOver(); }}
                >
                  Start over
                </button>
              </p>
            </div>
            <button type="button" aria-label="Dismiss" onClick={() => setShowRestored(false)} className="p-1 -m-1 text-muted-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Visit details */}
        <section className="rounded-2xl border bg-card p-4 space-y-5">
          <div id="field-location" className="space-y-1.5 scroll-mt-24">
            <label htmlFor="ss-location" className="text-xs uppercase tracking-widest text-muted-foreground font-semibold">Location *</label>
            <div className="relative">
              <select
                id="ss-location"
                value={location}
                onChange={(e) => setLocation(e.target.value as ShopperLocation)}
                className={cn(
                  'w-full appearance-none rounded-xl border bg-white px-4 py-3.5 text-base focus:outline-none focus:border-primary/60',
                  !location && 'text-muted-foreground',
                  errors.location && !location && 'border-red-500',
                )}
              >
                <option value="">Select location…</option>
                {SHOPPER_LOCATIONS.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
              <ChevronDown className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            </div>
            {errors.location && !location && <FieldError msg={errors.location} />}
          </div>

          <div id="field-date" className="space-y-1.5 scroll-mt-24">
            <label htmlFor="ss-date" className="text-xs uppercase tracking-widest text-muted-foreground font-semibold">Date *</label>
            <input
              id="ss-date"
              type="date"
              value={visitDate}
              max={todayLocal()}
              onChange={(e) => setVisitDate(e.target.value)}
              className={cn('w-full rounded-xl border bg-white px-4 py-3.5 text-base focus:outline-none focus:border-primary/60', errors.date && !visitDate && 'border-red-500')}
            />
            {errors.date && !visitDate && <FieldError msg={errors.date} />}
          </div>

          <div id="field-service" className="space-y-1.5 scroll-mt-24">
            <span className="text-xs uppercase tracking-widest text-muted-foreground font-semibold">Bar or Table Service? *</span>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Bar or Table service">
              {SERVICE_TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  role="radio"
                  aria-checked={serviceType === t}
                  onClick={() => setServiceType(t)}
                  className={cn(
                    'rounded-xl border py-3.5 text-base font-medium transition-colors',
                    serviceType === t ? 'border-primary bg-primary text-white' : 'bg-white text-foreground',
                    errors.service && !serviceType && 'border-red-500',
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
            {errors.service && !serviceType && <FieldError msg={errors.service} />}
          </div>
        </section>

        {/* Sections */}
        {SECTIONS.map((s, idx) => {
          const next = SECTIONS[idx + 1];
          return (
            <SectionCard
              key={s.key}
              index={idx + 1}
              sectionKey={s.key}
              title={sectionLabel(s.key, serviceType)}
              notesLabel={s.key === 'server' && serviceType === 'Bar' ? 'Bartender notes' : s.key === 'server' && serviceType === 'Table' ? 'Server notes' : s.notesLabel}
              value={sections[s.key]}
              open={openSection === s.key}
              onToggle={() => setOpenSection(openSection === s.key ? null : s.key)}
              onRating={(r) => updateSection(s.key, { rating: r })}
              onNotes={(n) => updateSection(s.key, { notes: n })}
              mediaItems={media.items.filter((i) => i.section === s.key)}
              onPickFiles={(files) => onPickFiles(files, s.key)}
              onRetry={media.retry}
              onRemove={media.remove}
              nextLabel={next ? `Next: ${sectionLabel(next.key, serviceType)}` : 'Done — add your email'}
              onNext={() => (next ? goToSection(next.key) : goToSection(null, 'field-email'))}
              timerRunning={s.key === 'food' && timerRunning}
              error={s.key === 'food' ? errors.food : undefined}
            >
              {s.key === 'food' && (
                <TicketTimer value={timer} onChange={(patch) => setTimer((prev) => ({ ...prev, ...patch }))} />
              )}
            </SectionCard>
          );
        })}

        {/* Email */}
        <section id="field-email" className="rounded-2xl border bg-card p-4 space-y-1.5 scroll-mt-24">
          <label htmlFor="ss-email" className="text-xs uppercase tracking-widest text-muted-foreground font-semibold">
            Email to receive $25 gift card *
          </label>
          <input
            id="ss-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="example@example.com"
            className={cn('w-full rounded-xl border bg-white px-4 py-3.5 text-base focus:outline-none focus:border-primary/60', errors.email && !EMAIL_RE.test(email.trim()) && 'border-red-500')}
          />
          <p className="text-xs text-muted-foreground">Your email will not be shared or used for marketing.</p>
          {errors.email && !EMAIL_RE.test(email.trim()) && <FieldError msg={errors.email} />}
        </section>

        {/* Honeypot — real people never see or fill this. */}
        <div aria-hidden="true" className="absolute -left-[9999px] top-0 h-px w-px overflow-hidden">
          <label>
            Should be Empty
            <input type="text" tabIndex={-1} autoComplete="off" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} />
          </label>
        </div>

        {showFailedPrompt && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 space-y-3 text-sm">
            <p className="font-medium text-amber-900">
              {media.failed} {media.failed === 1 ? 'upload' : 'uploads'} didn’t finish.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowFailedPrompt(false);
                  media.items.filter((i) => i.status === 'error' && i.blob).forEach((i) => media.retry(i.id));
                }}
                className="flex-1 rounded-lg border border-amber-400 bg-white py-2.5 font-medium text-amber-900"
              >
                Retry
              </button>
              <button type="button" onClick={() => void doSubmit()} className="flex-1 rounded-lg bg-amber-900 py-2.5 font-medium text-white">
                Submit without them
              </button>
            </div>
          </div>
        )}

        {submitError && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 flex gap-2">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{submitError}</span>
          </div>
        )}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={busy}
          className="w-full rounded-xl bg-primary py-4 text-base font-semibold text-white disabled:opacity-70 flex items-center justify-center gap-2"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          {phase === 'waiting'
            ? `Finishing ${media.inFlight} ${media.inFlight === 1 ? 'upload' : 'uploads'}…`
            : phase === 'submitting'
              ? 'Submitting…'
              : 'Submit Review'}
        </button>
      </main>
    </div>
  );
}

// ─── Pieces ───────────────────────────────────────────────────────────────────

function FieldError({ msg }: { msg: string }) {
  return <p className="text-xs text-red-600 flex items-center gap-1"><AlertCircle className="h-3 w-3" />{msg}</p>;
}

function RunningTimerChip({ startedAt, onClick }: { startedAt: string; onClick: () => void }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const s = Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000));
  const label = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  return (
    <button type="button" onClick={onClick} className="shrink-0 flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-white">
      <Timer className="h-3.5 w-3.5" />
      <span className="font-mono tabular-nums">{label}</span>
    </button>
  );
}

const RATING_WORDS = ['', 'Poor', 'Fair', 'Good', 'Great', 'Excellent'];

function StarRating({ value, onChange, label }: { value: number | null; onChange: (v: number | null) => void; label: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex" role="radiogroup" aria-label={label}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n} star${n > 1 ? 's' : ''}`}
            onClick={() => onChange(value === n ? null : n)}
            className="h-12 w-11 flex items-center justify-center active:scale-90 transition-transform"
          >
            <Star
              className="h-9 w-9"
              strokeWidth={1.5}
              style={n <= (value ?? 0) ? { fill: '#C5A572', color: '#A8875A' } : { color: '#D1D5DB' }}
            />
          </button>
        ))}
      </div>
      <span className="text-sm text-muted-foreground">{value ? RATING_WORDS[value] : 'Tap to rate'}</span>
    </div>
  );
}

function SectionCard(props: {
  index: number;
  sectionKey: SectionKey;
  title: string;
  notesLabel: string;
  value: { rating: number | null; notes: string };
  open: boolean;
  onToggle: () => void;
  onRating: (r: number | null) => void;
  onNotes: (n: string) => void;
  mediaItems: UploadItem[];
  onPickFiles: (files: FileList | null) => void;
  onRetry: (id: string) => void;
  onRemove: (id: string) => void;
  nextLabel: string;
  onNext: () => void;
  timerRunning: boolean;
  error?: string;
  children?: React.ReactNode;
}) {
  const { sectionKey, value, open, mediaItems } = props;
  const uploading = mediaItems.some((m) => m.status === 'processing' || m.status === 'uploading');
  const failed = mediaItems.some((m) => m.status === 'error');

  return (
    <section id={`section-${sectionKey}`} className={cn('rounded-2xl border bg-card scroll-mt-20 overflow-hidden', props.error && 'border-red-400')}>
      <button type="button" onClick={props.onToggle} aria-expanded={open} className="w-full flex items-center gap-3 px-4 py-4 text-left">
        <span
          className={cn(
            'h-7 w-7 shrink-0 rounded-full flex items-center justify-center text-xs font-semibold',
            value.rating != null ? 'bg-primary text-white' : 'bg-muted text-muted-foreground',
          )}
        >
          {value.rating != null ? <Check className="h-3.5 w-3.5" /> : props.index}
        </span>
        <div className="flex-1 min-w-0">
          <p className="font-serif text-base font-semibold text-foreground">{props.title}</p>
          {!open && (value.rating != null || value.notes.trim() || mediaItems.length > 0 || props.timerRunning) && (
            <p className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
              {value.rating != null && (
                <span className="flex items-center gap-0.5" aria-label={`${value.rating} stars`}>
                  {Array.from({ length: value.rating }).map((_, i) => (
                    <Star key={i} className="h-3 w-3" style={{ fill: '#C5A572', color: '#A8875A' }} />
                  ))}
                </span>
              )}
              {value.notes.trim() && <span>Notes</span>}
              {mediaItems.length > 0 && (
                <span className={cn('flex items-center gap-0.5', failed && 'text-red-600')}>
                  <Camera className="h-3 w-3" />{mediaItems.length}{uploading && '…'}
                </span>
              )}
              {props.timerRunning && <span className="text-primary font-medium">Timer running</span>}
            </p>
          )}
        </div>
        <ChevronDown className={cn('h-5 w-5 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-4 border-t pt-4">
          {props.children}
          {props.error && <FieldError msg={props.error} />}

          <StarRating value={value.rating} onChange={props.onRating} label={`Rate ${props.title}`} />

          <div className="space-y-1.5">
            <label htmlFor={`notes-${sectionKey}`} className="text-xs text-muted-foreground font-medium">{props.notesLabel}</label>
            <textarea
              id={`notes-${sectionKey}`}
              value={value.notes}
              onChange={(e) => props.onNotes(e.target.value)}
              rows={4}
              maxLength={5000}
              className="w-full rounded-xl border bg-white px-4 py-3 text-base leading-relaxed focus:outline-none focus:border-primary/60 resize-y"
            />
          </div>

          {mediaItems.length > 0 && (
            <div className="grid grid-cols-4 gap-2">
              {mediaItems.map((m) => (
                <MediaThumb key={m.id} item={m} onRetry={() => props.onRetry(m.id)} onRemove={() => props.onRemove(m.id)} />
              ))}
            </div>
          )}

          <div className="flex items-center gap-2">
            <label className="flex-1 cursor-pointer rounded-xl border border-dashed bg-white py-3 text-sm font-medium text-foreground flex items-center justify-center gap-2 active:bg-muted">
              <Camera className="h-4 w-4" />
              Add photo/video
              <input
                type="file"
                accept="image/*,video/*"
                multiple
                className="sr-only"
                onChange={(e) => {
                  props.onPickFiles(e.target.files);
                  e.target.value = '';
                }}
              />
            </label>
          </div>
          <p className="text-[11px] text-muted-foreground -mt-2">
            Up to {MEDIA_LIMITS.maxPhotos} photos and {MEDIA_LIMITS.maxVideos} videos per review · videos up to {MEDIA_LIMITS.maxVideoSeconds}s
          </p>

          <button type="button" onClick={props.onNext} className="w-full rounded-xl bg-muted py-3 text-sm font-semibold text-foreground">
            {props.nextLabel} →
          </button>
        </div>
      )}
    </section>
  );
}

function MediaThumb({ item, onRetry, onRemove }: { item: UploadItem; onRetry: () => void; onRemove: () => void }) {
  const busy = item.status === 'processing' || item.status === 'uploading';
  return (
    <div className={cn('relative aspect-square rounded-lg overflow-hidden border bg-muted', item.status === 'error' && 'border-red-400')}>
      {item.previewUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.previewUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        <div className="h-full w-full flex flex-col items-center justify-center text-muted-foreground">
          {item.mediaType === 'video' ? <Video className="h-6 w-6" /> : <ImageIcon className="h-6 w-6" />}
        </div>
      )}

      {busy && (
        <div className="absolute inset-0 bg-black/45 flex flex-col items-center justify-center text-white">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-[10px] font-semibold mt-1 tabular-nums">
            {item.status === 'processing' ? 'Preparing' : `${Math.round(item.progress * 100)}%`}
          </span>
          {item.status === 'uploading' && (
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/30">
              <div className="h-1 bg-white transition-all" style={{ width: `${item.progress * 100}%` }} />
            </div>
          )}
        </div>
      )}

      {item.status === 'error' && (
        <div className="absolute inset-0 bg-red-600/80 flex flex-col items-center justify-center gap-1 p-1 text-white">
          <span className="text-[9px] leading-tight text-center line-clamp-2">{item.error}</span>
          <div className="flex gap-1">
            {item.blob && (
              <button type="button" onClick={onRetry} aria-label="Retry upload" className="rounded bg-white/90 p-1 text-red-700">
                <RotateCw className="h-3.5 w-3.5" />
              </button>
            )}
            <button type="button" onClick={onRemove} aria-label="Remove" className="rounded bg-white/90 p-1 text-red-700">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {item.status === 'done' && (
        <>
          <span className="absolute bottom-1 left-1 rounded-full bg-green-600 p-0.5 text-white"><Check className="h-3 w-3" /></span>
          <button type="button" onClick={onRemove} aria-label="Remove" className="absolute top-1 right-1 rounded-full bg-black/60 p-1 text-white">
            <X className="h-3 w-3" />
          </button>
        </>
      )}
    </div>
  );
}
