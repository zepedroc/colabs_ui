import { Tag } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { CreateTagInput } from "./TagSelector";

type ItemWithContent = {
  _id: string;
  content: string;
  tagIds?: Id<"lifeManagementTags">[];
};

type ItemDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "add" | "edit";
  item: ItemWithContent | null;
  title: string;
  description: string;
  placeholder: string;
  submitLabel: string;
  tags: Doc<"lifeManagementTags">[];
  onCreateTag: (name: string, color: string) => Promise<void>;
  onSave: (content: string, tagIds: Id<"lifeManagementTags">[]) => Promise<void>;
};

export function ItemDialog({
  open,
  onOpenChange,
  mode,
  item,
  title,
  description,
  placeholder,
  submitLabel,
  tags,
  onCreateTag,
  onSave,
}: ItemDialogProps) {
  const [content, setContent] = useState("");
  const [selectedTagIds, setSelectedTagIds] = useState<Id<"lifeManagementTags">[]>([]);

  useEffect(() => {
    if (open) {
      if (mode === "edit" && item) {
        setContent(item.content);
        setSelectedTagIds(item.tagIds ?? []);
      } else {
        setContent("");
        setSelectedTagIds([]);
      }
    }
  }, [open, mode, item]);

  const handleSave = async () => {
    const trimmed = content.trim();
    if (!trimmed) return;

    await onSave(trimmed, selectedTagIds);
    onOpenChange(false);
  };

  const toggleTag = (tagId: Id<"lifeManagementTags">) => {
    setSelectedTagIds((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId],
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="item-content">Content</Label>
            <textarea
              id="item-content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSave();
                }
              }}
              placeholder={placeholder}
              rows={3}
              className="flex min-h-[80px] w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm transition-all placeholder:text-slate-400 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary focus-visible:border-primary disabled:cursor-not-allowed disabled:opacity-50 resize-y"
            />
          </div>
          <div className="grid gap-2">
            <Label className="flex items-center gap-2">
              <Tag className="h-4 w-4" />
              Group
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
                    backgroundColor: selectedTagIds.includes(tag._id)
                      ? tag.color
                      : `${tag.color}33`,
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
          <Button onClick={handleSave}>{submitLabel}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
