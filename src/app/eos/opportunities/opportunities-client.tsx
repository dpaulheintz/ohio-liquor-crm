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
import { ArchiveBanner, ArchiveButton } from '@/components/eos/ArchiveControls';
import { cn } from '@/lib/utils';

type Props = { initialOpportunities: Opportunity[]; activeMeetingId: string | null; archived?: boolean };

function fmtSolvedDate(d: string): string {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
type StatusFilter = 'open' | 'in_progress' | 'solved' | 'all';

const PRIORITY_CONFIG: Record<string, { label: string; dot: string; text: string }> = {
  critical: { label: 'Critical', dot: 'bg-red-600',    text: 'text-red-600' },
  high:     { label: 'High',     dot: 'bg-red-600', text: 'text-red-600' },
  medium:   { label: 'Medium',   dot: 'bg-amber-500', text: 'text-amber-600' },
  low:      { label: 'Low',      dot: 'bg-gray-300',  text: 'text-gray-500' },
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

  const inputCls = 'w-full rounded-lg bg-white border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-green-600 transition-colors placeholder:text-gray-400';

  return (
    <div className="fixed inset-0 bg-gray-50/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white border border-gray-200 rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">{mode === 'create' ? 'Add Opportunity' : 'Edit Opportunity'}</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-900 text-2xl w-7 h-7 flex items-center justify-center transition-colors">×</button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {error && <p className="text-sm text-red-600 bg-red-50 border border-gray-200 rounded-lg px-3 py-2">{error}</p>}
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1.5 block">Title *</label>
            <input autoFocus type="text" value={form.title} onChange={e => set('title', e.target.value)} className={inputCls} placeholder="What's the issue or opportunity?" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1.5 block">Priority</label>
              <select value={form.priority} onChange={e => set('priority', e.target.value)} className={inputCls}>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1.5 block">Status</label>
              <select value={form.status} onChange={e => set('status', e.target.value)} className={inputCls}>
                {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1.5 block">Term</label>
              <div className="flex rounded-lg overflow-hidden border border-gray-200 h-[38px]">
                {(['short', 'long'] as const).map(t => (
                  <button key={t} type="button" onClick={() => set('term', t)}
                    className={cn('flex-1 text-xs font-medium capitalize transition-colors',
                      form.term === t ? 'bg-green-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-100')}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1.5 block">Owner</label>
            <OwnerSelect
              ownerName={form.owner_name}
              ownerEmail={form.owner_email}
              onChange={(name, email) => { set('owner_name', name); set('owner_email', email); }}
              className={inputCls}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1.5 block">Description</label>
            <textarea value={form.description} onChange={e => set('description', e.target.value)} className={`${inputCls} resize-none`} rows={3} placeholder="More context…" />
          </div>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-lg border border-gray-200 text-gray-900 text-sm hover:bg-gray-100 transition-colors">Cancel</button>
            <button type="submit" disabled={saving} className="flex-1 py-2.5 rounded-lg bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-semibold transition-colors">
              {saving ? 'Saving…' : mode === 'create' ? 'Add' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function OpportunitiesClient({ initialOpportunities, activeMeetingId, archived = false }: Props) {
  const [opps, setOpps] = useState<Opportunity[]>(initialOpportunities);
  const [filter, setFilter] = useState<StatusFilter>('open');
  const [showModal, setShowModal] = useState(false);
  const [editingOpp, setEditingOpp] = useState<Opportunity | null>(null);
  const [flashedSolvedIds, setFlashedSolvedIds] = useState<Set<string>>(new Set());

  const filtered = archived ? opps : (filter === 'all' ? opps : opps.filter(o => o.status === filter));

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
    catch { console.error('Failed to delete.'); }
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
          <h1 className="font-serif text-3xl font-bold text-gray-900" style={{ letterSpacing: '-0.02em' }}>Opportunities</h1>
          <p className="text-gray-500 mt-1 text-sm">Short and long-term issues to identify, discuss, and solve</p>
        </div>
        {!archived && (
          <div className="flex items-center gap-2">
            <ArchiveButton basePath="/eos/opportunities" />
            <button onClick={() => setShowModal(true)} className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-medium transition-colors">
              + Add Opportunity
            </button>
          </div>
        )}
      </div>

      {archived && <ArchiveBanner label="opportunities" basePath="/eos/opportunities" />}

      {/* Filter tabs (active view only) */}
      {!archived && (
        <div className="flex gap-1 mb-5 border-b border-gray-200">
          {([
            { key: 'open', label: 'Open' },
            { key: 'in_progress', label: 'In Progress' },
            { key: 'solved', label: 'Solved' },
            { key: 'all', label: 'All' },
          ] as { key: StatusFilter; label: string }[]).map(({ key, label }) => (
            <button key={key} onClick={() => setFilter(key)}
              className={cn('px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-[2px]',
                filter === key ? 'border-green-600 text-green-600' : 'border-transparent text-gray-500 hover:text-gray-900')}>
              {label} <span className="text-xs opacity-60 ml-1">{counts[key as keyof typeof counts]}</span>
            </button>
          ))}
        </div>
      )}

      {/* List */}
      <div className="space-y-2">
        {filtered.map(opp => {
          const pri = PRIORITY_CONFIG[opp.priority ?? ''] ?? PRIORITY_CONFIG.medium;
          return (
            <div key={opp.id} className="rounded-xl border border-gray-200 bg-white px-4 py-3 hover:bg-gray-100/40 transition-colors group/row">
              <div className="flex items-start gap-3">
                {/* Priority dot — click to solve/reopen (static in archive view) */}
                <div className="shrink-0 mt-1.5">
                  {archived ? (
                    <span className="w-4 h-4 rounded-full bg-green-600 flex items-center justify-center">
                      <svg className="w-2.5 h-2.5" viewBox="0 0 10 10" fill="none">
                        <path d="M2 5l2.5 2.5L8 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                  ) : opp.status === 'solved' ? (
                    <button
                      onClick={() => handleReopenOpp(opp.id)}
                      title="Re-open"
                      className="w-4 h-4 rounded-full bg-green-600 hover:bg-green-600 flex items-center justify-center text-gray-900 transition-all"
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
                        'w-4 h-4 rounded-full transition-all hover:scale-125 hover:ring-2 hover:ring-green-600/50',
                        flashedSolvedIds.has(opp.id)
                          ? 'bg-green-600 scale-125 ring-2 ring-green-600/50'
                          : pri.dot,
                      )}
                    />
                  )}
                </div>

                {/* Main content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start gap-2 flex-wrap">
                    <p className="text-sm font-medium text-gray-900 flex-1 min-w-0">{opp.title}</p>
                    {/* Term badge */}
                    <span className={cn(
                      'shrink-0 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded',
                      opp.term === 'long' ? 'bg-gray-100 text-gray-500' : 'border border-green-600 text-green-600',
                    )}>
                      {opp.term}-term
                    </span>
                  </div>
                  {opp.description && (
                    <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{opp.description}</p>
                  )}
                  <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                    {opp.owner_name && <span className="text-xs text-gray-400">{opp.owner_name}</span>}
                    <span className="text-xs text-gray-400">{fmtDate(opp.created_at)}</span>
                    {archived ? (
                      <span className="text-xs text-gray-400">Solved {fmtSolvedDate(opp.updated_at)}</span>
                    ) : (
                      /* Quick status change */
                      <select
                        value={opp.status}
                        onChange={e => handleStatusChange(opp.id, e.target.value)}
                        onClick={e => e.stopPropagation()}
                        className="text-xs bg-gray-100 border border-gray-200 rounded px-1.5 py-0.5 text-gray-500 focus:outline-none focus:border-green-600 transition-colors"
                      >
                        {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    )}
                  </div>
                </div>

                {/* Actions (hidden in archive view — read-only) */}
                {!archived && (
                <div className="shrink-0 flex items-center gap-2 opacity-0 group-hover/row:opacity-100 transition-opacity">
                  {opp.status !== 'solved' && (
                    activeMeetingId ? (
                      <Link
                        href={`/eos/meetings/${activeMeetingId}/run?section=ids&opportunity=${opp.id}`}
                        className="text-xs text-green-600 hover:text-green-700 px-1.5 py-1 transition-colors whitespace-nowrap"
                        title="Discuss in current meeting"
                      >
                        Discuss in IDS →
                      </Link>
                    ) : (
                      <span
                        className="text-xs text-gray-400 cursor-default px-1.5 py-1 whitespace-nowrap"
                        title="Start a Level 10 meeting to use IDS"
                      >
                        Discuss in IDS →
                      </span>
                    )
                  )}
                  <button onClick={() => setEditingOpp(opp)} className="text-gray-400 hover:text-gray-900 text-xs px-1.5 py-1 transition-colors">Edit</button>
                  <button onClick={() => handleDelete(opp.id)} className="text-gray-400 hover:text-red-600 text-xs px-1.5 py-1 transition-colors">✕</button>
                </div>
                )}
              </div>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="rounded-xl border border-gray-200 bg-white px-6 py-12 text-center text-gray-400 text-sm">
            {archived ? 'No archived opportunities.' : filter === 'all' ? 'No opportunities yet.' : `No ${filter.replace('_', ' ')} opportunities.`}
          </div>
        )}
      </div>

      {!archived && showModal && <OppModal mode="create" onSave={handleCreate} onClose={() => setShowModal(false)} />}
      {!archived && editingOpp && <OppModal mode="edit" opp={editingOpp} onSave={handleUpdate} onClose={() => setEditingOpp(null)} />}
      {!archived && <SmartAddButton pageContext="opportunities" />}
    </>
  );
}
