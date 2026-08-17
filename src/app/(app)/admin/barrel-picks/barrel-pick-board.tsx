'use client';

import { useState } from 'react';
import {
  type BarrelPick,
  type PipelineStage,
  PIPELINE_STAGES,
  updateBarrelPickStatus,
} from '@/app/actions/barrel-picks';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';
import { toast } from 'sonner';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import { useDroppable, useDraggable } from '@dnd-kit/core';

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
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const visibleStages = PIPELINE_STAGES.filter(s => s !== 'cancelled' || showCancelled);

  function handleDragStart(e: DragStartEvent) {
    setActiveId(e.active.id as string);
  }

  async function handleDragEnd(e: DragEndEvent) {
    setActiveId(null);
    if (!e.over) return;
    const pickId = e.active.id as string;
    const newStatus = e.over.id as PipelineStage;
    const pick = picks.find(p => p.id === pickId);
    if (!pick || pick.status === newStatus) return;

    try {
      await updateBarrelPickStatus(pickId, newStatus);
      toast.success(`Moved to ${STAGE_META[newStatus].label}`);
      onRefresh();
    } catch {
      toast.error('Failed to update status');
    }
  }

  const activePick = activeId ? picks.find(p => p.id === activeId) : null;

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

      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="flex gap-3 overflow-x-auto pb-4">
          {visibleStages.map(stage => (
            <Column
              key={stage}
              stage={stage}
              picks={picks.filter(p => p.status === stage)}
              onSelect={onSelect}
            />
          ))}
        </div>

        <DragOverlay>
          {activePick && <PickCard pick={activePick} isDragging />}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

function Column({
  stage,
  picks,
  onSelect,
}: {
  stage: PipelineStage;
  picks: BarrelPick[];
  onSelect: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  const meta = STAGE_META[stage];
  const total = picks.reduce((s, p) => s + Number(p.total_value ?? 0), 0);

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex-shrink-0 w-[260px] rounded-lg border p-2 transition-colors min-h-[400px]',
        meta.color,
        isOver && 'ring-2 ring-primary/50'
      )}
    >
      <div className="flex items-center justify-between mb-2 px-1">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider">{meta.label}</h3>
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{picks.length}</Badge>
        </div>
        {total > 0 && (
          <span className="text-[10px] text-muted-foreground font-medium">
            ${total.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </span>
        )}
      </div>
      <div className="space-y-2">
        {picks.map(p => (
          <DraggableCard key={p.id} pick={p} onSelect={onSelect} />
        ))}
      </div>
    </div>
  );
}

function DraggableCard({ pick, onSelect }: { pick: BarrelPick; onSelect: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: pick.id });

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={cn(isDragging && 'opacity-30')}
    >
      <PickCard pick={pick} onClick={() => onSelect(pick.id)} />
    </div>
  );
}

function PickCard({
  pick,
  isDragging,
  onClick,
}: {
  pick: BarrelPick;
  isDragging?: boolean;
  onClick?: () => void;
}) {
  return (
    <Card
      className={cn(
        'border-l-4 cursor-pointer hover:shadow-md transition-shadow p-3',
        BARREL_COLORS[pick.barrel_type] ?? 'border-l-gray-400',
        isDragging && 'shadow-lg rotate-2'
      )}
      onClick={onClick}
    >
      <p className="font-medium text-sm leading-tight">{pick.customer_name}</p>
      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
          {pick.barrel_type}
        </Badge>
        {pick.is_half_barrel && (
          <Badge variant="secondary" className="text-[10px] px-1 py-0">Half</Badge>
        )}
      </div>
      <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
        {pick.pick_date ? (
          <span>{format(parseISO(pick.pick_date), 'MMM d')}</span>
        ) : (
          <span className="italic">No date</span>
        )}
        <span className="font-medium text-foreground">
          ${Number(pick.total_value).toLocaleString(undefined, { maximumFractionDigits: 0 })}
        </span>
      </div>
      {pick.rep?.full_name && (
        <p className="text-[10px] text-muted-foreground mt-1 truncate">{pick.rep.full_name}</p>
      )}
    </Card>
  );
}
