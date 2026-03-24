/** Short segment after the last slash (e.g. provider/model-id -> model-id). */
export function getModelShortName(modelId: string): string {
  return modelId.split("/").pop() ?? modelId;
}

/**
 * When OpenRouter resolves a route id (e.g. openrouter/free) to a concrete model,
 * show "free -> actual-model" using short names.
 */
export function formatRequestedToResolvedShort(
  requested: string | undefined,
  resolved: string | undefined,
): string {
  const req = requested ?? "Unknown";
  const shortReq = getModelShortName(req);
  if (!resolved || resolved === requested) return shortReq;
  return `${shortReq} -> ${getModelShortName(resolved)}`;
}
