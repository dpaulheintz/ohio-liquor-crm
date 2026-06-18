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
  not_started: { label: 'Not Started', bg: 'bg-[#2A1F14]', text: 'text-[#B8A99A]' },
  on_track:    { label: 'On Track',    bg: 'bg-[#0F2E2B]', text: 'text-[#5B9E94]' },
  off_track:   { label: 'Off Track',   bg: 'bg-[#2E0F0F]',  text: 'text-[#C0392B]'  },
  complete:    { label: 'Complete',    bg: 'bg-[#C9963A]', text: 'text-[#0E0B07]' },
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
          <h1 className="font-serif text-3xl font-bold text-[#F5ECD7]" style={{ letterSpacing: '-0.02em' }}>Barrels</h1>
          <p className="text-[#B8A99A] mt-1 text-sm">Quarterly rocks — big goals for the company and individuals</p>
        </div>
        <div className="flex items-center gap-3">
          {quarters.length > 1 && (
            <select
              value={quarterFilter}
              onChange={e => setQuarterFilter(e.target.value)}
              className="rounded-lg border border-[#3D2E1E] bg-[#1C1510] text-[#F5ECD7] text-sm px-3 py-1.5 focus:outline-none focus:border-[#C9963A] transition-colors"
            >
              {quarters.map(q => (
                <option key={q} value={q}>{q === 'all' ? 'All Quarters' : q}</option>
              ))}
            </select>
          )}
          <div className="flex rounded-lg border border-[#3D2E1E] overflow-hidden text-sm">
            {(['list', 'board'] as const).map(v => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={cn(
                  'px-3 py-1.5 font-medium capitalize transition-colors',
                  view === v ? 'bg-[#C9963A] text-[#0E0B07]' : 'bg-[#1C1510] text-[#B8A99A] hover:bg-[#2A1F14]',
                )}
              >
                {v}
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 rounded-lg bg-[#C9963A] hover:bg-[#E8B86D] text-[#0E0B07] text-sm font-medium transition-colors"
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
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-[#B8A99A]">{label}</h3>
                  <span className="text-xs text-[#6B5A4A] ml-auto">{col.length}</span>
                </div>
                <div className="space-y-2 min-h-[60px]">
                  {col.map(barrel => {
                    const totalMs = barrel.milestones.length;
                    const doneMs = barrel.milestones.filter(m => m.completed).length;
                    return (
                      <div
                        key={barrel.id}
                        onClick={() => setSelectedBarrel(barrel)}
                        className="rounded-xl border border-[#3D2E1E] bg-[#1C1510] px-4 py-3 cursor-pointer hover:bg-[#2A1F14]/60 transition-colors"
                      >
                        <p className="text-sm font-medium text-[#F5ECD7] mb-2">{barrel.title}</p>
                        <div className="flex items-center justify-between text-xs text-[#B8A99A]">
                          <span>{barrel.owner_name ?? '—'}</span>
                          <span>{fmtDate(barrel.due_date)}</span>
                        </div>
                        {totalMs > 0 && (
                          <div className="mt-2 flex items-center gap-1.5">
                            <div className="flex-1 h-1 rounded-full bg-[#2A1F14] overflow-hidden">
                              <div
                                className="h-1 rounded-full bg-[#C9963A]"
                                style={{ width: `${(doneMs / totalMs) * 100}%` }}
                              />
                            </div>
                            <span className="text-[10px] text-[#6B5A4A]">{doneMs}/{totalMs}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {col.length === 0 && (
                    <div className="rounded-xl border border-dashed border-[#3D2E1E] px-4 py-6 text-center text-[#6B5A4A] text-xs">
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
        <div className="rounded-xl border border-[#3D2E1E] bg-[#1C1510] px-8 py-16 text-center">
          <p className="text-[#B8A99A] text-sm">No barrels yet. Click &ldquo;+ Add Barrel&rdquo; to create your first quarterly rock.</p>
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
