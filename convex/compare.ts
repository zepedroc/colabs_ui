import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { mutation, query } from "./_generated/server";
import { getDefaultOrchestratorModel } from "./aiConfig";
import { generationSettingsValidator, normalizeGenerationSettings } from "./generation";

const modelsValidator = v.array(v.string());

function looksLikeHtmlResponse(content: string): boolean {
  const normalized = content.toLowerCase();
  return (
    normalized.includes("```html") ||
    normalized.includes("<!doctype html") ||
    normalized.includes("<html") ||
    normalized.includes("<body") ||
    normalized.includes("<svg")
  );
}

export const sendMessage = mutation({
  args: {
    content: v.string(),
    sessionId: v.string(),
    models: modelsValidator,
    generation: v.optional(generationSettingsValidator),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    if (args.models.length !== 2) {
      throw new Error("Exactly 2 models are required for compare");
    }

    const generation = normalizeGenerationSettings(args.generation);

    await ctx.db.insert("chatMessages", {
      userId,
      content: args.content,
      role: "user",
      sessionId: args.sessionId,
      source: "user",
      generationMode: generation.mode,
    });

    await ctx.scheduler.runAfter(0, internal.chat.runCouncilQuery, {
      userId,
      sessionId: args.sessionId,
      query: args.content,
      rounds: 1,
      mode: "parallel",
      models: args.models,
      orchestratorModel: getDefaultOrchestratorModel(),
      generation,
    });

    return null;
  },
});

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
        mode: "answer" | "coding";
        startedAt: number;
        lastActivityAt: number;
        models: Set<string>;
      }
    >();

    for (const msg of messages) {
      if (!msg.sessionId.startsWith("compare-")) {
        continue;
      }

      const existing = sessions.get(msg.sessionId);
      if (!existing) {
        sessions.set(msg.sessionId, {
          sessionId: msg.sessionId,
          prompt: "",
          promptAt: Number.POSITIVE_INFINITY,
          mode: "answer",
          startedAt: msg._creationTime,
          lastActivityAt: msg._creationTime,
          models: new Set(msg.model ? [msg.model] : []),
        });
      }

      const session = sessions.get(msg.sessionId);
      if (!session) {
        continue;
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
      if (
        msg.role === "user" &&
        msg.source === "user" &&
        msg._creationTime < session.promptAt
      ) {
        session.promptAt = msg._creationTime;
        session.prompt = msg.content;
      }
      if (msg.role === "user" && msg.source === "user" && msg.generationMode === "coding") {
        session.mode = "coding";
      } else if (msg.role === "assistant" && looksLikeHtmlResponse(msg.content)) {
        // Backfill mode for legacy chats where generationMode wasn't stored.
        session.mode = "coding";
      }
    }

    return [...sessions.values()]
      .map((session) => ({
        sessionId: session.sessionId,
        prompt: session.prompt,
        mode: session.mode,
        models: [...session.models].sort((a, b) => a.localeCompare(b)),
        startedAt: session.startedAt,
        lastActivityAt: session.lastActivityAt,
      }))
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
    if (!args.sessionId.startsWith("compare-")) {
      throw new Error("Invalid compare session");
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
