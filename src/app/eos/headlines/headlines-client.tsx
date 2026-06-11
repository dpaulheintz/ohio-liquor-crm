'use client';

import { useState } from 'react';
import type { Headline } from '@/lib/eos/headlines';
import { createHeadlineAction, updateHeadlineAction, deleteHeadlineAction, type HeadlineFormData } from './actions';
import { cn } from '@/lib/utils';

type Props = { initialHeadlines: Headline[] };
type TypeFilter = 'all' | 'good_news' | 'customer_win' | 'employee_update';

const TYPE_CONFIG: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  good_news:       { label: 'Good News',       bg: 'bg-yellow-900/40', text: 'text-yellow-300', dot: 'bg-yellow-500' },
  customer_win:    { label: 'Customer Win',    bg: 'bg-green-900/40',  text: 'text-green-300',  dot: 'bg-green-500' },
  employee_update: { label: 'Employee Update', bg: 'bg-blue-900/40',   text: 'text-blue-300',   dot: 'bg-blue-500'  },
};

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function HeadlineModal({
  mode,
  headline,
  onSave,
  onClose,
}: {
  mode: 'create' | 'edit';
  headline?: Headline;
  onSave: (data: HeadlineFormData) => Promise<void>;
  onClose: () => void;
}) {
  const [form, setForm] = useState<HeadlineFormData>({
    title: headline?.title ?? '',
    headline_type: headline?.headline_type ?? 'good_news',
    owner_name: headline?.owner_name ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function set(field: keyof HeadlineFormData, value: string) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) { setError('Headline is required.'); return; }
    setSaving(true); setError('');
    try { await onSave(form); }
    catch { setError('Failed to save.'); setSaving(false); }
  }

  const inputCls = 'w-full rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm text-white focus:outline-none focus:border-green-600 transition-colors placeholder:text-zinc-600';

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#1a1a1a] border border-zinc-700 rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
          <h2 className="text-lg font-semibold text-white">{mode === 'create' ? 'Share a Headline' : 'Edit Headline'}</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-200 text-2xl w-7 h-7 flex items-center justify-center transition-colors">×</button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {error && <p className="text-sm text-red-400 bg-red-900/20 border border-red-800/40 rounded-lg px-3 py-2">{error}</p>}

          {/* Type selection */}
          <div>
            <label className="text-xs font-medium text-zinc-400 mb-2 block">Type</label>
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(TYPE_CONFIG).map(([key, cfg]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => set('headline_type', key)}
                  className={cn(
                    'py-2 px-2 rounded-lg text-xs font-medium transition-colors border',
                    form.headline_type === key
                      ? `${cfg.bg} ${cfg.text} border-transparent`
                      : 'bg-zinc-900 text-zinc-500 border-zinc-700 hover:bg-zinc-800',
                  )}
                >
                  {cfg.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-zinc-400 mb-1.5 block">Headline *</label>
            <textarea
              autoFocus
              value={form.title}
              onChange={e => set('title', e.target.value)}
              className={`${inputCls} resize-none`}
              rows={3}
              placeholder="Share the good news…"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-zinc-400 mb-1.5 block">From</label>
            <input type="text" value={form.owner_name} onChange={e => set('owner_name', e.target.value)} className={inputCls} placeholder="Your name (optional)" />
          </div>

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-lg border border-zinc-700 text-zinc-300 text-sm hover:bg-zinc-800 transition-colors">Cancel</button>
            <button type="submit" disabled={saving} className="flex-1 py-2.5 rounded-lg bg-[#2a5a3a] hover:bg-[#3a6a4a] disabled:opacity-50 text-white text-sm font-medium transition-colors">
              {saving ? 'Sharing…' : mode === 'create' ? 'Share' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function HeadlinesClient({ initialHeadlines }: Props) {
  const [headlines, setHeadlines] = useState<Headline[]>(initialHeadlines);
  const [filter, setFilter] = useState<TypeFilter>('all');
  const [showModal, setShowModal] = useState(false);
  const [editingHeadline, setEditingHeadline] = useState<Headline | null>(null);

  const filtered = filter === 'all' ? headlines : headlines.filter(h => h.headline_type === filter);

  async function handleCreate(data: HeadlineFormData) {
    const created = await createHeadlineAction(data);
    setHeadlines(prev => [created, ...prev]);
    setShowModal(false);
  }

  async function handleUpdate(data: HeadlineFormData) {
    if (!editingHeadline) return;
    await updateHeadlineAction(editingHeadline.id, data);
    setHeadlines(prev => prev.map(h =>
      h.id === editingHeadline.id
        ? { ...h, title: data.title.trim(), headline_type: data.headline_type as Headline['headline_type'], owner_name: data.owner_name.trim() || null }
        : h,
    ));
    setEditingHeadline(null);
  }

  async function handleDelete(id: string) {
    if (!window.confirm('Delete this headline?')) return;
    setHeadlines(prev => prev.filter(h => h.id !== id));
    try { await deleteHeadlineAction(id); }
    catch { alert('Failed to delete.'); }
  }

  return (
    <>
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="font-serif text-3xl font-bold text-white">Headlines</h1>
          <p className="text-zinc-400 mt-1 text-sm">Good news, customer wins, and team updates</p>
        </div>
        <button onClick={() => setShowModal(true)} className="px-4 py-2 rounded-lg bg-[#2a5a3a] hover:bg-[#3a6a4a] text-white text-sm font-medium transition-colors">
          + Share Headline
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 mb-5 border-b border-zinc-800 flex-wrap">
        {([
          { key: 'all', label: 'All' },
          { key: 'good_news', label: 'Good News' },
          { key: 'customer_win', label: 'Customer Wins' },
          { key: 'employee_update', label: 'Team Updates' },
        ] as { key: TypeFilter; label: string }[]).map(({ key, label }) => (
          <button key={key} onClick={() => setFilter(key)}
            className={cn('px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-[2px] whitespace-nowrap',
              filter === key ? 'border-green-600 text-green-400' : 'border-transparent text-zinc-500 hover:text-zinc-300')}>
            {label}
          </button>
        ))}
      </div>

      {/* Headlines list */}
      <div className="space-y-3">
        {filtered.map(headline => {
          const cfg = TYPE_CONFIG[headline.headline_type] ?? TYPE_CONFIG.good_news;
          return (
            <div
              key={headline.id}
              className="rounded-xl border border-zinc-800 bg-[#111] px-5 py-4 hover:bg-zinc-800/40 transition-colors group/row"
            >
              <div className="flex items-start gap-3">
                {/* Type dot */}
                <div className={cn('w-2 h-2 rounded-full mt-1.5 shrink-0', cfg.dot)} />

                <div className="flex-1 min-w-0">
                  {/* Type badge */}
                  <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider mb-1.5', cfg.bg, cfg.text)}>
                    {cfg.label}
                  </span>
                  <p className="text-sm text-zinc-100 leading-relaxed">{headline.title}</p>
                  <div className="flex items-center gap-2 mt-1.5">
                    {headline.owner_name && (
                      <span className="text-xs text-zinc-500">{headline.owner_name}</span>
                    )}
                    <span className="text-xs text-zinc-700">{fmtDate(headline.created_at)}</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="shrink-0 flex items-center gap-1 opacity-0 group-hover/row:opacity-100 transition-opacity">
                  <button onClick={() => setEditingHeadline(headline)} className="text-zinc-600 hover:text-zinc-300 text-xs px-1.5 py-1 transition-colors">Edit</button>
                  <button onClick={() => handleDelete(headline.id)} className="text-zinc-700 hover:text-red-400 text-xs px-1.5 py-1 transition-colors">✕</button>
                </div>
              </div>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="rounded-xl border border-zinc-800 bg-[#111] px-6 py-12 text-center text-zinc-600 text-sm">
            No headlines yet. Click &ldquo;+ Share Headline&rdquo; to celebrate a win.
          </div>
        )}
      </div>

      {showModal && <HeadlineModal mode="create" onSave={handleCreate} onClose={() => setShowModal(false)} />}
      {editingHeadline && <HeadlineModal mode="edit" headline={editingHeadline} onSave={handleUpdate} onClose={() => setEditingHeadline(null)} />}
    </>
  );
}
