'use client';

import type { ReactNode } from 'react';
import {
  DndContext, closestCenter, PointerSensor, TouchSensor, KeyboardSensor,
  useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, verticalListSortingStrategy, useSortable,
  sortableKeyboardCoordinates, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';

/**
 * Generic vertical drag-to-reorder list (desktop pointer + mobile touch +
 * keyboard). `renderItem` receives a drag-handle node to place wherever it wants
 * — only the handle initiates a drag, so buttons/inputs in the row still work.
 * `onReorder` is called with the full list of ids in their new order.
 */
export function SortableList<T extends { id: string }>({
  items, onReorder, renderItem, disabled = false,
}: {
  items: T[];
  onReorder: (orderedIds: string[]) => void;
  renderItem: (item: T, handle: ReactNode) => ReactNode;
  disabled?: boolean;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex(i => i.id === active.id);
    const newIndex = items.findIndex(i => i.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    onReorder(arrayMove(items, oldIndex, newIndex).map(i => i.id));
  }

  if (disabled) {
    return <>{items.map(item => <div key={item.id}>{renderItem(item, null)}</div>)}</>;
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={items.map(i => i.id)} strategy={verticalListSortingStrategy}>
        {items.map(item => (
          <SortableRow key={item.id} id={item.id}>
            {(handle) => renderItem(item, handle)}
          </SortableRow>
        ))}
      </SortableContext>
    </DndContext>
  );
}

function SortableRow({ id, children }: { id: string; children: (handle: ReactNode) => ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.85 : 1,
  };
  const handle = (
    <button
      type="button"
      {...attributes}
      {...listeners}
      aria-label="Drag to reorder"
      className="shrink-0 cursor-grab active:cursor-grabbing touch-none text-gray-300 hover:text-gray-500 transition-colors -ml-1"
    >
      <GripVertical className="w-4 h-4" />
    </button>
  );
  return (
    <div ref={setNodeRef} style={style}>
      {children(handle)}
    </div>
  );
}

/**
 * Given the full list and the new order of a (possibly filtered) visible subset,
 * produce the new full order: visible items take their new relative order while
 * hidden items keep their positions. Used so drag-reordering a filtered view
 * persists a coherent global sort_order.
 */
export function reorderFullFromSubset<T extends { id: string }>(full: T[], subsetNewIds: string[]): T[] {
  const subsetSet = new Set(subsetNewIds);
  const byId = new Map(full.map(f => [f.id, f]));
  let k = 0;
  return full.map(item => (subsetSet.has(item.id) ? byId.get(subsetNewIds[k++])! : item));
}
