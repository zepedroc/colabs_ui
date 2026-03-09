import { useMutation, useQuery } from "convex/react";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { DraggableList } from "./DraggableList";

export function IdeasList() {
  const [newIdea, setNewIdea] = useState("");

  const ideas = useQuery(api.lifeManagement.listIdeas) ?? [];
  const addIdea = useMutation(api.lifeManagement.addIdea);
  const removeIdea = useMutation(api.lifeManagement.removeIdea);
  const reorderIdeas = useMutation(api.lifeManagement.reorderIdeas);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const content = newIdea.trim();
    if (!content) return;

    setNewIdea("");
    await addIdea({ content });
  };

  const handleRemove = async (ideaId: Id<"lifeManagementIdeas">) => {
    await removeIdea({ ideaId });
  };

  const handleReorder = async (orderedIds: string[]) => {
    await reorderIdeas({ orderedIds: orderedIds as Id<"lifeManagementIdeas">[] });
  };

  return (
    <div className="max-w-2xl">
      <form onSubmit={handleAdd} className="flex gap-2 mb-4">
        <Input
          value={newIdea}
          onChange={(e) => setNewIdea(e.target.value)}
          placeholder="Add an idea..."
          className="flex-1"
        />
        <Button type="submit">Add</Button>
      </form>
      <DraggableList
        items={ideas}
        onReorder={handleReorder}
        renderItem={(idea, isDragging) => (
          <Card className={isDragging ? "ring-2 ring-primary/20" : undefined}>
            <CardContent className="p-3 flex items-center justify-between gap-2">
              <span className="text-sm">{idea.content}</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 text-slate-500 hover:text-red-600"
                onClick={() => handleRemove(idea._id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        )}
        emptyMessage="No ideas recorded yet."
      />
    </div>
  );
}
