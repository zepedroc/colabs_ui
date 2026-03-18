import type { DropResult } from "@hello-pangea/dnd";
import { DragDropContext, Draggable, Droppable } from "@hello-pangea/dnd";
import { ChevronDown } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { Doc, Id } from "../../../convex/_generated/dataModel";

const UNTAGGED_GROUP_ID = "__untagged__";
const UNTAGGED_GROUP_COLOR = "#94a3b8";
const GROUP_COLLAPSE_ANIMATION_MS = 260;

type TaggedItem = {
  _id: string;
  content: string;
  order?: number;
  tagIds?: Id<"lifeManagementTags">[];
};

type ItemGroup = {
  id: Id<"lifeManagementTags"> | typeof UNTAGGED_GROUP_ID;
  title: string;
  color: string;
  items: TaggedItem[];
};

function getPrimaryTag(
  item: TaggedItem,
  tagsById: Map<Id<"lifeManagementTags">, Doc<"lifeManagementTags">>,
) {
  if (!item.tagIds?.length) return null;
  return item.tagIds
    .map((tagId) => tagsById.get(tagId))
    .find((tag): tag is Doc<"lifeManagementTags"> => Boolean(tag));
}

function groupByPrimaryTag(
  items: TaggedItem[],
  tagsById: Map<Id<"lifeManagementTags">, Doc<"lifeManagementTags">>,
): ItemGroup[] {
  const groups = new Map<ItemGroup["id"], ItemGroup>();

  for (const item of items) {
    const primaryTag = getPrimaryTag(item, tagsById);
    const groupId = primaryTag?._id ?? UNTAGGED_GROUP_ID;

    if (!groups.has(groupId)) {
      groups.set(groupId, {
        id: groupId,
        title: primaryTag?.name ?? "General",
        color: primaryTag?.color ?? UNTAGGED_GROUP_COLOR,
        items: [],
      });
    }

    groups.get(groupId)?.items.push(item);
  }

  return Array.from(groups.values());
}

type GroupedDraggableListProps<T extends TaggedItem> = {
  listId: string;
  items: T[];
  tags: Doc<"lifeManagementTags">[];
  onReorder: (orderedIds: string[]) => Promise<void>;
  onUpdateItemTagIds?: (itemId: string, tagIds: Id<"lifeManagementTags">[]) => Promise<void>;
  renderItem: (item: T, isDragging: boolean) => React.ReactNode;
  emptyMessage: string;
  itemClassName?: string;
};

