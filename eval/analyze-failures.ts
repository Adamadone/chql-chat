#!/usr/bin/env tsx
// Cross-model analysis: find golden-set questions where every model failed.
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

const resultsDir = join(process.cwd(), "results");
const files = readdirSync(resultsDir).filter(
  (f) => f.endsWith(".json") && !f.includes("legacy"),
);

interface Row {
  question: { id: string; query: string; expectedBehavior: string; expectedChql: string | null };
  actualChql: string | null;
  modelResponse: string;
  usedTool: boolean;
  verdict: string;
  success: boolean;
  reason: string;
  chqlParses?: boolean;
  chqlEquivalent?: string;
}
interface Run {
  modelId: string;
  results: Row[];
}

const runs: Run[] = [];
for (const f of files) {
  const data = JSON.parse(readFileSync(join(resultsDir, f), "utf-8"));
  runs.push({ modelId: data.modelId ?? f.replace(/\.json$/, ""), results: data.results });
}

console.log(`Loaded ${runs.length} runs:`);
for (const r of runs) console.log(`  - ${r.modelId} (${r.results.length} rows)`);
console.log();

// Index by question id.
const byId = new Map<string, { question: Row["question"]; perModel: Map<string, Row> }>();
for (const run of runs) {
  for (const row of run.results) {
    const id = row.question.id;
    if (!byId.has(id)) byId.set(id, { question: row.question, perModel: new Map() });
    byId.get(id)!.perModel.set(run.modelId, row);
  }
}

const sortedIds = Array.from(byId.keys()).sort();

console.log("=== Questions where EVERY model failed (success=false on all runs) ===\n");
for (const id of sortedIds) {
  const entry = byId.get(id)!;
  const all = Array.from(entry.perModel.values());
  if (all.length === 0) continue;
  const allFailed = all.every((r) => !r.success);
  if (allFailed) {
    console.log(`### ${id}  [${entry.question.expectedBehavior}]`);
    console.log(`Query: ${entry.question.query}`);
    console.log(`Expected: ${entry.question.expectedChql ?? "(no CHQL — refusal/clarification)"}`);
    for (const [model, row] of entry.perModel) {
      console.log(`  - ${model}: verdict=${row.verdict} | actual=${row.actualChql ?? "(none)"} | reason=${row.reason}`);
    }
    console.log();
  }
}

console.log("=== Per-question success counts (sorted by # failing) ===\n");
const summary = sortedIds.map((id) => {
  const entry = byId.get(id)!;
  const all = Array.from(entry.perModel.values());
  const passed = all.filter((r) => r.success).length;
  return { id, query: entry.question.query, passed, total: all.length };
});
summary.sort((a, b) => a.passed - b.passed || a.id.localeCompare(b.id));
for (const s of summary) {
  console.log(`  ${s.id.padEnd(8)} ${s.passed}/${s.total}   ${s.query.slice(0, 80)}`);
}
