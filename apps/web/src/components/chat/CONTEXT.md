# chat components context

## Purpose

The chat UI surface: sidebar (chat list / sign-out / new chat), the chat area (message stream + input), and the inline measurement table rendered inside assistant bubbles.

## Key concepts

- **Optimistic + server-truth combo.** `chat-area.tsx` keeps an in-memory `pendingMessage` so the user bubble appears instantly, then clears it when the real user message arrives from Convex. Server-side `chat.isProcessing` is the source of truth for "still waiting" — `pendingMessage` only covers the gap before the server knows.
- **Per-chat drafts in a ref.** Parent `chat-area.tsx` holds `draftsRef: Map<chatId, string>` so switching chats preserves WIP input without re-rendering the expensive `ChatMessages` subtree on every keystroke. Drafts are not persisted — refresh wipes them.
- **Browser-side envelope validation.** `measurement-table.tsx` defines its own `EnvelopeShape` interface and validates with `isEnvelope` rather than importing the chql-core type. This keeps `node:crypto` (pulled in by chql-core/hash) out of the browser bundle.
- **Pivot table.** Flat envelope rows (one per K0001) are re-grouped by `(part, K2000-or-K2001, K0000)` into a table where rows are measurement events and columns are characteristics. Per-page pagination uses `api.ai.fetchPage` which is LLM-free.

## Architecture

```
chat-shell
├── chat-sidebar    chat list, sign-out, new-chat button
└── chat-area       per-chat drafts ref, pendingMessage state
    ├── chat-messages
    │   ├── MessageBubble / TypewriterBubble / PendingUserBubble / ThinkingIndicator
    │   └── measurement-table   inline pivot table on assistant turns with envelope data
    └── chat-input  textarea, send/interrupt, history navigation
```

`ui/` (shadcn primitives), `hooks/`, `utils/`, `providers/` siblings carry the supporting layer.

## Gotchas

- **Don't import from chql-core in `measurement-table.tsx`** — `node:crypto` would land in the browser bundle.
- **`shouldRenderMeasurementTable` is the parent-side gate.** Lets `MessageBubble` / `TypewriterBubble` skip mounting the table when there's no envelope, the envelope is malformed, or `rowCount === 0`.
- **`hasNext` is a guess.** chy.stat doesn't return a total; the table assumes more pages exist if the current page came back full (`rows.length >= pageSize`).
- **`generateTitle` fires in parallel with `processMessage`** — the call in `chat-input.tsx` passes `userMessage` so the title action skips the DB roundtrip and produces the title within ~1s.
- **`activeChatRef`** in `chat-input.tsx` tracks the chat the in-flight send belongs to, so an interrupt fires against the correct chat even if the user switches mid-flight.
- **K-key field labels** in pivot logic (K1000/K1001/K1002/K1008, K2000/K2001/K2002/K2142, K0000/K0001/K0004/K0002/K0007/K0010/K0014) are intentional — the codes are opaque.
