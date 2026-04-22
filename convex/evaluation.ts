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
import type { Id } from "./_generated/dataModel";
import { action, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  connectAndDiscoverTools,
  closeMCPClient,
  buildSystemPrompt,
  runLLMWithTools,
  callMCPTool,
} from "./ai";
import { parseChql } from "./chql/parse";
import { hashMCPResponseText } from "./chql/hash";
import goldenSet from "../eval/golden-set.json";

// ─── Types ──────────────────────────────────────────────────────────────────

interface GoldenQuery {
  query: string;
  expectedChql: string;
  expectedKkeys: string[];
}

type ChqlEquivalent =
  | "equivalent"
  | "different"
  | "expected_empty"
  | "actual_error";

// Large pageSize used for eval-time re-execution so functional comparison
// reflects the full result set (queries returning >1000 rows are truncated,
// which is acceptable for the current golden set).
const EVAL_PAGE_SIZE = 1000;

const SEARCH_TOOL_NAME = "search_measurements";

// ─── Cost Estimation ────────────────────────────────────────────────────────

/**
 * Per-token pricing in USD. Costs are per 1M tokens.
 * Self-hosted models have zero marginal API cost.
 */
const PRICING: Record<string, { input: number; output: number }> = {
  "claude-opus-4-6": { input: 15, output: 75 },
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-haiku-4-5": { input: 0.8, output: 4 },
  "gpt-5.4": { input: 2.5, output: 15 },
  "gpt-5.3-chat-latest": { input: 1.75, output: 14 },
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
  const a = new Set(actual);
  const e = new Set(expected);
  if (a.size !== e.size) return false;
  for (const k of e) if (!a.has(k)) return false;
  return true;
}

// ─── Core Eval Logic ────────────────────────────────────────────────────────

interface SingleQueryOutcome {
  response: string;
  dslQuery?: string;
  usedTool: boolean;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  responseTimeMs: number;
  chqlEquivalent: ChqlEquivalent;
}

/**
 * Executes the LLM pipeline for one golden-set entry, then — with the same
 * MCP client still connected — fetches the row-set hashes for both
 * `actualChql` and `expectedChql` back-to-back to compute functional
 * equivalence. The two fetches happen ~100ms apart so that chy.stat data
 * drift during the run can't invalidate the comparison.
 */
async function runSingleQuery(
  queryEntry: GoldenQuery,
  modelId: string,
): Promise<SingleQueryOutcome> {
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

    const actualChql = result.metadata?.dslQuery;
    const chqlEquivalent = await computeEquivalence(
      mcpClient,
      actualChql,
      queryEntry.expectedChql,
    );

    return {
      response: result.response,
      dslQuery: actualChql,
      usedTool: (result.metadata?.toolCalls?.length ?? 0) > 0,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      totalTokens: result.usage.totalTokens,
      responseTimeMs,
      chqlEquivalent,
    };
  } finally {
    if (mcpClient) {
      await closeMCPClient(mcpClient);
    }
  }
}

/**
 * Computes the functional equivalence verdict for one query attempt.
 *
 * Fetches both the actual and expected result sets via MCP back-to-back
 * and compares their row-set hashes. Returns `actual_error` if we can't
 * get a clean response for the actual query, `expected_empty` if the
 * expected query returns zero rows (can't meaningfully compare).
 */
async function computeEquivalence(
  mcpClient: Awaited<ReturnType<typeof connectAndDiscoverTools>>["client"],
  actualChql: string | undefined,
  expectedChql: string,
): Promise<ChqlEquivalent> {
  if (!mcpClient || !actualChql) return "actual_error";

  let actualText: { text: string; isError: boolean };
  try {
    actualText = await callMCPTool(mcpClient, SEARCH_TOOL_NAME, {
      query: actualChql,
      pageSize: EVAL_PAGE_SIZE,
    });
  } catch {
    return "actual_error";
  }
  if (actualText.isError) return "actual_error";

  const actualHash = hashMCPResponseText(actualText.text);
  if (!actualHash) return "actual_error";

  let expectedText: { text: string; isError: boolean };
  try {
    expectedText = await callMCPTool(mcpClient, SEARCH_TOOL_NAME, {
      query: expectedChql,
      pageSize: EVAL_PAGE_SIZE,
    });
  } catch {
    console.warn(
      `[Eval] Expected CHQL fetch failed for "${expectedChql}" — treating as expected_empty`,
    );
    return "expected_empty";
  }
  if (expectedText.isError) {
    console.warn(
      `[Eval] Expected CHQL returned isError for "${expectedChql}" — treating as expected_empty`,
    );
    return "expected_empty";
  }

  const expectedHash = hashMCPResponseText(expectedText.text);
  if (!expectedHash || expectedHash.isEmpty) return "expected_empty";

  return actualHash.hash === expectedHash.hash ? "equivalent" : "different";
}

// ─── Exported Actions ───────────────────────────────────────────────────────

/**
 * Runs a single query from the golden set as its own scheduled action.
 *
 * This is the core of the scheduler-based eval pipeline. Each query
 * (and each attempt of a query) runs in a fresh action invocation with
 * its own 5-minute budget, so a slow query can't take down the whole run.
 *
 * After each attempt, this action decides what to schedule next:
 *   - Failed attempt 1? → schedule attempt 2 of the same query.
 *   - Otherwise, more queries left? → schedule attempt 1 of the next query.
 *   - All queries done? → run `finalizeEvalRun` mutation to compute aggregates.
 *
 * Errors from `runSingleQuery` are caught, recorded as a failure row, and
 * the chain continues to the next step. Re-throwing would orphan the run.
 */
