import type { Doc } from "../../convex/_generated/dataModel";

export function formatTokens(msg: Doc<"chatMessages">): string {
  const totalTokens =
    msg.totalTokens ??
    ((msg.promptTokens ?? msg.usagePromptTokens) !== undefined &&
    (msg.completionTokens ?? msg.usageCompletionTokens) !== undefined
      ? (msg.promptTokens ?? msg.usagePromptTokens ?? 0) +
        (msg.completionTokens ?? msg.usageCompletionTokens ?? 0)
      : undefined);
  return totalTokens !== undefined ? totalTokens.toLocaleString() : "-";
}

export function formatCost(costUsd: number | undefined): string {
  if (costUsd === undefined) return "-";
  return `$${costUsd.toFixed(2)}`;
}

export function formatLatency(latencyMs: number | undefined): string {
  if (latencyMs === undefined) return "-";
  if (latencyMs >= 1000) return `${(latencyMs / 1000).toFixed(2)} s`;
  return `${Math.round(latencyMs)} ms`;
}

export function getMessageLatency(msg: Doc<"chatMessages">): number | undefined {
  return msg.latencyMs ?? msg.responseTimeMs;
}
