/**
 * @module convex/evaluationHelpers — Mutations and queries for eval data
 *
 * Separated from evaluation.ts because Convex requires mutations/queries
 * to run in the default (non-Node.js) runtime, while actions with AI SDK
 * imports need "use node".
 */

import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";

// ─── Internal Mutations ─────────────────────────────────────────────────────

export const createEvalRun = internalMutation({
  args: {
    modelId: v.string(),
    totalQueries: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("evalRuns", {
      modelId: args.modelId,
      startedAt: Date.now(),
      status: "running",
      totalQueries: args.totalQueries,
    });
  },
});

export const updateEvalRunStatus = internalMutation({
  args: {
    runId: v.id("evalRuns"),
    status: v.union(
      v.literal("running"),
      v.literal("completed"),
      v.literal("failed"),
    ),
    completedAt: v.optional(v.number()),
    aggregateMetrics: v.optional(
      v.object({
        successRate: v.number(),
        avgResponseTimeMs: v.number(),
        avgInputTokens: v.number(),
        avgOutputTokens: v.number(),
        avgTotalTokens: v.number(),
        totalCostUsd: v.number(),
        chqlValidityRate: v.number(),
        toolUsageRate: v.number(),
        goldenSetAccuracy: v.number(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.runId, {
      status: args.status,
      completedAt: args.completedAt,
      aggregateMetrics: args.aggregateMetrics,
    });
  },
});

export const insertEvalResult = internalMutation({
  args: {
    runId: v.id("evalRuns"),
    queryIndex: v.number(),
    userQuery: v.string(),
    category: v.string(),
    expectedChql: v.optional(v.string()),
    expectedKkeys: v.optional(v.array(v.string())),
    actualChql: v.optional(v.string()),
    modelResponse: v.optional(v.string()),
    attempt: v.number(),
    success: v.boolean(),
    metrics: v.object({
      responseTimeMs: v.number(),
      inputTokens: v.number(),
      outputTokens: v.number(),
      totalTokens: v.number(),
      costUsd: v.optional(v.number()),
      chqlValid: v.optional(v.boolean()),
      usedTool: v.boolean(),
      kkeysCorrect: v.optional(v.boolean()),
    }),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("evalResults", args);
  },
});

// ─── Queries ────────────────────────────────────────────────────────────────

/**
 * Exports eval results as a CSV string for the given run IDs.
 */
export const exportResults = query({
  args: {
    runIds: v.array(v.id("evalRuns")),
  },
  handler: async (ctx, args) => {
    const header =
      "model,query,category,attempt,success,response_time_ms,input_tokens,output_tokens,total_tokens,cost_usd,chql_valid,used_tool,kkeys_correct,expected_chql,actual_chql";

    const rows: string[] = [header];

    for (const runId of args.runIds) {
      const run = await ctx.db.get(runId);
      if (!run) continue;

      const results = await ctx.db
        .query("evalResults")
        .withIndex("by_run", (q) => q.eq("runId", runId))
        .collect();

      for (const result of results) {
        const csvRow = [
          csvEscape(run.modelId),
          csvEscape(result.userQuery),
          csvEscape(result.category),
          result.attempt,
          result.success,
          result.metrics.responseTimeMs,
          result.metrics.inputTokens,
          result.metrics.outputTokens,
          result.metrics.totalTokens,
          result.metrics.costUsd ?? "",
          result.metrics.chqlValid ?? "",
          result.metrics.usedTool,
          result.metrics.kkeysCorrect ?? "",
          csvEscape(result.expectedChql ?? ""),
          csvEscape(result.actualChql ?? ""),
        ].join(",");

        rows.push(csvRow);
      }
    }

    return rows.join("\n");
  },
});

/**
 * Lists all eval runs, optionally filtered by model.
 */
export const listRuns = query({
  args: {
    modelId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.modelId) {
      return await ctx.db
        .query("evalRuns")
        .withIndex("by_model", (q) => q.eq("modelId", args.modelId!))
        .collect();
    }
    return await ctx.db.query("evalRuns").collect();
  },
});

// ─── Utilities ──────────────────────────────────────────────────────────────

function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
