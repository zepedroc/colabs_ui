/**
 * OpenRouter API key from Convex environment.
 */

export function getOpenRouterApiKey(): string {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } })
    .process?.env;
  const key = env?.OPENROUTER_API_KEY?.trim();

  if (!key) {
    throw new Error(
      "Missing OPENROUTER_API_KEY in Convex environment. " +
        "Set OPENROUTER_API_KEY in your Convex dashboard (Settings > Environment Variables)."
    );
  }

  return key;
}
