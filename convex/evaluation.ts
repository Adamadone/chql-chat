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
  gradeResult,
  type GoldenQuestion,
  type ModelOutput,
  type ChqlEquivalent,
} from "@chql-chat/chql-core";
import goldenSet from "../eval/golden-set.json";

const METHODOLOGY_VERSION = "v2";

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
  chqlEquivalent?: ChqlEquivalent;
}

// Fetches actual + expected row-set hashes back-to-back (~100ms apart) so chy.stat data
// drift mid-run can't invalidate the comparison.
async function runSingleQuery(
  question: GoldenQuestion,
  modelId: string,
): Promise<SingleQueryOutcome> {
  const { client: mcpClient, tools } = await connectAndDiscoverTools();

  try {
    const systemPrompt = buildSystemPrompt({
      hasTools: Object.keys(tools).length > 0,
      timeZone: "Europe/Prague",
    });
    const chatHistory = [{ role: "user" as const, content: question.query }];

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
      question.expectedChql,
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

// Returns undefined when there is no actualChql to judge or no reference to compare against.
async function computeEquivalence(
  mcpClient: Awaited<ReturnType<typeof connectAndDiscoverTools>>["client"],
  actualChql: string | undefined,
  expectedChql: string | null,
): Promise<ChqlEquivalent | undefined> {
  if (!mcpClient || !actualChql) return undefined;
  if (expectedChql === null) return undefined;

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

// One question per scheduled action (own 5-min budget). Single attempt — no retries.
// Schedules the next question or finalizeEvalRun. Errors are recorded as failure rows;
// re-throwing would orphan the run.
export const runQueryAction = internalAction({
  args: {
    runId: v.id("evalRuns"),
    modelId: v.string(),
    queryIndex: v.number(),
  },
  handler: async (ctx, args): Promise<void> => {
    const questions = goldenSet as GoldenQuestion[];
    const question = questions[args.queryIndex];
    const totalQueries = questions.length;

    console.log(
      `[Eval] Query ${args.queryIndex + 1}/${totalQueries} for ${args.modelId}: "${question.query}"`,
    );

    try {
      const result = await runSingleQuery(question, args.modelId);

      const usedTool = result.usedTool;
      const actualChql = result.dslQuery ?? null;

      let kkeysCorrect: boolean | undefined;
      if (
        actualChql &&
        question.expectedKkeys &&
        question.expectedKkeys.length > 0
      ) {
        const actualKkeys = extractKkeys(actualChql);
        kkeysCorrect = kkeysMatch(actualKkeys, question.expectedKkeys);
      }

      const chqlParses = actualChql ? parseChql(actualChql).ok : undefined;

      const cost = estimateCost(
        args.modelId,
        result.inputTokens,
        result.outputTokens,
      );

      const modelOutput: ModelOutput = {
        actualChql,
        usedTool,
        chqlEquivalent: result.chqlEquivalent,
      };
      const graded = gradeResult(question, modelOutput);

      await ctx.runMutation(internal.evaluationHelpers.insertEvalResult, {
        runId: args.runId,
        queryIndex: args.queryIndex,
        userQuery: question.query,
        questionId: question.id,
        category: question.category,
        expectedBehavior: question.expectedBehavior,
        expectedChql: question.expectedChql ?? undefined,
        expectedKkeys: question.expectedKkeys ?? undefined,
        actualChql: actualChql ?? undefined,
        modelResponse: result.response.slice(0, 4000),
        attempt: 1,
        success: graded.success,
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
          verdict: graded.verdict,
          reason: graded.reason,
        },
      });

      if (!graded.success) {
        console.log(
          `[Eval] Query ${args.queryIndex + 1} failed: ${graded.verdict} — ${graded.reason}`,
        );
      }
    } catch (error) {
      console.error(
        `[Eval] Query ${args.queryIndex + 1} threw error:`,
        error,
      );

      try {
        const modelOutput: ModelOutput = {
          actualChql: null,
          usedTool: false,
          chqlEquivalent: "actual_error",
        };
        const graded = gradeResult(question, modelOutput);

        await ctx.runMutation(internal.evaluationHelpers.insertEvalResult, {
          runId: args.runId,
          queryIndex: args.queryIndex,
          userQuery: question.query,
          questionId: question.id,
          category: question.category,
          expectedBehavior: question.expectedBehavior,
          expectedChql: question.expectedChql ?? undefined,
          expectedKkeys: question.expectedKkeys ?? undefined,
          attempt: 1,
          success: graded.success,
          metrics: {
            responseTimeMs: 0,
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
            usedTool: false,
            chqlEquivalent: "actual_error",
            verdict: "actual_error",
            reason: "runtime error during generation",
          },
        });
      } catch (insertError) {
        console.error(
          `[Eval] Failed to insert failure row for query ${args.queryIndex + 1}:`,
          insertError,
        );
      }
    }

    const nextQueryIndex = args.queryIndex + 1;
    if (nextQueryIndex < totalQueries) {
      await ctx.scheduler.runAfter(0, internal.evaluation.runQueryAction, {
        runId: args.runId,
        modelId: args.modelId,
        queryIndex: nextQueryIndex,
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
    const questions = goldenSet as GoldenQuestion[];

    const runId: Id<"evalRuns"> = await ctx.runMutation(
      internal.evaluationHelpers.createEvalRun,
      {
        modelId: args.modelId,
        totalQueries: questions.length,
        methodologyVersion: METHODOLOGY_VERSION,
      },
    );

    console.log(
      `[Eval] Starting eval run for model ${args.modelId} with ${questions.length} questions (runId=${runId}, methodology=${METHODOLOGY_VERSION})`,
    );

    await ctx.scheduler.runAfter(0, internal.evaluation.runQueryAction, {
      runId,
      modelId: args.modelId,
      queryIndex: 0,
    });

    return { runId };
  },
});

// Re-judges historical rows against the current golden-set using only stored CHQL strings.
// Handles two cases: (1) corrected golden-set references → updates row + re-derives verdict;
// (2) identical-CHQL false-failures (e.g. expected_empty when actual==expected) → upgrades to equivalent.
// Rows with textually-different CHQLs keep their stored chqlEquivalent (judging those needs MCP).
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
    const questions = goldenSet as GoldenQuestion[];
    const goldenByQuery = new Map<string, GoldenQuestion>();
    for (const q of questions) {
      goldenByQuery.set(q.query, q);
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
      // Fall back to a constructed question when no longer in golden set.
      const question: GoldenQuestion = golden ?? {
        id: row.questionId ?? `legacy-${row.queryIndex}`,
        category: (row.category as GoldenQuestion["category"]) ?? "simple_single",
        expectedBehavior:
          (row.expectedBehavior as GoldenQuestion["expectedBehavior"]) ??
          "equivalence",
        query: row.userQuery,
        expectedChql: row.expectedChql ?? null,
        expectedKkeys: row.expectedKkeys ?? null,
      };

      const referenceChanged =
        golden !== undefined &&
        (row.expectedChql !== (question.expectedChql ?? undefined) ||
          !kkeysSetsEqual(
            row.expectedKkeys ?? [],
            question.expectedKkeys ?? [],
          ));

      const actualChql = row.actualChql ?? null;

      let newChqlEquivalent = row.metrics.chqlEquivalent;

      if (!actualChql) {
        newChqlEquivalent = undefined;
      } else if (
        question.expectedChql &&
        normalizeChql(actualChql) === normalizeChql(question.expectedChql)
      ) {
        // Identical strings ⇒ identical row sets ⇒ equivalent, regardless of stored verdict.
        newChqlEquivalent = "equivalent";
      } else if (referenceChanged) {
        // Text differs against a new reference — can't judge without executing.
        newChqlEquivalent = undefined;
      }

      const modelOutput: ModelOutput = {
        actualChql,
        usedTool: row.metrics.usedTool,
        chqlEquivalent: newChqlEquivalent,
      };
      const graded = gradeResult(question, modelOutput);

      let newKkeysCorrect: boolean | undefined = row.metrics.kkeysCorrect;
      if (actualChql && (question.expectedKkeys ?? []).length > 0) {
        const actualKkeys = extractKkeys(actualChql);
        newKkeysCorrect = kkeysMatch(actualKkeys, question.expectedKkeys ?? []);
      } else if ((question.expectedKkeys ?? []).length === 0) {
        newKkeysCorrect = undefined;
      }

      const verdictChanged =
        row.metrics.chqlEquivalent !== newChqlEquivalent ||
        row.success !== graded.success;

      if (!referenceChanged && !verdictChanged) continue;

      if (referenceChanged) rowsReferenceUpdated++;
      if (verdictChanged) rowsVerdictChanged++;

      await ctx.runMutation(
        internal.evaluationHelpers.patchEvalResultFields,
        {
          resultId: row._id,
          expectedChql: question.expectedChql ?? undefined,
          expectedKkeys: question.expectedKkeys ?? undefined,
          success: graded.success,
          metrics: {
            ...row.metrics,
            kkeysCorrect: newKkeysCorrect,
            chqlEquivalent: newChqlEquivalent,
            verdict: graded.verdict,
            reason: graded.reason,
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
