#!/usr/bin/env tsx
/**
 * Merges Convex-exported CSV + local JSON reports into a single CSV. See ./CONTEXT.md.
 *
 * Usage:
 *   npx tsx merge-results.ts --convex results/convex-export.csv --local results/qwen3-4b-*.json
 *   npx tsx merge-results.ts --local results/qwen3-4b-*.json   # local only, no Convex CSV
 *   npx tsx merge-results.ts --convex results/convex-export.csv # Convex only, no local
 */

import { readFileSync, writeFileSync } from "fs";
import { join, dirname, basename } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ─── CLI Args ───────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  let convexCsv: string | undefined;
  const localJsonFiles: string[] = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--convex" && args[i + 1]) {
      convexCsv = args[++i];
    } else if (args[i] === "--local" && args[i + 1]) {
      i++;
      while (i < args.length && !args[i].startsWith("--")) {
        localJsonFiles.push(args[i]);
        i++;
      }
      i--;
    }
  }

  return { convexCsv, localJsonFiles };
}

// ─── Types ──────────────────────────────────────────────────────────────────

interface LocalEvalReport {
  modelId: string;
  results: Array<{
    queryIndex: number;
    userQuery: string;
    expectedChql: string;
    expectedKkeys: string[];
    actualChql?: string;
    attempt: number;
    success: boolean;
    metrics: {
      responseTimeMs: number;
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
      chqlParses?: boolean;
      chqlEquivalent?: "equivalent" | "different" | "expected_empty" | "actual_error";
      usedTool: boolean;
      kkeysCorrect?: boolean;
    };
  }>;
}

// ─── CSV Helpers ────────────────────────────────────────────────────────────

function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

const CSV_HEADER =
  "model,query,attempt,success,response_time_ms,input_tokens,output_tokens,total_tokens,cost_usd,chql_parses,chql_equivalent,used_tool,kkeys_correct,expected_chql,actual_chql";

// ─── Main ───────────────────────────────────────────────────────────────────

function main() {
  const config = parseArgs();
  const allRows: string[] = [CSV_HEADER];

  if (!config.convexCsv && config.localJsonFiles.length === 0) {
    console.error(
      "Usage: npx tsx merge-results.ts --convex <csv-file> --local <json-files...>",
    );
    process.exit(1);
  }

  if (config.convexCsv) {
    console.log(`📄 Reading Convex CSV: ${config.convexCsv}`);
    const csv = readFileSync(config.convexCsv, "utf-8");
    const lines = csv.split("\n").filter((l) => l.trim());
    for (let i = 1; i < lines.length; i++) {
      allRows.push(lines[i]);
    }
    console.log(`   Added ${lines.length - 1} rows from Convex export.`);
  }

  for (const jsonFile of config.localJsonFiles) {
    console.log(`📄 Reading local JSON: ${jsonFile}`);
    const report: LocalEvalReport = JSON.parse(readFileSync(jsonFile, "utf-8"));

    let rowCount = 0;
    for (const result of report.results) {
      const row = [
        csvEscape(report.modelId),
        csvEscape(result.userQuery),
        result.attempt,
        result.success,
        result.metrics.responseTimeMs,
        result.metrics.inputTokens,
        result.metrics.outputTokens,
        result.metrics.totalTokens,
        "", // cost_usd — N/A for self-hosted
        result.metrics.chqlParses ?? "",
        result.metrics.chqlEquivalent ?? "",
        result.metrics.usedTool,
        result.metrics.kkeysCorrect ?? "",
        csvEscape(result.expectedChql ?? ""),
        csvEscape(result.actualChql ?? ""),
      ].join(",");

      allRows.push(row);
      rowCount++;
    }
    console.log(`   Added ${rowCount} rows from ${basename(jsonFile)}.`);
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outputPath = join(__dirname, "results", `merged-${timestamp}.csv`);
  writeFileSync(outputPath, allRows.join("\n"));

  console.log(`\n✅ Merged CSV written to: ${outputPath}`);
  console.log(`   Total rows: ${allRows.length - 1} (excluding header)\n`);
}

main();
