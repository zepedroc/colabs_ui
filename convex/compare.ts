import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { mutation } from "./_generated/server";
import { getDefaultOrchestratorModel } from "./aiConfig";

const modelsValidator = v.array(v.string());

export const sendMessage = mutation({
  args: {
    content: v.string(),
    sessionId: v.string(),
    models: modelsValidator,
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    if (args.models.length !== 2) {
      throw new Error("Exactly 2 models are required for compare");
    }

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
      rounds: 1,
      mode: "parallel",
      models: args.models,
      orchestratorModel: getDefaultOrchestratorModel(),
    });

    return null;
  },
});
