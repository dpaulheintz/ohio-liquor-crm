'use client';

import { useState } from 'react';
import type { Headline } from '@/lib/eos/headlines';
import { createHeadlineAction, updateHeadlineAction, deleteHeadlineAction, type HeadlineFormData } from './actions';
import OwnerSelect from '@/components/eos/OwnerSelect';
import SmartAddButton from '@/components/eos/SmartAddButton';
import { EOS_TEAM_MEMBERS } from '@/lib/eos/team';
import { cn } from '@/lib/utils';

type Props = { initialHeadlines: Headline[] };
type TypeFilter = 'all' | 'good_news' | 'customer_win' | 'employee_update';

const TYPE_CONFIG: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  good_news:       { label: 'Good News',       bg: 'bg-[#2E1E08]', text: 'text-[#D4821A]', dot: 'bg-[#D4821A]' },
  customer_win:    { label: 'Customer Win',    bg: 'bg-[#0F2E2B]',  text: 'text-[#5B9E94]',  dot: 'bg-[#5B9E94]' },
  employee_update: { label: 'Employee Update', bg: 'bg-[#0F2E2B]',   text: 'text-[#5B9E94]',   dot: 'bg-[#5B9E94]'  },
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

  const inputCls = 'w-full rounded-lg bg-[#1C1510] border border-[#3D2E1E] px-3 py-2 text-sm text-[#F5ECD7] focus:outline-none focus:border-[#16A34A] transition-colors placeholder:text-[#6B5A4A]';

  return (
    <div className="fixed inset-0 bg-[#0E0B07]/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#1C1510] border border-[#3D2E1E] rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#3D2E1E]">
          <h2 className="text-lg font-semibold text-[#F5ECD7]">{mode === 'create' ? 'Share a Headline' : 'Edit Headline'}</h2>
          <button onClick={onClose} className="text-[#B8A99A] hover:text-[#F5ECD7] text-2xl w-7 h-7 flex items-center justify-center transition-colors">×</button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {error && <p className="text-sm text-[#C0392B] bg-[#2E0F0F] border border-[#3D2E1E] rounded-lg px-3 py-2">{error}</p>}

          {/* Type selection */}
          <div>
            <label className="text-xs font-medium text-[#B8A99A] mb-2 block">Type</label>
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
                      : 'bg-[#1C1510] text-[#B8A99A] border-[#3D2E1E] hover:bg-[#2A1F14]',
                  )}
                >
                  {cfg.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-[#B8A99A] mb-1.5 block">Headline *</label>
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
            <label className="text-xs font-medium text-[#B8A99A] mb-1.5 block">From</label>
            <select
              value={EOS_TEAM_MEMBERS.find(m => m.name === form.owner_name)?.email || ''}
              onChange={e => {
                const m = EOS_TEAM_MEMBERS.find(m => m.email === e.target.value);
                set('owner_name', m?.name ?? '');
              }}
              className={inputCls}
            >
              <option value="">— Unassigned —</option>
              {EOS_TEAM_MEMBERS.map(m => (
                <option key={m.email} value={m.email}>{m.name}</option>
              ))}
            </select>
          </div>

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-lg border border-[#3D2E1E] text-[#F5ECD7] text-sm hover:bg-[#2A1F14] transition-colors">Cancel</button>
            <button type="submit" disabled={saving} className="flex-1 py-2.5 rounded-lg bg-[#16A34A] hover:bg-[#15803D] disabled:opacity-50 text-white text-sm font-semibold transition-colors">
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
          <h1 className="font-serif text-3xl font-bold text-[#F5ECD7]" style={{ letterSpacing: '-0.02em' }}>Headlines</h1>
          <p className="text-[#B8A99A] mt-1 text-sm">Good news, customer wins, and team updates</p>
        </div>
        <button onClick={() => setShowModal(true)} className="px-4 py-2 rounded-lg bg-[#16A34A] hover:bg-[#15803D] text-white text-sm font-medium transition-colors">
          + Share Headline
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 mb-5 border-b border-[#3D2E1E] flex-wrap">
        {([
          { key: 'all', label: 'All' },
          { key: 'good_news', label: 'Good News' },
          { key: 'customer_win', label: 'Customer Wins' },
          { key: 'employee_update', label: 'Team Updates' },
        ] as { key: TypeFilter; label: string }[]).map(({ key, label }) => (
          <button key={key} onClick={() => setFilter(key)}
            className={cn('px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-[2px] whitespace-nowrap',
              filter === key ? 'border-[#16A34A] text-[#16A34A]' : 'border-transparent text-[#B8A99A] hover:text-[#F5ECD7]')}>
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
              className="rounded-xl border border-[#3D2E1E] bg-[#1C1510] px-5 py-4 hover:bg-[#2A1F14]/40 transition-colors group/row"
            >
              <div className="flex items-start gap-3">
                {/* Type dot */}
                <div className={cn('w-2 h-2 rounded-full mt-1.5 shrink-0', cfg.dot)} />

                <div className="flex-1 min-w-0">
                  {/* Type badge */}
                  <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider mb-1.5', cfg.bg, cfg.text)}>
                    {cfg.label}
                  </span>
                  <p className="text-sm text-[#F5ECD7] leading-relaxed">{headline.title}</p>
                  <div className="flex items-center gap-2 mt-1.5">
                    {headline.owner_name && (
                      <span className="text-xs text-[#B8A99A]">{headline.owner_name}</span>
                    )}
                    <span className="text-xs text-[#6B5A4A]">{fmtDate(headline.created_at)}</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="shrink-0 flex items-center gap-1 opacity-0 group-hover/row:opacity-100 transition-opacity">
                  <button onClick={() => setEditingHeadline(headline)} className="text-[#6B5A4A] hover:text-[#F5ECD7] text-xs px-1.5 py-1 transition-colors">Edit</button>
                  <button onClick={() => handleDelete(headline.id)} className="text-[#6B5A4A] hover:text-[#C0392B] text-xs px-1.5 py-1 transition-colors">✕</button>
                </div>
              </div>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="rounded-xl border border-[#3D2E1E] bg-[#1C1510] px-6 py-12 text-center text-[#6B5A4A] text-sm">
            No headlines yet. Click &ldquo;+ Share Headline&rdquo; to celebrate a win.
          </div>
        )}
      </div>

      {showModal && <HeadlineModal mode="create" onSave={handleCreate} onClose={() => setShowModal(false)} />}
      {editingHeadline && <HeadlineModal mode="edit" headline={editingHeadline} onSave={handleUpdate} onClose={() => setEditingHeadline(null)} />}
      <SmartAddButton pageContext="headlines" />
    </>
  );
}
