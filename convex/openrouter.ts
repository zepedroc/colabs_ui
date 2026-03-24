/**
 * OpenRouter API client for LLM Council.
 * Uses fetch for Convex compatibility.
 */

import { type ChartSpec, executeTool, type ToolResult } from "./agentTools";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
const MAX_ATTEMPTS = 3;
const INITIAL_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 8000;
const JITTER_MS = 250;
const RETRYABLE_STATUS_CODES = new Set([408, 500, 502, 503, 504]);

export class OpenRouterRequestError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number | null,
    public readonly retryable: boolean,
    public readonly category: string,
  ) {
    super(message);
    this.name = "OpenRouterRequestError";
  }
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

type ResponseMetricsBase = {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  costUsd?: number;
};

export interface ResponseMetrics extends ResponseMetricsBase {
  latencyMs: number;
}

function shorten(value: string, maxLen = 320): string {
  const flattened = value.replace(/\s+/g, " ").trim();
  if (flattened.length <= maxLen) return flattened;
  return `${flattened.slice(0, maxLen)}...`;
}

function extractErrorFromBody(body: string | null): {
  message: string | null;
  providerName: string | null;
} {
  if (!body) return { message: null, providerName: null };
  try {
    const payload = JSON.parse(body) as Record<string, unknown>;
    const error = payload?.error as Record<string, unknown> | undefined;
    if (!error || typeof error !== "object") return { message: null, providerName: null };
    const message = typeof error.message === "string" ? error.message : null;
    const metadata = error.metadata as Record<string, unknown> | undefined;
    const providerName =
      metadata && typeof metadata.provider_name === "string" ? metadata.provider_name : null;
    return { message, providerName };
  } catch {
    return { message: null, providerName: null };
  }
}

function buildUserMessage(
  statusCode: number | null,
  detail: string,
  providerName: string | null,
): string {
  const suffix = providerName ? ` (provider: ${providerName})` : "";
  const safeDetail = detail ? shorten(detail) : "Unknown error from OpenRouter.";

  if (statusCode === 400) return `OpenRouter rejected the request (400 Bad Request): ${safeDetail}`;
  if (statusCode === 401)
    return "OpenRouter authentication failed (401 Unauthorized). Check OPENROUTER_API_KEY.";
  if (statusCode === 402)
    return "OpenRouter request failed due to insufficient credits (402 Payment Required).";
  if (statusCode === 403)
    return `OpenRouter blocked the request (403 Forbidden), likely moderation-related${suffix}: ${safeDetail}`;
  if (statusCode === 404)
    return `OpenRouter resource/model not found (404 Not Found): ${safeDetail}`;
  if (statusCode === 408)
    return `OpenRouter timed out (408 Request Timeout)${suffix}: ${safeDetail}`;
  if (statusCode === 422)
    return `OpenRouter could not process the request (422 Unprocessable Entity): ${safeDetail}`;
  if (statusCode === 429)
    return `OpenRouter rate limit exceeded (429 Too Many Requests)${suffix}: ${safeDetail}`;
  if (statusCode === 500)
    return `OpenRouter internal error (500 Internal Server Error)${suffix}: ${safeDetail}`;
  if (statusCode === 502)
    return `OpenRouter upstream/provider error (502 Bad Gateway)${suffix}: ${safeDetail}`;
  if (statusCode === 503)
    return `OpenRouter has no available provider (503 Service Unavailable)${suffix}: ${safeDetail}`;
  if (statusCode === 504) return `OpenRouter gateway timeout (504)${suffix}: ${safeDetail}`;
  if (statusCode != null)
    return `OpenRouter request failed (HTTP ${statusCode})${suffix}: ${safeDetail}`;
  return `OpenRouter request failed: ${safeDetail}`;
}

