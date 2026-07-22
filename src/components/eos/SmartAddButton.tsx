'use client';

import { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import MetricModal, { type MetricFormData } from '@/components/eos/MetricModal';
import BarrelModal from '@/components/eos/BarrelModal';
import OwnerSelect from '@/components/eos/OwnerSelect';
import { addMetric } from '@/app/eos/scorecard/actions';
import { createBarrelAction, type BarrelFormData } from '@/app/eos/barrels/actions';
import { createTodoAction } from '@/app/eos/todos/actions';
import { createOpportunityAction } from '@/app/eos/opportunities/actions';
import { createHeadlineAction } from '@/app/eos/headlines/actions';
import { startMeetingAction } from '@/app/eos/meetings/actions';
import { cn } from '@/lib/utils';

export type PageContext = 'scorecard' | 'barrels' | 'todos' | 'opportunities' | 'headlines' | 'meetings' | 'dashboard' | 'meeting';
type ModalKey = 'metric' | 'barrel' | 'todo' | 'opp' | 'headline' | 'meeting';

const PAGE_DEFAULTS: Record<PageContext, { label: string; modal: ModalKey }> = {
  scorecard:     { label: 'New Metric',      modal: 'metric' },
  barrels:       { label: 'New Barrel',      modal: 'barrel' },
  todos:         { label: 'New To-Do',       modal: 'todo' },
  opportunities: { label: 'New Opportunity', modal: 'opp' },
  headlines:     { label: 'New Headline',    modal: 'headline' },
  meetings:      { label: 'Start Meeting',   modal: 'meeting' },
  dashboard:     { label: 'New To-Do',       modal: 'todo' },
  meeting:       { label: 'New Opportunity', modal: 'opp' },
};

const DROPDOWN_ACTIONS: { key: ModalKey; label: string }[] = [
  { key: 'todo',     label: 'New To-Do' },
  { key: 'opp',      label: 'New Opportunity' },
  { key: 'headline', label: 'New Headline' },
  { key: 'barrel',   label: 'New Barrel' },
  { key: 'meeting',  label: 'Start Meeting' },
];

const mCls = 'w-full rounded-lg bg-white border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-green-600 transition-colors';

function Overlay({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-gray-50/70 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
      <div onClick={e => e.stopPropagation()} className="w-full max-w-md">
        {children}
      </div>
      <div className="absolute inset-0 -z-10" onClick={onClose} />
    </div>
  );
}

function Shell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-2xl">
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
        <h2 className="text-base font-semibold text-gray-900">{title}</h2>
        <button onClick={onClose} className="text-gray-500 hover:text-gray-900 text-2xl w-7 h-7 flex items-center justify-center">×</button>
      </div>
      {children}
    </div>
  );
}

function TodoQuickModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [due, setDue] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    try {
      await createTodoAction({ title: title.trim(), owner_name: ownerName, owner_email: ownerEmail, due_date: due });
      router.refresh();
      onClose();
    } catch { console.error('Failed.'); setSaving(false); }
  }

  return (
    <Shell title="New To-Do" onClose={onClose}>
      <form onSubmit={handleSave} className="px-6 py-4 space-y-3">
        <input autoFocus type="text" value={title} onChange={e => setTitle(e.target.value)} className={mCls} placeholder="Task description" />
        <div className="grid grid-cols-2 gap-3">
          <OwnerSelect ownerName={ownerName} ownerEmail={ownerEmail} onChange={(n, e) => { setOwnerName(n); setOwnerEmail(e); }} className={mCls} />
          <input type="date" value={due} onChange={e => setDue(e.target.value)} className={mCls} />
        </div>
        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onClose} className="flex-1 py-2 rounded-lg border border-gray-200 text-gray-900 text-sm hover:bg-gray-100 transition-colors">Cancel</button>
          <button type="submit" disabled={saving || !title.trim()} className="flex-1 py-2 rounded-lg bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-semibold transition-colors">
            {saving ? 'Saving…' : 'Add To-Do'}
          </button>
        </div>
      </form>
    </Shell>
  );
}

function OppQuickModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState('medium');
  const [term, setTerm] = useState<'short' | 'long'>('short');
  const [ownerName, setOwnerName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    try {
      await createOpportunityAction({ title: title.trim(), description: '', priority, owner_name: ownerName, owner_email: ownerEmail, term, status: 'open' });
      router.refresh();
      onClose();
    } catch { console.error('Failed.'); setSaving(false); }
  }

  return (
    <Shell title="New Opportunity" onClose={onClose}>
      <form onSubmit={handleSave} className="px-6 py-4 space-y-3">
        <input autoFocus type="text" value={title} onChange={e => setTitle(e.target.value)} className={mCls} placeholder="What's the issue or opportunity?" />
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Priority</label>
            <select value={priority} onChange={e => setPriority(e.target.value)} className={mCls}>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Term</label>
            <div className="flex rounded-lg overflow-hidden border border-gray-200 h-[42px]">
              {(['short', 'long'] as const).map(t => (
                <button key={t} type="button" onClick={() => setTerm(t)}
                  className={cn('flex-1 text-sm font-medium capitalize transition-colors',
                    term === t ? 'bg-green-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-100')}>
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Owner</label>
            <OwnerSelect ownerName={ownerName} ownerEmail={ownerEmail} onChange={(n, e) => { setOwnerName(n); setOwnerEmail(e); }} className={mCls} />
          </div>
        </div>
        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onClose} className="flex-1 py-2 rounded-lg border border-gray-200 text-gray-900 text-sm hover:bg-gray-100 transition-colors">Cancel</button>
          <button type="submit" disabled={saving || !title.trim()} className="flex-1 py-2 rounded-lg bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-semibold transition-colors">
            {saving ? 'Saving…' : 'Add Opportunity'}
          </button>
        </div>
      </form>
    </Shell>
  );
}

function HeadlineQuickModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [type, setType] = useState<'good_news' | 'customer_win' | 'employee_update'>('good_news');
  const [ownerName, setOwnerName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [saving, setSaving] = useState(false);

  const TYPE_OPTS = [
    { value: 'good_news' as const,       label: 'Good News' },
    { value: 'customer_win' as const,    label: 'Customer Win' },
    { value: 'employee_update' as const, label: 'Team Update' },
  ];

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    try {
      await createHeadlineAction({ title: title.trim(), headline_type: type, owner_name: ownerName });
      router.refresh();
      onClose();
    } catch { console.error('Failed.'); setSaving(false); }
  }

  return (
    <Shell title="New Headline" onClose={onClose}>
      <form onSubmit={handleSave} className="px-6 py-4 space-y-3">
        <div className="flex gap-1.5">
          {TYPE_OPTS.map(opt => (
            <button key={opt.value} type="button" onClick={() => setType(opt.value)}
              className={cn('flex-1 rounded-lg py-1.5 text-xs font-semibold transition-colors border',
                type === opt.value ? 'bg-green-600 border-green-600 text-white' : 'bg-white border-gray-200 text-gray-500 hover:text-gray-900')}>
              {opt.label}
            </button>
          ))}
        </div>
        <input autoFocus type="text" value={title} onChange={e => setTitle(e.target.value)} className={mCls} placeholder="Share good news…" />
        <OwnerSelect ownerName={ownerName} ownerEmail={ownerEmail} onChange={(n, e) => { setOwnerName(n); setOwnerEmail(e); }} className={mCls} />
        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onClose} className="flex-1 py-2 rounded-lg border border-gray-200 text-gray-900 text-sm hover:bg-gray-100 transition-colors">Cancel</button>
          <button type="submit" disabled={saving || !title.trim()} className="flex-1 py-2 rounded-lg bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-semibold transition-colors">
            {saving ? 'Sharing…' : 'Share'}
          </button>
        </div>
      </form>
    </Shell>
  );
}

function MeetingQuickModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [starting, setStarting] = useState(false);

  async function handleStart() {
    setStarting(true);
    try {
      const id = await startMeetingAction();
      router.push(`/eos/meetings/${id}/run`);
    } catch { console.error('Failed to start meeting.'); setStarting(false); }
  }

  return (
    <Shell title="Start Level 10 Meeting" onClose={onClose}>
      <div className="px-6 py-5">
        <p className="text-sm text-gray-500 mb-5">This will create a new meeting record and open the live runner.</p>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg border border-gray-200 text-gray-900 text-sm hover:bg-gray-100 transition-colors">Cancel</button>
          <button onClick={handleStart} disabled={starting} className="flex-1 py-2.5 rounded-lg bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-semibold transition-colors">
            {starting ? 'Starting…' : 'Start Meeting'}
          </button>
        </div>
      </div>
    </Shell>
  );
}

export default function SmartAddButton({ pageContext, className }: { pageContext: PageContext; className?: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [activeModal, setActiveModal] = useState<ModalKey | null>(null);

  void pathname; // used elsewhere to decide context, not suppressing runner

  const pageDefault = PAGE_DEFAULTS[pageContext];

  function openModal(key: ModalKey) {
    setDropdownOpen(false);
    setActiveModal(key);
  }

  function closeModal() {
    setActiveModal(null);
  }

  return (
    <>
      {dropdownOpen && (
        <div className="fixed inset-0 z-[44]" onClick={() => setDropdownOpen(false)} />
      )}

      <div className={cn('fixed bottom-6 right-6 z-[45]', className)}>
        <div className="relative">
          {dropdownOpen && (
            <div className="absolute bottom-full right-0 mb-2 bg-white border border-gray-200 rounded-xl shadow-2xl overflow-hidden min-w-[180px]">
              {DROPDOWN_ACTIONS.map(action => (
                <button
                  key={action.key}
                  onClick={() => openModal(action.key)}
                  className="w-full text-left px-4 py-3 text-sm text-gray-900 hover:bg-gray-100 transition-colors"
                >
                  {action.label}
                </button>
              ))}
            </div>
          )}

          <div className="flex shadow-2xl rounded-full overflow-hidden">
            <button
              onClick={() => openModal(pageDefault.modal)}
              className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white text-sm font-bold px-5 py-3 transition-colors"
            >
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 16 16" fill="none">
                <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              {pageDefault.label}
            </button>
            <div className="w-px bg-gray-50/20 self-stretch" />
            <button
              onClick={() => setDropdownOpen(o => !o)}
              className={cn(
                'bg-green-600 hover:bg-green-700 text-white px-3 py-3 transition-colors',
                dropdownOpen && 'bg-green-700',
              )}
              aria-label="More actions"
            >
              <svg className={cn('w-4 h-4 transition-transform', dropdownOpen && 'rotate-180')} viewBox="0 0 16 16" fill="none">
                <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>
        </div>
      </div>

      {activeModal === 'metric' && (
        <MetricModal
          mode="create"
          onSave={async (data: MetricFormData) => {
            await addMetric({ ...data, display_order: 9999 });
            router.refresh();
            closeModal();
          }}
          onClose={closeModal}
        />
      )}
      {activeModal === 'barrel' && (
        <BarrelModal
          mode="create"
          onSave={async (data: BarrelFormData) => {
            await createBarrelAction(data);
            router.refresh();
            closeModal();
          }}
          onClose={closeModal}
        />
      )}
      {activeModal === 'todo' && (
        <Overlay onClose={closeModal}>
          <TodoQuickModal onClose={closeModal} />
        </Overlay>
      )}
      {activeModal === 'opp' && (
        <Overlay onClose={closeModal}>
          <OppQuickModal onClose={closeModal} />
        </Overlay>
      )}
      {activeModal === 'headline' && (
        <Overlay onClose={closeModal}>
          <HeadlineQuickModal onClose={closeModal} />
        </Overlay>
      )}
      {activeModal === 'meeting' && (
        <Overlay onClose={closeModal}>
          <MeetingQuickModal onClose={closeModal} />
        </Overlay>
      )}
    </>
  );
}
