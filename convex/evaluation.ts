// See ./CONTEXT.md for module overview.
// Trigger from Convex dashboard: api.evaluation.startEval({ modelId: "claude-opus-4-7" })
// Export results:               api.evaluationHelpers.exportResults({ runIds: [...] })

"use node";

import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { action, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  connectAndDiscoverTools,
  closeMCPClient,
  runLLMWithTools,
  callMCPTool,
} from "./ai";
import {
  buildSystemPrompt,
  parseChql,
  hashMCPResponseText,
  extractKkeys,
  kkeysMatch,
} from "@chql-chat/chql-core";
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

// Larger than production so equivalence reflects the full result set;
// >1000-row queries get truncated — acceptable for the current golden set.
const EVAL_PAGE_SIZE = 1000;

const SEARCH_TOOL_NAME = "search_measurements";

// ─── Cost estimation ────────────────────────────────────────────────────────

// USD per 1M tokens. Self-hosted (local/*) is absent → zero marginal API cost.
const PRICING: Record<string, { input: number; output: number }> = {
  "claude-opus-4-7": { input: 5, output: 25 },
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-haiku-4-5": { input: 1, output: 5 },
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

// ─── Core eval logic ────────────────────────────────────────────────────────

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

// Fetches actual + expected row-set hashes back-to-back (~100ms apart) so chy.stat data
// drift mid-run can't invalidate the comparison.
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

// Returns `actual_error` if actualChql doesn't produce a clean response;
// `expected_empty` if expectedChql returns zero rows (can't meaningfully compare).
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

  // Compute expectedHash first so identical-CHQL-against-no-data isn't misreported as unjudgeable.
  let expectedHash: ReturnType<typeof hashMCPResponseText> | null = null;
  let expectedFailed = false;

  try {
    const expectedText = await callMCPTool(mcpClient, SEARCH_TOOL_NAME, {
      query: expectedChql,
      pageSize: EVAL_PAGE_SIZE,
    });
    if (expectedText.isError) {
      expectedFailed = true;
      console.warn(
        `[Eval] Expected CHQL returned isError for "${expectedChql}"`,
      );
    } else {
      expectedHash = hashMCPResponseText(expectedText.text);
    }
  } catch {
    expectedFailed = true;
    console.warn(`[Eval] Expected CHQL fetch threw for "${expectedChql}"`);
  }

  if (expectedHash && actualHash.hash === expectedHash.hash) {
    return "equivalent";
  }
  if (expectedFailed || !expectedHash || expectedHash.isEmpty) {
    return "expected_empty";
  }
  return "different";
}

// ─── Exported actions ───────────────────────────────────────────────────────

// One query attempt per scheduled action (own 5-min budget). Decides what to schedule next:
// retry on fail (attempt 2) → next query (attempt 1) → finalizeEvalRun.
// Errors are recorded as failure rows; re-throwing would orphan the run.
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
    }

    const nextQueryIndex = args.queryIndex + 1;
    if (!success && args.attempt === 1) {
      await ctx.scheduler.runAfter(0, internal.evaluation.runQueryAction, {
        runId: args.runId,
        modelId: args.modelId,
        queryIndex: args.queryIndex,
        attempt: 2,
      });
    } else if (nextQueryIndex < totalQueries) {
      await ctx.scheduler.runAfter(0, internal.evaluation.runQueryAction, {
        runId: args.runId,
        modelId: args.modelId,
        queryIndex: nextQueryIndex,
        attempt: 1,
      });
    } else {
      await ctx.runMutation(internal.evaluationHelpers.finalizeEvalRun, {
        runId: args.runId,
      });
      console.log(`[Eval] Eval run finalized for ${args.modelId}`);
    }
  },
});

/** Creates the eval run row, schedules the first query action, returns `{ runId }` immediately. */
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

