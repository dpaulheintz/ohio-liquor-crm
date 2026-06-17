'use client';

import type { BarrelWithMilestones } from '@/lib/eos/barrels';
import { cn } from '@/lib/utils';

type Status = 'not_started' | 'on_track' | 'off_track' | 'complete';

const STATUS_CONFIG: Record<Status, { label: string; bg: string; text: string }> = {
  not_started: { label: 'Not Started', bg: 'bg-zinc-800', text: 'text-zinc-400' },
  on_track:    { label: 'On Track',    bg: 'bg-blue-900/60', text: 'text-blue-300' },
  off_track:   { label: 'Off Track',   bg: 'bg-red-900/60',  text: 'text-red-300'  },
  complete:    { label: 'Complete',    bg: 'bg-green-900/60', text: 'text-green-300' },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status as Status] ?? STATUS_CONFIG.not_started;
  return (
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium shrink-0', cfg.bg, cfg.text)}>
      {cfg.label}
    </span>
  );
}

function fmtDate(d: string | null) {
  if (!d) return '';
  const [y, m, day] = d.split('-').map(Number);
  return new Date(y, m - 1, day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

type Props = {
  barrels: BarrelWithMilestones[];
  /** If provided, shows inline status dropdown on each row */
  onStatusChange?: (id: string, status: string) => void;
  /** If provided, shows "Flag for IDS" button on hover */
  onFlagForIDS?: (title: string) => void;
  /** Titles already flagged — shows "Flagged" indicator instead of button */
  flaggedTitles?: Set<string>;
  /** If provided, clicking a row calls this instead of nothing */
  onBarrelClick?: (barrel: BarrelWithMilestones) => void;
};

function BarrelGroup({
  label,
  items,
  onStatusChange,
  onFlagForIDS,
  flaggedTitles = new Set(),
  onBarrelClick,
}: {
  label: string;
  items: BarrelWithMilestones[];
} & Omit<Props, 'barrels'>) {
  return (
    <div>
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
            const flagTitle = `Barrel: ${barrel.title}`;

            return (
              <div
                key={barrel.id}
                onClick={() => onBarrelClick?.(barrel)}
                className={cn(
                  'flex items-center gap-4 px-4 py-3',
                  'group/row hover:bg-zinc-800/50 transition-colors',
                  idx < items.length - 1 && 'border-b border-zinc-800',
                  idx % 2 === 0 ? 'bg-[#111]' : 'bg-[#141414]',
                  onBarrelClick && 'cursor-pointer',
                )}
              >
                {/* Status badge */}
                <StatusBadge status={barrel.status} />

                {/* Title + quarter */}
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

                {/* Inline status dropdown (runner context) */}
                {onStatusChange && (
                  <select
                    value={barrel.status}
                    onChange={e => { e.stopPropagation(); onStatusChange(barrel.id, e.target.value); }}
                    onClick={e => e.stopPropagation()}
                    className="text-[11px] bg-transparent border border-green-900/30 rounded px-1 py-0.5 text-zinc-400 focus:outline-none focus:border-green-600 shrink-0"
                  >
                    {Object.entries(STATUS_CONFIG).map(([v, c]) => (
                      <option key={v} value={v}>{c.label}</option>
                    ))}
                  </select>
                )}

                {/* Flag for IDS (runner context) */}
                {onFlagForIDS && !flaggedTitles.has(flagTitle) && (
                  <button
                    onClick={e => { e.stopPropagation(); onFlagForIDS(flagTitle); }}
                    className="opacity-0 group-hover/row:opacity-100 text-[11px] text-yellow-600 hover:text-yellow-400 transition-all whitespace-nowrap shrink-0"
                  >
                    Flag
                  </button>
                )}
                {onFlagForIDS && flaggedTitles.has(flagTitle) && (
                  <span className="text-[11px] text-yellow-700 shrink-0">Flagged</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function BarrelsListView({ barrels, onStatusChange, onFlagForIDS, flaggedTitles, onBarrelClick }: Props) {
  const companyBarrels = barrels.filter(b => b.barrel_type === 'company');
  const individualBarrels = barrels.filter(b => b.barrel_type === 'individual');

  if (barrels.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-[#111] px-8 py-16 text-center">
        <p className="text-zinc-500 text-sm">No barrels set for this quarter.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <BarrelGroup
        label="Company Barrels"
        items={companyBarrels}
        onStatusChange={onStatusChange}
        onFlagForIDS={onFlagForIDS}
        flaggedTitles={flaggedTitles}
        onBarrelClick={onBarrelClick}
      />
      <BarrelGroup
        label="Individual Barrels"
        items={individualBarrels}
        onStatusChange={onStatusChange}
        onFlagForIDS={onFlagForIDS}
        flaggedTitles={flaggedTitles}
        onBarrelClick={onBarrelClick}
      />
    </div>
  );
}
