import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

const taskStatus = v.union(
  v.literal("todo"),
  v.literal("in_progress"),
  v.literal("done"),
);

const taskPriority = v.union(
  v.literal("low"),
  v.literal("medium"),
  v.literal("high"),
  v.literal("urgent"),
);

const PRIORITY_ORDER = { low: 0, medium: 1, high: 2, urgent: 3 } as const;

// --- Tags ---

export const listTags = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return [];
    }
    return await ctx.db
      .query("lifeManagementTags")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
  },
});

export const createTag = mutation({
  args: {
    name: v.string(),
    color: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }
    return await ctx.db.insert("lifeManagementTags", {
      userId,
      name: args.name,
      color: args.color,
    });
  },
});

export const deleteTag = mutation({
  args: {
    tagId: v.id("lifeManagementTags"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }
    const tag = await ctx.db.get(args.tagId);
    if (!tag || tag.userId !== userId) {
      throw new Error("Tag not found");
    }
    await ctx.db.delete(args.tagId);
    return null;
  },
});

// --- Tasks (Kanban) ---

export const listTasks = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return [];
    }

    const statuses = ["todo", "in_progress", "done"] as const;
    const allTasks = [];

    for (const status of statuses) {
      const tasks = await ctx.db
        .query("lifeManagementTasks")
        .withIndex("by_user_and_status", (q) =>
          q.eq("userId", userId).eq("status", status),
        )
        .collect();
      allTasks.push(...tasks);
    }

    return allTasks.sort((a, b) => {
      if (a.status !== b.status) {
        return statuses.indexOf(a.status) - statuses.indexOf(b.status);
      }
      const aPriority = a.priority ? PRIORITY_ORDER[a.priority] : -1;
      const bPriority = b.priority ? PRIORITY_ORDER[b.priority] : -1;
      if (aPriority !== bPriority) {
        return bPriority - aPriority; // higher priority first
      }
      return a.order - b.order;
    });
  },
});

export const createTask = mutation({
  args: {
    title: v.string(),
    status: taskStatus,
    description: v.optional(v.string()),
    priority: v.optional(taskPriority),
    tagIds: v.optional(v.array(v.id("lifeManagementTags"))),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const existingTasks = await ctx.db
      .query("lifeManagementTasks")
      .withIndex("by_user_and_status", (q) =>
        q.eq("userId", userId).eq("status", args.status),
      )
      .collect();

    const order = existingTasks.length > 0
      ? Math.max(...existingTasks.map((t) => t.order)) + 1
      : 0;

    return await ctx.db.insert("lifeManagementTasks", {
      userId,
      title: args.title,
      status: args.status,
      order,
      description: args.description,
      priority: args.priority ?? "low",
      tagIds: args.tagIds,
    });
  },
});

export const updateTask = mutation({
  args: {
    taskId: v.id("lifeManagementTasks"),
    title: v.optional(v.string()),
    description: v.optional(v.union(v.string(), v.null())),
    priority: v.optional(v.union(taskPriority, v.null())),
    tagIds: v.optional(v.array(v.id("lifeManagementTags"))),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const task = await ctx.db.get(args.taskId);
    if (!task || task.userId !== userId) {
      throw new Error("Task not found");
    }

    const updates: Record<string, unknown> = {};
    if (args.title !== undefined) updates.title = args.title;
    if (args.description !== undefined) updates.description = args.description;
    if (args.priority !== undefined) updates.priority = args.priority;
    if (args.tagIds !== undefined) updates.tagIds = args.tagIds;

    if (Object.keys(updates).length > 0) {
      await ctx.db.patch(args.taskId, updates);
    }
    return null;
  },
});

export const moveTask = mutation({
  args: {
    taskId: v.id("lifeManagementTasks"),
    destinationStatus: taskStatus,
    destinationIndex: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const task = await ctx.db.get(args.taskId);
    if (!task || task.userId !== userId) {
      throw new Error("Task not found");
    }

    const oldStatus = task.status;

    const getTasksInColumn = async (status: typeof task.status) => {
      return (
        await ctx.db
          .query("lifeManagementTasks")
          .withIndex("by_user_and_status", (q) =>
            q.eq("userId", userId).eq("status", status),
          )
          .collect()
      ).sort((a, b) => a.order - b.order);
    };

    if (oldStatus === args.destinationStatus) {
      const tasks = await getTasksInColumn(oldStatus);
      const sourceIndex = tasks.findIndex((t) => t._id === args.taskId);
      if (sourceIndex === -1 || sourceIndex === args.destinationIndex) {
        return null;
      }
      const [moved] = tasks.splice(sourceIndex, 1);
      tasks.splice(args.destinationIndex, 0, moved);
      for (let i = 0; i < tasks.length; i++) {
        await ctx.db.patch(tasks[i]._id, { order: i });
      }
    } else {
      const sourceTasks = await getTasksInColumn(oldStatus);
      const destTasks = await getTasksInColumn(args.destinationStatus);
      const sourceIndex = sourceTasks.findIndex((t) => t._id === args.taskId);
      if (sourceIndex === -1) return null;

      const [moved] = sourceTasks.splice(sourceIndex, 1);
      destTasks.splice(args.destinationIndex, 0, moved);

      for (let i = 0; i < sourceTasks.length; i++) {
        await ctx.db.patch(sourceTasks[i]._id, { order: i });
      }
      for (let i = 0; i < destTasks.length; i++) {
        await ctx.db.patch(destTasks[i]._id, {
          status: args.destinationStatus,
          order: i,
        });
      }
    }
    return null;
  },
});

export const deleteTask = mutation({
  args: {
    taskId: v.id("lifeManagementTasks"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const task = await ctx.db.get(args.taskId);
    if (!task || task.userId !== userId) {
      throw new Error("Task not found");
    }

    await ctx.db.delete(args.taskId);
    return null;
  },
});

// --- Pains ---

export const listPains = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return [];
    }

    return await ctx.db
      .query("lifeManagementPains")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
  },
});

export const addPain = mutation({
  args: {
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    return await ctx.db.insert("lifeManagementPains", {
      userId,
      content: args.content,
    });
  },
});

export const removePain = mutation({
  args: {
    painId: v.id("lifeManagementPains"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const pain = await ctx.db.get(args.painId);
    if (!pain || pain.userId !== userId) {
      throw new Error("Pain not found");
    }

    await ctx.db.delete(args.painId);
    return null;
  },
});

// --- Learnings ---

export const listLearnings = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return [];
    }

    const learnings = await ctx.db
      .query("lifeManagementLearnings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    return learnings.sort((a, b) => a.order - b.order);
  },
});

export const addLearning = mutation({
  args: {
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const existing = await ctx.db
      .query("lifeManagementLearnings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    const order = existing.length > 0
      ? Math.max(...existing.map((l) => l.order)) + 1
      : 0;

    return await ctx.db.insert("lifeManagementLearnings", {
      userId,
      content: args.content,
      order,
    });
  },
});

export const removeLearning = mutation({
  args: {
    learningId: v.id("lifeManagementLearnings"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const learning = await ctx.db.get(args.learningId);
    if (!learning || learning.userId !== userId) {
      throw new Error("Learning not found");
    }

    await ctx.db.delete(args.learningId);
    return null;
  },
});

export const reorderLearnings = mutation({
  args: {
    learningId: v.id("lifeManagementLearnings"),
    order: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const learning = await ctx.db.get(args.learningId);
    if (!learning || learning.userId !== userId) {
      throw new Error("Learning not found");
    }

    await ctx.db.patch(args.learningId, { order: args.order });
    return null;
  },
});
