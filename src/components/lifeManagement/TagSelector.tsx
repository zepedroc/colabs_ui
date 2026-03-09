import { Tag } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Doc, Id } from "../../../convex/_generated/dataModel";

const DEFAULT_TAG_COLORS = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#14b8a6",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
];

export function CreateTagInput({
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
        className="h-9 w-9 rounded-lg border border-slate-200 cursor-pointer"
      />
      <Button type="button" variant="outline" size="sm" onClick={handleCreate}>
        Add
      </Button>
    </div>
  );
}

export function TagChips({
  tags,
  selectedTagIds,
  onToggle,
  label = "Tags",
}: {
  tags: Doc<"lifeManagementTags">[];
  selectedTagIds: Id<"lifeManagementTags">[];
  onToggle: (tagId: Id<"lifeManagementTags">) => void;
  label?: string;
}) {
  return (
    <div className="grid gap-2">
      <Label className="flex items-center gap-2">
        <Tag className="h-4 w-4" />
        {label}
      </Label>
      <div className="flex flex-wrap gap-2">
        {tags.map((tag) => (
          <button
            key={tag._id}
            type="button"
            onClick={() => onToggle(tag._id)}
            className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors ${
              selectedTagIds.includes(tag._id) ? "ring-2 ring-offset-1" : "opacity-60 hover:opacity-100"
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
    </div>
  );
}
