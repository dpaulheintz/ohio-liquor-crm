'use client';

import { useState } from 'react';
import type { BarrelWithMilestones } from '@/lib/eos/barrels';
import { createBarrelAction, type BarrelFormData } from './actions';
import BarrelModal from '@/components/eos/BarrelModal';
import BarrelDetailPanel from '@/components/eos/BarrelDetailPanel';
import BarrelsListView from '@/components/eos/BarrelsListView';
import SmartAddButton from '@/components/eos/SmartAddButton';
import { cn } from '@/lib/utils';

type Props = { initialBarrels: BarrelWithMilestones[] };

type Status = 'not_started' | 'on_track' | 'off_track' | 'complete';

const STATUS_CONFIG: Record<Status, { label: string; bg: string; text: string }> = {
  not_started: { label: 'Not Started', bg: 'bg-gray-100', text: 'text-gray-500' },
  on_track:    { label: 'On Track',    bg: 'bg-green-50', text: 'text-green-600' },
  off_track:   { label: 'Off Track',   bg: 'bg-red-50',  text: 'text-red-600'  },
  complete:    { label: 'Complete',    bg: 'bg-green-600', text: 'text-white' },
};

const BOARD_COLUMNS: { status: Status; label: string }[] = [
  { status: 'not_started', label: 'Not Started' },
  { status: 'on_track',    label: 'On Track' },
  { status: 'off_track',   label: 'Off Track' },
  { status: 'complete',    label: 'Complete' },
];

function fmtDate(d: string | null) {
  if (!d) return '';
  const [y, m, day] = d.split('-').map(Number);
  return new Date(y, m - 1, day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function BarrelsClient({ initialBarrels }: Props) {
  const [barrels, setBarrels] = useState<BarrelWithMilestones[]>(initialBarrels);
  const [view, setView] = useState<'list' | 'board'>('list');
  const [selectedBarrel, setSelectedBarrel] = useState<BarrelWithMilestones | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [quarterFilter, setQuarterFilter] = useState('all');

  const quarters = ['all', ...Array.from(new Set(barrels.map(b => b.quarter).filter(Boolean) as string[])).sort()];

  function handleUpdate(updated: BarrelWithMilestones) {
    setBarrels(prev => prev.map(b => b.id === updated.id ? updated : b));
    setSelectedBarrel(updated);
  }

  function handleDelete(id: string) {
    setBarrels(prev => prev.filter(b => b.id !== id));
    setSelectedBarrel(null);
  }

  async function handleCreate(data: BarrelFormData) {
    const created = await createBarrelAction(data);
    setBarrels(prev => [...prev, { ...created, milestones: [] }]);
    setShowAddModal(false);
  }

  const filteredBarrels = quarterFilter === 'all'
    ? barrels
    : barrels.filter(b => b.quarter === quarterFilter);

  return (
    <>
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="font-serif text-3xl font-bold text-gray-900" style={{ letterSpacing: '-0.02em' }}>Barrels</h1>
          <p className="text-gray-500 mt-1 text-sm">Quarterly rocks — big goals for the company and individuals</p>
        </div>
        <div className="flex items-center gap-3">
          {quarters.length > 1 && (
            <select
              value={quarterFilter}
              onChange={e => setQuarterFilter(e.target.value)}
              className="rounded-lg border border-gray-200 bg-white text-gray-900 text-sm px-3 py-1.5 focus:outline-none focus:border-green-600 transition-colors"
            >
              {quarters.map(q => (
                <option key={q} value={q}>{q === 'all' ? 'All Quarters' : q}</option>
              ))}
            </select>
          )}
          <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
            {(['list', 'board'] as const).map(v => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={cn(
                  'px-3 py-1.5 font-medium capitalize transition-colors',
                  view === v ? 'bg-green-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-100',
                )}
              >
                {v}
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-medium transition-colors"
          >
            + Add Barrel
          </button>
        </div>
      </div>

      {/* LIST VIEW */}
      {view === 'list' && (
        <BarrelsListView
          barrels={filteredBarrels}
          onBarrelClick={barrel => setSelectedBarrel(barrel)}
        />
      )}

      {/* BOARD VIEW */}
      {view === 'board' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {BOARD_COLUMNS.map(({ status, label }) => {
            const col = filteredBarrels.filter(b => b.status === status);
            const cfg = STATUS_CONFIG[status];
            return (
              <div key={status} className="flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <span className={cn('w-2 h-2 rounded-full', cfg.bg)} />
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">{label}</h3>
                  <span className="text-xs text-gray-400 ml-auto">{col.length}</span>
                </div>
                <div className="space-y-2 min-h-[60px]">
                  {col.map(barrel => {
                    const totalMs = barrel.milestones.length;
                    const doneMs = barrel.milestones.filter(m => m.completed).length;
                    return (
                      <div
                        key={barrel.id}
                        onClick={() => setSelectedBarrel(barrel)}
                        className="rounded-xl border border-gray-200 bg-white px-4 py-3 cursor-pointer hover:bg-gray-100/60 transition-colors"
                      >
                        <p className="text-sm font-medium text-gray-900 mb-2">{barrel.title}</p>
                        <div className="flex items-center justify-between text-xs text-gray-500">
                          <span>{barrel.owner_name ?? '—'}</span>
                          <span>{fmtDate(barrel.due_date)}</span>
                        </div>
                        {totalMs > 0 && (
                          <div className="mt-2 flex items-center gap-1.5">
                            <div className="flex-1 h-1 rounded-full bg-gray-100 overflow-hidden">
                              <div
                                className="h-1 rounded-full bg-green-600"
                                style={{ width: `${(doneMs / totalMs) * 100}%` }}
                              />
                            </div>
                            <span className="text-[10px] text-gray-400">{doneMs}/{totalMs}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {col.length === 0 && (
                    <div className="rounded-xl border border-dashed border-gray-200 px-4 py-6 text-center text-gray-400 text-xs">
                      Empty
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {barrels.length === 0 && (
        <div className="rounded-xl border border-gray-200 bg-white px-8 py-16 text-center">
          <p className="text-gray-500 text-sm">No barrels yet. Click &ldquo;+ Add Barrel&rdquo; to create your first quarterly rock.</p>
        </div>
      )}

      {/* Detail Panel */}
      <BarrelDetailPanel
        barrel={selectedBarrel}
        onClose={() => setSelectedBarrel(null)}
        onUpdate={handleUpdate}
        onDelete={handleDelete}
      />

      {showAddModal && (
        <BarrelModal
          mode="create"
          onSave={handleCreate}
          onClose={() => setShowAddModal(false)}
        />
      )}
      <SmartAddButton pageContext="barrels" />
    </>
  );
}