export const runQueryAction = internalAction({
  args: {
    runId: v.id("evalRuns"),
    modelId: v.string(),
    queryIndex: v.number(),
    attempt: v.number(),
  },
  handler: async (ctx, args): Promise<void> => {
    const queries = goldenSet as GoldenQuery[];
    const queryEntry = queries[args.queryIndex];
    const totalQueries = queries.length;

    console.log(
      `[Eval] Query ${args.queryIndex + 1}/${totalQueries} (attempt ${args.attempt}) for ${args.modelId}: "${queryEntry.query}"`,
    );

    let success = false;

    try {
      const result = await runSingleQuery(queryEntry, args.modelId);

      const usedTool = result.usedTool;
      const actualChql = result.dslQuery;

      let kkeysCorrect: boolean | undefined;
      if (actualChql && queryEntry.expectedKkeys.length > 0) {
        const actualKkeys = extractKkeys(actualChql);
        kkeysCorrect = kkeysMatch(actualKkeys, queryEntry.expectedKkeys);
      }

      const chqlParses = actualChql ? parseChql(actualChql).ok : undefined;

      const cost = estimateCost(
        args.modelId,
        result.inputTokens,
        result.outputTokens,
      );

      success = result.chqlEquivalent === "equivalent";

      await ctx.runMutation(internal.evaluationHelpers.insertEvalResult, {
        runId: args.runId,
        queryIndex: args.queryIndex,
        userQuery: queryEntry.query,
        expectedChql: queryEntry.expectedChql,
        expectedKkeys: queryEntry.expectedKkeys,
        actualChql,
        modelResponse: result.response.slice(0, 2000),
        attempt: args.attempt,
        success,
        metrics: {
          responseTimeMs: result.responseTimeMs,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          totalTokens: result.totalTokens,
          costUsd: cost,
          usedTool,
          kkeysCorrect,
          chqlParses,
          chqlEquivalent: result.chqlEquivalent,
        },
      });

      if (!success) {
        console.log(
          `[Eval] Query ${args.queryIndex + 1} attempt ${args.attempt} failed, ${args.attempt < 2 ? "retrying..." : "moving on."}`,
        );
      }
    } catch (error) {
      console.error(
        `[Eval] Query ${args.queryIndex + 1} attempt ${args.attempt} threw error:`,
        error,
      );

      try {
        await ctx.runMutation(internal.evaluationHelpers.insertEvalResult, {
          runId: args.runId,
          queryIndex: args.queryIndex,
          userQuery: queryEntry.query,
          expectedChql: queryEntry.expectedChql,
          expectedKkeys: queryEntry.expectedKkeys,
          attempt: args.attempt,
          success: false,
          metrics: {
            responseTimeMs: 0,
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
            usedTool: false,
            chqlEquivalent: "actual_error",
          },
        });
      } catch (insertError) {
        console.error(
          `[Eval] Failed to insert failure row for query ${args.queryIndex + 1} attempt ${args.attempt}:`,
          insertError,
        );
      }
      // Fall through to the next-step decision below. success stays false.
    }

    // Decide what to schedule next.
    const nextQueryIndex = args.queryIndex + 1;
    if (!success && args.attempt === 1) {
      // Retry same query
      await ctx.scheduler.runAfter(0, internal.evaluation.runQueryAction, {
        runId: args.runId,
        modelId: args.modelId,
        queryIndex: args.queryIndex,
        attempt: 2,
      });
    } else if (nextQueryIndex < totalQueries) {
      // Advance to next query
      await ctx.scheduler.runAfter(0, internal.evaluation.runQueryAction, {
        runId: args.runId,
        modelId: args.modelId,
        queryIndex: nextQueryIndex,
        attempt: 1,
      });
    } else {
      // Done — finalize aggregates
      await ctx.runMutation(internal.evaluationHelpers.finalizeEvalRun, {
        runId: args.runId,
      });
      console.log(`[Eval] Eval run finalized for ${args.modelId}`);
    }
  },
});

/**
 * Public action to trigger an eval run.
 *
 * Creates the `evalRuns` row, schedules the first query action, and returns
 * immediately with `{ runId }`. The actual eval proceeds asynchronously via
 * the scheduler chain in `runQueryAction`.
 */
export const startEval = action({
  args: {
    modelId: v.string(),
  },
  handler: async (ctx, args): Promise<{ runId: Id<"evalRuns"> }> => {
    const queries = goldenSet as GoldenQuery[];

    const runId: Id<"evalRuns"> = await ctx.runMutation(
      internal.evaluationHelpers.createEvalRun,
      {
        modelId: args.modelId,
        totalQueries: queries.length,
      },
    );

    console.log(
      `[Eval] Starting eval run for model ${args.modelId} with ${queries.length} queries (runId=${runId})`,
    );

    await ctx.scheduler.runAfter(0, internal.evaluation.runQueryAction, {
      runId,
      modelId: args.modelId,
      queryIndex: 0,
      attempt: 1,
    });

    return { runId };
  },
});
