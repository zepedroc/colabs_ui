import { action } from "./_generated/server";
import { DEFAULT_COUNCIL_MODELS } from "./aiConfig";

const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";

export type FreeModel = {
  id: string;
  name: string;
};

/**
 * Fetch free models from OpenRouter API.
 * Free models have pricing.prompt === "0" and pricing.completion === "0".
 */
export const getFreeModels = action({
  args: {},
  handler: async (): Promise<FreeModel[]> => {
    const response = await fetch(OPENROUTER_MODELS_URL);
    if (!response.ok) {
      throw new Error(
        `Failed to fetch OpenRouter models: ${response.status} ${response.statusText}`,
      );
    }

    const data = (await response.json()) as {
      data?: Array<{
        id: string;
        name: string;
        created?: number;
        pricing?: { prompt?: string; completion?: string };
      }>;
    };
    const models = data.data ?? [];

    const free = models
      .filter((m) => m.pricing?.prompt === "0" && m.pricing?.completion === "0" && m.id && m.name)
      .sort((a, b) => (b.created ?? 0) - (a.created ?? 0));

    return free.map((m) => ({ id: m.id, name: m.name }));
  },
});

/**
 * Fetch free image-generation models from OpenRouter API.
 * Image models have "image" in architecture.output_modalities and all pricing fields set to "0".
 */
export const getFreeImageModels = action({
  args: {},
  handler: async (): Promise<FreeModel[]> => {
    const response = await fetch(OPENROUTER_MODELS_URL + '?output_modalities=image');
    if (!response.ok) {
      throw new Error(
        `Failed to fetch OpenRouter models: ${response.status} ${response.statusText}`,
      );
    }

    const data = (await response.json()) as {
      data?: Array<{
        id: string;
        name: string;
        created?: number;
        pricing?: Record<string, string | undefined>;
        architecture?: {
          output_modalities?: string[];
        };
      }>;
    };
    const models = data.data ?? [];

    const free = models
      .filter((m) => {
        if (!m.pricing || !m.id || !m.name) return false;
        // All pricing fields must be "0" (or absent)
        return Object.values(m.pricing).every((v) => v === "0" || v == null);
      })
      .sort((a, b) => (b.created ?? 0) - (a.created ?? 0));

    return free.map((m) => ({ id: m.id, name: m.name }));
  },
});

/**
 * Default models for the council (used when no selection is provided).
 */
export function getDefaultModels(): string[] {
  return [...DEFAULT_COUNCIL_MODELS];
}
