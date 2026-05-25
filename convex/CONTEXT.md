# convex context

## Purpose

Convex backend for the chat app. Holds:

- **`ai.ts`** — the LLM + MCP integration hub. Calls Vercel AI SDK providers (Anthropic / OpenAI / local vLLM), opens an MCP client against the standalone `apps/mcp-server`, and orchestrates the multi-turn tool-use loop.
- **`chats.ts` / `messages.ts`** — CRUD for chats and messages with per-user authorisation.
- **`auth.ts` / `http.ts`** — Convex Auth (GitHub OAuth) with one-week sessions.
- **`schema.ts`** — `chats`, `messages`, `evalRuns`, `evalResults` plus `authTables`.
- **`evaluation.ts` (Node) + `evaluationHelpers.ts` (default runtime)** — model benchmarking pipeline. Split runtimes because actions calling the AI SDK need `"use node"` while mutations/queries must run in Convex V8.
- **`constants.ts`** — `MAX_USER_MESSAGE_CHARS = 8000` enforced by both `processMessage` (ai.ts) and `messages.send`.
- **`migrations.ts`** — `@convex-dev/migrations` runner; no migrations defined yet.

## Key concepts

- **MCP side-channel.** `runLLMWithTools` passes a `Map<toolCallId, SearchEnvelope>` into the tool execute wrapper. The wrapper strips `rows` from what the LLM sees and stashes the full envelope in the map; `onStepFinish` drains it into `metadata.apiResponse` so the UI can render the table without the LLM ever seeing the rows.
- **Per-step processing flow.** `processMessage` does: auth → persist user message → load history → connect MCP (graceful degradation if it fails) → run multi-turn loop with `stepCountIs(MAX_TOOL_ROUNDS)` → interruption check → persist assistant message with metadata → cleanup.
- **`fetchPage` is LLM-free.** Re-runs the stored `dslQuery` at a new page number via direct MCP call; patches `metadata.apiResponse` only. Saves the `listTools` round-trip that `processMessage` does.
- **Eval scheduler chain.** `runQueryAction` runs one question per scheduled action (own 5-min budget) — methodology v2, single attempt, no retry — then schedules the next or `finalizeEvalRun`. Errors are caught and recorded as failure rows; re-throwing would orphan the run.
- **Grading predicate** lives in `packages/chql-core/src/grading.ts` (`gradeResult`). Dispatches by the question's `expectedBehavior`: `equivalence`, `refusal`, `clarification`, or `no_injection_compliance`. Both Convex and `eval/run-local.ts` call the same function.
- **Rejudge.** `rejudgeRun` re-judges historical rows against the current golden-set using only stored CHQL strings (no MCP, no LLM). Identical normalised CHQL strings ⇒ identical row sets ⇒ verdict upgraded to `"equivalent"`.

## Architecture

```
frontend (chat-input.tsx) ──useAction──▶ ai.processMessage
                                        │
                                        ├─▶ MCP client (Streamable HTTP) ──▶ apps/mcp-server ──▶ chy.stat
                                        └─▶ AI SDK (anthropic / openai / local)
```

Eval pipeline:

```
api.evaluation.startEval ──schedules──▶ runQueryAction ──chain──▶ finalizeEvalRun
                                              │
                                              └─▶ runSingleQuery (LLM + MCP) ──▶ computeEquivalence (back-to-back MCP fetches)
```

## Gotchas

- **Two runtimes.** `ai.ts` and `evaluation.ts` declare `"use node"` (needed for AI SDK + node:crypto). `evaluationHelpers.ts`, `chats.ts`, `messages.ts`, `schema.ts`, `auth.ts`, `migrations.ts` run in the default V8 runtime. Putting a mutation in a `"use node"` file or importing AI SDK from a V8 file is a deploy error.
- **`MAX_USER_MESSAGE_CHARS = 8000`** (~2000 tokens) is enforced server-side at both entry points; the client textarea mirrors it for UX only.
- **`__last__` sentinel in `EnvelopeSideChannel`.** Defensive fallback for when the AI SDK doesn't pass a `toolCallId` to the execute wrapper — covers the single-tool-call-per-step case.
- **`fetchPage` page-size preservation.** Reads the prior `apiResponse.page.pageSize` so pagination stays stable; falls back to `DEFAULT_FETCH_PAGE_SIZE = 100`.
- **Eval `EVAL_PAGE_SIZE = 1000`.** Larger than production to make functional equivalence reflect the full result set; queries returning >1000 rows are truncated (acceptable for the current golden set).
- **`computeEquivalence` runs actual + expected back-to-back (~100ms apart)** so chy.stat data drift during a run can't invalidate the hash comparison. Equivalence is set-based — empty-vs-empty counts as `"equivalent"` only when both hashes match; otherwise `"expected_empty"` covers the "can't judge" cases.
- **Success criterion comes from `gradeResult`,** not directly from `chqlEquivalent`. Refusal / clarification / injection questions can succeed without a tool call; equivalence questions still require a row-set match.
- **`finalizeEvalRun` vs `recomputeRunAggregates`.** Both call `computeAggregateMetrics`. `finalizeEvalRun` also sets `status` and `completedAt`; `recomputeRunAggregates` leaves them intact (used by `rejudgeRun`). Single attempt per question, so rates are computed straight over the rows (no attempt-1 filtering as in v1).
- **Auth requires explicit `issuer` for GitHub.** GitHub sends `iss=https://github.com/login/oauth` per RFC 9207, which Convex Auth needs declared explicitly on the provider.
- **`patchApiResponse` (messages.ts)** verifies the caller owns the chat that contains the message, not just the message itself.
- **User messages are wrapped in `<user_message_${nonce}>...</user_message_${nonce}>` tags** in `processMessage` as an injection defense — the system prompt instructs the model to treat tag contents as data.
