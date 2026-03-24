import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction, internalMutation, mutation, query } from "./_generated/server";
import { getDefaultOrchestratorModel } from "./aiConfig";
import { queryCouncilStream, queryResearchCouncilStream } from "./council";
import {
  generationSettingsValidator,
  normalizeGenerationSettings,
  type GenerationSettings,
} from "./generation";
import { getDefaultModels } from "./models";
import {
  formatAssistantModelLabel,
  type LatestResolvedByRequested,
  historyModelsLine,
  mergeLatestResolvedModel,
} from "./modelLabels";
import { getOpenRouterApiKey } from "./openrouterConfig";

const councilMode = v.union(
  v.literal("parallel"),
  v.literal("conversation"),
  v.literal("research"),
);

const modelsValidator = v.array(v.string());

export const sendMessage = mutation({
  args: {
    content: v.string(),
    sessionId: v.string(),
    rounds: v.number(),
    mode: councilMode,
    models: v.optional(modelsValidator),
    orchestratorModel: v.optional(v.string()),
    generation: v.optional(generationSettingsValidator),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const generation = normalizeGenerationSettings(args.generation);

    // Insert user message
    await ctx.db.insert("chatMessages", {
      userId,
      content: args.content,
      role: "user",
      sessionId: args.sessionId,
      source: "user",
      generationMode: generation.mode,
      generationArtifact:
        generation.mode === "coding" && generation.artifact !== "none"
          ? generation.artifact
          : undefined,
    });

    const models =
      args.models && args.models.length >= 3 ? args.models.slice(0, 3) : getDefaultModels();
    const orchestratorModel = args.orchestratorModel?.trim() || getDefaultOrchestratorModel();

    await ctx.scheduler.runAfter(0, internal.chat.runCouncilQuery, {
      userId,
      sessionId: args.sessionId,
      query: args.content,
      rounds: args.rounds,
      mode: args.mode,
      models,
      orchestratorModel,
      generation,
    });

    return null;
  },
});

export const getMessages = query({
  args: {
    sessionId: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return [];
    }

    return await ctx.db
      .query("chatMessages")
      .withIndex("by_user_and_session", (q) =>
        q.eq("userId", userId).eq("sessionId", args.sessionId),
      )
      .order("asc")
      .collect();
  },
});

function isResearchMessageSource(source: string | undefined): boolean {
  return (
    source === "research_orchestrator" ||
    source === "research_council" ||
    source === "research_final" ||
    source === "research_error"
  );
}

export const listSessions = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return [];
    }

    const messages = await ctx.db
      .query("chatMessages")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    const sessions = new Map<
      string,
      {
        sessionId: string;
        prompt: string;
        promptAt: number;
        startedAt: number;
        lastActivityAt: number;
        models: Set<string>;
        resolvedByRequested: LatestResolvedByRequested;
        maxRound: number;
        hasResearch: boolean;
        orchestratorModel: string | null;
        orchestratorAt: number;
      }
    >();

    for (const msg of messages) {
      if (!msg.sessionId.startsWith("session-")) {
        continue;
      }

      let session = sessions.get(msg.sessionId);
      if (!session) {
        session = {
          sessionId: msg.sessionId,
          prompt: "",
          promptAt: Number.POSITIVE_INFINITY,
          startedAt: msg._creationTime,
          lastActivityAt: msg._creationTime,
          models: new Set(msg.model ? [msg.model] : []),
          resolvedByRequested: new Map(),
          maxRound: msg.round ?? 0,
          hasResearch: false,
          orchestratorModel: null,
          orchestratorAt: 0,
        };
        sessions.set(msg.sessionId, session);
      }

      if (msg._creationTime < session.startedAt) {
        session.startedAt = msg._creationTime;
      }
      if (msg._creationTime > session.lastActivityAt) {
        session.lastActivityAt = msg._creationTime;
      }
      if (msg.model) {
        session.models.add(msg.model);
      }
      if (msg.role === "assistant" && msg.model && msg.resolvedModel) {
        mergeLatestResolvedModel(
          session.resolvedByRequested,
          msg.model,
          msg.resolvedModel,
          msg._creationTime,
        );
      }
      if (msg.round != null && msg.round > session.maxRound) {
        session.maxRound = msg.round;
      }
      const src = msg.source;
      if (isResearchMessageSource(src)) {
        session.hasResearch = true;
        if (
          (src === "research_orchestrator" || src === "research_final") &&
          msg.model &&
          msg._creationTime >= session.orchestratorAt
        ) {
          session.orchestratorModel = msg.model;
          session.orchestratorAt = msg._creationTime;
        }
      }
      if (msg.role === "user" && msg.source === "user" && msg._creationTime < session.promptAt) {
        session.promptAt = msg._creationTime;
        session.prompt = msg.content;
      }
    }

    return [...sessions.values()]
      .map((session) => {
        const mode = session.hasResearch ? ("research" as const) : ("parallel" as const);
        const rounds = session.maxRound > 0 ? Math.min(5, Math.max(1, session.maxRound)) : 3;
        const modelsSorted = [...session.models].sort((a, b) => a.localeCompare(b));
        return {
          sessionId: session.sessionId,
          prompt: session.prompt,
          mode,
          models: modelsSorted,
          historyModelsSummary: historyModelsLine(modelsSorted, session.resolvedByRequested, " · "),
          rounds,
          orchestratorModel: session.orchestratorModel,
          startedAt: session.startedAt,
          lastActivityAt: session.lastActivityAt,
        };
      })
      .sort((a, b) => b.lastActivityAt - a.lastActivityAt);
  },
});

