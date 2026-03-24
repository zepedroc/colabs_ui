import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { mutation, query } from "./_generated/server";
import { getDefaultOrchestratorModel } from "./aiConfig";
import { generationSettingsValidator, normalizeGenerationSettings } from "./generation";
import {
  type LatestResolvedByRequested,
  historyModelsLine,
  mergeLatestResolvedModel,
} from "./modelLabels";

const modelsValidator = v.array(v.string());

function inferCodingArtifactFromAssistant(content: string): "html" | "react" | null {
  const lower = content.toLowerCase();
  if (lower.includes("```r3f")) {
    return "react";
  }
  if ((lower.includes("```tsx") || lower.includes("```jsx")) && /<Canvas\b/u.test(content)) {
    return "react";
  }
  if (lower.includes("```html")) {
    return "html";
  }
  return null;
}

function looksLikeCodingPreviewResponse(content: string): boolean {
  const normalized = content.toLowerCase();
  return (
    normalized.includes("```r3f") ||
    normalized.includes("```tsx") ||
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
      generationArtifact:
        generation.mode === "coding" && generation.artifact !== "none"
          ? generation.artifact
          : undefined,
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
        codingArtifact?: "html" | "react" | "threejs";
        /** True if any user message persisted `generationArtifact` (do not infer from assistants). */
        hasStoredCodingArtifact: boolean;
        startedAt: number;
        lastActivityAt: number;
        models: Set<string>;
        resolvedByRequested: LatestResolvedByRequested;
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
          hasStoredCodingArtifact: false,
          startedAt: msg._creationTime,
          lastActivityAt: msg._creationTime,
          models: new Set(msg.model ? [msg.model] : []),
          resolvedByRequested: new Map(),
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
      if (msg.role === "assistant" && msg.model && msg.resolvedModel) {
        mergeLatestResolvedModel(
          session.resolvedByRequested,
          msg.model,
          msg.resolvedModel,
          msg._creationTime,
        );
      }
      if (msg.role === "user" && msg.source === "user" && msg._creationTime < session.promptAt) {
        session.promptAt = msg._creationTime;
        session.prompt = msg.content;
      }
      if (msg.role === "user" && msg.source === "user" && msg.generationMode === "coding") {
        session.mode = "coding";
        if (msg.generationArtifact !== undefined) {
          session.hasStoredCodingArtifact = true;
        }
        const a = msg.generationArtifact;
        if (a === "react") {
          session.codingArtifact = "react";
        } else if (a === "html" && session.codingArtifact !== "react") {
          session.codingArtifact = "html";
        } else if (a === "threejs" && session.codingArtifact === undefined) {
          session.codingArtifact = "threejs";
        }
      } else if (msg.role === "assistant" && looksLikeCodingPreviewResponse(msg.content)) {
        // Backfill mode for legacy chats where generationMode wasn't stored.
        session.mode = "coding";
      }
      if (
        msg.role === "assistant" &&
        session.mode === "coding" &&
        !session.hasStoredCodingArtifact
      ) {
        const inferred = inferCodingArtifactFromAssistant(msg.content);
        if (inferred === "react") {
          session.codingArtifact = "react";
        } else if (inferred === "html" && session.codingArtifact !== "react") {
          session.codingArtifact ??= "html";
        }
      }
    }

    return [...sessions.values()]
      .map((session) => {
        const modelsSorted = [...session.models].sort((a, b) => a.localeCompare(b));
        return {
          sessionId: session.sessionId,
          prompt: session.prompt,
          mode: session.mode,
          codingArtifact: session.codingArtifact,
          models: modelsSorted,
          historyModelsSummary: historyModelsLine(
            modelsSorted,
            session.resolvedByRequested,
            " vs ",
          ),
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
