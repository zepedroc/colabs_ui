import { Ban, Check, ChevronDown, Star } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { FreeModel } from "@/hooks/useFreeModels";
import { useFreeModels } from "@/hooks/useFreeModels";
import { useModelPreferences } from "@/hooks/useModelPreferences";
import { cn } from "@/lib/utils";

const DEFAULT_MODELS = [
  "stepfun/step-3.5-flash:free",
  "arcee-ai/trinity-large-preview:free",
  "nvidia/nemotron-3-nano-30b-a3b:free",
];

export type ModelSelectorPropsBase = {
  disabled?: boolean;
  /** When "down", dropdown opens below the button. Default "up" opens above. */
  dropdownPosition?: "up" | "down";
  /** Override the internally-fetched models list. When provided, the hook is bypassed. */
  externalModels?: { models: FreeModel[]; loading: boolean; error: string | null };
};

export type SingleModelSelectorProps = {
  value: string;
  onChange: (model: string) => void;
  disabled?: boolean;
  label?: string;
};

export type ModelSelectorProps2 = ModelSelectorPropsBase & {
  count: 2;
  value: [string, string];
  onChange: (models: [string, string]) => void;
};

export type ModelSelectorProps3 = ModelSelectorPropsBase & {
  count?: 3;
  value: [string, string, string];
  onChange: (models: [string, string, string]) => void;
};

export type ModelSelectorProps = ModelSelectorProps2 | ModelSelectorProps3;

/**
 * Multi-select for exactly 2 or 3 free OpenRouter models.
 * Ensures the target count of distinct models are always selected.
 */
export function ModelSelector({
  value,
  onChange,
  disabled,
  dropdownPosition = "up",
  count = 3,
  externalModels,
}: ModelSelectorProps) {
  const targetCount = count;
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const internal = useFreeModels();
  const { models, loading, error } = externalModels ?? internal;
  const { favorites, deprecated, toggleFavorite, toggleDeprecated } = useModelPreferences();

  const handleToggle = useCallback(
    (modelId: string) => {
      const selected = new Set(value);
      if (selected.has(modelId)) {
        if (selected.size <= targetCount) return;
        selected.delete(modelId);
      } else {
        if (selected.size >= targetCount) {
          selected.delete(value[0]);
        }
        selected.add(modelId);
      }
      const next = Array.from(selected);
      if (next.length === targetCount) {
        (onChange as (models: string[]) => void)(next);
      }
    },
    [value, onChange, targetCount],
  );

  // Ensure we always have exactly targetCount valid models
  const selected = value;
  const ensureCount = useCallback(() => {
    const freeIds = new Set(models.map((m) => m.id));
    const current = [...selected];
    for (let i = 0; i < targetCount; i++) {
      if (!current[i] || !freeIds.has(current[i])) {
        const fallback = DEFAULT_MODELS[i] ?? models[0]?.id ?? "";
        current[i] = freeIds.has(fallback) ? fallback : (models[i]?.id ?? "");
      }
    }
    const changed = current.some((c, i) => c !== selected[i]);
    if (changed) {
      (onChange as (models: string[]) => void)(current);
    }
  }, [models, selected, onChange, targetCount]);

  useEffect(() => {
    if (models.length > 0) {
      ensureCount();
    }
  }, [models.length, ensureCount]);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const selectedModels = value.map((id) => models.find((m) => m.id === id)).filter(Boolean) as {
    id: string;
    name: string;
  }[];
  const displayText =
    selectedModels.length === targetCount
      ? selectedModels.map((m) => m.name).join(", ")
      : `Select ${targetCount} models`;

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-primary" />
        Loading models...
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-sm text-red-600" title={error}>
        Could not load models. Using defaults.
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative flex items-center gap-2 shrink-0">
      <Button
        type="button"
        variant="outline"
        size="default"
        className="h-11 min-w-[200px] max-w-[320px] justify-between gap-2 text-left font-normal"
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled || models.length === 0}
      >
        <span className="truncate" title={displayText}>
          {displayText}
        </span>
        <ChevronDown
          className={cn("h-4 w-4 shrink-0 opacity-50 transition-transform", open && "rotate-180")}
        />
      </Button>
      {open && (
        <div
          className={cn(
            "absolute left-0 z-50 max-h-64 min-w-[280px] overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg",
            dropdownPosition === "down" ? "top-full mt-1" : "bottom-full mb-1",
          )}
        >
          {models.map((m) => {
            const isSelected = value.includes(m.id);
            const isFavorite = favorites.has(m.id);
            const isDeprecated = deprecated.has(m.id);
            return (
              <div key={m.id} className="group relative">
                <button
                  type="button"
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-slate-100",
                    isSelected && "bg-primary/5",
                    isFavorite && "bg-amber-50/80",
                    isDeprecated && "opacity-60",
                  )}
                  onClick={() => handleToggle(m.id)}
                >
                  <span
                    className={cn(
                      "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                      isSelected ? "border-primary bg-primary text-white" : "border-slate-300",
                    )}
                  >
                    {isSelected ? <Check className="h-3 w-3" /> : null}
                  </span>
                  <span
                    className={cn(
                      "truncate flex-1",
                      isDeprecated && "line-through text-slate-500",
                      isFavorite && "text-amber-800 font-medium",
                    )}
                  >
                    {m.name}
                  </span>
                </button>
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5 rounded-md border border-slate-200 bg-white px-1.5 py-0.5 shadow-md opacity-0 transition-opacity group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto">
                  <button
                    type="button"
                    title={isFavorite ? "Remove from favorites" : "Add to favorites"}
                    className={cn(
                      "rounded p-1 transition-colors hover:bg-amber-100",
                      isFavorite && "text-amber-600",
                    )}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      toggleFavorite(m.id);
                    }}
                  >
                    <Star className={cn("h-3.5 w-3.5", isFavorite && "fill-amber-500")} />
                  </button>
                  <button
                    type="button"
                    title={isDeprecated ? "Remove deprecated" : "Mark as deprecated"}
                    className={cn(
                      "rounded p-1 transition-colors hover:bg-slate-100",
                      isDeprecated && "text-slate-600",
                    )}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      toggleDeprecated(m.id);
                    }}
                  >
                    <Ban className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function SingleModelSelector({
  value,
  onChange,
  disabled,
  label = "Orchestrator:",
}: SingleModelSelectorProps) {
  const { models, loading, error } = useFreeModels();

  useEffect(() => {
    if (models.length === 0) return;
    const selectedExists = models.some((m) => m.id === value);
    if (!selectedExists) {
      onChange(models[0]?.id ?? DEFAULT_MODELS[0]);
    }
  }, [models, value, onChange]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-primary" />
        Loading orchestrator...
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 shrink-0 text-sm text-slate-600">
      <span>{label}</span>
      <Select value={value} onValueChange={onChange} disabled={disabled || models.length === 0}>
        <SelectTrigger
          className="h-11 w-[280px] shrink-0"
          title={error ?? undefined}
          aria-label="Select orchestrator model"
        >
          <SelectValue placeholder="Select orchestrator model" />
        </SelectTrigger>
        <SelectContent>
          {models.map((model) => (
            <SelectItem key={model.id} value={model.id}>
              {model.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
