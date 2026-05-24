# eval context

## Purpose

Local evaluation harness for benchmarking LLM models against [`golden-set.json`](golden-set.json). Three CLI scripts that work in concert with the Convex-side eval pipeline (`convex/evaluation.ts`):

- **`run-local.ts`** — runs the eval entirely on localhost against a self-hosted model (vLLM / OpenAI-compatible endpoint) and a local MCP server. Writes a JSON report to `results/<model>-<timestamp>.json`.
- **`merge-results.ts`** — merges Convex-exported CSV (`api.evaluationHelpers.exportResults`) and one-or-more local JSON reports into a single unified CSV under `results/merged-<timestamp>.csv`.
- **`aggregate-summary.ts`** — pulls per-run aggregates from Convex (run IDs in `results/run-ids.json`) and per-report aggregates from local JSONs into a side-by-side, one-row-per-model CSV used in the thesis tables.

## Key concepts

- **Cloud vs local split.** Anthropic / OpenAI runs are executed via `api.evaluation.startEval` in Convex (scheduler-chained, persisted in `evalRuns` / `evalResults` tables). Self-hosted runs are executed by `run-local.ts` in this directory. Both pipelines replicate the same prompt, tool-use loop, equivalence check, and metrics schema.
- **Equivalence check.** Same logic as `convex/evaluation.ts`: back-to-back MCP calls for actual + expected CHQL, compare row-set hashes via `hashMCPResponseText` (from chql-core).
- **Two retries per query.** Both pipelines retry attempt-1 failures once; only attempt-1 rows count toward rate/average aggregates.
- **`EVAL_PAGE_SIZE = 1000`** to make equivalence reflect the full result set (matches `convex/evaluation.ts`).

## Architecture

```
run-local.ts ──writes──▶ results/<model>-<timestamp>.json ──┐
                                                            ├─▶ merge-results.ts ──▶ results/merged-<ts>.csv
api.evaluation.startEval ──persists──▶ Convex evalRuns/evalResults ──exportResults──▶ CSV ──┘

run-ids.json + results/*.json ──▶ aggregate-summary.ts ──▶ results/aggregate-<ts>.csv
```

## Gotchas

- **`golden-set.json`** is the shared reference for both pipelines; edits flow through `rejudgeRun` for historical Convex rows.
- **`cost_usd` is blank in `merge-results.ts` for local rows** — self-hosted has no API marginal cost. Convex pricing comes from `convex/evaluation.ts`'s `PRICING` map.
- **CSV header mirrors `convex/evaluationHelpers.ts` `exportResults`** verbatim so the two sources concatenate cleanly.
- **`aggregate-summary.ts` shells out to the Convex CLI** to fetch run aggregates — it doesn't talk to the DB directly.
- The Convex eval doesn't double-count retries in success rate; `run-local.ts` mirrors that rule (`if (attempt === 1 || !success)` gating).
