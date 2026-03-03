import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

export const startBenchmark = mutation({
  args: {
    name: v.string(),
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
    });

    // Simulate benchmark completion after 3-5 seconds
    await ctx.scheduler.runAfter(
      Math.random() * 2000 + 3000, // 3-5 seconds
      "benchmark:completeBenchmark" as any,
      { benchmarkId }
    );

    return benchmarkId;
  },
});

export const completeBenchmark = mutation({
  args: {
    benchmarkId: v.id("benchmarkRuns"),
  },
  handler: async (ctx, args) => {
    // Mock benchmark results
    const mockResults = {
      accuracy: Math.random() * 0.3 + 0.7, // 70-100%
      latency: Math.random() * 100 + 50, // 50-150ms
      throughput: Math.random() * 500 + 1000, // 1000-1500 req/s
    };

    await ctx.db.patch(args.benchmarkId, {
      status: "completed",
      results: mockResults,
      endTime: Date.now(),
    });

    return null;
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
