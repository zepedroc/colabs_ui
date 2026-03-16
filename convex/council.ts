/**
 * Council logic - parallel dispatch to multiple LLMs and aggregation.
 * No memory feature (omitted per migration plan).
 */

import type { ChartSpec } from "./agentTools";
import { AGENT_TOOLS } from "./agentTools";
import { type ChatMessage, sendQuery, sendQueryWithTools } from "./openrouter";

export type CouncilMode = "parallel" | "conversation";

export interface ModelResponse {
  model: string;
  content: string | null;
  error: string | null;
  chartSpec?: ChartSpec | null;
}

export interface CouncilResponse {
  query: string;
  responses: ModelResponse[];
}

const COUNCIL_SYSTEM_PROMPT =
  "You are part of an LLM council. Be concise, honest, and self-critical. " +
  "You have access to tools: evaluate_math (for calculations) and create_chart (for graphs). Use them when the user asks for math or visualizations.";

const FIRST_ROUND_PROMPT_TEMPLATE =
  "You are a deep thinker in a multi-agent council.\n" +
  "Try to answer the user's query as accurately as possible.\n\n" +
  "User query:\n{query}";

const MIDDLE_ROUND_PROMPT_TEMPLATE =
  "These are the other agents' responses to the user query from the previous round:\n" +
  "{other_responses}\n\n" +
  "Feel free to comment on other responses or change your opinion if the new information " +
  "changes your view.\n" +
  "Consider questioning the conversation: Are we sure we're thinking correctly? " +
  "Is there something we're not seeing? Challenge assumptions and look for blind spots.\n\n" +
  "Original user query:\n{query}";

const CONVERSATION_ROUND_PROMPT_TEMPLATE =
  "You are in an ongoing multi-agent conversation.\n" +
  "Conversation transcript so far:\n" +
  "{context}\n\n" +
  "Respond to the latest points from other agents. You can challenge assumptions, " +
  "comment on a specific agent's response, or ask direct questions for future turns.\n" +
  "Keep your answer concise and grounded in the original user query.\n\n" +
  "Original user query:\n{query}";

const FINAL_ROUND_PROMPT_TEMPLATE =
  "All conversation context so far:\n" +
  "{context}\n\n" +
  "This is the final round. Provide your final answer to the user query. Be concise.";

async function querySingleModel(
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  toolsEnabled: boolean,
): Promise<ModelResponse> {
  try {
    if (toolsEnabled) {
      const { content, chartSpec } = await sendQueryWithTools(
        apiKey,
        model,
        messages as Array<{ role: "system" | "user" | "assistant"; content: string }>,
        AGENT_TOOLS,
      );
      return { model, content, error: null, chartSpec: chartSpec ?? undefined };
    }
    const content = await sendQuery(apiKey, model, messages);
    return { model, content, error: null };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    return { model, content: null, error };
  }
}

function formatOtherResponses(previousRound: ModelResponse[], currentModel: string): string {
  const lines = previousRound
    .filter((r) => r.model !== currentModel)
    .map((r) => {
      const content = r.content ?? `[Error] ${r.error}`;
      return `${r.model}: ${content}`;
    });
  return lines.length > 0 ? lines.join("\n") : "No other model responses available.";
}

function formatContext(allRounds: ModelResponse[][]): string {
  const lines: string[] = [];
  allRounds.forEach((roundResponses, i) => {
    lines.push(`Round ${i + 1}:`);
    roundResponses.forEach((r) => {
      const content = r.content ?? `[Error] ${r.error}`;
      lines.push(`- Agent ${r.model} said: ${content}`);
    });
  });
  return lines.length > 0 ? lines.join("\n") : "No previous context.";
}

function formatContextWithCurrentRound(
  allRounds: ModelResponse[][],
  currentRoundNumber: number,
  currentRoundResponses: ModelResponse[] | null,
): string {
  const baseContext = formatContext(allRounds);
  if (!currentRoundResponses || currentRoundResponses.length === 0) {
    return baseContext;
  }
  const currentLines = [`Round ${currentRoundNumber} (in progress):`];
  currentRoundResponses.forEach((r) => {
    const content = r.content ?? `[Error] ${r.error}`;
    currentLines.push(`- Agent ${r.model} said: ${content}`);
  });
  if (baseContext === "No previous context.") {
    return currentLines.join("\n");
  }
  return `${baseContext}\n${currentLines.join("\n")}`;
}

function buildRoundPrompt(
  roundNumber: number,
  totalRounds: number,
  query: string,
  model: string,
  mode: CouncilMode,
  allRounds: ModelResponse[][],
  currentRoundResponses: ModelResponse[] | null,
): string {
  if (totalRounds === 1) {
    return FINAL_ROUND_PROMPT_TEMPLATE.replace("{context}", `User query: ${query}`);
  }
  if (roundNumber === 1) {
    return FIRST_ROUND_PROMPT_TEMPLATE.replace("{query}", query);
  }
  if (roundNumber === totalRounds) {
    const context = formatContextWithCurrentRound(allRounds, roundNumber, currentRoundResponses);
    return FINAL_ROUND_PROMPT_TEMPLATE.replace("{context}", context);
  }
  if (mode === "conversation") {
    const context = formatContextWithCurrentRound(allRounds, roundNumber, currentRoundResponses);
    return CONVERSATION_ROUND_PROMPT_TEMPLATE.replace("{context}", context).replace(
      "{query}",
      query,
    );
  }
  const otherResponses = formatOtherResponses(allRounds[allRounds.length - 1] ?? [], model);
  return MIDDLE_ROUND_PROMPT_TEMPLATE.replace("{other_responses}", otherResponses).replace(
    "{query}",
    query,
  );
}

