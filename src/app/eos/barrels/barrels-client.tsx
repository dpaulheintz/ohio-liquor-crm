'use client';

import { useState } from 'react';
import type { BarrelWithMilestones } from '@/lib/eos/barrels';
import { createBarrelAction, type BarrelFormData } from './actions';
import BarrelModal from '@/components/eos/BarrelModal';
import BarrelDetailPanel from '@/components/eos/BarrelDetailPanel';
import { cn } from '@/lib/utils';

type Props = { initialBarrels: BarrelWithMilestones[] };

type Status = 'not_started' | 'on_track' | 'off_track' | 'complete';

const STATUS_CONFIG: Record<Status, { label: string; bg: string; text: string }> = {
  not_started: { label: 'Not Started', bg: 'bg-zinc-800', text: 'text-zinc-400' },
  on_track:    { label: 'On Track',    bg: 'bg-blue-900/60', text: 'text-blue-300' },
  off_track:   { label: 'Off Track',   bg: 'bg-red-900/60',  text: 'text-red-300'  },
  complete:    { label: 'Complete',    bg: 'bg-green-900/60', text: 'text-green-300' },
};

const BOARD_COLUMNS: { status: Status; label: string }[] = [
  { status: 'not_started', label: 'Not Started' },
  { status: 'on_track',    label: 'On Track' },
  { status: 'off_track',   label: 'Off Track' },
  { status: 'complete',    label: 'Complete' },
];

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status as Status] ?? STATUS_CONFIG.not_started;
  return (
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', cfg.bg, cfg.text)}>
      {cfg.label}
    </span>
  );
}

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

  function openDetail(barrel: BarrelWithMilestones) {
    setSelectedBarrel(barrel);
  }

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

  const companyBarrels = barrels.filter(b => b.barrel_type === 'company');
  const individualBarrels = barrels.filter(b => b.barrel_type === 'individual');

  return (
    <>
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="font-serif text-3xl font-bold text-white">Barrels</h1>
          <p className="text-zinc-400 mt-1 text-sm">Quarterly rocks — big goals for the company and individuals</p>
        </div>
        <div className="flex items-center gap-3">
          {/* View toggle */}
          <div className="flex rounded-lg border border-zinc-700 overflow-hidden text-sm">
            {(['list', 'board'] as const).map(v => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={cn(
                  'px-3 py-1.5 font-medium capitalize transition-colors',
                  view === v ? 'bg-[#2a5a3a] text-white' : 'bg-zinc-900 text-zinc-400 hover:bg-zinc-800',
                )}
              >
                {v}
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 rounded-lg bg-[#2a5a3a] hover:bg-[#3a6a4a] text-white text-sm font-medium transition-colors"
          >
            + Add Barrel
          </button>
        </div>
      </div>

      {/* LIST VIEW */}
      {view === 'list' && (
        <div className="space-y-8">
          {[
            { label: 'Company Barrels', items: companyBarrels },
            { label: 'Individual Barrels', items: individualBarrels },
          ].map(({ label, items }) => (
            <div key={label}>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3">{label}</h2>
              {items.length === 0 ? (
                <div className="rounded-xl border border-zinc-800 bg-[#111] px-6 py-8 text-center text-zinc-600 text-sm">
                  No {label.toLowerCase()} yet.
                </div>
              ) : (
                <div className="rounded-xl border border-zinc-800 overflow-hidden">
                  {items.map((barrel, idx) => {
                    const completedMs = barrel.milestones.filter(m => m.completed).length;
                    const totalMs = barrel.milestones.length;
                    const progress = totalMs > 0 ? completedMs / totalMs : 0;

                    return (
                      <div
                        key={barrel.id}
                        onClick={() => openDetail(barrel)}
                        className={cn(
                          'flex items-center gap-4 px-4 py-3 cursor-pointer',
                          'group/row hover:bg-zinc-800/50 transition-colors',
                          idx < items.length - 1 && 'border-b border-zinc-800',
                          idx % 2 === 0 ? 'bg-[#111]' : 'bg-[#141414]',
                        )}
                      >
                        {/* Status badge */}
                        <div className="shrink-0">
                          <StatusBadge status={barrel.status} />
                        </div>

                        {/* Title */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-zinc-100 truncate">{barrel.title}</p>
                          {barrel.quarter && (
                            <p className="text-xs text-zinc-600">{barrel.quarter}</p>
                          )}
                        </div>

                        {/* Milestone progress */}
                        <div className="shrink-0 hidden sm:flex items-center gap-2">
                          {totalMs > 0 ? (
                            <>
                              <span className="text-xs text-zinc-500">{completedMs}/{totalMs}</span>
                              <div className="w-16 h-1 rounded-full bg-zinc-800 overflow-hidden">
                                <div
                                  className="h-1 rounded-full bg-green-600 transition-all"
                                  style={{ width: `${progress * 100}%` }}
                                />
                              </div>
                            </>
                          ) : (
                            <span className="text-xs text-zinc-700">—</span>
                          )}
                        </div>

                        {/* Owner */}
                        <div className="shrink-0 hidden md:block text-right">
                          <p className="text-xs text-zinc-400">{barrel.owner_name ?? '—'}</p>
                        </div>

                        {/* Due date */}
                        <div className="shrink-0 text-right">
                          <p className="text-xs text-zinc-500">{fmtDate(barrel.due_date)}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}

          {barrels.length === 0 && (
            <div className="rounded-xl border border-zinc-800 bg-[#111] px-8 py-16 text-center">
              <p className="text-zinc-500 text-sm">No barrels yet. Click &ldquo;+ Add Barrel&rdquo; to create your first quarterly rock.</p>
            </div>
          )}
        </div>
      )}

      {/* BOARD VIEW */}
      {view === 'board' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {BOARD_COLUMNS.map(({ status, label }) => {
            const col = barrels.filter(b => b.status === status);
            const cfg = STATUS_CONFIG[status];
            return (
              <div key={status} className="flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <span className={cn('w-2 h-2 rounded-full', cfg.bg)} />
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">{label}</h3>
                  <span className="text-xs text-zinc-700 ml-auto">{col.length}</span>
                </div>
                <div className="space-y-2 min-h-[60px]">
                  {col.map(barrel => {
                    const totalMs = barrel.milestones.length;
                    const doneMs = barrel.milestones.filter(m => m.completed).length;
                    return (
                      <div
                        key={barrel.id}
                        onClick={() => openDetail(barrel)}
                        className="rounded-xl border border-zinc-800 bg-[#111] px-4 py-3 cursor-pointer hover:bg-zinc-800/60 transition-colors"
                      >
                        <p className="text-sm font-medium text-zinc-100 mb-2">{barrel.title}</p>
                        <div className="flex items-center justify-between text-xs text-zinc-500">
                          <span>{barrel.owner_name ?? '—'}</span>
                          <span>{fmtDate(barrel.due_date)}</span>
                        </div>
                        {totalMs > 0 && (
                          <div className="mt-2 flex items-center gap-1.5">
                            <div className="flex-1 h-1 rounded-full bg-zinc-800 overflow-hidden">
                              <div
                                className="h-1 rounded-full bg-green-600"
                                style={{ width: `${(doneMs / totalMs) * 100}%` }}
                              />
                            </div>
                            <span className="text-[10px] text-zinc-600">{doneMs}/{totalMs}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {col.length === 0 && (
                    <div className="rounded-xl border border-dashed border-zinc-800 px-4 py-6 text-center text-zinc-700 text-xs">
                      Empty
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Detail Panel */}
      <BarrelDetailPanel
        barrel={selectedBarrel}
        onClose={() => setSelectedBarrel(null)}
        onUpdate={handleUpdate}
        onDelete={handleDelete}
      />

      {/* Add Modal */}
      {showAddModal && (
        <BarrelModal
          mode="create"
          onSave={handleCreate}
          onClose={() => setShowAddModal(false)}
        />
      )}
    </>
  );
}
