import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, mutation, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { Id } from "./_generated/dataModel";
import { getFastApiBaseUrl } from "./fastapiConfig";

const councilMode = v.union(v.literal("parallel"), v.literal("conversation"));

function buildCouncilRequestUrl() {
  return `${getFastApiBaseUrl()}/council/query`;
}

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
    source: v.union(v.literal("fastapi_round"), v.literal("fastapi_final"), v.literal("fastapi_error")),
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
      const response = await fetch(buildCouncilRequestUrl(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/x-ndjson",
        },
        body: JSON.stringify({
          query: args.query,
          rounds: args.rounds,
          mode: args.mode,
        }),
      });

      if (!response.ok) {
        throw new Error(`FastAPI request failed: ${response.status} ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("FastAPI response stream is not readable.");
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (value) {
          buffer += decoder.decode(value, { stream: !done });
        }

        const lines = buffer.split(/\r?\n/);
        if (done) {
          buffer = "";
        } else {
          buffer = lines.pop() || "";
        }

        for (const rawLine of lines) {
          const line = rawLine.trim();
          if (!line) {
            continue;
          }

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
            event = JSON.parse(line);
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
              source: "fastapi_round",
              round: event.round,
              model: event.model,
            });
            continue;
          }

          if (event.type === "final") {
            const responses = event.data?.responses ?? [];
            if (responses.length === 0) {
              continue;
            }
            for (const modelResponse of responses) {
              await ctx.runMutation(internal.chat.appendAssistantMessage, {
                userId: args.userId as Id<"users">,
                sessionId: args.sessionId,
                content:
                  `Final · ${modelResponse.model ?? "unknown model"}\n` +
                  (modelResponse.error ? `Error: ${modelResponse.error}` : modelResponse.content || "(no content)"),
                source: "fastapi_final",
                model: modelResponse.model,
              });
            }
          }
        }

        if (done) {
          break;
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown FastAPI error";
      await ctx.runMutation(internal.chat.appendAssistantMessage, {
        userId: args.userId as Id<"users">,
        sessionId: args.sessionId,
        content: `Failed to process council query.\n${message}`,
        source: "fastapi_error",
      });
    }
  },
});
