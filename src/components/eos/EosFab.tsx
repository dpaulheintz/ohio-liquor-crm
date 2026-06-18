'use client';

import { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { createTodoAction } from '@/app/eos/todos/actions';
import { createOpportunityAction } from '@/app/eos/opportunities/actions';
import { createHeadlineAction } from '@/app/eos/headlines/actions';
import { startMeetingAction } from '@/app/eos/meetings/actions';
import { cn } from '@/lib/utils';

type Modal = 'todo' | 'opp' | 'headline' | 'meeting' | null;

const inputCls = 'w-full rounded-lg bg-[#1C1510] border border-[#3D2E1E] px-3 py-2 text-sm text-[#F5ECD7] placeholder:text-[#6B5A4A] focus:outline-none focus:border-[#C9963A] transition-colors';

function Overlay({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-[#0E0B07]/70 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
      <div onClick={e => e.stopPropagation()} className="w-full max-w-md">
        {children}
      </div>
      <div className="absolute inset-0 -z-10" onClick={onClose} />
    </div>
  );
}

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="bg-[#1C1510] border border-[#3D2E1E] rounded-2xl shadow-2xl">
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#3D2E1E]">
        <h2 className="text-base font-semibold text-[#F5ECD7]">{title}</h2>
        <button onClick={onClose} className="text-[#B8A99A] hover:text-[#F5ECD7] text-2xl w-7 h-7 flex items-center justify-center">×</button>
      </div>
      {children}
    </div>
  );
}

function TodoQuickModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [owner, setOwner] = useState('');
  const [due, setDue] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    try {
      await createTodoAction({ title: title.trim(), owner_name: owner.trim(), owner_email: '', due_date: due });
      router.refresh();
      onClose();
    } catch { alert('Failed.'); setSaving(false); }
  }

  return (
    <ModalShell title="New To-Do" onClose={onClose}>
      <form onSubmit={handleSave} className="px-6 py-4 space-y-3">
        <input autoFocus type="text" value={title} onChange={e => setTitle(e.target.value)} className={inputCls} placeholder="Task description" />
        <div className="grid grid-cols-2 gap-3">
          <input type="text" value={owner} onChange={e => setOwner(e.target.value)} className={inputCls} placeholder="Owner" />
          <input type="date" value={due} onChange={e => setDue(e.target.value)} className={inputCls} />
        </div>
        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onClose} className="flex-1 py-2 rounded-lg border border-[#3D2E1E] text-[#F5ECD7] text-sm hover:bg-[#2A1F14] transition-colors">Cancel</button>
          <button type="submit" disabled={saving || !title.trim()} className="flex-1 py-2 rounded-lg bg-[#C9963A] hover:bg-[#E8B86D] disabled:opacity-50 text-[#0E0B07] text-sm font-semibold transition-colors">
            {saving ? 'Saving…' : 'Add To-Do'}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

function OppQuickModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState('medium');
  const [term, setTerm] = useState<'short' | 'long'>('short');
  const [saving, setSaving] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    try {
      await createOpportunityAction({ title: title.trim(), description: '', priority, owner_name: '', owner_email: '', term, status: 'open' });
      router.refresh();
      onClose();
    } catch { alert('Failed.'); setSaving(false); }
  }

  return (
    <ModalShell title="New Opportunity" onClose={onClose}>
      <form onSubmit={handleSave} className="px-6 py-4 space-y-3">
        <input autoFocus type="text" value={title} onChange={e => setTitle(e.target.value)} className={inputCls} placeholder="What's the issue or opportunity?" />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-[#B8A99A] mb-1 block">Priority</label>
            <select value={priority} onChange={e => setPriority(e.target.value)} className={inputCls}>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-[#B8A99A] mb-1 block">Term</label>
            <div className="flex rounded-lg overflow-hidden border border-[#3D2E1E] h-[42px]">
              {(['short', 'long'] as const).map(t => (
                <button key={t} type="button" onClick={() => setTerm(t)}
                  className={cn('flex-1 text-sm font-medium capitalize transition-colors',
                    term === t ? 'bg-[#C9963A] text-[#0E0B07]' : 'bg-[#1C1510] text-[#B8A99A] hover:bg-[#2A1F14]')}>
                  {t}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onClose} className="flex-1 py-2 rounded-lg border border-[#3D2E1E] text-[#F5ECD7] text-sm hover:bg-[#2A1F14] transition-colors">Cancel</button>
          <button type="submit" disabled={saving || !title.trim()} className="flex-1 py-2 rounded-lg bg-[#C9963A] hover:bg-[#E8B86D] disabled:opacity-50 text-[#0E0B07] text-sm font-semibold transition-colors">
            {saving ? 'Saving…' : 'Add Opportunity'}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

function HeadlineQuickModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [type, setType] = useState<'good_news' | 'customer_win' | 'employee_update'>('good_news');
  const [saving, setSaving] = useState(false);

  const TYPE_OPTS = [
    { value: 'good_news', label: 'Good News' },
    { value: 'customer_win', label: 'Customer Win' },
    { value: 'employee_update', label: 'Team Update' },
  ] as const;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    try {
      await createHeadlineAction({ title: title.trim(), headline_type: type, owner_name: '' });
      router.refresh();
      onClose();
    } catch { alert('Failed.'); setSaving(false); }
  }

  return (
    <ModalShell title="New Headline" onClose={onClose}>
      <form onSubmit={handleSave} className="px-6 py-4 space-y-3">
        <div className="flex gap-1.5">
          {TYPE_OPTS.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setType(opt.value)}
              className={cn(
                'flex-1 rounded-lg py-1.5 text-xs font-semibold transition-colors border',
                type === opt.value
                  ? 'bg-[#C9963A] border-[#C9963A] text-[#0E0B07]'
                  : 'bg-[#1C1510] border-[#3D2E1E] text-[#B8A99A] hover:text-[#F5ECD7]',
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <input autoFocus type="text" value={title} onChange={e => setTitle(e.target.value)} className={inputCls} placeholder="Share good news…" />
        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onClose} className="flex-1 py-2 rounded-lg border border-[#3D2E1E] text-[#F5ECD7] text-sm hover:bg-[#2A1F14] transition-colors">Cancel</button>
          <button type="submit" disabled={saving || !title.trim()} className="flex-1 py-2 rounded-lg bg-[#C9963A] hover:bg-[#E8B86D] disabled:opacity-50 text-[#0E0B07] text-sm font-semibold transition-colors">
            {saving ? 'Saving…' : 'Add Headline'}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

function MeetingConfirmModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [starting, setStarting] = useState(false);

  async function handleStart() {
    setStarting(true);
    try {
      const id = await startMeetingAction();
      router.push(`/eos/meetings/${id}/run`);
    } catch { alert('Failed to start meeting.'); setStarting(false); }
  }

  return (
    <ModalShell title="Start Level 10 Meeting" onClose={onClose}>
      <div className="px-6 py-5">
        <p className="text-sm text-[#B8A99A] mb-5">This will create a new meeting record and open the live runner.</p>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg border border-[#3D2E1E] text-[#F5ECD7] text-sm hover:bg-[#2A1F14] transition-colors">Cancel</button>
          <button onClick={handleStart} disabled={starting} className="flex-1 py-2.5 rounded-lg bg-[#C9963A] hover:bg-[#E8B86D] disabled:opacity-50 text-[#0E0B07] text-sm font-semibold transition-colors">
            {starting ? 'Starting…' : 'Start Meeting'}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

const ACTIONS = [
  { key: 'todo' as const,     label: 'New To-Do',      icon: '✅' },
  { key: 'opp' as const,      label: 'New Opportunity', icon: '💡' },
  { key: 'headline' as const, label: 'New Headline',    icon: '📰' },
  { key: 'meeting' as const,  label: 'Start Meeting',   icon: '▶' },
];

export default function EosFab() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [modal, setModal] = useState<Modal>(null);

  // Hide on meeting runner
  if (/\/eos\/meetings\/[^/]+\/run/.test(pathname)) return null;

  function openModal(m: Modal) {
    setOpen(false);
    setModal(m);
  }

  function closeModal() {
    setModal(null);
  }

  return (
    <>
      {/* Expanded options */}
      {open && (
        <div className="fixed bottom-20 right-6 z-[55] flex flex-col items-end gap-2">
          {ACTIONS.map(action => (
            <button
              key={action.key}
              onClick={() => openModal(action.key)}
              className="flex items-center gap-2.5 rounded-full bg-[#2A1F14] border border-[#3D2E1E] shadow-lg px-4 py-2.5 text-sm text-[#F5ECD7] font-medium hover:bg-[#3D2E1E] transition-colors"
            >
              <span className="text-base">{action.icon}</span>
              {action.label}
            </button>
          ))}
        </div>
      )}

      {/* Backdrop to close FAB menu */}
      {open && (
        <div className="fixed inset-0 z-[54]" onClick={() => setOpen(false)} />
      )}

      {/* FAB button */}
      <button
        onClick={() => setOpen(o => !o)}
        className={cn(
          'fixed bottom-6 right-6 z-[55] w-14 h-14 rounded-full shadow-2xl flex items-center justify-center transition-all',
          'bg-[#C9963A] hover:bg-[#E8B86D] text-[#0E0B07] text-2xl font-light',
          open && 'rotate-45 bg-[#E8B86D]',
        )}
        aria-label="Quick actions"
      >
        +
      </button>

      {/* Modals */}
      {modal === 'todo' && (
        <Overlay onClose={closeModal}>
          <TodoQuickModal onClose={closeModal} />
        </Overlay>
      )}
      {modal === 'opp' && (
        <Overlay onClose={closeModal}>
          <OppQuickModal onClose={closeModal} />
        </Overlay>
      )}
      {modal === 'headline' && (
        <Overlay onClose={closeModal}>
          <HeadlineQuickModal onClose={closeModal} />
        </Overlay>
      )}
      {modal === 'meeting' && (
        <Overlay onClose={closeModal}>
          <MeetingConfirmModal onClose={closeModal} />
        </Overlay>
      )}
    </>
  );
}
