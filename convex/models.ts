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

    const data = (await response.json()) as { data?: Array<{ id: string; name: string; pricing?: { prompt?: string; completion?: string } }> };
    const models = data.data ?? [];

    const free = models.filter(
      (m) =>
        m.pricing?.prompt === "0" && m.pricing?.completion === "0" && m.id && m.name,
    );

    return free.map((m) => ({ id: m.id, name: m.name })).sort((a, b) => a.name.localeCompare(b.name));
  },
});

/**
 * Default models for the council (used when no selection is provided).
 */
export function getDefaultModels(): string[] {
  return [...DEFAULT_COUNCIL_MODELS];
}
