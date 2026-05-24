// See ./CONTEXT.md for module overview.
// Split from evaluation.ts because mutations/queries must run in Convex's default
// V8 runtime, while the AI-SDK-dependent actions in evaluation.ts need "use node".

import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { internalMutation, internalQuery, query } from "./_generated/server";

// ─── Shared aggregate math ──────────────────────────────────────────────────

// Used by both finalizeEvalRun (live runs) and recomputeRunAggregates (rejudge).
// Rate/average metrics use attempt-1 rows only; cost sums every attempt.
export function computeAggregateMetrics(results: Doc<"evalResults">[]) {
  const firstAttempts = results.filter((r) => r.attempt === 1);

  let successCount = 0;
  let toolUsageCount = 0;
  let chqlParsesCount = 0;
  let equivalenceCount = 0;
  let kkeysCorrectCount = 0;
  let totalResponseTime = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalTokensAll = 0;

  for (const r of firstAttempts) {
    if (r.success) successCount++;
    if (r.metrics.usedTool) toolUsageCount++;
    if (r.metrics.chqlParses) chqlParsesCount++;
    if (r.metrics.chqlEquivalent === "equivalent") equivalenceCount++;
    if (r.metrics.kkeysCorrect) kkeysCorrectCount++;
    totalResponseTime += r.metrics.responseTimeMs;
    totalInputTokens += r.metrics.inputTokens;
    totalOutputTokens += r.metrics.outputTokens;
    totalTokensAll += r.metrics.totalTokens;
  }

  let totalCost = 0;
  for (const r of results) totalCost += r.metrics.costUsd ?? 0;

  const n = firstAttempts.length || 1;
  return {
    aggregateMetrics: {
      successRate: successCount / n,
      avgResponseTimeMs: totalResponseTime / n,
      avgInputTokens: totalInputTokens / n,
      avgOutputTokens: totalOutputTokens / n,
      avgTotalTokens: totalTokensAll / n,
      totalCostUsd: totalCost,
      chqlParsesRate: chqlParsesCount / n,
      equivalenceRate: equivalenceCount / n,
      toolUsageRate: toolUsageCount / n,
    },
    kkeysCorrectCount,
    firstAttemptCount: firstAttempts.length,
  };
}

// ─── Internal mutations ─────────────────────────────────────────────────────

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
        chqlParsesRate: v.number(),
        equivalenceRate: v.number(),
        toolUsageRate: v.number(),
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

/** Final mutation in the scheduler chain: sets status=completed + completedAt + aggregates. */
export const finalizeEvalRun = internalMutation({
  args: {
    runId: v.id("evalRuns"),
  },
  handler: async (ctx, args) => {
    const results = await ctx.db
      .query("evalResults")
      .withIndex("by_run", (q) => q.eq("runId", args.runId))
      .collect();

    const { aggregateMetrics, kkeysCorrectCount, firstAttemptCount } =
      computeAggregateMetrics(results);

    await ctx.db.patch(args.runId, {
      status: "completed",
      completedAt: Date.now(),
      aggregateMetrics,
    });

    console.log(
      `[Eval] Finalized run ${args.runId}: kkeysCorrectCount=${kkeysCorrectCount}/${firstAttemptCount}, metrics=${JSON.stringify(aggregateMetrics)}`,
    );
  },
});

export const insertEvalResult = internalMutation({
  args: {
    runId: v.id("evalRuns"),
    queryIndex: v.number(),
    userQuery: v.string(),
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
      usedTool: v.boolean(),
      kkeysCorrect: v.optional(v.boolean()),
      chqlParses: v.optional(v.boolean()),
      chqlEquivalent: v.optional(
        v.union(
          v.literal("equivalent"),
          v.literal("different"),
          v.literal("expected_empty"),
          v.literal("actual_error"),
        ),
      ),
    }),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("evalResults", args);
  },
});

export const getResultsForRun = internalQuery({
  args: { runId: v.id("evalRuns") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("evalResults")
      .withIndex("by_run", (q) => q.eq("runId", args.runId))
      .collect();
  },
});

/** `metrics` is replaced wholesale — caller must supply the full object. */
export const patchEvalResultFields = internalMutation({
  args: {
    resultId: v.id("evalResults"),
    expectedChql: v.optional(v.string()),
    expectedKkeys: v.optional(v.array(v.string())),
    success: v.boolean(),
    metrics: v.object({
      responseTimeMs: v.number(),
      inputTokens: v.number(),
      outputTokens: v.number(),
      totalTokens: v.number(),
      costUsd: v.optional(v.number()),
      usedTool: v.boolean(),
      kkeysCorrect: v.optional(v.boolean()),
      chqlParses: v.optional(v.boolean()),
      chqlEquivalent: v.optional(
        v.union(
          v.literal("equivalent"),
          v.literal("different"),
          v.literal("expected_empty"),
          v.literal("actual_error"),
        ),
      ),
    }),
  },
  handler: async (ctx, args) => {
    const { resultId, ...patch } = args;
    await ctx.db.patch(resultId, patch);
  },
});

/** Like finalizeEvalRun but leaves status/completedAt alone (used by rejudgeRun). */
export const recomputeRunAggregates = internalMutation({
  args: { runId: v.id("evalRuns") },
  handler: async (ctx, args) => {
    const results = await ctx.db
      .query("evalResults")
      .withIndex("by_run", (q) => q.eq("runId", args.runId))
      .collect();

    const { aggregateMetrics } = computeAggregateMetrics(results);
    await ctx.db.patch(args.runId, { aggregateMetrics });
    return aggregateMetrics;
  },
});

// ─── Queries ────────────────────────────────────────────────────────────────

export const exportResults = query({
  args: {
    runIds: v.array(v.id("evalRuns")),
  },
  handler: async (ctx, args) => {
    const header =
      "model,query,attempt,success,response_time_ms,input_tokens,output_tokens,total_tokens,cost_usd,chql_parses,chql_equivalent,used_tool,kkeys_correct,expected_chql,actual_chql";

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
          result.attempt,
          result.success,
          result.metrics.responseTimeMs,
          result.metrics.inputTokens,
          result.metrics.outputTokens,
          result.metrics.totalTokens,
          result.metrics.costUsd ?? "",
          result.metrics.chqlParses ?? "",
          result.metrics.chqlEquivalent ?? "",
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

/** Per-run aggregates in input order. Consumed by eval/aggregate-summary.ts. */
export const exportAggregates = query({
  args: {
    runIds: v.array(v.id("evalRuns")),
  },
  handler: async (ctx, args) => {
    const out = [];
    for (const runId of args.runIds) {
      const run = await ctx.db.get(runId);
      if (!run) {
        out.push({ runId, found: false as const });
        continue;
      }
      out.push({
        runId,
        found: true as const,
        modelId: run.modelId,
        status: run.status,
        startedAt: run.startedAt,
        completedAt: run.completedAt,
        totalQueries: run.totalQueries,
        aggregateMetrics: run.aggregateMetrics,
      });
    }
    return out;
  },
});

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
