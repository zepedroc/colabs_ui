import { useAction } from "convex/react";
import { useEffect, useState } from "react";
import { api } from "../../convex/_generated/api";

export type FreeModel = {
  id: string;
  name: string;
};

const STORAGE_KEY = "colabs_free_models_cache";

function getToday(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

type CachedModels = {
  models: FreeModel[];
  cachedAt: string;
};

function loadCachedModels(): FreeModel[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      Array.isArray((parsed as CachedModels).models) &&
      typeof (parsed as CachedModels).cachedAt === "string"
    ) {
      const { models, cachedAt } = parsed as CachedModels;
      if (cachedAt === getToday() && models.length > 0) {
        return models.filter(
          (m): m is FreeModel => m && typeof m.id === "string" && typeof m.name === "string",
        );
      }
    }
  } catch {
    // ignore
  }
  return null;
}

function saveCachedModels(models: FreeModel[]) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ models, cachedAt: getToday() } satisfies CachedModels),
    );
  } catch {
    // ignore
  }
}

export function useFreeModels() {
  const [models, setModels] = useState<FreeModel[]>(() => loadCachedModels() ?? []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const getFreeModels = useAction(api.models.getFreeModels);

  useEffect(() => {
    const cached = loadCachedModels();
    if (cached !== null && cached.length > 0) {
      setModels(cached);
      setLoading(false);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    getFreeModels()
      .then((list) => {
        if (!cancelled) {
          setModels(list);
          saveCachedModels(list);
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

  return { models, loading, error };
}
