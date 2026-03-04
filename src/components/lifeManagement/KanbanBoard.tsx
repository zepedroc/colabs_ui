import { useState, useMemo, useEffect } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Trash2, Pencil, Plus, Tag, ArrowDown, Minus, ArrowUp, AlertTriangle } from "lucide-react";

type TaskStatus = "todo" | "in_progress" | "done";
type TaskPriority = "low" | "medium" | "high" | "urgent";

const COLUMNS: { id: TaskStatus; title: string }[] = [
  { id: "todo", title: "To Do" },
  { id: "in_progress", title: "In Progress" },
  { id: "done", title: "Done" },
];

const PRIORITY_ORDER: TaskPriority[] = ["low", "medium", "high", "urgent"];
const DEFAULT_PRIORITY: TaskPriority = "low";

const PRIORITY_CONFIG: Record<TaskPriority, { icon: React.ElementType; color: string }> = {
  low: { icon: ArrowDown, color: "#64748b" },
  medium: { icon: Minus, color: "#3b82f6" },
  high: { icon: ArrowUp, color: "#f97316" },
  urgent: { icon: AlertTriangle, color: "#ef4444" },
};

const DEFAULT_TAG_COLORS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e",
  "#14b8a6", "#3b82f6", "#8b5cf6", "#ec4899",
];

