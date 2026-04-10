/**
 * @module convex/evaluation — Model Benchmarking Actions
 *
 * Convex actions for running structured evaluations of different LLM models
 * against a golden set of test queries. Each query is sent through the same
 * LLM + MCP pipeline used in production, and metrics are collected.
 *
 * Mutations and queries are in evaluationHelpers.ts (Convex requires them
 * in the default runtime, not Node.js).
 *
 * ## Usage
 *
 * Trigger an eval from the Convex dashboard:
 * ```
 * api.evaluation.startEval({ modelId: "claude-opus-4-6" })
 * ```
 *
 * Export results:
 * ```
 * api.evaluationHelpers.exportResults({ runIds: [runId1, runId2] })
 * ```
 */

"use node";

import { v } from "convex/values";
import { action, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  connectAndDiscoverTools,
  closeMCPClient,
  buildSystemPrompt,
  runLLMWithTools,
} from "./ai";
import goldenSet from "../eval/golden-set.json";

// ─── Types ──────────────────────────────────────────────────────────────────

interface GoldenQuery {
  query: string;
  expectedChql: string;
  expectedKkeys: string[];
  category: string;
}

// ─── Cost Estimation ────────────────────────────────────────────────────────

/**
 * Per-token pricing in USD. Costs are per 1M tokens.
 * Self-hosted models have zero marginal API cost.
 */
const PRICING: Record<string, { input: number; output: number }> = {
  "claude-opus-4-6": { input: 15, output: 75 },
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-haiku-4-5": { input: 0.8, output: 4 },
  // GPT-5.x pricing — update when available
  "gpt-5.4": { input: 2.5, output: 10 },
  "gpt-5.3": { input: 1, output: 4 },
};

