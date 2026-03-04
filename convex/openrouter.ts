/**
 * OpenRouter API client for LLM Council.
 * Uses fetch for Convex compatibility.
 */

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
    public readonly category: string
  ) {
    super(message);
    this.name = "OpenRouterRequestError";
  }
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

function shorten(value: string, maxLen = 320): string {
  const flattened = value.replace(/\s+/g, " ").trim();
  if (flattened.length <= maxLen) return flattened;
  return flattened.slice(0, maxLen) + "...";
}

function extractErrorFromBody(body: string | null): { message: string | null; providerName: string | null } {
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
  providerName: string | null
): string {
  const suffix = providerName ? ` (provider: ${providerName})` : "";
  const safeDetail = detail ? shorten(detail) : "Unknown error from OpenRouter.";

  if (statusCode === 400)
    return `OpenRouter rejected the request (400 Bad Request): ${safeDetail}`;
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
  if (statusCode === 504)
    return `OpenRouter gateway timeout (504)${suffix}: ${safeDetail}`;
  if (statusCode != null)
    return `OpenRouter request failed (HTTP ${statusCode})${suffix}: ${safeDetail}`;
  return `OpenRouter request failed: ${safeDetail}`;
}

function retryDelayMs(failedAttempt: number): number {
  const exponent = failedAttempt - 1;
  const baseDelay = Math.min(
    INITIAL_BACKOFF_MS * Math.pow(2, exponent),
    MAX_BACKOFF_MS
  );
  return baseDelay + Math.random() * JITTER_MS;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Send a chat completion request to OpenRouter.
 * Retries on 408, 500, 502, 503, 504 with exponential backoff.
 */
export async function sendQuery(
  apiKey: string,
  model: string,
  messages: ChatMessage[]
): Promise<string> {
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
        const userMessage = buildUserMessage(
          response.status,
          detail,
          providerName
        );
        lastError = new OpenRouterRequestError(
          userMessage,
          response.status,
          retryable,
          "api_error"
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
          "parse_error"
        );
      }

      const choices = data.choices as Array<{ message?: { content?: string } }> | undefined;
      if (!Array.isArray(choices) || choices.length === 0) {
        throw new OpenRouterRequestError(
          "OpenRouter returned no choices.",
          null,
          true,
          "no_content"
        );
      }

      const content = choices[0]?.message?.content;
      if (typeof content !== "string" || !content.trim()) {
        throw new OpenRouterRequestError(
          "OpenRouter returned empty response content.",
          null,
          true,
          "no_content"
        );
      }

      return content;
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
          "transport_error"
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

  throw lastError ?? new OpenRouterRequestError(
    "OpenRouter request failed after retries.",
    null,
    false,
    "retry_exhausted"
  );
}
