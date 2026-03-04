import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, mutation, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { Id } from "./_generated/dataModel";
import { getFastApiBaseUrl } from "./fastapiConfig";

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

function buildBenchmarkRequestUrl() {
  return `${getFastApiBaseUrl()}/benchmark/run`;
}

export const startBenchmark = mutation({
  args: {
    name: v.string(),
    filePath: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const benchmarkId = await ctx.db.insert("benchmarkRuns", {
      userId,
      name: args.name,
      status: "running",
      startTime: Date.now(),
      filePath: args.filePath,
    });

    await ctx.scheduler.runAfter(0, internal.benchmark.runBenchmarkAgainstFastApi, {
      benchmarkId,
      userId,
      filePath: args.filePath,
    });

    return benchmarkId;
  },
});

export const getBenchmarks = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return [];
    }

    return await ctx.db
      .query("benchmarkRuns")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(20);
  },
});

export const getBenchmarkCaseResults = query({
  args: {
    benchmarkId: v.id("benchmarkRuns"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return [];
    }

    const run = await ctx.db.get(args.benchmarkId);
    if (!run || run.userId !== userId) {
      return [];
    }

    return await ctx.db
      .query("benchmarkCaseResults")
      .withIndex("by_user_and_run", (q) => q.eq("userId", userId).eq("benchmarkRunId", args.benchmarkId))
      .collect();
  },
});

export const setBenchmarkActiveCase = internalMutation({
  args: {
    benchmarkId: v.id("benchmarkRuns"),
    activeCase: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.benchmarkId, {
      activeCase: args.activeCase,
    });
  },
});

export const upsertBenchmarkCaseResult = internalMutation({
  args: {
    benchmarkId: v.id("benchmarkRuns"),
    userId: v.id("users"),
    caseIndex: v.number(),
    question: v.string(),
    expectedOption: v.string(),
    modelResults: v.array(benchmarkModelResult),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("benchmarkCaseResults")
      .withIndex("by_run", (q) => q.eq("benchmarkRunId", args.benchmarkId))
      .collect();
    const existingDoc = existing.find((doc) => doc.caseIndex === args.caseIndex);

    if (existingDoc) {
      await ctx.db.patch(existingDoc._id, {
        question: args.question,
        expectedOption: args.expectedOption,
        modelResults: args.modelResults,
      });
      return;
    }

    await ctx.db.insert("benchmarkCaseResults", {
      benchmarkRunId: args.benchmarkId,
      userId: args.userId,
      caseIndex: args.caseIndex,
      question: args.question,
      expectedOption: args.expectedOption,
      modelResults: args.modelResults,
    });
  },
});

export const completeBenchmarkRun = internalMutation({
  args: {
    benchmarkId: v.id("benchmarkRuns"),
    summary: v.object({
      totalCases: v.number(),
      round1Correct: v.number(),
      finalCorrect: v.number(),
      round1Accuracy: v.number(),
      finalAccuracy: v.number(),
      delta: v.number(),
    }),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.benchmarkId, {
      status: "completed",
      activeCase: undefined,
      endTime: Date.now(),
      results: args.summary,
      errorMessage: undefined,
    });
  },
});

export const failBenchmarkRun = internalMutation({
  args: {
    benchmarkId: v.id("benchmarkRuns"),
    message: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.benchmarkId, {
      status: "failed",
      activeCase: undefined,
      endTime: Date.now(),
      errorMessage: args.message,
    });
  },
});

export const runBenchmarkAgainstFastApi = internalAction({
  args: {
    benchmarkId: v.id("benchmarkRuns"),
    userId: v.id("users"),
    filePath: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    try {
      const response = await fetch(buildBenchmarkRequestUrl(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/x-ndjson",
        },
        body: JSON.stringify(args.filePath ? { file_path: args.filePath } : {}),
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
      let hasSummary = false;

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
            case_index?: number;
            question?: string;
            data?: {
              case_index?: number;
              question?: string;
              expected_option?: string;
              model_results?: Array<{
                model: string;
                round1_raw_response?: string | null;
                final_raw_response?: string | null;
                round1_option?: string | null;
                final_option?: string | null;
                round1_correct: boolean;
                final_correct: boolean;
                round1_status?: "correct" | "incorrect" | "parsing_error";
                final_status?: "correct" | "incorrect" | "parsing_error";
                round1_parse_error?: string | null;
                final_parse_error?: string | null;
              }>;
              total_cases?: number;
              round1_correct?: number;
              final_correct?: number;
              round1_accuracy?: number;
              final_accuracy?: number;
              delta?: number;
            };
          };
          try {
            event = JSON.parse(line);
          } catch {
            continue;
          }

          if (event.type === "benchmark_case_started") {
            await ctx.runMutation(internal.benchmark.setBenchmarkActiveCase, {
              benchmarkId: args.benchmarkId,
              activeCase: `Case ${(event.case_index ?? 0) + 1}: ${event.question ?? ""}`.trim(),
            });
            continue;
          }

          if (event.type === "benchmark_case_result" && event.data) {
            await ctx.runMutation(internal.benchmark.upsertBenchmarkCaseResult, {
              benchmarkId: args.benchmarkId,
              userId: args.userId as Id<"users">,
              caseIndex: event.data.case_index ?? 0,
              question: event.data.question ?? "",
              expectedOption: event.data.expected_option ?? "",
              modelResults: (event.data.model_results ?? []).map((result) => ({
                model: result.model,
                round1RawResponse: result.round1_raw_response ?? null,
                finalRawResponse: result.final_raw_response ?? null,
                round1Option: result.round1_option ?? null,
                finalOption: result.final_option ?? null,
                round1Correct: Boolean(result.round1_correct),
                finalCorrect: Boolean(result.final_correct),
                round1Status: result.round1_status,
                finalStatus: result.final_status,
                round1ParseError: result.round1_parse_error ?? null,
                finalParseError: result.final_parse_error ?? null,
              })),
            });
            continue;
          }

          if (event.type === "benchmark_summary" && event.data) {
            hasSummary = true;
            await ctx.runMutation(internal.benchmark.completeBenchmarkRun, {
              benchmarkId: args.benchmarkId,
              summary: {
                totalCases: event.data.total_cases ?? 0,
                round1Correct: event.data.round1_correct ?? 0,
                finalCorrect: event.data.final_correct ?? 0,
                round1Accuracy: event.data.round1_accuracy ?? 0,
                finalAccuracy: event.data.final_accuracy ?? 0,
                delta: event.data.delta ?? 0,
              },
            });
          }
        }

        if (done) {
          break;
        }
      }

      if (!hasSummary) {
        await ctx.runMutation(internal.benchmark.failBenchmarkRun, {
          benchmarkId: args.benchmarkId,
          message: "Benchmark stream ended before summary was received.",
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown FastAPI error";
      await ctx.runMutation(internal.benchmark.failBenchmarkRun, {
        benchmarkId: args.benchmarkId,
        message,
      });
    }
  },
});
