# chql-core context

## Purpose

Shared package consumed by `convex/`, `apps/mcp-server/`, `apps/web/`, and `eval/`. Single source of truth for CHQL primitives: wire types, system prompt, grammar reference, query validator, K-key utilities, response hashing, and output sanitisation. Anything that touches CHQL or chy.stat envelopes lives here so the producer (MCP server) and consumers (Convex action, UI, eval) cannot drift.

## Key concepts

- **K-keys** — chy.stat's identifier vocabulary (`K0001`, `K2002`, `KX123`, …). Names are opaque codes; per-field JSDoc on the interfaces in `envelope.ts` is the only human label and is kept intentionally.
- **Envelope** — the `SearchEnvelope` shape returned by the MCP `search_measurements` tool. Has both a heavy `rows` payload and a smaller LLM-facing digest.
- **LLM vs UI split** — `rows` is stripped before the envelope reaches the LLM (would overflow context). The full envelope is persisted to `messages.metadata.apiResponse` for the UI to render.
- **CHQL** — the grammar defined by the ANTLR4 lexer/parser under `generated/`; the embedded reference lives in `reference.ts`.

## Architecture

- `envelope.ts` — wire types (`SearchEnvelope`, `EnvelopeRow`, aggregates, part/characteristic summaries) plus `parseSearchEnvelope` and `splitEnvelope` helpers.
- `prompt.ts` — `buildSystemPrompt({ hasTools, timeZone?, sections? })` returns the system-message blocks for `generateText`. The static reference block is marked Anthropic-cacheable only when `sections === 'all'` (the default, byte-stable). The old positional signature `(hasTools, timeZone?)` still works via a back-compat shim.
- `reference.ts` — `CHQL_REFERENCE_CORE` + per-section blobs in `CHQL_REFERENCE_SECTIONS`, assembled by `buildChqlReference(sections)`. The legacy `CHQL_REFERENCE` export equals `buildChqlReference('all')`. The string content is the LLM's grammar manual; do not edit casually.
- `router.ts` — `routeSections(userMessageTexts)`: stateless keyword router used by the local-vLLM path to ship only the conditional sections the user actually mentioned, cutting prefill tokens. Cloud paths ship `'all'` for prompt-cache stability.
- `router.test.ts` — per-category unit cases + golden-set snapshot asserting routed sections cover every K-key in each equivalence question's `expectedChql`. Skips `ambiguous`/`errors` categories (those test model-side typo recovery, beyond pure-regex scope).
- `hash.ts` — hashes the `(K1000, K2000, K0000)` tuple set from a response for eval equivalence checks. Handles both the new envelope shape and the legacy nested aqdef-json shape.
- `parse.ts` — `parseChql` wraps the ANTLR-generated lexer/parser and returns `{ ok: true } | { ok: false; error }`.
- `kkeys.ts` — `extractKkeys` / `kkeysMatch` for eval golden-set comparison.
- `sanitize.ts` — `stripToolTags` removes hallucinated `<tool_call>`/`<tool_response>`/`<function_call>`/`<function_response>` tags from LLM text.
- `grading.ts` — `gradeResult(question, output)` is the single source of truth for the eval success criterion. Defines the `GoldenQuestion` schema (category, expectedBehavior) and dispatches predicates for `equivalence` (row-set match), `refusal` / `clarification` (no tool call), and `no_injection_compliance` (refused or matched legitimate intent). Imported by both `eval/run-local.ts` and `convex/evaluation.ts`.
- `index.ts` — re-export barrel.

## Gotchas

- **`hash.ts` imports `node:crypto`.** Consumers must run in Node (Convex `"use node"` actions, Node/tsx CLIs). It is not consumable from Convex V8 functions or the browser. The UI's `measurement-table.tsx` defines its own wire type for this reason.
- **K0000 is not unique across characteristics** — the same K0000 can appear under multiple K2000 for the same piece/timestamp. That is why `hash.ts` uses the `(K1000, K2000, K0000)` tuple.
- **`CHQL_REFERENCE` is intentionally ~4000+ tokens** to qualify for Anthropic prompt caching. Trimming it under that threshold breaks the cache hit and raises per-request cost. The composer's `sections !== 'all'` path deliberately drops cache-control because a routed prefix varies per request; it is only used on the local-vLLM path (no cache) where prefill tokens are the real cost.
- **`parseSearchEnvelope` back-compat** — older mcp-server builds may emit envelopes without `measurementCount` / `partsOnPage` / `sampleMeasurements`. The parser fills zero-ish defaults so the UI degrades to a flat view instead of crashing.
- **K-key field JSDoc on envelope interfaces is intentional.** The codes are opaque; the JSDoc is the why. Do not strip those comments.
- **`prompt.ts` formats local-ISO timestamps server-side** rather than letting the model convert from UTC. LLMs tend to keep UTC numerals and stamp the local offset onto them, producing wrong wall-clock times.
- **`SystemPromptBlock` is structurally compatible with the AI SDK's `SystemModelMessage`** but defined locally so this package stays AI-SDK-free.
