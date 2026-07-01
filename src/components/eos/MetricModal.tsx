'use client';

import { useState } from 'react';
import type { Metric } from '@/lib/eos/scorecard';
import OwnerSelect from '@/components/eos/OwnerSelect';

export type MetricFormData = {
  title: string;
  goal_operator: string;
  goal_value: string;
  metric_type: string;
  owner_name: string;
  owner_email: string;
};

type Props = {
  mode: 'create' | 'edit';
  metric?: Metric;
  onSave: (data: MetricFormData) => Promise<void>;
  onClose: () => void;
};

export default function MetricModal({ mode, metric, onSave, onClose }: Props) {
  const [form, setForm] = useState<MetricFormData>({
    title: metric?.title ?? '',
    goal_operator: metric?.goal_operator ?? '>=',
    goal_value: metric?.goal_value ?? '',
    metric_type: metric?.metric_type ?? 'number',
    owner_name: metric?.owner_name ?? '',
    owner_email: metric?.owner_email ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function set(field: keyof MetricFormData, value: string) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) { setError('Title is required.'); return; }
    if (!form.goal_value.trim()) { setError('Goal value is required.'); return; }
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
    'w-full rounded-lg bg-[#1C1510] border border-[#3D2E1E] px-3 py-2 text-sm text-[#F5ECD7] focus:outline-none focus:border-[#16A34A] transition-colors placeholder:text-[#6B5A4A]';

  const goalHint =
    form.metric_type === 'boolean'
      ? 'Use "true" to require Yes'
      : form.metric_type === 'percentage'
      ? 'Enter number only (e.g. 18 for 18%)'
      : form.metric_type === 'currency'
      ? 'Enter number only (e.g. 15000)'
      : '';

  return (
    <div className="fixed inset-0 bg-[#0E0B07]/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#1C1510] border border-[#3D2E1E] rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#3D2E1E]">
          <h2 className="text-lg font-semibold text-[#F5ECD7]">
            {mode === 'create' ? 'Add Metric' : 'Edit Metric'}
          </h2>
          <button
            onClick={onClose}
            className="text-[#B8A99A] hover:text-[#F5ECD7] text-2xl leading-none transition-colors w-7 h-7 flex items-center justify-center"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {error && (
            <p className="text-sm text-[#C0392B] rounded-lg bg-[#2E0F0F] border border-[#3D2E1E] px-3 py-2">
              {error}
            </p>
          )}

          <div>
            <label className="text-xs font-medium text-[#B8A99A] mb-1.5 block">Title *</label>
            <input
              type="text"
              value={form.title}
              onChange={e => set('title', e.target.value)}
              className={inputCls}
              placeholder="e.g. Weekly Revenue"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-[#B8A99A] mb-1.5 block">Type *</label>
              <select
                value={form.metric_type}
                onChange={e => set('metric_type', e.target.value)}
                className={inputCls}
              >
                <option value="number">Number</option>
                <option value="currency">Currency ($)</option>
                <option value="percentage">Percentage (%)</option>
                <option value="decimal">Decimal</option>
                <option value="boolean">Boolean (Yes/No)</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-[#B8A99A] mb-1.5 block">Goal *</label>
              <select
                value={form.goal_operator}
                onChange={e => set('goal_operator', e.target.value)}
                className={inputCls}
              >
                <option value=">=">≥ at least</option>
                <option value="<=">≤ at most</option>
                <option value=">"> &gt; greater than</option>
                <option value="<"> &lt; less than</option>
                <option value="=">=  equal to</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-[#B8A99A] mb-1.5 block">
              Goal Value *{goalHint && <span className="text-[#6B5A4A] font-normal ml-1">— {goalHint}</span>}
            </label>
            <input
              type="text"
              value={form.goal_value}
              onChange={e => set('goal_value', e.target.value)}
              className={inputCls}
              placeholder={
                form.metric_type === 'boolean' ? 'true' :
                form.metric_type === 'currency' ? '15000' : '0'
              }
            />
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

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-lg border border-[#3D2E1E] text-[#F5ECD7] text-sm hover:bg-[#2A1F14] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-2.5 rounded-lg bg-[#16A34A] hover:bg-[#15803D] disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
            >
              {saving ? 'Saving…' : mode === 'create' ? 'Add Metric' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