function retryDelayMs(failedAttempt: number): number {
  const exponent = failedAttempt - 1;
  const baseDelay = Math.min(INITIAL_BACKOFF_MS * 2 ** exponent, MAX_BACKOFF_MS);
  return baseDelay + Math.random() * JITTER_MS;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseOptionalNumber(value: unknown): number | undefined {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

/** OpenRouter may route `openrouter/free` (etc.) to a concrete `model` in the JSON body. */
function extractResolvedModelFromPayload(
  data: Record<string, unknown>,
  requestedModel: string,
): string | undefined {
  const raw = data.model;
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  if (!trimmed || trimmed === requestedModel) return undefined;
  return trimmed;
}

function extractResponseMetrics(payload: Record<string, unknown>): ResponseMetricsBase {
  const usage =
    payload.usage && typeof payload.usage === "object"
      ? (payload.usage as Record<string, unknown>)
      : null;

  const promptTokens = parseOptionalNumber(
    usage?.prompt_tokens ?? usage?.input_tokens ?? usage?.promptTokens ?? usage?.inputTokens,
  );
  const completionTokens = parseOptionalNumber(
    usage?.completion_tokens ??
      usage?.output_tokens ??
      usage?.completionTokens ??
      usage?.outputTokens,
  );
  const explicitTotalTokens = parseOptionalNumber(usage?.total_tokens ?? usage?.totalTokens);
  const totalTokens =
    explicitTotalTokens ??
    (promptTokens !== undefined && completionTokens !== undefined
      ? promptTokens + completionTokens
      : undefined);
  const costUsd = parseOptionalNumber(
    usage?.cost ??
      usage?.total_cost ??
      usage?.totalCost ??
      usage?.estimated_cost ??
      usage?.estimatedCost ??
      payload.cost ??
      payload.total_cost ??
      payload.totalCost,
  );

  return {
    promptTokens,
    completionTokens,
    totalTokens,
    costUsd,
  };
}

function addMetricValue(
  base: number | undefined,
  increment: number | undefined,
): number | undefined {
  if (increment === undefined) return base;
  return (base ?? 0) + increment;
}

function aggregateMetrics(
  accumulated: ResponseMetricsBase,
  nextMetrics: ResponseMetricsBase,
): ResponseMetricsBase {
  return {
    promptTokens: addMetricValue(accumulated.promptTokens, nextMetrics.promptTokens),
    completionTokens: addMetricValue(accumulated.completionTokens, nextMetrics.completionTokens),
    totalTokens: addMetricValue(accumulated.totalTokens, nextMetrics.totalTokens),
    costUsd: addMetricValue(accumulated.costUsd, nextMetrics.costUsd),
  };
}

export interface SendQueryResult {
  content: string;
  /** Present when the API `model` field differs from the requested id (e.g. free-tier routing). */
  resolvedModel?: string;
  metrics: ResponseMetrics;
}

/**
 * Send a chat completion request to OpenRouter.
 * Retries on 408, 500, 502, 503, 504 with exponential backoff.
 */
export async function sendQuery(
  apiKey: string,
  model: string,
  messages: ChatMessage[],
): Promise<SendQueryResult> {
  const startedAt = Date.now();
  let lastError: OpenRouterRequestError | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(OPENROUTER_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          "HTTP-Referer": "https://colabs-ui.app",
        },
        body: JSON.stringify({
          model,
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      const body = await response.text();

      if (!response.ok) {
        const { message, providerName } = extractErrorFromBody(body);
        const detail = message || response.statusText || body;
        const retryable = RETRYABLE_STATUS_CODES.has(response.status);
        const userMessage = buildUserMessage(response.status, detail, providerName);
        lastError = new OpenRouterRequestError(
          userMessage,
          response.status,
          retryable,
          "api_error",
        );
        if (retryable && attempt < MAX_ATTEMPTS) {
          await sleep(retryDelayMs(attempt));
          continue;
        }
        throw lastError;
      }

      let data: Record<string, unknown>;
      try {
        data = JSON.parse(body) as Record<string, unknown>;
      } catch {
        throw new OpenRouterRequestError(
          "OpenRouter returned invalid JSON.",
          response.status,
          response.status >= 500,
          "parse_error",
        );
      }

      const choices = data.choices as Array<{ message?: { content?: string } }> | undefined;
      if (!Array.isArray(choices) || choices.length === 0) {
        throw new OpenRouterRequestError(
          "OpenRouter returned no choices.",
          null,
          true,
          "no_content",
        );
      }

      const content = choices[0]?.message?.content;
      if (typeof content !== "string" || !content.trim()) {
        throw new OpenRouterRequestError(
          "OpenRouter returned empty response content.",
          null,
          true,
          "no_content",
        );
      }

      return {
        content,
        resolvedModel: extractResolvedModelFromPayload(data, model),
        metrics: {
          ...extractResponseMetrics(data),
          latencyMs: Date.now() - startedAt,
        },
      };
    } catch (e) {
      if (e instanceof OpenRouterRequestError) {
        lastError = e;
        if (!e.retryable || attempt >= MAX_ATTEMPTS) throw e;
        await sleep(retryDelayMs(attempt));
        continue;
      }
      if (e instanceof Error) {
        const isTimeout = e.name === "AbortError" || e.message?.includes("timeout");
        lastError = new OpenRouterRequestError(
          isTimeout
            ? "Network timeout while contacting OpenRouter."
            : `Network error while contacting OpenRouter: ${shorten(e.message)}`,
          null,
          true,
          "transport_error",
        );
        if (attempt < MAX_ATTEMPTS) {
          await sleep(retryDelayMs(attempt));
          continue;
        }
        throw lastError;
      }
      throw e;
    }
  }

  throw (
    lastError ??
    new OpenRouterRequestError(
      "OpenRouter request failed after retries.",
      null,
      false,
      "retry_exhausted",
    )
  );
}

/** OpenAI-compatible message for tool calling */
type OpenRouterMessage =
  | { role: "system" | "user"; content: string }
  | {
      role: "assistant";
      content?: string | null;
      tool_calls?: Array<{
        id: string;
        type: "function";
        function: { name: string; arguments: string };
      }>;
    }
  | { role: "tool"; content: string; tool_call_id: string };

export interface SendQueryWithToolsResult {
  content: string | null;
  chartSpec: ChartSpec | null;
  resolvedModel?: string;
  metrics: ResponseMetrics;
}

const MAX_TOOL_ITERATIONS = 5;

/**
 * Send a chat completion request with tool support.
 * When the model returns tool_calls, executes tools and recurses until text is returned.
 */
export async function sendQueryWithTools(
  apiKey: string,
  model: string,
  messages: OpenRouterMessage[],
  tools: typeof import("./agentTools").AGENT_TOOLS,
): Promise<SendQueryWithToolsResult> {
  const startedAt = Date.now();
  let chartSpec: ChartSpec | null = null;
  let currentMessages = [...messages];
  let aggregatedMetrics: ResponseMetricsBase = {};
  let lastResolvedModel: string | undefined;

  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
    const body: Record<string, unknown> = {
      model,
      messages: currentMessages.map((m) => {
        if (m.role === "tool") {
          return { role: "tool", content: m.content, tool_call_id: m.tool_call_id };
        }
        if (m.role === "assistant" && m.tool_calls) {
          return {
            role: "assistant",
            content: m.content ?? "",
            tool_calls: m.tool_calls,
          };
        }
        return { role: m.role, content: m.content };
      }),
      tools,
      tool_choice: "auto",
    };

    const response = await fetch(OPENROUTER_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": "https://colabs-ui.app",
      },
      body: JSON.stringify(body),
    });

    const responseBody = await response.text();

    if (!response.ok) {
      const { message, providerName } = extractErrorFromBody(responseBody);
      const detail = message || response.statusText || responseBody;
      throw new OpenRouterRequestError(
        buildUserMessage(response.status, detail, providerName),
        response.status,
        RETRYABLE_STATUS_CODES.has(response.status),
        "api_error",
      );
    }

    let data: Record<string, unknown>;
    try {
      data = JSON.parse(responseBody) as Record<string, unknown>;
    } catch {
      throw new OpenRouterRequestError(
        "OpenRouter returned invalid JSON.",
        response.status,
        true,
        "parse_error",
      );
    }

    const choices = data.choices as
      | Array<{
          message?: {
            content?: string | null;
            tool_calls?: Array<{
              id: string;
              type: string;
              function?: { name?: string; arguments?: string };
            }>;
          };
        }>
      | undefined;

    if (!Array.isArray(choices) || choices.length === 0) {
      throw new OpenRouterRequestError("OpenRouter returned no choices.", null, true, "no_content");
    }

    aggregatedMetrics = aggregateMetrics(aggregatedMetrics, extractResponseMetrics(data));
    const resolvedFromPayload = extractResolvedModelFromPayload(data, model);
    if (resolvedFromPayload !== undefined) {
      lastResolvedModel = resolvedFromPayload;
    }

    const msg = choices[0]?.message;
    const toolCalls = msg?.tool_calls;

    if (toolCalls && Array.isArray(toolCalls) && toolCalls.length > 0) {
      const newMessages: OpenRouterMessage[] = [
        ...currentMessages,
        {
          role: "assistant" as const,
          content: msg?.content ?? null,
          tool_calls: toolCalls.map((tc) => ({
            id: tc.id,
            type: "function" as const,
            function: {
              name: tc.function?.name ?? "unknown",
              arguments: tc.function?.arguments ?? "{}",
            },
          })),
        },
      ];

      for (const tc of toolCalls) {
        const name = tc.function?.name ?? "unknown";
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(tc.function?.arguments ?? "{}") as Record<string, unknown>;
        } catch {
          // ignore parse errors
        }
        const result: ToolResult = executeTool(name, args);
        if (result.chartSpec) {
          chartSpec = result.chartSpec;
        }
        newMessages.push({
          role: "tool",
          content: result.content,
          tool_call_id: tc.id,
        });
      }

      currentMessages = newMessages;
      continue;
    }

    const content = msg?.content;
    return {
      content: typeof content === "string" ? content : null,
      chartSpec,
      resolvedModel: lastResolvedModel,
      metrics: {
        ...aggregatedMetrics,
        latencyMs: Date.now() - startedAt,
      },
    };
  }

  return {
    content: "Tool loop exceeded maximum iterations.",
    chartSpec,
    resolvedModel: lastResolvedModel,
    metrics: {
      ...aggregatedMetrics,
      latencyMs: Date.now() - startedAt,
    },
  };
}
