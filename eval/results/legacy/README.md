# Legacy evaluation artefacts (methodology v1)

These files are from the **methodology v1** evaluation:

- Golden set of **13 questions**, all of them equivalence-graded (no taxonomy of refusal / clarification / injection / typo categories).
- Each question got **two attempts** — if attempt 1 failed, the model was re-prompted and only the first attempt counted toward rates while both counted toward cost.
- Success criterion was solely `chqlEquivalent === "equivalent"`.

They are preserved here for reproducibility and to support the "before / after" comparison if it comes up in the thesis defence. **They are not directly comparable with the v2 reports under `eval/results/`** because the question set, the grading predicates, and the attempt count all changed.

Contents:

- `qwen3-4b-qwen3.6-plus-reasoning-distilled-2026-04-23T18-02-38-249Z.json` — local Qwen 3 4B run on the 13-question set.
- `aggregate-summary-2026-04-24T12-25-34-972Z.csv` — cross-model summary as of 2026-04-24 (5 cloud + 1 local).
- `run-ids.json` — Convex eval-run IDs that the aggregate summary was built from.
