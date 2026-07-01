'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { Opportunity } from '@/lib/eos/opportunities';
import {
  createOpportunityAction,
  updateOpportunityAction,
  updateOpportunityStatusAction,
  deleteOpportunityAction,
  type OpportunityFormData,
} from './actions';
import OwnerSelect from '@/components/eos/OwnerSelect';
import SmartAddButton from '@/components/eos/SmartAddButton';
import { cn } from '@/lib/utils';

type Props = { initialOpportunities: Opportunity[]; activeMeetingId: string | null };
type StatusFilter = 'open' | 'in_progress' | 'solved' | 'all';

const PRIORITY_CONFIG: Record<string, { label: string; dot: string; text: string }> = {
  critical: { label: 'Critical', dot: 'bg-[#C0392B]',    text: 'text-[#C0392B]' },
  high:     { label: 'High',     dot: 'bg-[#C0392B]', text: 'text-[#C0392B]' },
  medium:   { label: 'Medium',   dot: 'bg-[#D4821A]', text: 'text-[#D4821A]' },
  low:      { label: 'Low',      dot: 'bg-[#B8A99A]',   text: 'text-[#B8A99A]' },
};

const STATUS_OPTIONS = [
  { value: 'open',        label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'solved',      label: 'Solved' },
  { value: 'on_hold',     label: 'On Hold' },
];

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const EMPTY_FORM: OpportunityFormData = {
  title: '', description: '', priority: 'medium', owner_name: '', owner_email: '', term: 'short', status: 'open',
};

