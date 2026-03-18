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
          const label = `Round ${event.round ?? "?"} · ${event.model ?? "unknown model"}`;
          const body = event.error ? `Error: ${event.error}` : event.content || "(no content)";
          await ctx.runMutation(internal.chat.appendAssistantMessage, {
            userId: args.userId as Id<"users">,
            sessionId: args.sessionId,
            content: `${label}\n${body}`,
            source: "council_round",
            round: event.round,
            model: event.model,
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
                `Final · ${modelResponse.model ?? "unknown model"}\n` +
                (modelResponse.error
                  ? `Error: ${modelResponse.error}`
                  : modelResponse.content || "(no content)"),
              source: "council_final",
              model: modelResponse.model,
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
            promptTokens: event.promptTokens,
            completionTokens: event.completionTokens,
            totalTokens: event.totalTokens,
            costUsd: event.costUsd,
            latencyMs: event.latencyMs,
          });
          continue;
        }

        if (event.type === "research_council_response") {
          const label = `Round ${event.round ?? "?"} · ${event.model ?? "unknown model"}`;
          const body = event.error ? `Error: ${event.error}` : event.content || "(no content)";
          await ctx.runMutation(internal.chat.appendAssistantMessage, {
            userId: args.userId as Id<"users">,
            sessionId: args.sessionId,
            content: `${label}\n${body}`,
            source: "research_council",
            round: event.round,
            model: event.model,
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
            content: `Research final · ${event.model ?? "orchestrator"}\n${body}`,
            source: "research_final",
            model: event.model || args.orchestratorModel,
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
