/**
 * Labels for assistant messages when OpenRouter routes a requested id (e.g. openrouter/free)
 * to a concrete provider model.
 */
export function formatAssistantModelLabel(
  requested: string | undefined,
  resolved: string | undefined,
): string {
  const req = requested?.trim() || "unknown model";
  const res = resolved?.trim();
  if (!res || res === req) return req;
  return `${req} -> ${res}`;
}

export function shortModelId(id: string): string {
  return id.split("/").pop() ?? id;
}

export type LatestResolvedByRequested = Map<string, { resolved: string; at: number }>;

/** Keep the resolved id from the latest assistant message per requested model id. */
export function mergeLatestResolvedModel(
  map: LatestResolvedByRequested,
  requestedModel: string,
  resolvedModel: string,
  at: number,
): void {
  const prev = map.get(requestedModel);
  if (!prev || at >= prev.at) {
    map.set(requestedModel, { resolved: resolvedModel, at });
  }
}

/** Sidebar history line: show concrete model short names when routing resolved them. */
export function historyModelsLine(
  sortedModelIds: string[],
  resolvedByRequested: LatestResolvedByRequested,
  joiner: string,
): string {
  if (sortedModelIds.length === 0) return "";
  return sortedModelIds
    .map((id) => {
      const entry = resolvedByRequested.get(id);
      const idForDisplay = entry?.resolved ?? id;
      return shortModelId(idForDisplay);
    })
    .join(joiner);
}