function OppModal({
  mode,
  opp,
  onSave,
  onClose,
}: {
  mode: 'create' | 'edit';
  opp?: Opportunity;
  onSave: (data: OpportunityFormData) => Promise<void>;
  onClose: () => void;
}) {
  const [form, setForm] = useState<OpportunityFormData>({
    title: opp?.title ?? '',
    description: opp?.description ?? '',
    priority: opp?.priority ?? 'medium',
    owner_name: opp?.owner_name ?? '',
    owner_email: opp?.owner_email ?? '',
    term: opp?.term ?? 'short',
    status: opp?.status ?? 'open',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function set(field: keyof OpportunityFormData, value: string) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) { setError('Title is required.'); return; }
    setSaving(true); setError('');
    try { await onSave(form); }
    catch { setError('Failed to save.'); setSaving(false); }
  }

  const inputCls = 'w-full rounded-lg bg-[#1C1510] border border-[#3D2E1E] px-3 py-2 text-sm text-[#F5ECD7] focus:outline-none focus:border-[#16A34A] transition-colors placeholder:text-[#6B5A4A]';

  return (
    <div className="fixed inset-0 bg-[#0E0B07]/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#1C1510] border border-[#3D2E1E] rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#3D2E1E]">
          <h2 className="text-lg font-semibold text-[#F5ECD7]">{mode === 'create' ? 'Add Opportunity' : 'Edit Opportunity'}</h2>
          <button onClick={onClose} className="text-[#B8A99A] hover:text-[#F5ECD7] text-2xl w-7 h-7 flex items-center justify-center transition-colors">×</button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {error && <p className="text-sm text-[#C0392B] bg-[#2E0F0F] border border-[#3D2E1E] rounded-lg px-3 py-2">{error}</p>}
          <div>
            <label className="text-xs font-medium text-[#B8A99A] mb-1.5 block">Title *</label>
            <input autoFocus type="text" value={form.title} onChange={e => set('title', e.target.value)} className={inputCls} placeholder="What's the issue or opportunity?" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium text-[#B8A99A] mb-1.5 block">Priority</label>
              <select value={form.priority} onChange={e => set('priority', e.target.value)} className={inputCls}>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-[#B8A99A] mb-1.5 block">Status</label>
              <select value={form.status} onChange={e => set('status', e.target.value)} className={inputCls}>
                {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-[#B8A99A] mb-1.5 block">Term</label>
              <div className="flex rounded-lg overflow-hidden border border-[#3D2E1E] h-[38px]">
                {(['short', 'long'] as const).map(t => (
                  <button key={t} type="button" onClick={() => set('term', t)}
                    className={cn('flex-1 text-xs font-medium capitalize transition-colors',
                      form.term === t ? 'bg-[#16A34A] text-white' : 'bg-[#1C1510] text-[#B8A99A] hover:bg-[#2A1F14]')}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-[#B8A99A] mb-1.5 block">Owner</label>
            <OwnerSelect
              ownerName={form.owner_name}
              ownerEmail={form.owner_email}
              onChange={(name, email) => { set('owner_name', name); set('owner_email', email); }}
              className={inputCls}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-[#B8A99A] mb-1.5 block">Description</label>
            <textarea value={form.description} onChange={e => set('description', e.target.value)} className={`${inputCls} resize-none`} rows={3} placeholder="More context…" />
          </div>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-lg border border-[#3D2E1E] text-[#F5ECD7] text-sm hover:bg-[#2A1F14] transition-colors">Cancel</button>
            <button type="submit" disabled={saving} className="flex-1 py-2.5 rounded-lg bg-[#16A34A] hover:bg-[#15803D] disabled:opacity-50 text-white text-sm font-semibold transition-colors">
              {saving ? 'Saving…' : mode === 'create' ? 'Add' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function OpportunitiesClient({ initialOpportunities, activeMeetingId }: Props) {
  const [opps, setOpps] = useState<Opportunity[]>(initialOpportunities);
  const [filter, setFilter] = useState<StatusFilter>('open');
  const [showModal, setShowModal] = useState(false);
  const [editingOpp, setEditingOpp] = useState<Opportunity | null>(null);
  const [flashedSolvedIds, setFlashedSolvedIds] = useState<Set<string>>(new Set());

  const filtered = filter === 'all' ? opps : opps.filter(o => o.status === filter);

  async function handleCreate(data: OpportunityFormData) {
    const created = await createOpportunityAction(data);
    setOpps(prev => [created, ...prev]);
    setShowModal(false);
  }

  async function handleUpdate(data: OpportunityFormData) {
    if (!editingOpp) return;
    await updateOpportunityAction(editingOpp.id, data);
    setOpps(prev => prev.map(o =>
      o.id === editingOpp.id
        ? { ...o, ...data, title: data.title.trim(), term: data.term as Opportunity['term'], status: data.status as Opportunity['status'] }
        : o,
    ));
    setEditingOpp(null);
  }

  async function handleStatusChange(id: string, status: string) {
    setOpps(prev => prev.map(o => o.id === id ? { ...o, status: status as Opportunity['status'] } : o));
    try { await updateOpportunityStatusAction(id, status); }
    catch { /* best effort */ }
  }

  async function handleMarkSolved(id: string) {
    setOpps(prev => prev.map(o => o.id === id ? { ...o, status: 'solved' as const } : o));
    setFlashedSolvedIds(prev => new Set(prev).add(id));
    setTimeout(() => {
      setFlashedSolvedIds(prev => { const n = new Set(prev); n.delete(id); return n; });
    }, 600);
    try { await updateOpportunityStatusAction(id, 'solved'); }
    catch { setOpps(prev => prev.map(o => o.id === id ? { ...o, status: 'open' as const } : o)); }
  }

  async function handleReopenOpp(id: string) {
    setOpps(prev => prev.map(o => o.id === id ? { ...o, status: 'open' as const } : o));
    try { await updateOpportunityStatusAction(id, 'open'); }
    catch { setOpps(prev => prev.map(o => o.id === id ? { ...o, status: 'solved' as const } : o)); }
  }

  async function handleDelete(id: string) {
    if (!window.confirm('Delete this opportunity?')) return;
    setOpps(prev => prev.filter(o => o.id !== id));
    try { await deleteOpportunityAction(id); }
    catch { alert('Failed to delete.'); }
  }

  const counts = {
    open: opps.filter(o => o.status === 'open').length,
    in_progress: opps.filter(o => o.status === 'in_progress').length,
    solved: opps.filter(o => o.status === 'solved').length,
    all: opps.length,
  };

  return (
    <>
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="font-serif text-3xl font-bold text-[#F5ECD7]" style={{ letterSpacing: '-0.02em' }}>Opportunities</h1>
          <p className="text-[#B8A99A] mt-1 text-sm">Short and long-term issues to identify, discuss, and solve</p>
        </div>
        <button onClick={() => setShowModal(true)} className="px-4 py-2 rounded-lg bg-[#16A34A] hover:bg-[#15803D] text-white text-sm font-medium transition-colors">
          + Add Opportunity
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 mb-5 border-b border-[#3D2E1E]">
        {([
          { key: 'open', label: 'Open' },
          { key: 'in_progress', label: 'In Progress' },
          { key: 'solved', label: 'Solved' },
          { key: 'all', label: 'All' },
        ] as { key: StatusFilter; label: string }[]).map(({ key, label }) => (
          <button key={key} onClick={() => setFilter(key)}
            className={cn('px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-[2px]',
              filter === key ? 'border-[#16A34A] text-[#16A34A]' : 'border-transparent text-[#B8A99A] hover:text-[#F5ECD7]')}>
            {label} <span className="text-xs opacity-60 ml-1">{counts[key as keyof typeof counts]}</span>
          </button>
        ))}
      </div>

      {/* List */}
      <div className="space-y-2">
        {filtered.map(opp => {
          const pri = PRIORITY_CONFIG[opp.priority ?? ''] ?? PRIORITY_CONFIG.medium;
          return (
            <div key={opp.id} className="rounded-xl border border-[#3D2E1E] bg-[#1C1510] px-4 py-3 hover:bg-[#2A1F14]/40 transition-colors group/row">
              <div className="flex items-start gap-3">
                {/* Priority dot — click to solve/reopen */}
                <div className="shrink-0 mt-1.5">
                  {opp.status === 'solved' ? (
                    <button
                      onClick={() => handleReopenOpp(opp.id)}
                      title="Re-open"
                      className="w-4 h-4 rounded-full bg-[#16A34A] hover:bg-[#5B9E94] flex items-center justify-center text-[#F5ECD7] transition-all"
                    >
                      <svg className="w-2.5 h-2.5" viewBox="0 0 10 10" fill="none">
                        <path d="M2 5l2.5 2.5L8 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  ) : (
                    <button
                      onClick={() => handleMarkSolved(opp.id)}
                      title="Mark as solved"
                      className={cn(
                        'w-4 h-4 rounded-full transition-all hover:scale-125 hover:ring-2 hover:ring-[#16A34A]/50',
                        flashedSolvedIds.has(opp.id)
                          ? 'bg-[#5B9E94] scale-125 ring-2 ring-[#16A34A]/50'
                          : pri.dot,
                      )}
                    />
                  )}
                </div>

                {/* Main content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start gap-2 flex-wrap">
                    <p className="text-sm font-medium text-[#F5ECD7] flex-1 min-w-0">{opp.title}</p>
                    {/* Term badge */}
                    <span className={cn(
                      'shrink-0 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded',
                      opp.term === 'long' ? 'bg-[#2A1F14] text-[#B8A99A]' : 'border border-[#16A34A] text-[#16A34A]',
                    )}>
                      {opp.term}-term
                    </span>
                  </div>
                  {opp.description && (
                    <p className="text-xs text-[#B8A99A] mt-0.5 line-clamp-1">{opp.description}</p>
                  )}
                  <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                    {opp.owner_name && <span className="text-xs text-[#6B5A4A]">{opp.owner_name}</span>}
                    <span className="text-xs text-[#6B5A4A]">{fmtDate(opp.created_at)}</span>
                    {/* Quick status change */}
                    <select
                      value={opp.status}
                      onChange={e => handleStatusChange(opp.id, e.target.value)}
                      onClick={e => e.stopPropagation()}
                      className="text-xs bg-[#2A1F14] border border-[#3D2E1E] rounded px-1.5 py-0.5 text-[#B8A99A] focus:outline-none focus:border-[#16A34A] transition-colors"
                    >
                      {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                </div>

                {/* Actions */}
                <div className="shrink-0 flex items-center gap-2 opacity-0 group-hover/row:opacity-100 transition-opacity">
                  {opp.status !== 'solved' && (
                    activeMeetingId ? (
                      <Link
                        href={`/eos/meetings/${activeMeetingId}/run?section=ids&opportunity=${opp.id}`}
                        className="text-xs text-[#16A34A] hover:text-[#15803D] px-1.5 py-1 transition-colors whitespace-nowrap"
                        title="Discuss in current meeting"
                      >
                        Discuss in IDS →
                      </Link>
                    ) : (
                      <span
                        className="text-xs text-[#6B5A4A] cursor-default px-1.5 py-1 whitespace-nowrap"
                        title="Start a Level 10 meeting to use IDS"
                      >
                        Discuss in IDS →
                      </span>
                    )
                  )}
                  <button onClick={() => setEditingOpp(opp)} className="text-[#6B5A4A] hover:text-[#F5ECD7] text-xs px-1.5 py-1 transition-colors">Edit</button>
                  <button onClick={() => handleDelete(opp.id)} className="text-[#6B5A4A] hover:text-[#C0392B] text-xs px-1.5 py-1 transition-colors">✕</button>
                </div>
              </div>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="rounded-xl border border-[#3D2E1E] bg-[#1C1510] px-6 py-12 text-center text-[#6B5A4A] text-sm">
            {filter === 'all' ? 'No opportunities yet.' : `No ${filter.replace('_', ' ')} opportunities.`}
          </div>
        )}
      </div>

      {showModal && <OppModal mode="create" onSave={handleCreate} onClose={() => setShowModal(false)} />}
      {editingOpp && <OppModal mode="edit" opp={editingOpp} onSave={handleUpdate} onClose={() => setEditingOpp(null)} />}
      <SmartAddButton pageContext="opportunities" />
    </>
  );
}
