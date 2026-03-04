import { useState } from "react";
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
import { Trash2, Pencil, Plus } from "lucide-react";

type TaskStatus = "todo" | "in_progress" | "done";

const COLUMNS: { id: TaskStatus; title: string }[] = [
  { id: "todo", title: "To Do" },
  { id: "in_progress", title: "In Progress" },
  { id: "done", title: "Done" },
];

function getTasksByStatus(
  tasks: Doc<"lifeManagementTasks">[],
  status: TaskStatus
) {
  return tasks
    .filter((t) => t.status === status)
    .sort((a, b) => a.order - b.order);
}

export function KanbanBoard() {
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [addTaskDialogOpen, setAddTaskDialogOpen] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<Id<"lifeManagementTasks"> | null>(null);
  const [editingTitle, setEditingTitle] = useState("");

  const tasks = useQuery(api.lifeManagement.listTasks) ?? [];
  const createTask = useMutation(api.lifeManagement.createTask);
  const updateTask = useMutation(api.lifeManagement.updateTask);
  const moveTask = useMutation(api.lifeManagement.moveTask);
  const deleteTask = useMutation(api.lifeManagement.deleteTask);

  const handleAddTask = async () => {
    const title = newTaskTitle.trim();
    if (!title) return;

    setNewTaskTitle("");
    setAddTaskDialogOpen(false);
    await createTask({ title, status: "todo" });
  };

  const handleStartEdit = (task: Doc<"lifeManagementTasks">) => {
    setEditingTaskId(task._id);
    setEditingTitle(task.title);
  };

  const handleSaveEdit = async () => {
    if (!editingTaskId) return;
    const title = editingTitle.trim();
    if (!title) {
      setEditingTaskId(null);
      return;
    }
    await updateTask({ taskId: editingTaskId, title });
    setEditingTaskId(null);
    setEditingTitle("");
  };

  const handleCancelEdit = () => {
    setEditingTaskId(null);
    setEditingTitle("");
  };

  const handleDragEnd = async (result: {
    destination: { droppableId: string; index: number } | null;
    source: { droppableId: string; index: number };
    draggableId: string;
  }) => {
    if (!result.destination) return;

    const taskId = result.draggableId as Id<"lifeManagementTasks">;
    const destinationStatus = result.destination.droppableId as TaskStatus;
    const destinationIndex = result.destination.index;

    await moveTask({
      taskId,
      destinationStatus,
      destinationIndex,
    });
  };

  const handleDelete = async (taskId: Id<"lifeManagementTasks">) => {
    await deleteTask({ taskId });
  };

  return (
    <>
      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-4">
          {COLUMNS.map((column) => (
            <KanbanColumn
              key={column.id}
              column={column}
              tasks={getTasksByStatus(tasks, column.id)}
              canAddTasks={column.id === "todo"}
              onOpenAddTaskDialog={() => setAddTaskDialogOpen(true)}
              onDeleteTask={handleDelete}
              editingTaskId={editingTaskId}
              editingTitle={editingTitle}
              onEditingTitleChange={setEditingTitle}
              onStartEdit={handleStartEdit}
              onSaveEdit={handleSaveEdit}
              onCancelEdit={handleCancelEdit}
            />
          ))}
        </div>
      </DragDropContext>
      <Dialog
        open={addTaskDialogOpen}
        onOpenChange={(open) => {
          setAddTaskDialogOpen(open);
          if (!open) setNewTaskTitle("");
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
              <label htmlFor="task-title" className="text-sm font-medium text-slate-700">
                Task title
              </label>
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
                rows={4}
                className="flex min-h-[100px] w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:border-primary disabled:cursor-not-allowed disabled:opacity-50 resize-y"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setAddTaskDialogOpen(false);
                setNewTaskTitle("");
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleAddTask}>Add task</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function KanbanColumn({
  column,
  tasks,
  canAddTasks,
  onOpenAddTaskDialog,
  onDeleteTask,
  editingTaskId,
  editingTitle,
  onEditingTitleChange,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
}: {
  column: { id: TaskStatus; title: string };
  tasks: Doc<"lifeManagementTasks">[];
  canAddTasks: boolean;
  onOpenAddTaskDialog: () => void;
  onDeleteTask: (id: Id<"lifeManagementTasks">) => void;
  editingTaskId: Id<"lifeManagementTasks"> | null;
  editingTitle: string;
  onEditingTitleChange: (value: string) => void;
  onStartEdit: (task: Doc<"lifeManagementTasks">) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
}) {
  return (
    <div className="flex-shrink-0 w-72 flex flex-col">
      <h3 className="font-semibold text-slate-700 mb-3">{column.title}</h3>
      <Droppable droppableId={column.id}>
        {(provided) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className="flex-1 min-h-[200px] rounded-lg bg-gray-50 border border-gray-200 p-2 space-y-2"
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
              <Draggable
                key={task._id}
                draggableId={task._id}
                index={index}
              >
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.draggableProps}
                    {...provided.dragHandleProps}
                  >
                    <Card
                      className={`cursor-grab active:cursor-grabbing ${
                        snapshot.isDragging ? "shadow-lg opacity-90" : ""
                      }`}
                    >
                      <CardContent className="p-3 flex items-center justify-between gap-2">
                        {editingTaskId === task._id ? (
                          <Input
                            value={editingTitle}
                            onChange={(e) => onEditingTitleChange(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") onSaveEdit();
                              if (e.key === "Escape") onCancelEdit();
                            }}
                            onBlur={onSaveEdit}
                            className="flex-1 h-8 text-sm"
                            autoFocus
                            onClick={(e) => e.stopPropagation()}
                          />
                        ) : (
                          <span className="text-sm flex-1 line-clamp-3 break-words">
                            {task.title}
                          </span>
                        )}
                        <div className="flex gap-0.5 flex-shrink-0">
                          {editingTaskId !== task._id && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-gray-500 hover:text-primary"
                              onClick={(e) => {
                                e.stopPropagation();
                                onStartEdit(task);
                              }}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          )}
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
