#!/usr/bin/env tsx
/**
 * Builds a side-by-side aggregate CSV with one row per model.
 *
 * Pulls cloud-model aggregates from Convex (run IDs listed in
 * eval/results/run-ids.json) and appends local-model aggregates from the
 * JSON reports written by run-local.ts.
 *
 * Usage:
 *   npx tsx aggregate-summary.ts                                   # uses run-ids.json + all results/*.json locals
 *   npx tsx aggregate-summary.ts --local results/qwen3-4b-*.json   # explicit local files
 *   npx tsx aggregate-summary.ts --run-ids results/run-ids.json    # explicit run-ids file
 */

import { execFileSync } from "child_process";
import { readFileSync, writeFileSync, readdirSync } from "fs";
import { join, dirname, basename } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ─── CLI Args ───────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  let runIdsPath: string | undefined;
  const localJsonFiles: string[] = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--run-ids" && args[i + 1]) {
      runIdsPath = args[++i];
    } else if (args[i] === "--local" && args[i + 1]) {
      i++;
      while (i < args.length && !args[i].startsWith("--")) {
        localJsonFiles.push(args[i]);
        i++;
      }
      i--;
    }
  }

  return { runIdsPath, localJsonFiles };
}

// ─── Types ──────────────────────────────────────────────────────────────────

interface AggregateMetrics {
  successRate: number;
  avgResponseTimeMs: number;
  avgInputTokens: number;
  avgOutputTokens: number;
  avgTotalTokens: number;
  totalCostUsd?: number;
  chqlParsesRate: number;
  equivalenceRate: number;
  toolUsageRate: number;
}

interface ConvexRunRow {
  runId: string;
  found: boolean;
  modelId?: string;
  status?: string;
  startedAt?: number;
  completedAt?: number;
  totalQueries?: number;
  aggregateMetrics?: AggregateMetrics;
}

interface LocalEvalReport {
  modelId: string;
  aggregateMetrics: AggregateMetrics;
}

// ─── Convex CLI bridge ──────────────────────────────────────────────────────

/**
 * Runs `npx dotenvx run -- npx convex run <fn> <argJson>` and returns the
 * parsed JSON payload. dotenvx prints a banner line before the payload,
 * so we skip until the first line that starts with `[` or `{`.
 */
function convexRun<T>(fnName: string, argObj: unknown): T {
  const argJson = JSON.stringify(argObj);
  const isWin = process.platform === "win32";

  // On Windows with shell:true, cmd.exe strips one layer of double-quotes from
  // each arg, turning our JSON into invalid JSON5. Wrap the JSON in outer
  // quotes and escape inner quotes so one round-trip through cmd.exe yields
  // the original string.
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

  // Strip ANSI escapes, then locate the JSON payload. dotenvx prints banners
  // like `[dotenvx@1.52.0] injecting env ...` that also start with `[`, so
  // we have to skip those explicitly before looking for the array/object.
  const cleaned = raw.replace(/\x1b\[[0-9;]*m/g, "");
  const lines = cleaned.split(/\r?\n/);
  const startIdx = lines.findIndex((l) => {
    const t = l.trim();
    if (t.startsWith("[dotenvx")) return false;
    return t.startsWith("[") || t.startsWith("{");
  });
  if (startIdx < 0) {
    throw new Error(
      `Could not find JSON payload in convex output:\n${cleaned}`,
    );
  }
  const payload = lines.slice(startIdx).join("\n").trim();
  return JSON.parse(payload) as T;
}

// ─── CSV Helpers ────────────────────────────────────────────────────────────

function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function num(n: number | undefined, digits = 6): string {
  if (n === undefined || Number.isNaN(n)) return "";
  return Number(n.toFixed(digits)).toString();
}

const CSV_HEADER = [
  "model",
  "success_rate",
  "chql_parse_rate",
  "chql_equivalence_rate",
  "tool_usage_rate",
  "avg_response_time_ms",
  "avg_input_tokens",
  "avg_output_tokens",
  "avg_total_tokens",
  "total_cost_usd",
].join(",");

function formatRow(modelId: string, m: AggregateMetrics | undefined): string {
  if (!m) {
    return [csvEscape(modelId), "", "", "", "", "", "", "", "", ""].join(",");
  }
  return [
    csvEscape(modelId),
    num(m.successRate, 4),
    num(m.chqlParsesRate, 4),
    num(m.equivalenceRate, 4),
    num(m.toolUsageRate, 4),
    num(m.avgResponseTimeMs, 2),
    num(m.avgInputTokens, 2),
    num(m.avgOutputTokens, 2),
    num(m.avgTotalTokens, 2),
    num(m.totalCostUsd, 6),
  ].join(",");
}

// ─── Main ───────────────────────────────────────────────────────────────────

function main() {
  const { runIdsPath, localJsonFiles } = parseArgs();
  const rows: string[] = [CSV_HEADER];

  // 1. Cloud rows from Convex
  const idsFile =
    runIdsPath ?? join(__dirname, "results", "run-ids.json");
  const runIdsRaw = JSON.parse(readFileSync(idsFile, "utf-8")) as {
    runIds: string[];
  };
  const runIds = runIdsRaw.runIds ?? [];

  if (runIds.length > 0) {
    console.log(`📡 Fetching ${runIds.length} runs from Convex...`);
    const convexRows = convexRun<ConvexRunRow[]>(
      "evaluationHelpers:exportAggregates",
      { runIds },
    );

    for (const r of convexRows) {
      if (!r.found) {
        console.warn(`   ⚠ run ${r.runId} not found — skipping`);
        continue;
      }
      if (r.status !== "completed") {
        console.warn(
          `   ⚠ run ${r.runId} (${r.modelId}) status=${r.status} — row may be blank`,
        );
      }
      rows.push(formatRow(r.modelId ?? r.runId, r.aggregateMetrics));
      console.log(`   ✓ ${r.modelId}`);
    }
  } else {
    console.log("(no run IDs in run-ids.json, skipping Convex fetch)");
  }

  // 2. Local rows from JSON files
  const localFiles =
    localJsonFiles.length > 0
      ? localJsonFiles
      : defaultLocalFiles(join(__dirname, "results"));

  for (const jsonFile of localFiles) {
    const report = JSON.parse(
      readFileSync(jsonFile, "utf-8"),
    ) as LocalEvalReport;
    rows.push(formatRow(report.modelId, report.aggregateMetrics));
    console.log(`   ✓ ${report.modelId} (local, ${basename(jsonFile)})`);
  }

  // 3. Write merged CSV
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outputPath = join(
    __dirname,
    "results",
    `aggregate-summary-${timestamp}.csv`,
  );
  writeFileSync(outputPath, rows.join("\n") + "\n");

  console.log(`\n✅ Wrote ${outputPath}`);
  console.log(`   Rows: ${rows.length - 1}\n`);
  console.log(rows.join("\n"));
}

/**
 * When --local isn't given, default to every *.json in eval/results/ except
 * run-ids.json. Local eval reports all have the qwen-style filename, but
 * being permissive keeps this generic for future local models.
 */
function defaultLocalFiles(resultsDir: string): string[] {
  try {
    return readdirSync(resultsDir)
      .filter((f) => f.endsWith(".json") && f !== "run-ids.json")
      .map((f) => join(resultsDir, f));
  } catch {
    return [];
  }
}

main();
