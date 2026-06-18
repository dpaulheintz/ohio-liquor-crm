'use client';

import { useState, useEffect } from 'react';
import type { Barrel, BarrelWithMilestones, Milestone } from '@/lib/eos/barrels';
import OwnerSelect from '@/components/eos/OwnerSelect';
import {
  updateBarrelAction,
  deleteBarrelAction,
  addMilestoneAction,
  toggleMilestoneAction,
  deleteMilestoneAction,
  updateMilestoneAction,
  type BarrelFormData,
} from '@/app/eos/barrels/actions';
import { cn } from '@/lib/utils';

type Props = {
  barrel: BarrelWithMilestones | null;
  onClose: () => void;
  onUpdate: (updated: BarrelWithMilestones) => void;
  onDelete: (id: string) => void;
};

const STATUS_OPTIONS = [
  { value: 'not_started', label: 'Not Started' },
  { value: 'on_track', label: 'On Track' },
  { value: 'off_track', label: 'Off Track' },
  { value: 'complete', label: 'Complete' },
];

function fmtDate(d: string | null) {
  if (!d) return '';
  const parts = d.split('-').map(Number);
  const date = new Date(parts[0], parts[1] - 1, parts[2]);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function BarrelDetailPanel({ barrel, onClose, onUpdate, onDelete }: Props) {
  const [form, setForm] = useState<BarrelFormData | null>(null);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [saving, setSaving] = useState(false);
  const [addingMilestone, setAddingMilestone] = useState(false);
  const [newMilestoneTitle, setNewMilestoneTitle] = useState('');
  const [editingMilestoneId, setEditingMilestoneId] = useState<string | null>(null);
  const [editingMilestoneTitle, setEditingMilestoneTitle] = useState('');

  useEffect(() => {
    if (!barrel) { setForm(null); return; }
    setForm({
      title: barrel.title,
      description: barrel.description ?? '',
      owner_name: barrel.owner_name ?? '',
      owner_email: barrel.owner_email ?? '',
      status: barrel.status,
      due_date: barrel.due_date ?? '',
      quarter: barrel.quarter ?? '',
      barrel_type: barrel.barrel_type,
    });
    setMilestones(barrel.milestones);
    setAddingMilestone(false);
    setNewMilestoneTitle('');
    setEditingMilestoneId(null);
  }, [barrel?.id]);

  function setField(field: keyof BarrelFormData, value: string) {
    setForm(prev => prev ? { ...prev, [field]: value } : prev);
  }

  async function handleSave() {
    if (!barrel || !form) return;
    setSaving(true);
    try {
      await updateBarrelAction(barrel.id, form);
      onUpdate({
        ...barrel,
        ...form,
        status: form.status as Barrel['status'],
        barrel_type: form.barrel_type as Barrel['barrel_type'],
        milestones,
      });
    } catch {
      alert('Failed to save changes.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!barrel) return;
    if (!window.confirm('Delete this barrel and all its milestones? This cannot be undone.')) return;
    try {
      await deleteBarrelAction(barrel.id);
      onDelete(barrel.id);
    } catch {
      alert('Failed to delete barrel.');
    }
  }

  async function handleMilestoneToggle(id: string, completed: boolean) {
    setMilestones(prev => prev.map(m => m.id === id ? { ...m, completed } : m));
    try {
      await toggleMilestoneAction(id, completed);
    } catch {
      setMilestones(prev => prev.map(m => m.id === id ? { ...m, completed: !completed } : m));
    }
  }

  async function handleAddMilestone() {
    if (!barrel || !newMilestoneTitle.trim()) return;
    try {
      const created = await addMilestoneAction(barrel.id, newMilestoneTitle.trim());
      setMilestones(prev => [...prev, created]);
      setNewMilestoneTitle('');
      setAddingMilestone(false);
    } catch {
      alert('Failed to add milestone.');
    }
  }

  async function handleDeleteMilestone(id: string) {
    setMilestones(prev => prev.filter(m => m.id !== id));
    try {
      await deleteMilestoneAction(id);
    } catch {
      // Would need to re-fetch to restore — skip for now
    }
  }

  async function handleMilestoneTitleSave(id: string) {
    if (!editingMilestoneTitle.trim()) { setEditingMilestoneId(null); return; }
    const oldTitle = milestones.find(m => m.id === id)?.title ?? '';
    setMilestones(prev => prev.map(m => m.id === id ? { ...m, title: editingMilestoneTitle } : m));
    setEditingMilestoneId(null);
    try {
      await updateMilestoneAction(id, editingMilestoneTitle);
    } catch {
      setMilestones(prev => prev.map(m => m.id === id ? { ...m, title: oldTitle } : m));
    }
  }

  const open = barrel !== null;
  const completedCount = milestones.filter(m => m.completed).length;

  const inputCls =
    'w-full rounded-lg bg-[#1C1510] border border-[#3D2E1E] px-3 py-2 text-sm text-[#F5ECD7] focus:outline-none focus:border-[#C9963A] transition-colors placeholder:text-[#6B5A4A]';

  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          'fixed inset-0 z-30 bg-[#0E0B07]/60 transition-opacity duration-200',
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
        )}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className={cn(
          'fixed right-0 top-0 h-full w-full md:w-[480px] z-40',
          'bg-[#1C1510] border-l border-[#3D2E1E] shadow-2xl',
          'transform transition-transform duration-200 ease-out overflow-y-auto',
          open ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        {form && barrel && (
          <div className="flex flex-col h-full">
            {/* Panel header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#3D2E1E] shrink-0">
              <span className="text-xs font-semibold uppercase tracking-wider text-[#B8A99A]">
                Barrel Detail
              </span>
              <button
                onClick={onClose}
                className="text-[#B8A99A] hover:text-[#F5ECD7] transition-colors w-7 h-7 flex items-center justify-center text-xl"
              >
                ×
              </button>
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              {/* Title */}
              <div>
                <label className="text-xs font-medium text-[#B8A99A] mb-1 block">Title</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={e => setField('title', e.target.value)}
                  className="w-full bg-transparent border-0 border-b border-[#3D2E1E] pb-1 text-[#F5ECD7] text-lg font-semibold focus:outline-none focus:border-[#C9963A] transition-colors"
                />
              </div>

              {/* Status */}
              <div>
                <label className="text-xs font-medium text-[#B8A99A] mb-1.5 block">Status</label>
                <select
                  value={form.status}
                  onChange={e => setField('status', e.target.value)}
                  className={inputCls}
                >
                  {STATUS_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>

              {/* Barrel type + quarter */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-[#B8A99A] mb-1.5 block">Type</label>
                  <div className="flex rounded-lg overflow-hidden border border-[#3D2E1E]">
                    {(['company', 'individual'] as const).map(t => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setField('barrel_type', t)}
                        className={cn(
                          'flex-1 py-1.5 text-xs font-medium transition-colors capitalize',
                          form.barrel_type === t
                            ? 'bg-[#C9963A] text-[#0E0B07]'
                            : 'bg-[#1C1510] text-[#B8A99A] hover:bg-[#2A1F14]',
                        )}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-[#B8A99A] mb-1.5 block">Quarter</label>
                  <input
                    type="text"
                    value={form.quarter}
                    onChange={e => setField('quarter', e.target.value)}
                    className={inputCls}
                    placeholder="Q2 2026"
                  />
                </div>
              </div>

              {/* Owner */}
              <div>
                <label className="text-xs font-medium text-[#B8A99A] mb-1.5 block">Owner</label>
                <OwnerSelect
                  ownerName={form.owner_name}
                  ownerEmail={form.owner_email}
                  onChange={(name, email) => { setField('owner_name', name); setField('owner_email', email); }}
                  className={inputCls}
                />
              </div>

              {/* Due date */}
              <div>
                <label className="text-xs font-medium text-[#B8A99A] mb-1.5 block">Due Date</label>
                <input
                  type="date"
                  value={form.due_date}
                  onChange={e => setField('due_date', e.target.value)}
                  className={inputCls}
                />
              </div>

              {/* Description */}
              <div>
                <label className="text-xs font-medium text-[#B8A99A] mb-1.5 block">Description</label>
                <textarea
                  value={form.description}
                  onChange={e => setField('description', e.target.value)}
                  className={`${inputCls} resize-none`}
                  rows={3}
                  placeholder="Context or success criteria..."
                />
              </div>

              {/* Milestones */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium text-[#B8A99A]">
                    Milestones{' '}
                    {milestones.length > 0 && (
                      <span className="text-[#6B5A4A]">
                        ({completedCount}/{milestones.length})
                      </span>
                    )}
                  </label>
                </div>

                <div className="space-y-1">
                  {milestones.map(m => (
                    <div
                      key={m.id}
                      className="flex items-center gap-2 group/milestone rounded-lg px-2 py-1.5 hover:bg-[#2A1F14]/50"
                    >
                      <button
                        onClick={() => handleMilestoneToggle(m.id, !m.completed)}
                        className={cn(
                          'w-4 h-4 rounded shrink-0 border transition-colors flex items-center justify-center',
                          m.completed
                            ? 'bg-[#C9963A] border-[#C9963A] text-[#F5ECD7]'
                            : 'border-[#3D2E1E] hover:border-[#C9963A]',
                        )}
                      >
                        {m.completed && (
                          <svg className="w-2.5 h-2.5" viewBox="0 0 10 10" fill="none">
                            <path d="M2 5l2.5 2.5L8 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </button>

                      {editingMilestoneId === m.id ? (
                        <input
                          autoFocus
                          value={editingMilestoneTitle}
                          onChange={e => setEditingMilestoneTitle(e.target.value)}
                          onBlur={() => handleMilestoneTitleSave(m.id)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') handleMilestoneTitleSave(m.id);
                            if (e.key === 'Escape') setEditingMilestoneId(null);
                          }}
                          className="flex-1 bg-transparent text-sm text-[#F5ECD7] focus:outline-none border-b border-[#3D2E1E]"
                        />
                      ) : (
                        <span
                          onClick={() => {
                            setEditingMilestoneId(m.id);
                            setEditingMilestoneTitle(m.title);
                          }}
                          className={cn(
                            'flex-1 text-sm cursor-text',
                            m.completed ? 'line-through text-[#6B5A4A]' : 'text-[#F5ECD7]',
                          )}
                        >
                          {m.title}
                        </span>
                      )}

                      <button
                        onClick={() => handleDeleteMilestone(m.id)}
                        className="opacity-0 group-hover/milestone:opacity-100 text-[#6B5A4A] hover:text-[#C0392B] transition-all text-xs px-1"
                        title="Delete milestone"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>

                {addingMilestone ? (
                  <div className="flex items-center gap-2 mt-2 px-2">
                    <div className="w-4 h-4 shrink-0 rounded border border-[#3D2E1E]" />
                    <input
                      autoFocus
                      value={newMilestoneTitle}
                      onChange={e => setNewMilestoneTitle(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleAddMilestone();
                        if (e.key === 'Escape') {
                          setAddingMilestone(false);
                          setNewMilestoneTitle('');
                        }
                      }}
                      onBlur={() => {
                        if (!newMilestoneTitle.trim()) {
                          setAddingMilestone(false);
                        }
                      }}
                      className="flex-1 bg-[#1C1510] border border-[#3D2E1E] rounded px-2 py-1 text-sm text-[#F5ECD7] focus:outline-none focus:border-[#C9963A]"
                      placeholder="Milestone title…"
                    />
                    <button
                      onClick={handleAddMilestone}
                      className="text-[#C9963A] hover:text-[#E8B86D] text-sm transition-colors"
                    >
                      Add
                    </button>
                    <button
                      onClick={() => { setAddingMilestone(false); setNewMilestoneTitle(''); }}
                      className="text-[#6B5A4A] hover:text-[#B8A99A] text-sm transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setAddingMilestone(true)}
                    className="mt-2 px-2 text-sm text-[#6B5A4A] hover:text-[#B8A99A] transition-colors"
                  >
                    + Add Milestone
                  </button>
                )}
              </div>
            </div>

            {/* Footer actions */}
            <div className="shrink-0 px-6 py-4 border-t border-[#3D2E1E] space-y-3">
              <button
                onClick={handleSave}
                disabled={saving}
                className="w-full py-2.5 rounded-lg bg-[#C9963A] hover:bg-[#E8B86D] disabled:opacity-50 text-[#0E0B07] text-sm font-semibold transition-colors"
              >
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
              <button
                onClick={handleDelete}
                className="w-full text-center text-sm text-[#C0392B] hover:text-[#C0392B] transition-colors py-1"
              >
                Delete Barrel
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
