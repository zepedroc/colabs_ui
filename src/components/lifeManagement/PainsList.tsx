import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Trash2 } from "lucide-react";

export function PainsList() {
  const [newPain, setNewPain] = useState("");

  const pains = useQuery(api.lifeManagement.listPains) ?? [];
  const addPain = useMutation(api.lifeManagement.addPain);
  const removePain = useMutation(api.lifeManagement.removePain);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const content = newPain.trim();
    if (!content) return;

    setNewPain("");
    await addPain({ content });
  };

  const handleRemove = async (painId: Id<"lifeManagementPains">) => {
    await removePain({ painId });
  };

  return (
    <div className="max-w-2xl">
      <form onSubmit={handleAdd} className="flex gap-2 mb-4">
        <Input
          value={newPain}
          onChange={(e) => setNewPain(e.target.value)}
          placeholder="Add a pain point..."
          className="flex-1"
        />
        <Button type="submit">Add</Button>
      </form>
      <ul className="space-y-2">
        {pains.map((pain) => (
          <li key={pain._id}>
            <Card>
              <CardContent className="p-3 flex items-center justify-between gap-2">
                <span className="text-sm">{pain.content}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 flex-shrink-0 text-gray-500 hover:text-red-600"
                  onClick={() => handleRemove(pain._id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
      {pains.length === 0 && (
        <p className="text-sm text-gray-500 mt-4">No pains recorded yet.</p>
      )}
    </div>
  );
}
