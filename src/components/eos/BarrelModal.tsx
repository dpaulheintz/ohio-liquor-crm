'use client';

import { useState } from 'react';
import type { BarrelFormData } from '@/app/eos/barrels/actions';
import type { Barrel } from '@/lib/eos/barrels';
import OwnerSelect from '@/components/eos/OwnerSelect';

type Props = {
  mode: 'create' | 'edit';
  barrel?: Barrel;
  onSave: (data: BarrelFormData) => Promise<void>;
  onClose: () => void;
};

const STATUS_OPTIONS = [
  { value: 'not_started', label: 'Not Started' },
  { value: 'on_track', label: 'On Track' },
  { value: 'off_track', label: 'Off Track' },
  { value: 'complete', label: 'Complete' },
];

export default function BarrelModal({ mode, barrel, onSave, onClose }: Props) {
  const [form, setForm] = useState<BarrelFormData>({
    title: barrel?.title ?? '',
    description: barrel?.description ?? '',
    owner_name: barrel?.owner_name ?? '',
    owner_email: barrel?.owner_email ?? '',
    status: barrel?.status ?? 'not_started',
    due_date: barrel?.due_date ?? '',
    quarter: barrel?.quarter ?? '',
    barrel_type: barrel?.barrel_type ?? 'company',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function set(field: keyof BarrelFormData, value: string) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) { setError('Title is required.'); return; }
    setSaving(true);
    setError('');
    try {
      await onSave(form);
    } catch {
      setError('Failed to save. Please try again.');
      setSaving(false);
    }
  }

  const inputCls =
    'w-full rounded-lg bg-white border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-green-600 transition-colors placeholder:text-gray-400';

  return (
    <div className="fixed inset-0 bg-gray-50/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white border border-gray-200 rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            {mode === 'create' ? 'Add Barrel' : 'Edit Barrel'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-900 text-2xl leading-none w-7 h-7 flex items-center justify-center transition-colors"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {error && (
            <p className="text-sm text-red-600 rounded-lg bg-red-50 border border-gray-200 px-3 py-2">
              {error}
            </p>
          )}

          <div>
            <label className="text-xs font-medium text-gray-500 mb-1.5 block">Title *</label>
            <input
              type="text"
              value={form.title}
              onChange={e => set('title', e.target.value)}
              className={inputCls}
              placeholder="e.g. Launch Barrel Select product line"
              autoFocus
            />
          </div>

          {/* Barrel Type toggle */}
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1.5 block">Type</label>
            <div className="flex rounded-lg overflow-hidden border border-gray-200">
              {(['company', 'individual'] as const).map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => set('barrel_type', t)}
                  className={`flex-1 py-2 text-sm font-medium transition-colors capitalize ${
                    form.barrel_type === t
                      ? 'bg-green-600 text-white'
                      : 'bg-white text-gray-500 hover:bg-gray-100'
                  }`}
                >
                  {t}
                </button>
              ))}
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

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1.5 block">Status</label>
              <select
                value={form.status}
                onChange={e => set('status', e.target.value)}
                className={inputCls}
              >
                {STATUS_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1.5 block">Due Date</label>
              <input
                type="date"
                value={form.due_date}
                onChange={e => set('due_date', e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1.5 block">Quarter</label>
              <input
                type="text"
                value={form.quarter}
                onChange={e => set('quarter', e.target.value)}
                className={inputCls}
                placeholder="Q2 2026"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500 mb-1.5 block">Description</label>
            <textarea
              value={form.description}
              onChange={e => set('description', e.target.value)}
              className={`${inputCls} resize-none`}
              rows={3}
              placeholder="Optional context or success criteria..."
            />
          </div>

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-lg border border-gray-200 text-gray-900 text-sm hover:bg-gray-100 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-2.5 rounded-lg bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-semibold transition-colors"
            >
              {saving ? 'Saving…' : mode === 'create' ? 'Add Barrel' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
