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

const RESEARCH_COUNCIL_SYSTEM_PROMPT =
  "You are a council member in research mode. Follow the orchestrator's instructions, use tools when useful, " +
  "and clearly separate verified facts from assumptions.";

const RESEARCH_ORCHESTRATOR_SYSTEM_PROMPT =
  "You are an orchestrator coordinating three research agents. " +
  "Your job is to drive the team to a high-quality answer by asking focused follow-ups, verification passes, and challenges. " +
  "Always return STRICT JSON, no markdown, no prose outside JSON.";

type ResearchDecision = {
  decision: "continue" | "stop";
  rationale: string;
  globalInstruction: string;
  verificationChecklist: string[];
  perModel: Array<{ model: string; instruction: string }>;
};

type ResearchRoundState = {
  round: number;
  orchestratorMessage: string;
  decision: ResearchDecision;
  councilResponses: ModelResponse[];
};

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

function extractJsonObject(raw: string): string | null {
  const fenced = raw.match(/```json\s*([\s\S]*?)```/i)?.[1] ?? raw;
  const start = fenced.indexOf("{");
  const end = fenced.lastIndexOf("}");
  if (start < 0 || end < 0 || end <= start) {
    return null;
  }
  return fenced.slice(start, end + 1);
}

function defaultResearchDecision(models: string[], roundNumber: number, maxRounds: number): ResearchDecision {
  const shouldStop = roundNumber >= maxRounds;
  return {
    decision: shouldStop ? "stop" : "continue",
    rationale: shouldStop
      ? "Reached maximum rounds; proceed to final synthesis."
      : "Continue with deeper analysis and verification.",
    globalInstruction:
      "Improve answer quality, challenge weak assumptions, and verify the most important claims.",
    verificationChecklist: [
      "Check factual claims for internal consistency",
      "Call out uncertainty explicitly",
      "Provide practical, user-actionable guidance",
    ],
    perModel: models.map((model, idx) => ({
      model,
      instruction:
        idx === 0
          ? "Build a structured core answer with key steps."
          : idx === 1
            ? "Critique assumptions and identify risks or missing evidence."
            : "Propose alternatives and edge cases, then suggest what to verify.",
    })),
  };
}

function parseResearchDecision(
  rawResponse: string,
  models: string[],
  roundNumber: number,
  maxRounds: number,
): ResearchDecision {
  const fallback = defaultResearchDecision(models, roundNumber, maxRounds);
  const jsonCandidate = extractJsonObject(rawResponse);
  if (!jsonCandidate) {
    return fallback;
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonCandidate) as Record<string, unknown>;
  } catch {
    return fallback;
  }

  const decision = parsed.decision === "stop" || roundNumber >= maxRounds ? "stop" : "continue";
  const rationale =
    typeof parsed.rationale === "string" && parsed.rationale.trim()
      ? parsed.rationale.trim()
      : fallback.rationale;
  const globalInstruction =
    typeof parsed.globalInstruction === "string" && parsed.globalInstruction.trim()
      ? parsed.globalInstruction.trim()
      : fallback.globalInstruction;
  const verificationChecklist = Array.isArray(parsed.verificationChecklist)
    ? parsed.verificationChecklist.filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    : fallback.verificationChecklist;

  const perModelMap = new Map<string, string>();
  if (Array.isArray(parsed.perModel)) {
    for (const item of parsed.perModel) {
      if (!item || typeof item !== "object") continue;
      const obj = item as Record<string, unknown>;
      const model = typeof obj.model === "string" ? obj.model : "";
      const instruction = typeof obj.instruction === "string" ? obj.instruction : "";
      if (models.includes(model) && instruction.trim()) {
        perModelMap.set(model, instruction.trim());
      }
    }
  }

  const perModel = models.map((model, idx) => ({
    model,
    instruction: perModelMap.get(model) ?? fallback.perModel[idx]?.instruction ?? globalInstruction,
  }));

  return {
    decision,
    rationale,
    globalInstruction,
    verificationChecklist,
    perModel,
  };
}

