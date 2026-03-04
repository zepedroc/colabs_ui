import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

const benchmarkAnswerStatus = v.union(
  v.literal("correct"),
  v.literal("incorrect"),
  v.literal("parsing_error"),
);

const benchmarkModelResult = v.object({
  model: v.string(),
  round1RawResponse: v.optional(v.union(v.string(), v.null())),
  finalRawResponse: v.optional(v.union(v.string(), v.null())),
  round1Option: v.optional(v.union(v.string(), v.null())),
  finalOption: v.optional(v.union(v.string(), v.null())),
  round1Correct: v.boolean(),
  finalCorrect: v.boolean(),
  round1Status: v.optional(benchmarkAnswerStatus),
  finalStatus: v.optional(benchmarkAnswerStatus),
  round1ParseError: v.optional(v.union(v.string(), v.null())),
  finalParseError: v.optional(v.union(v.string(), v.null())),
});

const applicationTables = {
  chatMessages: defineTable({
    userId: v.id("users"),
    content: v.string(),
    role: v.union(v.literal("user"), v.literal("assistant")),
    sessionId: v.string(),
    source: v.optional(
      v.union(
        v.literal("user"),
        v.literal("fastapi_round"),
        v.literal("fastapi_final"),
        v.literal("fastapi_error"),
      ),
    ),
    round: v.optional(v.number()),
    model: v.optional(v.string()),
  }).index("by_session", ["sessionId"]),

  benchmarkRuns: defineTable({
    userId: v.id("users"),
    name: v.string(),
    status: v.union(v.literal("running"), v.literal("completed"), v.literal("failed")),
    results: v.optional(v.object({
      totalCases: v.number(),
      round1Correct: v.number(),
      finalCorrect: v.number(),
      round1Accuracy: v.number(),
      finalAccuracy: v.number(),
      delta: v.number(),
    })),
    activeCase: v.optional(v.string()),
    filePath: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
    startTime: v.number(),
    endTime: v.optional(v.number()),
  }).index("by_user", ["userId"]),

  benchmarkCaseResults: defineTable({
    benchmarkRunId: v.id("benchmarkRuns"),
    userId: v.id("users"),
    caseIndex: v.number(),
    question: v.string(),
    expectedOption: v.string(),
    modelResults: v.array(benchmarkModelResult),
  })
    .index("by_run", ["benchmarkRunId"])
    .index("by_user_and_run", ["userId", "benchmarkRunId"]),

  lifeManagementTasks: defineTable({
    userId: v.id("users"),
    title: v.string(),
    status: v.union(
      v.literal("todo"),
      v.literal("in_progress"),
      v.literal("done"),
    ),
    order: v.number(),
  }).index("by_user_and_status", ["userId", "status"]),

  lifeManagementPains: defineTable({
    userId: v.id("users"),
    content: v.string(),
  }).index("by_user", ["userId"]),

  lifeManagementLearnings: defineTable({
    userId: v.id("users"),
    content: v.string(),
    order: v.number(),
  }).index("by_user", ["userId"]),
};

export default defineSchema({
  ...authTables,
  ...applicationTables,
});
