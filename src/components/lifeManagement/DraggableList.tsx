import type { DropResult } from "@hello-pangea/dnd";
import { DragDropContext, Draggable, Droppable } from "@hello-pangea/dnd";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";

const DROPPABLE_ID = "list";

export type DraggableListItem = {
  _id: string;
  [key: string]: unknown;
};

type DraggableListProps<T extends DraggableListItem> = {
  items: T[];
  onReorder: (orderedIds: string[]) => Promise<void>;
  renderItem: (item: T, isDragging: boolean) => React.ReactNode;
  emptyMessage: string;
  itemClassName?: string;
};

export function DraggableList<T extends DraggableListItem>({
  items,
  onReorder,
  renderItem,
  emptyMessage,
  itemClassName,
}: DraggableListProps<T>) {
  const [optimisticOrder, setOptimisticOrder] = useState<string[] | null>(null);

  const displayItems = useMemo(() => {
    if (!optimisticOrder || optimisticOrder.length !== items.length) {
      return items;
    }
    const byId = new Map(items.map((item) => [item._id, item]));
    const ordered = optimisticOrder
      .map((id) => byId.get(id))
      .filter((item): item is T => item != null);
    return ordered.length === items.length ? ordered : items;
  }, [items, optimisticOrder]);

  useEffect(() => {
    if (!optimisticOrder) return;
    const currentIds = items.map((i) => i._id);
    if (
      currentIds.length === optimisticOrder.length &&
      currentIds.every((id, i) => id === optimisticOrder[i])
    ) {
      setOptimisticOrder(null);
    }
  }, [items, optimisticOrder]);

  const handleDragEnd = async (result: DropResult) => {
    if (!result.destination || result.destination.index === result.source.index) {
      return;
    }

    const reordered = [...displayItems];
    const [removed] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, removed);
    const orderedIds = reordered.map((item) => item._id);

    setOptimisticOrder(orderedIds);
    await onReorder(orderedIds);
  };

  if (items.length === 0) {
    return <p className="text-sm text-slate-500 mt-4">{emptyMessage}</p>;
  }

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <Droppable droppableId={DROPPABLE_ID}>
        {(provided) => (
          <ul ref={provided.innerRef} {...provided.droppableProps} className="space-y-2">
            {displayItems.map((item, index) => (
              <Draggable key={item._id} draggableId={item._id} index={index}>
                {(provided, snapshot) => (
                  <li
                    ref={provided.innerRef}
                    {...provided.draggableProps}
                    {...provided.dragHandleProps}
                    className={cn(
                      "cursor-grab active:cursor-grabbing transition-shadow",
                      snapshot.isDragging && "opacity-90 shadow-lg",
                      itemClassName,
                    )}
                  >
                    {renderItem(item, snapshot.isDragging)}
                  </li>
                )}
              </Draggable>
            ))}
            {provided.placeholder}
          </ul>
        )}
      </Droppable>
    </DragDropContext>
  );
}