function estimateCost(
  modelId: string,
  inputTokens: number,
  outputTokens: number,
): number | undefined {
  const pricing = PRICING[modelId];
  if (!pricing) return undefined;
  return (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000;
}

// ─── K-key Extraction ───────────────────────────────────────────────────────

function extractKkeys(chql: string): string[] {
  const matches = chql.match(/K[X]?\d+/g);
  return matches ? [...new Set(matches)] : [];
}

function kkeysMatch(actual: string[], expected: string[]): boolean {
  if (actual.length !== expected.length) return false;
  const sortedActual = [...actual].sort();
  const sortedExpected = [...expected].sort();
  return sortedActual.every((k, i) => k === sortedExpected[i]);
}

function normalizeChql(chql: string): string {
  return chql.trim().replace(/\s+/g, " ").toUpperCase();
}

// ─── Core Eval Logic ────────────────────────────────────────────────────────

async function runSingleQuery(
  queryEntry: GoldenQuery,
  modelId: string,
): Promise<{
  response: string;
  dslQuery?: string;
  usedTool: boolean;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  responseTimeMs: number;
}> {
  const { client: mcpClient, tools } = await connectAndDiscoverTools();

  try {
    const systemPrompt = buildSystemPrompt(Object.keys(tools).length > 0);
    const chatHistory = [{ role: "user" as const, content: queryEntry.query }];

    const startTime = Date.now();
    const result = await runLLMWithTools(
      systemPrompt,
      chatHistory,
      tools,
      modelId,
    );
    const responseTimeMs = Date.now() - startTime;

    return {
      response: result.response,
      dslQuery: result.metadata?.dslQuery,
      usedTool: (result.metadata?.toolCalls?.length ?? 0) > 0,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      totalTokens: result.usage.totalTokens,
      responseTimeMs,
    };
  } finally {
    if (mcpClient) {
      await closeMCPClient(mcpClient);
    }
  }
}

// ─── Exported Actions ───────────────────────────────────────────────────────

/**
 * Runs the full eval benchmark for a given model.
 *
 * Iterates through all queries in the golden set, runs each against the model,
 * collects metrics, and stores results. Failed queries are retried once.
 */
export const runEval = internalAction({
  args: {
    modelId: v.string(),
  },
  handler: async (ctx, args) => {
    const queries = goldenSet as GoldenQuery[];

    const runId = await ctx.runMutation(internal.evaluationHelpers.createEvalRun, {
      modelId: args.modelId,
      totalQueries: queries.length,
    });

    console.log(
      `[Eval] Starting eval run for model ${args.modelId} with ${queries.length} queries`,
    );

    let successCount = 0;
    let toolUsageCount = 0;
    let chqlValidCount = 0;
    let kkeysCorrectCount = 0;
    let totalResponseTime = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalTokensAll = 0;
    let totalCost = 0;
    let goldenMatchCount = 0;
    let validResultCount = 0;

    try {
      for (let i = 0; i < queries.length; i++) {
        const queryEntry = queries[i];

        for (let attempt = 1; attempt <= 2; attempt++) {
          try {
            console.log(
              `[Eval] Query ${i + 1}/${queries.length} (attempt ${attempt}): "${queryEntry.query}"`,
            );

            const result = await runSingleQuery(queryEntry, args.modelId);

            const usedTool = result.usedTool;
            const actualChql = result.dslQuery;
            const chqlValid = usedTool && !!actualChql;

            let kkeysCorrect: boolean | undefined;
            if (actualChql && queryEntry.expectedKkeys.length > 0) {
              const actualKkeys = extractKkeys(actualChql);
              kkeysCorrect = kkeysMatch(actualKkeys, queryEntry.expectedKkeys);
            }

            const goldenMatch =
              actualChql !== undefined &&
              normalizeChql(actualChql) === normalizeChql(queryEntry.expectedChql);

            const cost = estimateCost(
              args.modelId,
              result.inputTokens,
              result.outputTokens,
            );

            const success = usedTool && chqlValid;

            await ctx.runMutation(internal.evaluationHelpers.insertEvalResult, {
              runId,
              queryIndex: i,
              userQuery: queryEntry.query,
              category: queryEntry.category,
              expectedChql: queryEntry.expectedChql,
              expectedKkeys: queryEntry.expectedKkeys,
              actualChql,
              modelResponse: result.response.slice(0, 2000),
              attempt,
              success,
              metrics: {
                responseTimeMs: result.responseTimeMs,
                inputTokens: result.inputTokens,
                outputTokens: result.outputTokens,
                totalTokens: result.totalTokens,
                costUsd: cost,
                chqlValid,
                usedTool,
                kkeysCorrect,
              },
            });

            // Count metrics from the final attempt used
            if (attempt === 1 || !success) {
              validResultCount++;
              if (success) successCount++;
              if (usedTool) toolUsageCount++;
              if (chqlValid) chqlValidCount++;
              if (kkeysCorrect) kkeysCorrectCount++;
              if (goldenMatch) goldenMatchCount++;
              totalResponseTime += result.responseTimeMs;
              totalInputTokens += result.inputTokens;
              totalOutputTokens += result.outputTokens;
              totalTokensAll += result.totalTokens;
              totalCost += cost ?? 0;
            }

            if (success) break;

            console.log(
              `[Eval] Query ${i + 1} attempt ${attempt} failed, ${attempt < 2 ? "retrying..." : "moving on."}`,
            );
          } catch (error) {
            console.error(
              `[Eval] Query ${i + 1} attempt ${attempt} threw error:`,
              error,
            );

            await ctx.runMutation(internal.evaluationHelpers.insertEvalResult, {
              runId,
              queryIndex: i,
              userQuery: queryEntry.query,
              category: queryEntry.category,
              expectedChql: queryEntry.expectedChql,
              expectedKkeys: queryEntry.expectedKkeys,
              attempt,
              success: false,
              metrics: {
                responseTimeMs: 0,
                inputTokens: 0,
                outputTokens: 0,
                totalTokens: 0,
                usedTool: false,
              },
            });

            if (attempt === 1) validResultCount++;
          }
        }
      }

      const n = validResultCount || 1;
      const aggregateMetrics = {
        successRate: successCount / n,
        avgResponseTimeMs: totalResponseTime / n,
        avgInputTokens: totalInputTokens / n,
        avgOutputTokens: totalOutputTokens / n,
        avgTotalTokens: totalTokensAll / n,
        totalCostUsd: totalCost,
        chqlValidityRate: chqlValidCount / n,
        toolUsageRate: toolUsageCount / n,
        goldenSetAccuracy: goldenMatchCount / n,
      };

      await ctx.runMutation(internal.evaluationHelpers.updateEvalRunStatus, {
        runId,
        status: "completed",
        completedAt: Date.now(),
        aggregateMetrics,
      });

      console.log(
        `[Eval] Completed eval for ${args.modelId}:`,
        JSON.stringify(aggregateMetrics, null, 2),
      );
    } catch (error) {
      console.error(`[Eval] Eval run failed for ${args.modelId}:`, error);
      await ctx.runMutation(internal.evaluationHelpers.updateEvalRunStatus, {
        runId,
        status: "failed",
        completedAt: Date.now(),
      });
    }
  },
});

/**
 * Public action to trigger an eval run.
 */
export const startEval = action({
  args: {
    modelId: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.runAction(internal.evaluation.runEval, {
      modelId: args.modelId,
    });
  },
});