function formatResearchHistory(rounds: ResearchRoundState[]): string {
  if (rounds.length === 0) {
    return "No prior rounds yet.";
  }

  const lines: string[] = [];
  for (const round of rounds) {
    lines.push(`Round ${round.round} orchestrator note: ${round.orchestratorMessage}`);
    for (const response of round.councilResponses) {
      const body = response.content ?? `[Error] ${response.error ?? "Unknown error"}`;
      lines.push(`- ${response.model}: ${body}`);
    }
  }
  return lines.join("\n");
}

function buildResearchPlanningPrompt(
  query: string,
  models: string[],
  roundNumber: number,
  maxRounds: number,
  previousRounds: ResearchRoundState[],
): string {
  const transcript = formatResearchHistory(previousRounds);
  return (
    `User query:\n${query}\n\n` +
    `Round: ${roundNumber}/${maxRounds}\n` +
    `Council models: ${models.join(", ")}\n\n` +
    `Transcript so far:\n${transcript}\n\n` +
    "Decide whether the council should continue iterating or stop and synthesize final output.\n" +
    "Quality rubric:\n" +
    "1) Query coverage is complete.\n" +
    "2) Conflicts or open questions are resolved or called out.\n" +
    "3) High-risk factual claims are verified or explicitly marked uncertain.\n" +
    "4) Final output can be actionable and concise.\n\n" +
    "Return STRICT JSON with this exact shape:\n" +
    '{\n' +
    '  "decision": "continue" | "stop",\n' +
    '  "rationale": "short reason",\n' +
    '  "globalInstruction": "guidance for all models",\n' +
    '  "verificationChecklist": ["item1", "item2"],\n' +
    '  "perModel": [\n' +
    '    { "model": "exact model id", "instruction": "targeted instruction" }\n' +
    "  ]\n" +
    "}\n" +
    "Never omit any model in perModel.\n"
  );
}

function buildResearchCouncilPrompt(
  query: string,
  roundNumber: number,
  instruction: string,
  decision: ResearchDecision,
  previousRounds: ResearchRoundState[],
): string {
  const history = formatResearchHistory(previousRounds);
  return (
    `Original user query:\n${query}\n\n` +
    `Current round: ${roundNumber}\n` +
    `Orchestrator global instruction:\n${decision.globalInstruction}\n\n` +
    `Your targeted instruction:\n${instruction}\n\n` +
    `Verification checklist:\n- ${decision.verificationChecklist.join("\n- ")}\n\n` +
    `Previous transcript:\n${history}\n\n` +
    "Respond with your best contribution for this round. Be concrete, challenge assumptions where needed, " +
    "and explicitly label uncertain claims."
  );
}

function formatResearchOrchestratorMessage(decision: ResearchDecision, roundNumber: number): string {
  const modelInstructions = decision.perModel
    .map((item) => `- ${item.model}: ${item.instruction}`)
    .join("\n");
  const checklist = decision.verificationChecklist.map((item) => `- ${item}`).join("\n");
  return (
    `Orchestrator round ${roundNumber}\n` +
    `Decision: ${decision.decision}\n\n` +
    `Rationale: ${decision.rationale}\n\n` +
    `Global instruction:\n${decision.globalInstruction}\n\n` +
    `Per-model instructions:\n${modelInstructions}\n\n` +
    `Verification checklist:\n${checklist}`
  );
}

function buildResearchFinalPrompt(query: string, rounds: ResearchRoundState[]): string {
  const transcript = formatResearchHistory(rounds);
  return (
    `Original user query:\n${query}\n\n` +
    `Council transcript:\n${transcript}\n\n` +
    "Produce the final answer for the user. Requirements:\n" +
    "- Address the user request directly.\n" +
    "- Resolve or clearly call out remaining uncertainty.\n" +
    "- Prefer concise, actionable output.\n"
  );
}

