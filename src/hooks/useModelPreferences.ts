import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "colabs_model_preferences";

export type ModelPreferences = {
  favorites: string[];
  deprecated: string[];
};

function loadPreferences(): ModelPreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { favorites: [], deprecated: [] };
    const parsed = JSON.parse(raw) as unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      Array.isArray((parsed as ModelPreferences).favorites) &&
      Array.isArray((parsed as ModelPreferences).deprecated)
    ) {
      return {
        favorites: (parsed as ModelPreferences).favorites.filter((s) => typeof s === "string"),
        deprecated: (parsed as ModelPreferences).deprecated.filter((s) => typeof s === "string"),
      };
    }
  } catch {
    // ignore
  }
  return { favorites: [], deprecated: [] };
}

function savePreferences(prefs: ModelPreferences) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // ignore
  }
}

export function useModelPreferences() {
  const [prefs, setPrefs] = useState<ModelPreferences>(loadPreferences);

  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue) as ModelPreferences;
          setPrefs(parsed);
        } catch {
          // ignore
        }
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const toggleFavorite = useCallback((modelId: string) => {
    setPrefs((prev) => {
      const next = { ...prev };
      const idx = next.favorites.indexOf(modelId);
      if (idx >= 0) {
        next.favorites = next.favorites.filter((id) => id !== modelId);
      } else {
        next.favorites = [...next.favorites, modelId];
        next.deprecated = next.deprecated.filter((id) => id !== modelId);
      }
      savePreferences(next);
      return next;
    });
  }, []);

  const toggleDeprecated = useCallback((modelId: string) => {
    setPrefs((prev) => {
      const next = { ...prev };
      const idx = next.deprecated.indexOf(modelId);
      if (idx >= 0) {
        next.deprecated = next.deprecated.filter((id) => id !== modelId);
      } else {
        next.deprecated = [...next.deprecated, modelId];
        next.favorites = next.favorites.filter((id) => id !== modelId);
      }
      savePreferences(next);
      return next;
    });
  }, []);

  return {
    favorites: new Set(prefs.favorites),
    deprecated: new Set(prefs.deprecated),
    toggleFavorite,
    toggleDeprecated,
  };
}
