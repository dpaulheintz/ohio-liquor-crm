'use client';

import { useState } from 'react';
import type { Opportunity } from '@/lib/eos/opportunities';
import {
  createOpportunityAction,
  updateOpportunityAction,
  updateOpportunityStatusAction,
  deleteOpportunityAction,
  type OpportunityFormData,
} from './actions';
import { cn } from '@/lib/utils';

type Props = { initialOpportunities: Opportunity[] };
type StatusFilter = 'open' | 'in_progress' | 'solved' | 'all';

const PRIORITY_CONFIG: Record<string, { label: string; dot: string; text: string }> = {
  critical: { label: 'Critical', dot: 'bg-red-500',    text: 'text-red-400' },
  high:     { label: 'High',     dot: 'bg-orange-500', text: 'text-orange-400' },
  medium:   { label: 'Medium',   dot: 'bg-yellow-500', text: 'text-yellow-400' },
  low:      { label: 'Low',      dot: 'bg-zinc-500',   text: 'text-zinc-400' },
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

  const inputCls = 'w-full rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm text-white focus:outline-none focus:border-green-600 transition-colors placeholder:text-zinc-600';

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#1a1a1a] border border-zinc-700 rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
          <h2 className="text-lg font-semibold text-white">{mode === 'create' ? 'Add Opportunity' : 'Edit Opportunity'}</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-200 text-2xl w-7 h-7 flex items-center justify-center transition-colors">×</button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {error && <p className="text-sm text-red-400 bg-red-900/20 border border-red-800/40 rounded-lg px-3 py-2">{error}</p>}
          <div>
            <label className="text-xs font-medium text-zinc-400 mb-1.5 block">Title *</label>
            <input autoFocus type="text" value={form.title} onChange={e => set('title', e.target.value)} className={inputCls} placeholder="What's the issue or opportunity?" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium text-zinc-400 mb-1.5 block">Priority</label>
              <select value={form.priority} onChange={e => set('priority', e.target.value)} className={inputCls}>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-zinc-400 mb-1.5 block">Status</label>
              <select value={form.status} onChange={e => set('status', e.target.value)} className={inputCls}>
                {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-zinc-400 mb-1.5 block">Term</label>
              <div className="flex rounded-lg overflow-hidden border border-zinc-700 h-[38px]">
                {(['short', 'long'] as const).map(t => (
                  <button key={t} type="button" onClick={() => set('term', t)}
                    className={cn('flex-1 text-xs font-medium capitalize transition-colors',
                      form.term === t ? 'bg-[#2a5a3a] text-white' : 'bg-zinc-900 text-zinc-400 hover:bg-zinc-800')}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-zinc-400 mb-1.5 block">Owner</label>
              <input type="text" value={form.owner_name} onChange={e => set('owner_name', e.target.value)} className={inputCls} placeholder="Name" />
            </div>
            <div>
              <label className="text-xs font-medium text-zinc-400 mb-1.5 block">Owner Email</label>
              <input type="email" value={form.owner_email} onChange={e => set('owner_email', e.target.value)} className={inputCls} placeholder="Optional" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-zinc-400 mb-1.5 block">Description</label>
            <textarea value={form.description} onChange={e => set('description', e.target.value)} className={`${inputCls} resize-none`} rows={3} placeholder="More context…" />
          </div>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-lg border border-zinc-700 text-zinc-300 text-sm hover:bg-zinc-800 transition-colors">Cancel</button>
            <button type="submit" disabled={saving} className="flex-1 py-2.5 rounded-lg bg-[#2a5a3a] hover:bg-[#3a6a4a] disabled:opacity-50 text-white text-sm font-medium transition-colors">
              {saving ? 'Saving…' : mode === 'create' ? 'Add' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function OpportunitiesClient({ initialOpportunities }: Props) {
  const [opps, setOpps] = useState<Opportunity[]>(initialOpportunities);
  const [filter, setFilter] = useState<StatusFilter>('open');
  const [showModal, setShowModal] = useState(false);
  const [editingOpp, setEditingOpp] = useState<Opportunity | null>(null);

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
          <h1 className="font-serif text-3xl font-bold text-white">Opportunities</h1>
          <p className="text-zinc-400 mt-1 text-sm">Short and long-term issues to identify, discuss, and solve</p>
        </div>
        <button onClick={() => setShowModal(true)} className="px-4 py-2 rounded-lg bg-[#2a5a3a] hover:bg-[#3a6a4a] text-white text-sm font-medium transition-colors">
          + Add Opportunity
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 mb-5 border-b border-zinc-800">
        {([
          { key: 'open', label: 'Open' },
          { key: 'in_progress', label: 'In Progress' },
          { key: 'solved', label: 'Solved' },
          { key: 'all', label: 'All' },
        ] as { key: StatusFilter; label: string }[]).map(({ key, label }) => (
          <button key={key} onClick={() => setFilter(key)}
            className={cn('px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-[2px]',
              filter === key ? 'border-green-600 text-green-400' : 'border-transparent text-zinc-500 hover:text-zinc-300')}>
            {label} <span className="text-xs opacity-60 ml-1">{counts[key as keyof typeof counts]}</span>
          </button>
        ))}
      </div>

      {/* List */}
      <div className="space-y-2">
        {filtered.map(opp => {
          const pri = PRIORITY_CONFIG[opp.priority ?? ''] ?? PRIORITY_CONFIG.medium;
          return (
            <div key={opp.id} className="rounded-xl border border-zinc-800 bg-[#111] px-4 py-3 hover:bg-zinc-800/40 transition-colors group/row">
              <div className="flex items-start gap-3">
                {/* Priority dot */}
                <div className="shrink-0 mt-1.5">
                  <div className={cn('w-2 h-2 rounded-full', pri.dot)} title={pri.label} />
                </div>

                {/* Main content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start gap-2 flex-wrap">
                    <p className="text-sm font-medium text-zinc-100 flex-1 min-w-0">{opp.title}</p>
                    {/* Term badge */}
                    <span className={cn(
                      'shrink-0 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded',
                      opp.term === 'long' ? 'bg-purple-900/50 text-purple-400' : 'bg-zinc-800 text-zinc-500',
                    )}>
                      {opp.term}-term
                    </span>
                  </div>
                  {opp.description && (
                    <p className="text-xs text-zinc-500 mt-0.5 line-clamp-1">{opp.description}</p>
                  )}
                  <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                    {opp.owner_name && <span className="text-xs text-zinc-600">{opp.owner_name}</span>}
                    <span className="text-xs text-zinc-700">{fmtDate(opp.created_at)}</span>
                    {/* Quick status change */}
                    <select
                      value={opp.status}
                      onChange={e => handleStatusChange(opp.id, e.target.value)}
                      onClick={e => e.stopPropagation()}
                      className="text-xs bg-zinc-800 border border-zinc-700 rounded px-1.5 py-0.5 text-zinc-400 focus:outline-none focus:border-green-600 transition-colors"
                    >
                      {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                </div>

                {/* Actions */}
                <div className="shrink-0 flex items-center gap-1 opacity-0 group-hover/row:opacity-100 transition-opacity">
                  <button onClick={() => setEditingOpp(opp)} className="text-zinc-600 hover:text-zinc-300 text-xs px-1.5 py-1 transition-colors">Edit</button>
                  <button onClick={() => handleDelete(opp.id)} className="text-zinc-700 hover:text-red-400 text-xs px-1.5 py-1 transition-colors">✕</button>
                </div>
              </div>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="rounded-xl border border-zinc-800 bg-[#111] px-6 py-12 text-center text-zinc-600 text-sm">
            {filter === 'all' ? 'No opportunities yet.' : `No ${filter.replace('_', ' ')} opportunities.`}
          </div>
        )}
      </div>

      {showModal && <OppModal mode="create" onSave={handleCreate} onClose={() => setShowModal(false)} />}
      {editingOpp && <OppModal mode="edit" opp={editingOpp} onSave={handleUpdate} onClose={() => setEditingOpp(null)} />}
    </>
  );
}