export function GroupedDraggableList<T extends TaggedItem>({
  listId,
  items,
  tags,
  onReorder,
  onUpdateItemTagIds,
  renderItem,
  emptyMessage,
  itemClassName,
}: GroupedDraggableListProps<T>) {
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [collapsingGroups, setCollapsingGroups] = useState<Record<string, boolean>>({});
  const collapseTimeoutRef = useRef<Record<string, ReturnType<typeof window.setTimeout>>>({});

  const tagsById = useMemo(() => new Map(tags.map((tag) => [tag._id, tag] as const)), [tags]);
  const groupedItems = useMemo(() => groupByPrimaryTag(items, tagsById), [items, tagsById]);

  const toggleGroup = (groupId: ItemGroup["id"]) => {
    const groupKey = `${listId}:${groupId}`;

    setCollapsedGroups((prev) => {
      const willCollapse = !prev[groupKey];

      if (willCollapse) {
        setCollapsingGroups((active) => ({ ...active, [groupKey]: true }));
        if (collapseTimeoutRef.current[groupKey]) {
          window.clearTimeout(collapseTimeoutRef.current[groupKey]);
        }
        collapseTimeoutRef.current[groupKey] = window.setTimeout(() => {
          setCollapsingGroups((active) => {
            if (!active[groupKey]) return active;
            const next = { ...active };
            delete next[groupKey];
            return next;
          });
          delete collapseTimeoutRef.current[groupKey];
        }, GROUP_COLLAPSE_ANIMATION_MS);
      } else {
        if (collapseTimeoutRef.current[groupKey]) {
          window.clearTimeout(collapseTimeoutRef.current[groupKey]);
          delete collapseTimeoutRef.current[groupKey];
        }
        setCollapsingGroups((active) => {
          if (!active[groupKey]) return active;
          const next = { ...active };
          delete next[groupKey];
          return next;
        });
      }

      return { ...prev, [groupKey]: willCollapse };
    });
  };

  const buildOrderedIds = (groups: ItemGroup[]) => {
    return groups.flatMap((g) => g.items.map((i) => i._id));
  };

  const handleDragEnd = async (result: DropResult) => {
    const dest = result.destination;
    if (!dest) return;

    const sourceGroupId = result.source.droppableId.replace(`${listId}-`, "");
    const destGroupId = dest.droppableId.replace(`${listId}-`, "");
    const sourceIndex = result.source.index;
    const destIndex = dest.index;

    if (sourceGroupId === destGroupId && sourceIndex === destIndex) return;

    const sourceGroup = groupedItems.find((g) => `${listId}-${g.id}` === result.source.droppableId);
    const destGroup = groupedItems.find((g) => `${listId}-${g.id}` === dest.droppableId);
    if (!sourceGroup || !destGroup) return;

    const movedItem = sourceGroup.items[sourceIndex];
    if (!movedItem) return;

    const newGroups = groupedItems.map((group) => ({ ...group, items: [...group.items] }));

    const srcGroup = newGroups.find((g) => g.id === sourceGroup.id);
    const dstGroup = newGroups.find((g) => g.id === destGroup.id);
    if (!srcGroup || !dstGroup) return;

    srcGroup.items.splice(sourceIndex, 1);
    dstGroup.items.splice(destIndex, 0, movedItem);

    const movedToNewGroup = sourceGroupId !== destGroupId;
    if (movedToNewGroup && onUpdateItemTagIds && destGroupId !== UNTAGGED_GROUP_ID) {
      const newTagIds = [destGroupId as Id<"lifeManagementTags">];
      await onUpdateItemTagIds(movedItem._id, newTagIds);
    } else if (movedToNewGroup && onUpdateItemTagIds && destGroupId === UNTAGGED_GROUP_ID) {
      await onUpdateItemTagIds(movedItem._id, []);
    }

    const orderedIds = buildOrderedIds(newGroups);
    await onReorder(orderedIds);
  };

  if (items.length === 0) {
    return <p className="text-sm text-slate-500 mt-4">{emptyMessage}</p>;
  }

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="space-y-3">
        {groupedItems.map((group) => {
          const groupKey = `${listId}:${group.id}`;
          const isCollapsed = collapsedGroups[groupKey] ?? false;
          const isAnimatingClosed = collapsingGroups[groupKey] ?? false;
          const shouldRenderItems = !isCollapsed || isAnimatingClosed;
          const droppableId = `${listId}-${group.id}`;

          return (
            <section
              key={groupKey}
              className="rounded-2xl border shadow-sm"
              style={{
                borderColor: `${group.color}30`,
                background: `linear-gradient(180deg, ${group.color}14 0%, rgba(255,255,255,0.97) 62%)`,
              }}
            >
              <button
                type="button"
                className="flex w-full items-center gap-3 px-3.5 py-3 text-left transition hover:bg-white/35"
                onClick={() => toggleGroup(group.id)}
                aria-expanded={!isCollapsed}
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full shadow-[0_0_0_4px_rgba(255,255,255,0.9)]"
                  style={{ backgroundColor: group.color }}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold text-slate-800">
                      {group.title}
                    </span>
                    <span className="rounded-full bg-white/85 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                      {group.items.length}
                    </span>
                  </div>
                </div>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 shrink-0 text-slate-400 transition-transform duration-300",
                    !isCollapsed && "rotate-180",
                  )}
                />
              </button>

              <div
                className="grid overflow-hidden transition-[grid-template-rows,opacity] duration-[260ms] ease-[cubic-bezier(0.22,1,0.36,1)] will-change-[grid-template-rows,opacity]"
                aria-hidden={isCollapsed}
                style={{
                  gridTemplateRows: isCollapsed ? "0fr" : "1fr",
                  opacity: isCollapsed ? 0.72 : 1,
                }}
              >
                <div className="overflow-hidden">
                  <Droppable droppableId={droppableId}>
                    {(provided) => (
                      <ul
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className="space-y-2 px-3 pb-3"
                      >
                        {shouldRenderItems &&
                          group.items.map((item, index) => (
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
                                  {renderItem(item as T, snapshot.isDragging)}
                                </li>
                              )}
                            </Draggable>
                          ))}
                        {provided.placeholder}
                      </ul>
                    )}
                  </Droppable>
                </div>
              </div>
            </section>
          );
        })}
      </div>
    </DragDropContext>
  );
}
