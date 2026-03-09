import { useMutation, useQuery } from "convex/react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { GroupedDraggableList } from "./GroupedDraggableList";
import { ItemDialog } from "./ItemDialog";

export function PainsList() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<"add" | "edit">("add");
  const [editingPain, setEditingPain] = useState<Doc<"lifeManagementPains"> | null>(null);

  const pains = useQuery(api.lifeManagement.listPains) ?? [];
  const tags = useQuery(api.lifeManagement.listTags) ?? [];
  const addPain = useMutation(api.lifeManagement.addPain);
  const updatePain = useMutation(api.lifeManagement.updatePain);
  const removePain = useMutation(api.lifeManagement.removePain);
  const reorderPains = useMutation(api.lifeManagement.reorderPains);
  const createTag = useMutation(api.lifeManagement.createTag);

  const handleOpenAdd = () => {
    setDialogMode("add");
    setEditingPain(null);
    setDialogOpen(true);
  };

  const handleOpenEdit = (pain: Doc<"lifeManagementPains">) => {
    setDialogMode("edit");
    setEditingPain(pain);
    setDialogOpen(true);
  };

  const handleSave = async (content: string, tagIds: Id<"lifeManagementTags">[]) => {
    if (dialogMode === "add") {
      await addPain({
        content,
        tagIds: tagIds.length > 0 ? tagIds : undefined,
      });
    } else if (editingPain) {
      await updatePain({
        painId: editingPain._id,
        content,
        tagIds: tagIds.length > 0 ? tagIds : undefined,
      });
    }
  };

  const handleRemove = async (painId: Id<"lifeManagementPains">) => {
    await removePain({ painId });
  };

  const handleReorder = async (orderedIds: string[]) => {
    await reorderPains({ orderedIds: orderedIds as Id<"lifeManagementPains">[] });
  };

  const handleUpdateTagIds = async (itemId: string, tagIds: Id<"lifeManagementTags">[]) => {
    await updatePain({
      painId: itemId as Id<"lifeManagementPains">,
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
          Add pain
        </Button>
      </div>
      <GroupedDraggableList
        listId="pains"
        items={pains}
        tags={tags}
        onReorder={handleReorder}
        onUpdateItemTagIds={handleUpdateTagIds}
        renderItem={(pain, isDragging) => (
          <Card className={isDragging ? "ring-2 ring-primary/20" : undefined}>
            <CardContent className="p-3 flex items-center justify-between gap-2">
              <span className="text-sm flex-1 min-w-0">{pain.content}</span>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-slate-500 hover:text-slate-700"
                  onClick={() => handleOpenEdit(pain)}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-slate-500 hover:text-red-600"
                  onClick={() => handleRemove(pain._id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
        emptyMessage="No pains recorded yet."
      />
      <ItemDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        mode={dialogMode}
        item={editingPain}
        title={dialogMode === "add" ? "Add pain" : "Edit pain"}
        description={
          dialogMode === "add"
            ? "Capture a pain point. You can assign it to a group."
            : "Update your pain point. Changes are saved when you click Save."
        }
        placeholder="What's the pain point?"
        submitLabel={dialogMode === "add" ? "Add pain" : "Save"}
        tags={tags}
        onCreateTag={handleCreateTag}
        onSave={handleSave}
      />
    </div>
  );
}
