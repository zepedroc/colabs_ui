/**
 * Default AI models and config helpers.
 */

export const DEFAULT_COUNCIL_MODELS = [
  "stepfun/step-3.5-flash:free",
  "arcee-ai/trinity-large-preview:free",
  "nvidia/nemotron-3-nano-30b-a3b:free",
];

/**
 * Get council models from env or defaults.
 * COUNCIL_MODELS: JSON array or comma-separated string.
 */
export function getCouncilModels(): string[] {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
    ?.env;
  const raw = env?.COUNCIL_MODELS?.trim();
  if (!raw) {
    return [...DEFAULT_COUNCIL_MODELS];
  }
  if (raw.startsWith("[")) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed) && parsed.every((x) => typeof x === "string")) {
        return parsed as string[];
      }
    } catch {
      // fall through to default
    }
  }
  const models = raw
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  return models.length > 0 ? models : [...DEFAULT_COUNCIL_MODELS];
}