// Re-judges historical rows against the current golden-set using only stored CHQL strings.
// Handles two cases: (1) corrected golden-set references → updates row + re-derives kkeysCorrect;
// (2) identical-CHQL false-failures (e.g. expected_empty when actual==expected) → upgrades to equivalent.
// Rows with textually-different CHQLs keep their stored verdict (judging those needs MCP).
// Recomputes aggregateMetrics; preserves completedAt.
export const rejudgeRun = action({
  args: {
    runId: v.id("evalRuns"),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    rowsScanned: number;
    rowsReferenceUpdated: number;
    rowsVerdictChanged: number;
    aggregateMetrics: unknown;
  }> => {
    const queries = goldenSet as GoldenQuery[];
    const goldenByQuery = new Map<
      string,
      { expectedChql: string; expectedKkeys: string[] }
    >();
    for (const q of queries) {
      goldenByQuery.set(q.query, {
        expectedChql: q.expectedChql,
        expectedKkeys: q.expectedKkeys,
      });
    }

    const results = await ctx.runQuery(
      internal.evaluationHelpers.getResultsForRun,
      { runId: args.runId },
    );

    console.log(
      `[Rejudge] Run ${args.runId}: ${results.length} rows to examine`,
    );

    let rowsReferenceUpdated = 0;
    let rowsVerdictChanged = 0;

    for (const row of results) {
      const golden = goldenByQuery.get(row.userQuery);
      // Fall back to stored reference when the query is no longer in the golden set.
      const currentExpectedChql =
        golden?.expectedChql ?? row.expectedChql ?? "";
      const currentExpectedKkeys =
        golden?.expectedKkeys ?? row.expectedKkeys ?? [];

      const referenceChanged =
        golden !== undefined &&
        (row.expectedChql !== currentExpectedChql ||
          !kkeysSetsEqual(row.expectedKkeys ?? [], currentExpectedKkeys));

      const actualChql = row.actualChql;

      let newChqlEquivalent: ChqlEquivalent | undefined =
        row.metrics.chqlEquivalent;

      if (!actualChql) {
        newChqlEquivalent = "actual_error";
      } else if (
        currentExpectedChql &&
        normalizeChql(actualChql) === normalizeChql(currentExpectedChql)
      ) {
        // Identical strings ⇒ identical row sets ⇒ equivalent, regardless of stored verdict.
        newChqlEquivalent = "equivalent";
      } else if (referenceChanged) {
        // Text differs against a new reference — can't judge without executing; clear to flag.
        newChqlEquivalent = undefined;
      }
      // Else: reference unchanged + strings differ ⇒ keep stored verdict.

      const newSuccess = newChqlEquivalent === "equivalent";

      let newKkeysCorrect: boolean | undefined = row.metrics.kkeysCorrect;
      if (actualChql && currentExpectedKkeys.length > 0) {
        const actualKkeys = extractKkeys(actualChql);
        newKkeysCorrect = kkeysMatch(actualKkeys, currentExpectedKkeys);
      } else if (currentExpectedKkeys.length === 0) {
        newKkeysCorrect = undefined;
      }

      const verdictChanged =
        row.metrics.chqlEquivalent !== newChqlEquivalent ||
        row.success !== newSuccess;

      if (!referenceChanged && !verdictChanged) continue;

      if (referenceChanged) rowsReferenceUpdated++;
      if (verdictChanged) rowsVerdictChanged++;

      await ctx.runMutation(
        internal.evaluationHelpers.patchEvalResultFields,
        {
          resultId: row._id,
          expectedChql: currentExpectedChql,
          expectedKkeys: currentExpectedKkeys,
          success: newSuccess,
          metrics: {
            ...row.metrics,
            kkeysCorrect: newKkeysCorrect,
            chqlEquivalent: newChqlEquivalent,
          },
        },
      );
    }

    const aggregateMetrics = await ctx.runMutation(
      internal.evaluationHelpers.recomputeRunAggregates,
      { runId: args.runId },
    );

    console.log(
      `[Rejudge] Run ${args.runId} done: referenceUpdated=${rowsReferenceUpdated}, verdictChanged=${rowsVerdictChanged}, metrics=${JSON.stringify(aggregateMetrics)}`,
    );

    return {
      rowsScanned: results.length,
      rowsReferenceUpdated,
      rowsVerdictChanged,
      aggregateMetrics,
    };
  },
});

// Whitespace-only normalize: `K0014 = '9891978'` == `K0014='9891978'`.
// Anything stronger (operator reordering) would need the CHQL parser.
function normalizeChql(s: string): string {
  return s.trim().replace(/\s+/g, " ");
}

function kkeysSetsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const s = new Set(a);
  for (const k of b) if (!s.has(k)) return false;
  return true;
}
