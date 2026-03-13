import { useAction } from "convex/react";
import { ChevronDown, Check } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "../../convex/_generated/api";
import { cn } from "@/lib/utils";

const DEFAULT_MODELS = [
  "stepfun/step-3.5-flash:free",
  "arcee-ai/trinity-large-preview:free",
  "nvidia/nemotron-3-nano-30b-a3b:free",
];

export type ModelSelectorProps = {
  value: [string, string, string];
  onChange: (models: [string, string, string]) => void;
  disabled?: boolean;
};

/**
 * Multi-select for exactly 3 free OpenRouter models.
 * Ensures 3 distinct models are always selected.
 */
export function ModelSelector({ value, onChange, disabled }: ModelSelectorProps) {
  const [models, setModels] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const getFreeModels = useAction(api.models.getFreeModels);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getFreeModels()
      .then((list) => {
        if (!cancelled) {
          setModels(list);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load models");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [getFreeModels]);

  const handleToggle = useCallback(
    (modelId: string) => {
      const selected = new Set(value);
      if (selected.has(modelId)) {
        if (selected.size <= 3) return;
        selected.delete(modelId);
      } else {
        if (selected.size >= 3) {
          selected.delete(value[0]);
        }
        selected.add(modelId);
      }
      const next = Array.from(selected) as [string, string, string];
      if (next.length === 3) {
        onChange(next);
      }
    },
    [value, onChange],
  );

  // Ensure we always have exactly 3 valid models
  const selected = value;
  const ensureThree = useCallback(() => {
    const freeIds = new Set(models.map((m) => m.id));
    const current = [...selected];
    for (let i = 0; i < 3; i++) {
      if (!current[i] || !freeIds.has(current[i])) {
        const fallback = DEFAULT_MODELS[i] ?? models[0]?.id ?? "";
        current[i] = freeIds.has(fallback) ? fallback : (models[i]?.id ?? "");
      }
    }
    if (
      current[0] !== selected[0] ||
      current[1] !== selected[1] ||
      current[2] !== selected[2]
    ) {
      onChange(current as [string, string, string]);
    }
  }, [models, selected, onChange]);

  useEffect(() => {
    if (models.length > 0) {
      ensureThree();
    }
  }, [models.length, ensureThree]);

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

  const selectedModels = value
    .map((id) => models.find((m) => m.id === id))
    .filter(Boolean) as { id: string; name: string }[];
  const displayText =
    selectedModels.length === 3
      ? selectedModels.map((m) => m.name).join(", ")
      : "Select 3 models";

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
      <span className="text-sm text-slate-600 shrink-0">Models:</span>
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
        <div className="absolute bottom-full left-0 z-50 mb-1 max-h-64 min-w-[220px] overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
          {models.map((m) => {
            const isSelected = value.includes(m.id);
            return (
              <button
                key={m.id}
                type="button"
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-slate-100",
                  isSelected && "bg-primary/5",
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
                <span className="truncate">{m.name}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
