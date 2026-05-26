# eval context

## Purpose

Local evaluation harness for benchmarking LLM models against [`golden-set.json`](golden-set.json). Four CLI scripts that work in concert with the Convex-side eval pipeline (`convex/evaluation.ts`):

- **`run-local.ts`** — runs the eval entirely on localhost against a self-hosted model (LM Studio / vLLM / any OpenAI-compatible endpoint) and a local MCP server. Writes both a JSON report and a Markdown report to `results/<model-id>.{json,md}`. Supports `--set sample|golden` (default `golden`); `sample` uses [`sample-set.json`](sample-set.json) for 2-3 question smoke tests before committing to a full run.
- **`export-cloud-results.ts`** — pulls a Convex eval run (by `runId`) and emits the same per-model Markdown + JSON pair under `results/`. Mirrors what `run-local.ts` produces so cloud and local artefacts are visually comparable.
- **`merge-results.ts`** — merges Convex-exported CSV and one-or-more local JSON reports into a single unified CSV under `results/merged-<timestamp>.csv` (per-result rows).
- **`aggregate-summary.ts`** — pulls per-run aggregates from Convex (run IDs in a JSON file) and per-report aggregates from local JSONs into a side-by-side, one-row-per-model CSV with per-category success columns. Used in the thesis tables.

## Key concepts

- **Cloud vs local split.** Anthropic / OpenAI runs are executed via `api.evaluation.startEval` in Convex (scheduler-chained, persisted in `evalRuns` / `evalResults` tables). Self-hosted runs are executed by `run-local.ts` in this directory. Both pipelines replicate the same prompt, tool-use loop, equivalence check, grading predicates, and metrics schema.
- **Question taxonomy.** Each question in `golden-set.json` is tagged with a `category` (one of 10 sub-categories, e.g. `simple_single`, `datetime`, `injection`, `ambiguous`) and an `expectedBehavior` (`equivalence` / `refusal` / `clarification` / `no_injection_compliance`).
- **Grading predicates.** Defined once in [`packages/chql-core/src/grading.ts`](../packages/chql-core/src/grading.ts) and shared by both runners. `equivalence` checks row-set equality; `refusal` / `clarification` succeed iff the model produced no `search_measurements` call; `no_injection_compliance` succeeds iff the model either refused or honored the legitimate intent.
- **Equivalence check.** Same logic in both runners. Fast paths first: if `normalizeChql(actual) === normalizeChql(expected)`, return `"equivalent"` without touching chy.stat; if the expected CHQL has been resolved earlier in this run, reuse its cached row-set hash. Otherwise do the back-to-back MCP calls for actual + expected and compare via `hashMCPResponseText` (from chql-core). Cloud-side the cache lives on `evalRuns.expectedHashes`; locally it's an in-process `Map`. Only meaningful for `equivalence`-graded questions; the predicate dispatcher skips it for the others.
- **Single attempt per question.** No retries. Methodology v2; the v1 (13-question, 2-attempt) results are archived under `results/legacy/`.
- **`EVAL_PAGE_SIZE = 1000`** to make equivalence reflect the full result set (matches `convex/evaluation.ts`).

## Architecture

```
run-local.ts ───────writes───────▶ results/<model-id>.{json,md}
                                                │
api.evaluation.startEval ─persists─▶ Convex evalRuns/evalResults
                                                │
                                                ├─▶ export-cloud-results.ts ─▶ results/<model-id>.{json,md}
                                                │
                                                └─▶ exportResults (CSV) ─▶ merge-results.ts ─▶ results/merged-<ts>.csv
                                                                                    ▲
                                                                  results/<model-id>.json ┘

results/*.json + run-ids.json ──▶ aggregate-summary.ts ──▶ results/aggregate-summary-<ts>.csv
```

## Gotchas

- **`golden-set.json`** is the shared reference for both pipelines; edits flow through `rejudgeRun` for historical Convex rows.
- **`cost_usd` is blank in `merge-results.ts` for local rows** — self-hosted has no API marginal cost. Convex pricing comes from `convex/evaluation.ts`'s `PRICING` map.
- **Methodology version.** `run-local.ts` sets `methodologyVersion: "v2"` on its JSON; `convex/evaluation.ts` writes it to the `evalRuns` row. Compare runs only within the same methodology version.
- **`aggregate-summary.ts` shells out to the Convex CLI** to fetch run aggregates — it doesn't talk to the DB directly.
- **Per-category success columns are populated only for local rows.** Cloud per-category breakdown would require a per-run `exportRunDetail` round-trip; for now use `export-cloud-results.ts` to produce the per-model MD which has the breakdown.