async function* runResearchRoundParallel(
  apiKey: string,
  models: string[],
  query: string,
  roundNumber: number,
  decision: ResearchDecision,
  previousRounds: ResearchRoundState[],
  modelHistories: Record<string, ChatMessage[]>,
  toolsEnabled: boolean,
): AsyncGenerator<ModelResponse> {
  type Wrapped = {
    p: Promise<{ response: ModelResponse; prompt: string; index: number }>;
    index: number;
  };

  const wrapped: Wrapped[] = models.map((model, index) => {
    const instruction =
      decision.perModel.find((item) => item.model === model)?.instruction ?? decision.globalInstruction;
    const prompt = buildResearchCouncilPrompt(
      query,
      roundNumber,
      instruction,
      decision,
      previousRounds,
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

  const results: (ModelResponse | undefined)[] = new Array(models.length);
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

  await Promise.all(wrapped.map((w) => w.p));
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

/**
 * Research mode: orchestrator drives three council agents until quality is sufficient
 * or max rounds is reached, then synthesizes a final answer.
 */
export async function* queryResearchCouncilStream(
  apiKey: string,
  models: string[],
  orchestratorModel: string,
  query: string,
  maxRounds: number,
  toolsEnabled = true,
): AsyncGenerator<string> {
  if (maxRounds < 1) {
    throw new Error("maxRounds must be >= 1");
  }
  if (models.length < 1) {
    throw new Error("At least one council model is required");
  }

  try {
    const safeOrchestrator = orchestratorModel || models[0];
    const modelHistories: Record<string, ChatMessage[]> = {};
    for (const model of models) {
      modelHistories[model] = [{ role: "system", content: RESEARCH_COUNCIL_SYSTEM_PROMPT }];
    }

    const rounds: ResearchRoundState[] = [];

    for (let roundNumber = 1; roundNumber <= maxRounds; roundNumber++) {
      const planningPrompt = buildResearchPlanningPrompt(
        query,
        models,
        roundNumber,
        maxRounds,
        rounds,
      );

      let orchestratorRaw = "";
      try {
        orchestratorRaw = await sendQuery(apiKey, safeOrchestrator, [
          { role: "system", content: RESEARCH_ORCHESTRATOR_SYSTEM_PROMPT },
          { role: "user", content: planningPrompt },
        ]);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        yield `${JSON.stringify({ type: "research_error", error: message })}\n`;
        return;
      }

      const decision = parseResearchDecision(orchestratorRaw, models, roundNumber, maxRounds);
      const orchestratorMessage = formatResearchOrchestratorMessage(decision, roundNumber);

      yield `${JSON.stringify({
        type: "research_orchestrator",
        round: roundNumber,
        model: safeOrchestrator,
        content: orchestratorMessage,
      })}\n`;

      if (roundNumber > 1 && decision.decision === "stop") {
        break;
      }

      const councilResponses: ModelResponse[] = [];
      for await (const response of runResearchRoundParallel(
        apiKey,
        models,
        query,
        roundNumber,
        decision,
        rounds,
        modelHistories,
        toolsEnabled,
      )) {
        councilResponses.push(response);
        yield `${JSON.stringify({
          type: "research_council_response",
          round: roundNumber,
          model: response.model,
          content: response.content,
          error: response.error,
          chartSpec: response.chartSpec,
        })}\n`;
      }

      rounds.push({
        round: roundNumber,
        orchestratorMessage,
        decision,
        councilResponses,
      });
    }

    let finalContent: string | null = null;
    let finalError: string | null = null;
    try {
      finalContent = await sendQuery(apiKey, safeOrchestrator, [
        {
          role: "system",
          content:
            "You are the research orchestrator delivering the final response. Be direct, actionable, and explicit about uncertainty.",
        },
        { role: "user", content: buildResearchFinalPrompt(query, rounds) },
      ]);
    } catch (error) {
      finalError = error instanceof Error ? error.message : String(error);
    }

    yield `${JSON.stringify({
      type: "research_final",
      model: safeOrchestrator,
      content: finalContent,
      error: finalError,
    })}\n`;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    yield `${JSON.stringify({ type: "research_error", error: message })}\n`;
  }
}
