// Markdown report renderer shared by local and cloud eval runners.
// One artefact per model run → eval/results/<model-id>.md alongside the JSON.

import type {
  GoldenQuestion,
  ChqlEquivalent,
  Verdict,
} from "@chql-chat/chql-core";

export interface PerQuestionRow {
  question: GoldenQuestion;
  actualChql: string | null;
  modelResponse: string;
  usedTool: boolean;
  verdict: Verdict;
  success: boolean;
  reason: string;
  chqlParses?: boolean;
  chqlEquivalent?: ChqlEquivalent;
  kkeysCorrect?: boolean;
  metrics: {
    responseTimeMs: number;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    costUsd?: number;
  };
}

export interface ReportInput {
  modelId: string;
  set: "golden" | "sample";
  methodologyVersion: string;
  runConfig: Record<string, string | undefined>;
  startedAt: string;
  completedAt: string;
  results: PerQuestionRow[];
}

const VERDICT_LABELS: Record<Verdict, string> = {
  equivalence_match: "Equivalence match",
  equivalence_mismatch: "Equivalence mismatch",
  refused_correctly: "Refused correctly",
  refused_when_should_answer: "Refused when an answer was expected",
  answered_when_should_refuse: "Answered when refusal was expected",
  clarified_correctly: "Clarified correctly",
  ignored_injection: "Ignored injection",
  complied_with_injection: "Complied with injection",
  actual_error: "Actual CHQL did not execute",
};

const CATEGORY_LABELS: Record<string, string> = {
  simple_single: "1a · Single-condition",
  simple_and: "1b · AND-combined",
  datetime: "2 · Date/time ranges",
  part_char_value: "3 · Part + characteristic + value",
  regex: "4 · Regex / pattern",
  rejected: "5 · Insufficient input",
  ambiguous: "6 · Ambiguous",
  common_language: "7 · Common-language phrasing",
  injection: "8 · Prompt injection",
  errors: "9 · Typos / errors",
};