function recordResponse(
  response: ModelResponse,
  prompt: string,
  roundNumber: number,
  modelHistories: Record<string, ChatMessage[]>,
): ModelResponse {
  const history = modelHistories[response.model];
  history.push({ role: "user", content: prompt });
  const assistantContent = response.content ?? `[Round ${roundNumber} error] ${response.error}`;
  history.push({ role: "assistant", content: assistantContent });
  return response;
}

/**
 * Run a round in parallel, yielding each model's response as soon as it completes.
 * Returns the ordered results for use in subsequent rounds.
 */
async function* runRoundParallel(
  apiKey: string,
  models: string[],
  query: string,
  roundNumber: number,
  totalRounds: number,
  allRounds: ModelResponse[][],
  modelHistories: Record<string, ChatMessage[]>,
  toolsEnabled: boolean,
): AsyncGenerator<ModelResponse> {
  type Wrapped = {
    p: Promise<{ response: ModelResponse; prompt: string; index: number }>;
    index: number;
  };
  const wrapped: Wrapped[] = models.map((model, index) => {
    const prompt = buildRoundPrompt(
      roundNumber,
      totalRounds,
      query,
      model,
      "parallel",
      allRounds,
      null,
    );
    const messages: ChatMessage[] = [...modelHistories[model], { role: "user", content: prompt }];
    const p = querySingleModel(apiKey, model, messages, toolsEnabled).then((response) => ({
      response: {
        model,
        content: response.content,
        error: response.error,
        chartSpec: response.chartSpec,
      },
      prompt,
      index,
    }));
    return { p, index };
  });

  const results: (ModelResponse | null)[] = new Array(models.length);
  let completed = 0;

  while (completed < models.length) {
    const { response, prompt, index } = await Promise.race(
      wrapped.filter((w) => results[w.index] === undefined).map((w) => w.p),
    );
    const recorded = recordResponse(response, prompt, roundNumber, modelHistories);
    results[index] = recorded;
    completed++;
    yield recorded;
  }

  // Explicitly await all promises so Convex's runtime can verify no dangling fetches.
  await Promise.all(wrapped.map((w) => w.p));
}

async function runRoundConversation(
  apiKey: string,
  models: string[],
  query: string,
  roundNumber: number,
  totalRounds: number,
  allRounds: ModelResponse[][],
  modelHistories: Record<string, ChatMessage[]>,
  toolsEnabled: boolean,
): Promise<ModelResponse[]> {
  if (roundNumber === 1) {
    const results: ModelResponse[] = [];
    for await (const response of runRoundParallel(
      apiKey,
      models,
      query,
      roundNumber,
      totalRounds,
      allRounds,
      modelHistories,
      toolsEnabled,
    )) {
      results.push(response);
    }
    return results;
  }

  const roundResponses: ModelResponse[] = [];
  for (const model of models) {
    const prompt = buildRoundPrompt(
      roundNumber,
      totalRounds,
      query,
      model,
      "conversation",
      allRounds,
      roundResponses,
    );
    const messages: ChatMessage[] = [...modelHistories[model], { role: "user", content: prompt }];
    const response = await querySingleModel(apiKey, model, messages, toolsEnabled);
    const recorded = recordResponse(response, prompt, roundNumber, modelHistories);
    roundResponses.push(recorded);
  }
  return roundResponses;
}

function roundResponseEvent(roundNumber: number, response: ModelResponse): string {
  return `${JSON.stringify({
    type: "round_response",
    round: roundNumber,
    model: response.model,
    content: response.content,
    error: response.error,
    chartSpec: response.chartSpec,
  })}\n`;
}

/**
 * Run a multi-round council and yield NDJSON lines.
 * No memory - uses simple system prompt only.
 * When toolsEnabled is true, models can use evaluate_math and create_chart tools.
 */
export async function* queryCouncilStream(
  apiKey: string,
  models: string[],
  query: string,
  rounds: number,
  mode: CouncilMode,
  toolsEnabled = false,
): AsyncGenerator<string> {
  if (rounds < 1) {
    throw new Error("rounds must be >= 1");
  }

  const modelHistories: Record<string, ChatMessage[]> = {};
  for (const model of models) {
    modelHistories[model] = [{ role: "system", content: COUNCIL_SYSTEM_PROMPT }];
  }

  const allRounds: ModelResponse[][] = [];

  for (let roundNumber = 1; roundNumber <= rounds; roundNumber++) {
    const roundResponses: ModelResponse[] = [];

    // Round 1 and parallel mode: yield each response as it completes
    if (roundNumber === 1 || mode === "parallel") {
      for await (const response of runRoundParallel(
        apiKey,
        models,
        query,
        roundNumber,
        rounds,
        allRounds,
        modelHistories,
        toolsEnabled,
      )) {
        yield roundResponseEvent(roundNumber, response);
        roundResponses.push(response);
      }
    } else {
      // Conversation mode rounds 2+: sequential, yield each as we get it
      const responses = await runRoundConversation(
        apiKey,
        models,
        query,
        roundNumber,
        rounds,
        allRounds,
        modelHistories,
        toolsEnabled,
      );
      for (const response of responses) {
        yield roundResponseEvent(roundNumber, response);
        roundResponses.push(response);
      }
    }

    allRounds.push(roundResponses);
  }

  const finalResponses = allRounds[allRounds.length - 1] ?? [];
  const councilResponse: CouncilResponse = { query, responses: finalResponses };
  yield `${JSON.stringify({ type: "final", data: councilResponse })}\n`;
}
