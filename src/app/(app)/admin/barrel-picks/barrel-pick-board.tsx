'use client';

import { useState } from 'react';
import {
  type BarrelPick,
  type PipelineStage,
  PIPELINE_STAGES,
} from '@/app/actions/barrel-pick-constants';
import { updateBarrelPickStatus } from '@/app/actions/barrel-picks';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';
import { toast } from 'sonner';

const STAGE_META: Record<PipelineStage, { label: string; color: string }> = {
  prospect:           { label: 'Prospect',    color: 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-600' },
  scheduled:          { label: 'Scheduled',   color: 'bg-blue-50 dark:bg-blue-950 border-blue-300 dark:border-blue-700' },
  picked:             { label: 'Picked',      color: 'bg-amber-50 dark:bg-amber-950 border-amber-300 dark:border-amber-700' },
  in_production:      { label: 'In Production', color: 'bg-purple-50 dark:bg-purple-950 border-purple-300 dark:border-purple-700' },
  ready_for_delivery: { label: 'Ready',       color: 'bg-emerald-50 dark:bg-emerald-950 border-emerald-300 dark:border-emerald-700' },
  delivered:          { label: 'Delivered',    color: 'bg-teal-50 dark:bg-teal-950 border-teal-300 dark:border-teal-700' },
  completed:          { label: 'Completed',   color: 'bg-green-50 dark:bg-green-950 border-green-300 dark:border-green-700' },
  cancelled:          { label: 'Cancelled',   color: 'bg-red-50 dark:bg-red-950 border-red-300 dark:border-red-700' },
};

const BARREL_COLORS: Record<string, string> = {
  'Double Oaked':        'border-l-amber-500',
  'Double Double Oaked': 'border-l-orange-600',
  'Cigar Cask':          'border-l-rose-700',
  'Barrel Select':       'border-l-violet-600',
};

interface Props {
  picks: BarrelPick[];
  onRefresh: () => void;
  onSelect: (id: string) => void;
}

export function BarrelPickBoard({ picks, onRefresh, onSelect }: Props) {
  const [showCancelled, setShowCancelled] = useState(false);
  const [movingId, setMovingId] = useState<string | null>(null);

  const visibleStages = PIPELINE_STAGES.filter(s => s !== 'cancelled' || showCancelled);

  async function handleMove(pickId: string, newStatus: PipelineStage) {
    setMovingId(pickId);
    try {
      await updateBarrelPickStatus(pickId, newStatus);
      toast.success(`Moved to ${STAGE_META[newStatus].label}`);
      onRefresh();
    } catch {
      toast.error('Failed to update status');
    } finally {
      setMovingId(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button
          onClick={() => setShowCancelled(!showCancelled)}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {showCancelled ? 'Hide' : 'Show'} cancelled
        </button>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-4">
        {visibleStages.map(stage => {
          const stagePicks = picks.filter(p => p.status === stage);
          const total = stagePicks.filter(p => p.barrel_type !== 'TBD').reduce((s, p) => s + Number(p.total_value ?? 0), 0);
          const meta = STAGE_META[stage];
          const stageIdx = PIPELINE_STAGES.indexOf(stage);

          return (
            <div
              key={stage}
              className={cn(
                'flex-shrink-0 w-[260px] rounded-lg border p-2 min-h-[400px]',
                meta.color
              )}
            >
              <div className="flex items-center justify-between mb-2 px-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wider">{meta.label}</h3>
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{stagePicks.length}</Badge>
                </div>
                {total > 0 && (
                  <span className="text-[10px] text-muted-foreground font-medium">
                    ${total.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </span>
                )}
              </div>
              <div className="space-y-2">
                {stagePicks.map(p => {
                  const prevStage = stageIdx > 0 ? PIPELINE_STAGES[stageIdx - 1] : null;
                  const nextStage = stageIdx < PIPELINE_STAGES.length - 1 ? PIPELINE_STAGES[stageIdx + 1] : null;
                  const isMoving = movingId === p.id;

                  return (
                    <Card
                      key={p.id}
                      className={cn(
                        'border-l-4 cursor-pointer hover:shadow-md transition-shadow p-3',
                        (p.barrel_type && BARREL_COLORS[p.barrel_type]) ?? 'border-l-gray-400',
                        isMoving && 'opacity-50'
                      )}
                      onClick={() => onSelect(p.id)}
                    >
                      <p className="font-medium text-sm leading-tight">{p.customer_name}</p>
                      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                          {p.barrel_type ?? 'TBD'}
                        </Badge>
                        {p.is_half_barrel && (
                          <Badge variant="secondary" className="text-[10px] px-1 py-0">Half</Badge>
                        )}
                      </div>
                      <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
                        {p.pick_date ? (
                          <span>{format(parseISO(p.pick_date), 'MMM d')}</span>
                        ) : (
                          <span className="italic">No date</span>
                        )}
                        <span className="font-medium text-foreground">
                          {p.barrel_type === 'TBD'
                            ? 'TBD'
                            : p.total_value != null
                              ? `$${Number(p.total_value).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                              : '—'}
                        </span>
                      </div>
                      {p.rep?.full_name && (
                        <p className="text-[10px] text-muted-foreground mt-1 truncate">{p.rep.full_name}</p>
                      )}

                      {/* Quick move buttons */}
                      <div className="flex gap-1 mt-2 border-t pt-2" onClick={e => e.stopPropagation()}>
                        {prevStage && prevStage !== 'cancelled' && (
                          <button
                            disabled={isMoving}
                            onClick={() => handleMove(p.id, prevStage)}
                            className="text-[10px] px-1.5 py-0.5 rounded bg-muted hover:bg-muted/80 text-muted-foreground transition-colors"
                          >
                            &larr; {STAGE_META[prevStage].label}
                          </button>
                        )}
                        {nextStage && nextStage !== 'cancelled' && (
                          <button
                            disabled={isMoving}
                            onClick={() => handleMove(p.id, nextStage)}
                            className="text-[10px] px-1.5 py-0.5 rounded bg-muted hover:bg-muted/80 text-muted-foreground transition-colors ml-auto"
                          >
                            {STAGE_META[nextStage].label} &rarr;
                          </button>
                        )}
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
