import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, mutation, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { Id } from "./_generated/dataModel";
import { getOpenRouterApiKey } from "./openrouterConfig";
import { getCouncilModels } from "./aiConfig";
import { queryCouncilStream } from "./council";

const councilMode = v.union(v.literal("parallel"), v.literal("conversation"));

export const sendMessage = mutation({
  args: {
    content: v.string(),
    sessionId: v.string(),
    rounds: v.number(),
    mode: councilMode,
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    // Insert user message
    await ctx.db.insert("chatMessages", {
      userId,
      content: args.content,
      role: "user",
      sessionId: args.sessionId,
      source: "user",
    });

    await ctx.scheduler.runAfter(0, internal.chat.runCouncilQuery, {
      userId,
      sessionId: args.sessionId,
      query: args.content,
      rounds: args.rounds,
      mode: args.mode,
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
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .filter((q) => q.eq(q.field("userId"), userId))
      .order("asc")
      .collect();
  },
});

export const appendAssistantMessage = internalMutation({
  args: {
    userId: v.id("users"),
    sessionId: v.string(),
    content: v.string(),
    source: v.union(v.literal("council_round"), v.literal("council_final"), v.literal("council_error")),
    round: v.optional(v.number()),
    model: v.optional(v.string()),
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
  },
  handler: async (ctx, args) => {
    try {
      const apiKey = getOpenRouterApiKey();
      const models = getCouncilModels();

      for await (const line of queryCouncilStream(
        apiKey,
        models,
        args.query,
        args.rounds,
        args.mode
      )) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        let event: {
          type?: string;
          round?: number;
          model?: string;
          content?: string | null;
          error?: string | null;
          data?: {
            responses?: Array<{ model?: string; content?: string | null; error?: string | null }>;
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
          });
          continue;
        }

        if (event.type === "final") {
          const responses = event.data?.responses ?? [];
          if (responses.length === 0) continue;
          for (const modelResponse of responses) {
            await ctx.runMutation(internal.chat.appendAssistantMessage, {
              userId: args.userId as Id<"users">,
              sessionId: args.sessionId,
              content:
                `Final · ${modelResponse.model ?? "unknown model"}\n` +
                (modelResponse.error ? `Error: ${modelResponse.error}` : modelResponse.content || "(no content)"),
              source: "council_final",
              model: modelResponse.model,
            });
          }
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
