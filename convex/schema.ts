import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

const applicationTables = {
  chatMessages: defineTable({
    userId: v.id("users"),
    content: v.string(),
    role: v.union(v.literal("user"), v.literal("assistant")),
    sessionId: v.string(),
  }).index("by_session", ["sessionId"]),

  benchmarkRuns: defineTable({
    userId: v.id("users"),
    name: v.string(),
    status: v.union(v.literal("running"), v.literal("completed"), v.literal("failed")),
    results: v.optional(v.object({
      accuracy: v.number(),
      latency: v.number(),
      throughput: v.number(),
    })),
    startTime: v.number(),
    endTime: v.optional(v.number()),
  }).index("by_user", ["userId"]),
};

export default defineSchema({
  ...authTables,
  ...applicationTables,
});
