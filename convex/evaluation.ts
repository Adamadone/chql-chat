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
  "gpt-5.5": { input: 5, output: 30 },
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

interface CachedHash {
  hash: string;
  isEmpty: boolean;
}

interface SingleQueryOutcome {
  response: string;
  dslQuery?: string;
  usedTool: boolean;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  responseTimeMs: number;
  chqlEquivalent?: ChqlEquivalent;
  /** Caller persists this so subsequent questions with the same expectedChql skip chy.stat. */
  freshExpectedHash?: CachedHash;
}

interface EquivalenceResult {
  verdict: ChqlEquivalent | undefined;
  freshExpectedHash?: CachedHash;
}

async function runSingleQuery(
  question: GoldenQuestion,
  modelId: string,
  cachedExpectedHash: CachedHash | undefined,
): Promise<SingleQueryOutcome> {
  const { client: mcpClient, tools } = await connectAndDiscoverTools();

  try {
    const systemPrompt = buildSystemPrompt({
      hasTools: Object.keys(tools).length > 0,
      timeZone: "Europe/Prague",
    });
    const chatHistory = [{ role: "user" as const, content: question.query }];

    const startTime = Date.now();
    const result = await runLLMWithTools(systemPrompt, chatHistory, tools, modelId);
    const responseTimeMs = Date.now() - startTime;

    const actualChql = result.metadata?.dslQuery;
    const equivalence = await computeEquivalence(
      mcpClient,
      actualChql,
      question.expectedChql,
      cachedExpectedHash,
    );

    return {
      response: result.response,
      dslQuery: actualChql,
      usedTool: (result.metadata?.toolCalls?.length ?? 0) > 0,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      totalTokens: result.usage.totalTokens,
      responseTimeMs,
      chqlEquivalent: equivalence.verdict,
      freshExpectedHash: equivalence.freshExpectedHash,
    };
  } finally {
    if (mcpClient) await closeMCPClient(mcpClient);
  }
}

// Actual + expected fetched back-to-back (~100ms) so chy.stat data drift mid-run
// can't invalidate the hash comparison. Verdict is undefined when there's nothing
// to judge (no actualChql, or reference-free question).
async function computeEquivalence(
  mcpClient: Awaited<ReturnType<typeof connectAndDiscoverTools>>["client"],
  actualChql: string | undefined,
  expectedChql: string | null,
  cachedExpectedHash: CachedHash | undefined,
): Promise<EquivalenceResult> {
  if (!mcpClient || !actualChql || expectedChql === null) {
    return { verdict: undefined };
  }

  // Identical CHQL ⇒ identical row sets; same fast-path rejudgeRun uses on historical rows.
  if (normalizeChql(actualChql) === normalizeChql(expectedChql)) {
    return { verdict: "equivalent" };
  }

  const actualHash = await fetchHash(mcpClient, actualChql);
  if (actualHash === "error") return { verdict: "actual_error" };

  let expectedHash: CachedHash | null = cachedExpectedHash ?? null;
  let freshExpectedHash: CachedHash | undefined;
  if (!expectedHash) {
    const fetched = await fetchHash(mcpClient, expectedChql);
    if (fetched !== "error") {
      expectedHash = fetched;
      freshExpectedHash = fetched;
    }
  }

  if (expectedHash && actualHash.hash === expectedHash.hash) {
    return { verdict: "equivalent", freshExpectedHash };
  }
  if (!expectedHash || expectedHash.isEmpty) {
    return { verdict: "expected_empty", freshExpectedHash };
  }
  return { verdict: "different", freshExpectedHash };
}

// Fetches a CHQL's row-set hash via MCP. "error" covers both transport failures
// and chy.stat-side errors so the caller can map them to its own verdict.
async function fetchHash(
  mcpClient: NonNullable<
    Awaited<ReturnType<typeof connectAndDiscoverTools>>["client"]
  >,
  chql: string,
): Promise<CachedHash | "error"> {
  let text: { text: string; isError: boolean };
  try {
    text = await callMCPTool(mcpClient, SEARCH_TOOL_NAME, {
      query: chql,
      pageSize: EVAL_PAGE_SIZE,
    });
  } catch {
    console.warn(`[Eval] CHQL fetch threw for "${chql}"`);
    return "error";
  }
  if (text.isError) {
    console.warn(`[Eval] CHQL returned isError for "${chql}"`);
    return "error";
  }
  const h = hashMCPResponseText(text.text);
  if (!h) return "error";
  return { hash: h.hash, isEmpty: h.isEmpty };
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
      const cachedHashes = await ctx.runQuery(
        internal.evaluationHelpers.getExpectedHashes,
        { runId: args.runId },
      );
      const cachedExpectedHash = question.expectedChql
        ? cachedHashes.find((h) => h.chql === question.expectedChql)
        : undefined;

      const result = await runSingleQuery(
        question,
        args.modelId,
        cachedExpectedHash,
      );

      if (result.freshExpectedHash && question.expectedChql) {
        await ctx.runMutation(internal.evaluationHelpers.appendExpectedHash, {
          runId: args.runId,
          chql: question.expectedChql,
          ...result.freshExpectedHash,
        });
      }

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
