const CURSOR_AGENT_REPOSITORY = "https://github.com/zepedroc/colabs_ui";

function getEnv(name: string): string | undefined {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  return env?.[name]?.trim();
}

export function getCursorApiKey(): string {
  const key = getEnv("CURSOR_API_KEY");

  if (!key) {
    throw new Error(
      "Missing CURSOR_API_KEY in Convex environment. " +
        "Set CURSOR_API_KEY for the deployment used by `npx convex dev`.",
    );
  }

  return key;
}

export function getCursorRepository(): string {
  return CURSOR_AGENT_REPOSITORY;
}
