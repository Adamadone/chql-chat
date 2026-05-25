#!/usr/bin/env tsx
/**
 * Export a Convex eval run as the canonical per-model Markdown report
 * (and a JSON sibling). Mirrors what eval/run-local.ts produces for local runs.
 *
 * Usage:
 *   npx tsx export-cloud-results.ts --run-id <evalRunId>
 *   npx tsx export-cloud-results.ts --run-ids-file results/legacy/run-ids.json    # all in file
 */

import { execFileSync } from "child_process";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import {
  gradeResult,
  type GoldenQuestion,
  type ChqlEquivalent,
  type Verdict,
  type ModelOutput,
} from "@chql-chat/chql-core";
import { renderReport, type PerQuestionRow } from "./lib/render-report.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ─── CLI ───────────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  let runId: string | undefined;
  let runIdsFile: string | undefined;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--run-id" && args[i + 1]) {
      runId = args[++i];
    } else if (args[i] === "--run-ids-file" && args[i + 1]) {
      runIdsFile = args[++i];
    }
  }
  if (!runId && !runIdsFile) {
    console.error(
      "Usage: export-cloud-results.ts --run-id <id> | --run-ids-file <path>",
    );
    process.exit(1);
  }
  return { runId, runIdsFile };
}

// ─── Convex bridge ─────────────────────────────────────────────────────────

function convexRun<T>(fnName: string, argObj: unknown): T {
  const argJson = JSON.stringify(argObj);
  const isWin = process.platform === "win32";
  const quotedJson = isWin
    ? `"${argJson.replace(/"/g, '\\"')}"`
    : argJson;
  const cmd = isWin ? "npx.cmd" : "npx";
  const args = [
    "dotenvx",
    "run",
    "--",
    isWin ? "npx.cmd" : "npx",
    "convex",
    "run",
    fnName,
    quotedJson,
  ];

  console.log(`→ convex ${fnName} ${argJson}`);
  const raw = execFileSync(cmd, args, {
    cwd: join(__dirname, ".."),
    encoding: "utf-8",
    shell: isWin,
    stdio: ["ignore", "pipe", "inherit"],
  });

  const cleaned = raw.replace(/\x1b\[[0-9;]*m/g, "");
  const lines = cleaned.split(/\r?\n/);
  const startIdx = lines.findIndex((l) => {
    const t = l.trim();
    if (t.startsWith("[dotenvx")) return false;
    return t.startsWith("[") || t.startsWith("{") || t === "null";
  });
  if (startIdx < 0) {
    throw new Error(`Could not find JSON payload in convex output:\n${cleaned}`);
  }
  const payload = lines.slice(startIdx).join("\n").trim();
  return JSON.parse(payload) as T;
}

// ─── Types matching Convex rows ────────────────────────────────────────────

interface ConvexRow {
  _id: string;
  queryIndex: number;
  userQuery: string;
  questionId?: string;
  category?: string;
  expectedBehavior?: string;
  expectedChql?: string;
  expectedKkeys?: string[];
  actualChql?: string;
  modelResponse?: string;
  success: boolean;
  metrics: {
    responseTimeMs: number;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    costUsd?: number;
    usedTool: boolean;
    kkeysCorrect?: boolean;
    chqlParses?: boolean;
    chqlEquivalent?: ChqlEquivalent;
    verdict?: Verdict;
    reason?: string;
  };
}

interface ConvexRunDetail {
  run: {
    _id: string;
    modelId: string;
    startedAt: number;
    completedAt?: number;
    totalQueries: number;
    status: string;
    methodologyVersion?: string;
    aggregateMetrics?: unknown;
  };
  results: ConvexRow[];
}

// ─── Main ─────────────────────────────────────────────────────────────────

function exportOne(runId: string) {
  const detail = convexRun<ConvexRunDetail | null>(
    "evaluationHelpers:exportRunDetail",
    { runId },
  );
  if (!detail) {
    console.error(`Run ${runId} not found.`);
    return;
  }

  const { run, results } = detail;
  results.sort((a, b) => a.queryIndex - b.queryIndex);

  const perQuestion: PerQuestionRow[] = results.map((row) => {
    // Reconstruct GoldenQuestion from stored fields. For rows from methodology v1
    // (no category/expectedBehavior recorded), default to equivalence to retain past intent.
    const question: GoldenQuestion = {
      id: row.questionId ?? `q-${row.queryIndex}`,
      category: (row.category as GoldenQuestion["category"]) ?? "simple_single",
      expectedBehavior:
        (row.expectedBehavior as GoldenQuestion["expectedBehavior"]) ??
        "equivalence",
      query: row.userQuery,
      expectedChql: row.expectedChql ?? null,
      expectedKkeys: row.expectedKkeys ?? null,
    };

    // Prefer the stored verdict/reason. Fall back to recomputing if the row predates v2.
    let verdict = row.metrics.verdict;
    let reason = row.metrics.reason;
    let success = row.success;
    if (!verdict || !reason) {
      const modelOutput: ModelOutput = {
        actualChql: row.actualChql ?? null,
        usedTool: row.metrics.usedTool,
        chqlEquivalent: row.metrics.chqlEquivalent,
      };
      const graded = gradeResult(question, modelOutput);
      verdict = graded.verdict;
      reason = graded.reason;
      success = graded.success;
    }

    return {
      question,
      actualChql: row.actualChql ?? null,
      modelResponse: row.modelResponse ?? "",
      usedTool: row.metrics.usedTool,
      verdict,
      success,
      reason,
      chqlParses: row.metrics.chqlParses,
      chqlEquivalent: row.metrics.chqlEquivalent,
      kkeysCorrect: row.metrics.kkeysCorrect,
      metrics: {
        responseTimeMs: row.metrics.responseTimeMs,
        inputTokens: row.metrics.inputTokens,
        outputTokens: row.metrics.outputTokens,
        totalTokens: row.metrics.totalTokens,
        costUsd: row.metrics.costUsd,
      },
    };
  });

  const safeModelId = run.modelId.replace(/[\/\\:*?"<>|]/g, "_");
  const outDir = join(__dirname, "results");
  mkdirSync(outDir, { recursive: true });

  const md = renderReport({
    modelId: run.modelId,
    set: "golden",
    methodologyVersion: run.methodologyVersion ?? "v2",
    runConfig: {
      "Convex runId": run._id,
      Status: run.status,
    },
    startedAt: new Date(run.startedAt).toISOString(),
    completedAt: run.completedAt
      ? new Date(run.completedAt).toISOString()
      : "(in progress)",
    results: perQuestion,
  });

  const mdPath = join(outDir, `${safeModelId}.md`);
  const jsonPath = join(outDir, `${safeModelId}.json`);
  writeFileSync(mdPath, md);
  writeFileSync(
    jsonPath,
    JSON.stringify({ ...run, results: perQuestion }, null, 2),
  );

  console.log(`💾 ${run.modelId}:`);
  console.log(`   ${mdPath}`);
  console.log(`   ${jsonPath}`);
}

function main() {
  const { runId, runIdsFile } = parseArgs();
  const runIds: string[] = [];
  if (runId) runIds.push(runId);
  if (runIdsFile) {
    const parsed = JSON.parse(readFileSync(runIdsFile, "utf-8")) as {
      runIds?: string[];
    };
    if (parsed.runIds) runIds.push(...parsed.runIds);
  }
  for (const id of runIds) exportOne(id);
}

main();
