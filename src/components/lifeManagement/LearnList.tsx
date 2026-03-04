import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Trash2 } from "lucide-react";

export function LearnList() {
  const [newLearning, setNewLearning] = useState("");

  const learnings = useQuery(api.lifeManagement.listLearnings) ?? [];
  const addLearning = useMutation(api.lifeManagement.addLearning);
  const removeLearning = useMutation(api.lifeManagement.removeLearning);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const content = newLearning.trim();
    if (!content) return;

    setNewLearning("");
    await addLearning({ content });
  };

  const handleRemove = async (learningId: Id<"lifeManagementLearnings">) => {
    await removeLearning({ learningId });
  };

  return (
    <div className="max-w-2xl">
      <form onSubmit={handleAdd} className="flex gap-2 mb-4">
        <Input
          value={newLearning}
          onChange={(e) => setNewLearning(e.target.value)}
          placeholder="Add something to learn..."
          className="flex-1"
        />
        <Button type="submit">Add</Button>
      </form>
      <ul className="space-y-2">
        {learnings.map((learning) => (
          <li key={learning._id}>
            <Card>
              <CardContent className="p-3 flex items-center justify-between gap-2">
                <span className="text-sm">{learning.content}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 flex-shrink-0 text-gray-500 hover:text-red-600"
                  onClick={() => handleRemove(learning._id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
      {learnings.length === 0 && (
        <p className="text-sm text-gray-500 mt-4">Nothing to learn yet.</p>
      )}
    </div>
  );
}