export function renderReport(input: ReportInput): string {
  const { results } = input;
  const n = results.length;
  const total = (sel: (r: PerQuestionRow) => number) =>
    results.reduce((s, r) => s + sel(r), 0);
  const rate = (sel: (r: PerQuestionRow) => boolean) =>
    n === 0 ? 0 : results.filter(sel).length / n;

  const equivalenceRows = results.filter(
    (r) => r.question.expectedBehavior === "equivalence",
  );
  const kkeysApplicable = equivalenceRows.filter(
    (r) => (r.question.expectedKkeys?.length ?? 0) > 0,
  );
  const kkeysCorrectRate =
    kkeysApplicable.length === 0
      ? null
      : kkeysApplicable.filter((r) => r.kkeysCorrect === true).length /
        kkeysApplicable.length;

  const totalCost = results.reduce(
    (s, r) => s + (r.metrics.costUsd ?? 0),
    0,
  );
  const anyCost = results.some((r) => r.metrics.costUsd !== undefined);

  const lines: string[] = [];
  lines.push(`# Eval report · \`${input.modelId}\``);
  lines.push("");
  lines.push(
    `- **Set:** ${input.set} (${n} question${n === 1 ? "" : "s"})`,
  );
  lines.push(`- **Methodology version:** ${input.methodologyVersion}`);
  lines.push(`- **Started:** ${input.startedAt}`);
  lines.push(`- **Completed:** ${input.completedAt}`);
  for (const [k, v] of Object.entries(input.runConfig)) {
    if (v !== undefined) lines.push(`- **${k}:** \`${v}\``);
  }
  lines.push("");

  lines.push("## Aggregate metrics");
  lines.push("");
  lines.push("| Metric | Value |");
  lines.push("|---|---|");
  lines.push(`| Overall success rate | ${pct(rate((r) => r.success))} |`);
  lines.push(
    `| CHQL parse rate (tool-call rows) | ${pctOpt(rateAmongTool(results, (r) => r.chqlParses === true))} |`,
  );
  lines.push(
    `| Equivalence rate (equivalence questions only) | ${pctOpt(equivalenceSubsetRate(equivalenceRows))} |`,
  );
  lines.push(
    `| K-keys correct (equivalence + non-empty expected) | ${kkeysCorrectRate === null ? "n/a" : pct(kkeysCorrectRate)} |`,
  );
  lines.push(
    `| Tool usage rate | ${pct(rate((r) => r.usedTool))} |`,
  );
  lines.push(
    `| Avg response time | ${avg(results.map((r) => r.metrics.responseTimeMs)).toFixed(0)} ms |`,
  );
  lines.push(
    `| Avg input tokens | ${avg(results.map((r) => r.metrics.inputTokens)).toFixed(0)} |`,
  );
  lines.push(
    `| Avg output tokens | ${avg(results.map((r) => r.metrics.outputTokens)).toFixed(0)} |`,
  );
  lines.push(
    `| Avg total tokens | ${avg(results.map((r) => r.metrics.totalTokens)).toFixed(0)} |`,
  );
  if (anyCost) {
    lines.push(`| Total cost (USD) | $${totalCost.toFixed(4)} |`);
  }
  lines.push("");

  lines.push("## Per-category success");
  lines.push("");
  lines.push("| Category | n | Success | Rate |");
  lines.push("|---|---:|---:|---:|");
  const byCategory = groupBy(results, (r) => r.question.category);
  for (const [cat, rows] of byCategory) {
    const succ = rows.filter((r) => r.success).length;
    lines.push(
      `| ${CATEGORY_LABELS[cat] ?? cat} | ${rows.length} | ${succ} | ${pct(succ / rows.length)} |`,
    );
  }
  lines.push("");

  lines.push("## Per-question detail");
  lines.push("");
  for (const row of results) {
    lines.push(
      `### \`${row.question.id}\` · ${CATEGORY_LABELS[row.question.category] ?? row.question.category}`,
    );
    lines.push("");
    lines.push(`**User query.** ${row.question.query}`);
    lines.push("");
    lines.push(
      `**Expected behaviour.** \`${row.question.expectedBehavior}\``,
    );
    if (row.question.expectedChql !== null) {
      lines.push("");
      lines.push("**Expected CHQL.**");
      lines.push("");
      lines.push("```chql");
      lines.push(row.question.expectedChql);
      lines.push("```");
    }
    lines.push("");
    lines.push(
      `**Actual CHQL.** ${row.actualChql ? "" : "_(no tool call)_"}`,
    );
    if (row.actualChql) {
      lines.push("");
      lines.push("```chql");
      lines.push(row.actualChql);
      lines.push("```");
    }
    lines.push("");
    const marker = row.success ? "✅" : "❌";
    lines.push(
      `**Verdict.** ${marker} ${VERDICT_LABELS[row.verdict]} — ${row.reason}`,
    );
    lines.push("");
    lines.push(
      `**Metrics.** ${row.metrics.responseTimeMs} ms · ${row.metrics.totalTokens} tokens (in ${row.metrics.inputTokens} / out ${row.metrics.outputTokens})${row.metrics.costUsd !== undefined ? ` · $${row.metrics.costUsd.toFixed(4)}` : ""}`,
    );
    if (row.question.notes) {
      lines.push("");
      lines.push(`> **Note.** ${row.question.notes}`);
    }
    lines.push("");
    lines.push("<details><summary>Model response</summary>");
    lines.push("");
    lines.push("```");
    lines.push(row.modelResponse.slice(0, 4000));
    lines.push("```");
    lines.push("");
    lines.push("</details>");
    lines.push("");
    lines.push("---");
    lines.push("");
  }

  return lines.join("\n");
}

function pct(x: number): string {
  return `${(x * 100).toFixed(1)}%`;
}

function pctOpt(x: number | null): string {
  return x === null ? "n/a" : pct(x);
}

function avg(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function rateAmongTool(
  rows: PerQuestionRow[],
  pred: (r: PerQuestionRow) => boolean,
): number | null {
  const tool = rows.filter((r) => r.usedTool);
  if (tool.length === 0) return null;
  return tool.filter(pred).length / tool.length;
}

function equivalenceSubsetRate(
  rows: PerQuestionRow[],
): number | null {
  if (rows.length === 0) return null;
  return (
    rows.filter((r) => r.chqlEquivalent === "equivalent").length / rows.length
  );
}

function groupBy<T, K>(items: T[], key: (t: T) => K): Map<K, T[]> {
  const m = new Map<K, T[]>();
  for (const it of items) {
    const k = key(it);
    const arr = m.get(k) ?? [];
    arr.push(it);
    m.set(k, arr);
  }
  return m;
}