export const deleteSession = mutation({
  args: {
    sessionId: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }
    if (!args.sessionId.startsWith("session-")) {
      throw new Error("Invalid chat session");
    }

    const messages = await ctx.db
      .query("chatMessages")
      .withIndex("by_user_and_session", (q) =>
        q.eq("userId", userId).eq("sessionId", args.sessionId),
      )
      .collect();

    for (const message of messages) {
      await ctx.db.delete(message._id);
    }

    return null;
  },
});

export const appendAssistantMessage = internalMutation({
  args: {
    userId: v.id("users"),
    sessionId: v.string(),
    content: v.string(),
    promptTokens: v.optional(v.number()),
    completionTokens: v.optional(v.number()),
    totalTokens: v.optional(v.number()),
    costUsd: v.optional(v.number()),
    latencyMs: v.optional(v.number()),
    source: v.union(
      v.literal("council_round"),
      v.literal("council_final"),
      v.literal("council_error"),
      v.literal("research_orchestrator"),
      v.literal("research_council"),
      v.literal("research_final"),
      v.literal("research_error"),
    ),
    round: v.optional(v.number()),
    model: v.optional(v.string()),
    resolvedModel: v.optional(v.string()),
    chartSpec: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("chatMessages", {
      userId: args.userId,
      content: args.content,
      role: "assistant",
      sessionId: args.sessionId,
      source: args.source,
      round: args.round,
      model: args.model,
      resolvedModel: args.resolvedModel,
      promptTokens: args.promptTokens,
      completionTokens: args.completionTokens,
      totalTokens: args.totalTokens,
      costUsd: args.costUsd,
      latencyMs: args.latencyMs,
      chartSpec: args.chartSpec,
    });
  },
});

