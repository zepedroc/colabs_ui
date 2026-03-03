import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

export const sendMessage = mutation({
  args: {
    content: v.string(),
    sessionId: v.string(),
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
    });

    // Mock AI response - in production this would call your Python service
    const mockResponses = [
      "I understand your request. Let me analyze this with the AI council...",
      "Based on the collaborative analysis, here's what the agents suggest:",
      "The AI agents have reached a consensus on this topic:",
      "After deliberation among the AI council, the recommendation is:",
      "Multiple AI perspectives have been considered for your query:",
    ];

    const mockResponse = mockResponses[Math.floor(Math.random() * mockResponses.length)];

    // Insert AI response
    await ctx.db.insert("chatMessages", {
      userId,
      content: mockResponse,
      role: "assistant",
      sessionId: args.sessionId,
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
