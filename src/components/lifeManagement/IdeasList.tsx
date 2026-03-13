import { useMutation, useQuery } from "convex/react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { GroupedDraggableList } from "./GroupedDraggableList";
import { ItemDialog } from "./ItemDialog";

export function IdeasList() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<"add" | "edit">("add");
  const [editingIdea, setEditingIdea] = useState<Doc<"lifeManagementIdeas"> | null>(null);

  const ideas = useQuery(api.lifeManagement.listIdeas) ?? [];
  const tags = useQuery(api.lifeManagement.listTags) ?? [];
  const addIdea = useMutation(api.lifeManagement.addIdea);
  const updateIdea = useMutation(api.lifeManagement.updateIdea);
  const removeIdea = useMutation(api.lifeManagement.removeIdea);
  const reorderIdeas = useMutation(api.lifeManagement.reorderIdeas);
  const createTag = useMutation(api.lifeManagement.createTag);

  const handleOpenAdd = () => {
    setDialogMode("add");
    setEditingIdea(null);
    setDialogOpen(true);
  };

  const handleOpenEdit = (idea: Doc<"lifeManagementIdeas">) => {
    setDialogMode("edit");
    setEditingIdea(idea);
    setDialogOpen(true);
  };

  const handleSave = async (content: string, tagIds: Id<"lifeManagementTags">[]) => {
    if (dialogMode === "add") {
      await addIdea({
        content,
        tagIds: tagIds.length > 0 ? tagIds : undefined,
      });
    } else if (editingIdea) {
      await updateIdea({
        ideaId: editingIdea._id,
        content,
        tagIds: tagIds.length > 0 ? tagIds : undefined,
      });
    }
  };

  const handleRemove = async (ideaId: Id<"lifeManagementIdeas">) => {
    await removeIdea({ ideaId });
  };

  const handleReorder = async (orderedIds: string[]) => {
    await reorderIdeas({ orderedIds: orderedIds as Id<"lifeManagementIdeas">[] });
  };

  const handleUpdateTagIds = async (itemId: string, tagIds: Id<"lifeManagementTags">[]) => {
    await updateIdea({
      ideaId: itemId as Id<"lifeManagementIdeas">,
      tagIds: tagIds.length > 0 ? tagIds : undefined,
    });
  };

  const handleCreateTag = async (name: string, color: string) => {
    await createTag({ name: name.trim(), color });
  };

  return (
    <div className="max-w-2xl">
      <div className="mb-4">
        <Button
          onClick={handleOpenAdd}
          variant="ghost"
          size="sm"
          className="text-slate-600 hover:text-slate-900 hover:bg-slate-100/50"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add idea
        </Button>
      </div>
      <GroupedDraggableList
        listId="ideas"
        items={ideas}
        tags={tags}
        onReorder={handleReorder}
        onUpdateItemTagIds={handleUpdateTagIds}
        renderItem={(idea, isDragging) => (
          <Card className={isDragging ? "ring-2 ring-primary/20" : undefined}>
            <CardContent className="p-3 flex items-center justify-between gap-2">
              <span className="text-sm flex-1 min-w-0">{idea.content}</span>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-slate-500 hover:text-slate-700"
                  onClick={() => handleOpenEdit(idea)}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-slate-500 hover:text-red-600"
                  onClick={() => handleRemove(idea._id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
        emptyMessage="No ideas recorded yet."
      />
      <ItemDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        mode={dialogMode}
        item={editingIdea}
        title={dialogMode === "add" ? "Add idea" : "Edit idea"}
        description={
          dialogMode === "add"
            ? "Capture an idea. You can assign it to a group."
            : "Update your idea. Changes are saved when you click Save."
        }
        placeholder="What's the idea?"
        submitLabel={dialogMode === "add" ? "Add idea" : "Save"}
        tags={tags}
        onCreateTag={handleCreateTag}
        onSave={handleSave}
      />
    </div>
  );
}
