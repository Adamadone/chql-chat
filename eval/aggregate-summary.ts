#!/usr/bin/env tsx
/**
 * Side-by-side per-model aggregate CSV (cloud via Convex + local via JSON reports). See ./CONTEXT.md.
 *
 * Usage:
 *   npx tsx aggregate-summary.ts                                   # default: all results/*.json (non-legacy)
 *   npx tsx aggregate-summary.ts --local results/local-foo.json    # explicit list of local report files
 *   npx tsx aggregate-summary.ts --run-ids results/run-ids.json    # also pull cloud runs from Convex
 */

import { execFileSync } from "child_process";
import { readFileSync, writeFileSync, readdirSync, statSync } from "fs";
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
  methodologyVersion?: string;
  aggregateMetrics?: AggregateMetrics;
}

// v2 local report: { modelId, methodologyVersion, results: [...] }
interface LocalEvalReport {
  modelId: string;
  methodologyVersion?: string;
  aggregateMetrics?: AggregateMetrics;
  results?: Array<{
    success: boolean;
    question?: { category: string };
    category?: string;
  }>;
}

// ─── Convex CLI bridge ──────────────────────────────────────────────────────

function convexRun<T>(fnName: string, argObj: unknown): T {
  const argJson = JSON.stringify(argObj);
  const isWin = process.platform === "win32";
  const quotedJson = isWin ? `"${argJson.replace(/"/g, '\\"')}"` : argJson;
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
    return t.startsWith("[") || t.startsWith("{");
  });
  if (startIdx < 0) {
    throw new Error(`Could not find JSON payload in convex output:\n${cleaned}`);
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

const CATEGORIES = [
  "simple_single",
  "simple_and",
  "datetime",
  "part_char_value",
  "regex",
  "rejected",
  "ambiguous",
  "common_language",
  "injection",
  "errors",
] as const;

const HEADER = [
  "model",
  "methodology_version",
  "success_rate",
  "chql_parse_rate",
  "chql_equivalence_rate",
  "tool_usage_rate",
  "avg_response_time_ms",
  "avg_input_tokens",
  "avg_output_tokens",
  "avg_total_tokens",
  "total_cost_usd",
  ...CATEGORIES.map((c) => `success_rate__${c}`),
].join(",");

function formatRow(
  modelId: string,
  methodologyVersion: string | undefined,
  m: AggregateMetrics | undefined,
  perCategory: Map<string, { n: number; succ: number }> | undefined,
): string {
  const base = [
    csvEscape(modelId),
    csvEscape(methodologyVersion ?? ""),
    num(m?.successRate, 4),
    num(m?.chqlParsesRate, 4),
    num(m?.equivalenceRate, 4),
    num(m?.toolUsageRate, 4),
    num(m?.avgResponseTimeMs, 2),
    num(m?.avgInputTokens, 2),
    num(m?.avgOutputTokens, 2),
    num(m?.avgTotalTokens, 2),
    num(m?.totalCostUsd, 6),
  ];
  for (const cat of CATEGORIES) {
    const c = perCategory?.get(cat);
    base.push(c && c.n > 0 ? num(c.succ / c.n, 4) : "");
  }
  return base.join(",");
}

function categoryBreakdownFromLocal(
  report: LocalEvalReport,
): Map<string, { n: number; succ: number }> {
  const out = new Map<string, { n: number; succ: number }>();
  for (const r of report.results ?? []) {
    const cat = r.question?.category ?? r.category;
    if (!cat) continue;
    const entry = out.get(cat) ?? { n: 0, succ: 0 };
    entry.n++;
    if (r.success) entry.succ++;
    out.set(cat, entry);
  }
  return out;
}

// ─── Main ───────────────────────────────────────────────────────────────────

function main() {
  const { runIdsPath, localJsonFiles } = parseArgs();
  const rows: string[] = [HEADER];

  if (runIdsPath) {
    const runIdsRaw = JSON.parse(readFileSync(runIdsPath, "utf-8")) as {
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
        // Per-category breakdown for cloud rows would require exportRunDetail per run.
        // Leave empty for now — eval/export-cloud-results.ts produces the full per-model report.
        rows.push(
          formatRow(
            r.modelId ?? r.runId,
            r.methodologyVersion,
            r.aggregateMetrics,
            undefined,
          ),
        );
        console.log(`   ✓ ${r.modelId}`);
      }
    }
  }

  const localFiles =
    localJsonFiles.length > 0
      ? localJsonFiles
      : defaultLocalFiles(join(__dirname, "results"));

  for (const jsonFile of localFiles) {
    const report = JSON.parse(
      readFileSync(jsonFile, "utf-8"),
    ) as LocalEvalReport;
    const perCat = categoryBreakdownFromLocal(report);
    rows.push(
      formatRow(
        report.modelId,
        report.methodologyVersion,
        report.aggregateMetrics,
        perCat,
      ),
    );
    console.log(`   ✓ ${report.modelId} (local, ${basename(jsonFile)})`);
  }

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

// Top-level JSON files in eval/results/ (skip directories like legacy/).
function defaultLocalFiles(resultsDir: string): string[] {
  try {
    return readdirSync(resultsDir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => join(resultsDir, f))
      .filter((p) => statSync(p).isFile());
  } catch {
    return [];
  }
}

main();