export const runCouncilQuery = internalAction({
  args: {
    userId: v.id("users"),
    sessionId: v.string(),
    query: v.string(),
    rounds: v.number(),
    mode: councilMode,
    models: v.array(v.string()),
    orchestratorModel: v.string(),
    generation: generationSettingsValidator,
  },
  handler: async (ctx, args) => {
    try {
      const apiKey = getOpenRouterApiKey();
      const models = args.models;
      const stream =
        args.mode === "research"
          ? queryResearchCouncilStream(
              apiKey,
              models,
              args.orchestratorModel,
              args.query,
              args.rounds,
              true,
            )
          : queryCouncilStream(apiKey, models, args.query, args.rounds, args.mode, true, {
              mode: args.generation.mode,
              artifact: args.generation.artifact,
            } satisfies GenerationSettings);

      for await (const line of stream) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        let event: {
          type?: string;
          round?: number;
          model?: string;
          resolvedModel?: string;
          content?: string | null;
          error?: string | null;
          chartSpec?: unknown;
          promptTokens?: number;
          completionTokens?: number;
          totalTokens?: number;
          costUsd?: number;
          latencyMs?: number;
          data?: {
            responses?: Array<{
              model?: string;
              resolvedModel?: string;
              content?: string | null;
              error?: string | null;
              chartSpec?: unknown;
              metrics?: {
                promptTokens?: number;
                completionTokens?: number;
                totalTokens?: number;
                costUsd?: number;
                latencyMs?: number;
              };
              promptTokens?: number;
              completionTokens?: number;
              totalTokens?: number;
              costUsd?: number;
              latencyMs?: number;
            }>;
          };
        };
        try {
          event = JSON.parse(trimmed);
        } catch {
          continue;
        }

        if (event.type === "round_response") {
          const label = `Round ${event.round ?? "?"} · ${formatAssistantModelLabel(event.model, event.resolvedModel)}`;
          const body = event.error ? `Error: ${event.error}` : event.content || "(no content)";
          await ctx.runMutation(internal.chat.appendAssistantMessage, {
            userId: args.userId as Id<"users">,
            sessionId: args.sessionId,
            content: `${label}\n${body}`,
            source: "council_round",
            round: event.round,
            model: event.model,
            resolvedModel: event.resolvedModel,
            promptTokens: event.promptTokens,
            completionTokens: event.completionTokens,
            totalTokens: event.totalTokens,
            costUsd: event.costUsd,
            latencyMs: event.latencyMs,
            chartSpec: event.chartSpec,
          });
          continue;
        }

        if (event.type === "final") {
          const responses = event.data?.responses ?? [];
          if (responses.length === 0) continue;
          for (const modelResponse of responses) {
            const responseMetrics = modelResponse.metrics;
            await ctx.runMutation(internal.chat.appendAssistantMessage, {
              userId: args.userId as Id<"users">,
              sessionId: args.sessionId,
              content:
                `Final · ${formatAssistantModelLabel(modelResponse.model, modelResponse.resolvedModel)}\n` +
                (modelResponse.error
                  ? `Error: ${modelResponse.error}`
                  : modelResponse.content || "(no content)"),
              source: "council_final",
              model: modelResponse.model,
              resolvedModel: modelResponse.resolvedModel,
              promptTokens: modelResponse.promptTokens ?? responseMetrics?.promptTokens,
              completionTokens: modelResponse.completionTokens ?? responseMetrics?.completionTokens,
              totalTokens: modelResponse.totalTokens ?? responseMetrics?.totalTokens,
              costUsd: modelResponse.costUsd ?? responseMetrics?.costUsd,
              latencyMs: modelResponse.latencyMs ?? responseMetrics?.latencyMs,
              chartSpec: modelResponse.chartSpec,
            });
          }
          continue;
        }

        if (event.type === "research_orchestrator") {
          await ctx.runMutation(internal.chat.appendAssistantMessage, {
            userId: args.userId as Id<"users">,
            sessionId: args.sessionId,
            content: event.content || "(no content)",
            source: "research_orchestrator",
            round: event.round,
            model: event.model || args.orchestratorModel,
            resolvedModel: event.resolvedModel,
            promptTokens: event.promptTokens,
            completionTokens: event.completionTokens,
            totalTokens: event.totalTokens,
            costUsd: event.costUsd,
            latencyMs: event.latencyMs,
          });
          continue;
        }

        if (event.type === "research_council_response") {
          const label = `Round ${event.round ?? "?"} · ${formatAssistantModelLabel(event.model, event.resolvedModel)}`;
          const body = event.error ? `Error: ${event.error}` : event.content || "(no content)";
          await ctx.runMutation(internal.chat.appendAssistantMessage, {
            userId: args.userId as Id<"users">,
            sessionId: args.sessionId,
            content: `${label}\n${body}`,
            source: "research_council",
            round: event.round,
            model: event.model,
            resolvedModel: event.resolvedModel,
            promptTokens: event.promptTokens,
            completionTokens: event.completionTokens,
            totalTokens: event.totalTokens,
            costUsd: event.costUsd,
            latencyMs: event.latencyMs,
            chartSpec: event.chartSpec,
          });
          continue;
        }

        if (event.type === "research_final") {
          const body = event.error ? `Error: ${event.error}` : event.content || "(no content)";
          await ctx.runMutation(internal.chat.appendAssistantMessage, {
            userId: args.userId as Id<"users">,
            sessionId: args.sessionId,
            content: `Research final · ${formatAssistantModelLabel(event.model ?? "orchestrator", event.resolvedModel)}\n${body}`,
            source: "research_final",
            model: event.model || args.orchestratorModel,
            resolvedModel: event.resolvedModel,
            promptTokens: event.promptTokens,
            completionTokens: event.completionTokens,
            totalTokens: event.totalTokens,
            costUsd: event.costUsd,
            latencyMs: event.latencyMs,
          });
          continue;
        }

        if (event.type === "research_error") {
          await ctx.runMutation(internal.chat.appendAssistantMessage, {
            userId: args.userId as Id<"users">,
            sessionId: args.sessionId,
            content: event.error
              ? `Research mode failed.\n${event.error}`
              : "Research mode failed.",
            source: "research_error",
          });
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      await ctx.runMutation(internal.chat.appendAssistantMessage, {
        userId: args.userId as Id<"users">,
        sessionId: args.sessionId,
        content: `Failed to process council query.\n${message}`,
        source: "council_error",
      });
    }
  },
});