function CreateTagInput({
  onCreateTag,
}: {
  onCreateTag: (name: string, color: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(DEFAULT_TAG_COLORS[0]);

  const handleCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    await onCreateTag(trimmed, color);
    setName("");
    setColor(DEFAULT_TAG_COLORS[0]);
  };

  return (
    <div className="flex gap-2 mt-2">
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="New tag name"
        className="flex-1"
      />
      <input
        type="color"
        value={color}
        onChange={(e) => setColor(e.target.value)}
        className="h-9 w-9 rounded border cursor-pointer"
      />
      <Button type="button" variant="outline" size="sm" onClick={handleCreate}>
        Add
      </Button>
    </div>
  );
}

function getTasksByStatus(
  tasks: Doc<"lifeManagementTasks">[],
  status: TaskStatus
) {
  return tasks
    .filter((t) => t.status === status)
    .sort((a, b) => {
      const aPriority = a.priority ? PRIORITY_ORDER.indexOf(a.priority) : -1;
      const bPriority = b.priority ? PRIORITY_ORDER.indexOf(b.priority) : -1;
      if (aPriority !== bPriority) return bPriority - aPriority;
      return a.order - b.order;
    });
}

type OptimisticMove = {
  taskId: Id<"lifeManagementTasks">;
  sourceStatus: TaskStatus;
  destStatus: TaskStatus;
  destIndex: number;
};

export function KanbanBoard() {
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskDescription, setNewTaskDescription] = useState("");
  const [newTaskPriority, setNewTaskPriority] = useState<TaskPriority>(DEFAULT_PRIORITY);
  const [newTaskTagIds, setNewTaskTagIds] = useState<Id<"lifeManagementTags">[]>([]);
  const [addTaskDialogOpen, setAddTaskDialogOpen] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<Id<"lifeManagementTasks"> | null>(null);
  const [optimisticMove, setOptimisticMove] = useState<OptimisticMove | null>(null);

  const tasks = useQuery(api.lifeManagement.listTasks) ?? [];
  const tags = useQuery(api.lifeManagement.listTags) ?? [];
  const createTask = useMutation(api.lifeManagement.createTask);
  const updateTask = useMutation(api.lifeManagement.updateTask);
  const moveTask = useMutation(api.lifeManagement.moveTask);
  const deleteTask = useMutation(api.lifeManagement.deleteTask);
  const createTag = useMutation(api.lifeManagement.createTag);

  const displayedTasks = useMemo(() => {
    if (!optimisticMove) return tasks;
    const { taskId, sourceStatus, destStatus, destIndex } = optimisticMove;
    const task = tasks.find((t) => t._id === taskId);
    if (!task) return tasks;

    const movedTask = { ...task, status: destStatus };
    const otherTasks = tasks.filter(
      (t) => !(t._id === taskId && t.status === sourceStatus)
    );
    const sourceTasks = otherTasks.filter((t) => t.status === sourceStatus);
    const destTasks = otherTasks.filter((t) => t.status === destStatus);
    destTasks.splice(destIndex, 0, movedTask);

    return [
      ...otherTasks.filter((t) => t.status !== sourceStatus && t.status !== destStatus),
      ...sourceTasks,
      ...destTasks,
    ];
  }, [tasks, optimisticMove]);

  const handleAddTask = async () => {
    const title = newTaskTitle.trim();
    if (!title) return;

    setNewTaskTitle("");
    setNewTaskDescription("");
    setNewTaskPriority(DEFAULT_PRIORITY);
    setNewTaskTagIds([]);
    setAddTaskDialogOpen(false);
    await createTask({
      title,
      status: "todo",
      description: newTaskDescription.trim() || "",
      priority: newTaskPriority || DEFAULT_PRIORITY,
      tagIds: newTaskTagIds.length > 0 ? newTaskTagIds : undefined,
    });
  };

  const handleStartEdit = (task: Doc<"lifeManagementTasks">) => {
    setEditingTaskId(task._id);
  };

  const handleSaveEdit = async (updates: {
    title?: string;
    description?: string;
    priority?: TaskPriority | null;
    tagIds?: Id<"lifeManagementTags">[];
  }) => {
    if (!editingTaskId) return;
    const title = updates.title?.trim();
    if (title !== undefined && !title) {
      setEditingTaskId(null);
      return;
    }
    await updateTask({
      taskId: editingTaskId,
      ...(updates.title !== undefined && { title: updates.title }),
      ...(updates.description !== undefined && { description: updates.description }),
      ...(updates.priority !== undefined && { priority: updates.priority }),
      ...(updates.tagIds !== undefined && { tagIds: updates.tagIds }),
    });
    setEditingTaskId(null);
  };

  const handleCancelEdit = () => {
    setEditingTaskId(null);
  };

  const handleDragEnd = async (result: {
    destination: { droppableId: string; index: number } | null;
    source: { droppableId: string; index: number };
    draggableId: string;
  }) => {
    if (!result.destination) return;

    const taskId = result.draggableId as Id<"lifeManagementTasks">;
    const sourceStatus = result.source.droppableId as TaskStatus;
    const destinationStatus = result.destination.droppableId as TaskStatus;
    const destinationIndex = result.destination.index;

    if (sourceStatus === destinationStatus && result.source.index === destinationIndex) {
      return;
    }

    setOptimisticMove({
      taskId,
      sourceStatus,
      destStatus: destinationStatus,
      destIndex: destinationIndex,
    });

    try {
      await moveTask({
        taskId,
        destinationStatus,
        destinationIndex,
      });
    } finally {
      setOptimisticMove(null);
    }
  };

  const handleDelete = async (taskId: Id<"lifeManagementTasks">) => {
    await deleteTask({ taskId });
  };

  const handleCreateTag = async (name: string, color: string) => {
    await createTag({ name: name.trim(), color });
  };

  const editingTask = editingTaskId
    ? displayedTasks.find((t) => t._id === editingTaskId)
    : null;

  return (
    <>
      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-4">
          {COLUMNS.map((column) => (
            <KanbanColumn
              key={column.id}
              column={column}
              tasks={getTasksByStatus(displayedTasks, column.id)}
              tags={tags}
              canAddTasks={column.id === "todo"}
              onOpenAddTaskDialog={() => setAddTaskDialogOpen(true)}
              onDeleteTask={handleDelete}
              onOpenEditDialog={handleStartEdit}
            />
          ))}
        </div>
      </DragDropContext>

      <Dialog
        open={addTaskDialogOpen}
        onOpenChange={(open) => {
          setAddTaskDialogOpen(open);
          if (!open) {
            setNewTaskTitle("");
            setNewTaskDescription("");
            setNewTaskPriority(DEFAULT_PRIORITY);
            setNewTaskTagIds([]);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add task</DialogTitle>
            <DialogDescription>
              Enter a title for your new task. You can edit it later.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="task-title">Task title</Label>
              <textarea
                id="task-title"
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleAddTask();
                  }
                }}
                placeholder="What needs to be done?"
                rows={3}
                className="flex min-h-[80px] w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:border-primary disabled:cursor-not-allowed disabled:opacity-50 resize-y"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="task-description">Description</Label>
              <textarea
                id="task-description"
                value={newTaskDescription}
                onChange={(e) => setNewTaskDescription(e.target.value)}
                placeholder="Optional details..."
                rows={2}
                className="flex w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary resize-y"
              />
            </div>
            <div className="grid gap-2">
              <Label>Priority</Label>
              <Select value={newTaskPriority} onValueChange={(v) => setNewTaskPriority(v as TaskPriority)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select priority" />
                </SelectTrigger>
                <SelectContent className="bg-white">
                  {PRIORITY_ORDER.map((p) => {
                    const { icon: Icon, color } = PRIORITY_CONFIG[p];
                    return (
                      <SelectItem key={p} value={p}>
                        <span className="flex items-center gap-2">
                          <Icon className="h-4 w-4 shrink-0" style={{ color }} />
                          {p.charAt(0).toUpperCase() + p.slice(1)}
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label className="flex items-center gap-2">
                <Tag className="h-4 w-4" />
                Tags
              </Label>
              <div className="flex flex-wrap gap-2">
                {tags.map((tag) => (
                  <button
                    key={tag._id}
                    type="button"
                    onClick={() =>
                      setNewTaskTagIds((prev) =>
                        prev.includes(tag._id) ? prev.filter((x) => x !== tag._id) : [...prev, tag._id]
                      )
                    }
                    className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors ${
                      newTaskTagIds.includes(tag._id) ? "ring-2 ring-offset-1" : "opacity-60 hover:opacity-100"
                    }`}
                    style={{
                      backgroundColor: newTaskTagIds.includes(tag._id) ? tag.color : `${tag.color}33`,
                      borderColor: tag.color,
                      color: newTaskTagIds.includes(tag._id) ? "#fff" : tag.color,
                    }}
                  >
                    {tag.name}
                  </button>
                ))}
              </div>
              <CreateTagInput onCreateTag={handleCreateTag} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddTaskDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddTask}>Add task</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TaskEditDialog
        task={editingTask}
        tags={tags}
        open={!!editingTask}
        onOpenChange={(open) => !open && handleCancelEdit()}
        onSave={handleSaveEdit}
        onCreateTag={handleCreateTag}
      />
    </>
  );
}

function TaskEditDialog({
  task,
  tags,
  open,
  onOpenChange,
  onSave,
  onCreateTag,
}: {
  task: Doc<"lifeManagementTasks"> | null | undefined;
  tags: Doc<"lifeManagementTags">[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (updates: {
    title?: string;
    description?: string;
    priority?: TaskPriority | null;
    tagIds?: Id<"lifeManagementTags">[];
  }) => Promise<void>;
  onCreateTag: (name: string, color: string) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TaskPriority>(DEFAULT_PRIORITY);
  const [selectedTagIds, setSelectedTagIds] = useState<Id<"lifeManagementTags">[]>([]);

  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setDescription(task.description ?? "");
      setPriority((task.priority as TaskPriority) ?? DEFAULT_PRIORITY);
      setSelectedTagIds(task.tagIds ?? []);
    }
  }, [task?._id]);

  const handleSave = async () => {
    const t = title.trim();
    if (!t) return;
    await onSave({
      title: t,
      description: description.trim() || "",
      priority: priority || DEFAULT_PRIORITY,
      tagIds: selectedTagIds,
    });
    onOpenChange(false);
  };

  const toggleTag = (tagId: Id<"lifeManagementTags">) => {
    setSelectedTagIds((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit task</DialogTitle>
          <DialogDescription>
            Update task details. Changes are saved when you click Save.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="edit-title">Title</Label>
            <Input
              id="edit-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Task title"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="edit-description">Description</Label>
            <textarea
              id="edit-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional details..."
              rows={3}
              className="flex w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary resize-y"
            />
          </div>
          <div className="grid gap-2">
            <Label>Priority</Label>
            <Select value={priority} onValueChange={(v) => setPriority(v as TaskPriority)}>
              <SelectTrigger>
                <SelectValue placeholder="Select priority" />
              </SelectTrigger>
              <SelectContent className="bg-white">
                {PRIORITY_ORDER.map((p) => {
                  const { icon: Icon, color } = PRIORITY_CONFIG[p];
                  return (
                    <SelectItem key={p} value={p}>
                      <span className="flex items-center gap-2">
                        <Icon className="h-4 w-4 shrink-0" style={{ color }} />
                        {p.charAt(0).toUpperCase() + p.slice(1)}
                      </span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label className="flex items-center gap-2">
              <Tag className="h-4 w-4" />
              Tags
            </Label>
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => (
                <button
                  key={tag._id}
                  type="button"
                  onClick={() => toggleTag(tag._id)}
                  className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors ${
                    selectedTagIds.includes(tag._id)
                      ? "ring-2 ring-offset-1"
                      : "opacity-60 hover:opacity-100"
                  }`}
                  style={{
                    backgroundColor: selectedTagIds.includes(tag._id) ? tag.color : `${tag.color}33`,
                    borderColor: tag.color,
                    color: selectedTagIds.includes(tag._id) ? "#fff" : tag.color,
                  }}
                >
                  {tag.name}
                </button>
              ))}
            </div>
            <CreateTagInput onCreateTag={onCreateTag} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function KanbanColumn({
  column,
  tasks,
  tags,
  canAddTasks,
  onOpenAddTaskDialog,
  onDeleteTask,
  onOpenEditDialog,
}: {
  column: { id: TaskStatus; title: string };
  tasks: Doc<"lifeManagementTasks">[];
  tags: Doc<"lifeManagementTags">[];
  canAddTasks: boolean;
  onOpenAddTaskDialog: () => void;
  onDeleteTask: (id: Id<"lifeManagementTasks">) => void;
  onOpenEditDialog: (task: Doc<"lifeManagementTasks">) => void;
}) {
  const isDone = column.id === "done";

  return (
    <div className="flex-shrink-0 w-72 flex flex-col">
      <h3 className="font-semibold text-slate-700 mb-3">{column.title}</h3>
      <Droppable droppableId={column.id}>
        {(provided) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={`flex-1 min-h-[200px] rounded-lg border p-2 space-y-2 transition-colors ${
              isDone ? "bg-green-50/80 border-green-200" : "bg-gray-50 border-gray-200"
            }`}
          >
            {canAddTasks && (
              <div className="mb-2">
                <Button
                  onClick={onOpenAddTaskDialog}
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start text-slate-600 hover:text-slate-900"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add task
                </Button>
              </div>
            )}
            {tasks.map((task, index) => (
              <Draggable key={task._id} draggableId={task._id} index={index}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.draggableProps}
                    {...provided.dragHandleProps}
                  >
                    <Card
                      className={`cursor-grab active:cursor-grabbing transition-colors ${
                        snapshot.isDragging ? "shadow-lg opacity-90" : ""
                      } ${isDone ? "border-green-200 bg-green-50/50" : ""}`}
                    >
                      <CardContent className="p-3 flex flex-col gap-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            {task.priority && (
                              <span
                                className="flex items-center gap-1 text-[10px] font-medium uppercase mr-2"
                                style={{ color: PRIORITY_CONFIG[task.priority]?.color ?? "#64748b" }}
                              >
                                {(() => {
                                  const { icon: Icon } = PRIORITY_CONFIG[task.priority] ?? PRIORITY_CONFIG.low;
                                  return <Icon className="h-3 w-3 shrink-0" />;
                                })()}
                                {task.priority}
                              </span>
                            )}
                            <span className="text-sm line-clamp-2 break-words block">
                              {task.title}
                            </span>
                            {task.description && (
                              <p className="text-xs text-slate-500 line-clamp-2 mt-1">
                                {task.description}
                              </p>
                            )}
                          </div>
                          <div className="flex gap-0.5 flex-shrink-0">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-gray-500 hover:text-primary"
                              onClick={(e) => {
                                e.stopPropagation();
                                onOpenEditDialog(task);
                              }}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-gray-500 hover:text-red-600"
                              onClick={(e) => {
                                e.stopPropagation();
                                onDeleteTask(task._id);
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                        {task.tagIds && task.tagIds.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {task.tagIds.map((tagId) => {
                              const tag = tags.find((t) => t._id === tagId);
                              if (!tag) return null;
                              return (
                                <span
                                  key={tagId}
                                  className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium"
                                  style={{
                                    backgroundColor: `${tag.color}33`,
                                    color: tag.color,
                                    border: `1px solid ${tag.color}33`,
                                  }}
                                >
                                  {tag.name}
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                )}
              </Draggable>
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </div>
  );
}
