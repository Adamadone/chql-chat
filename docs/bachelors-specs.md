# Bachelor's Thesis - Implementation Plan
## Tech Stack

- **Language:** TypeScript (backend & frontend)
- **Database:** Convex
- **Authentication:** Convex Auth (`@convex-dev/auth`) with GitHub OAuth
- **LLM:** Anthropic Claude (claude-haiku-4-5) with native tool use API
- **MCP:** Model Context Protocol — TypeScript SDK, Streamable HTTP transport
- **DSL:** CHQL (chy.stat Query Language) — text-based grammar defined in ANTLR4
- **Target API:** chy.stat v2 measurements search (`POST /api/v2/measurements/search`)
- **Containerization:** Docker (backend & frontend)
- **UI:** ShadCN

## System Concept

A ChatGPT-style web application where:
- User logs in and sees chat history
- User writes messages in natural language
- Convex backend (MCP client) connects to an MCP server over Streamable HTTP
- MCP server exposes a single tool (`search_measurements`) to query the chy.stat API
- Convex fetches tool definitions from the MCP server and passes them to Claude
- Claude uses its native tool use API to decide when to generate CHQL queries
- The MCP server receives CHQL text, forwards it to the chy.stat API, and returns results
- Claude incorporates the results into a natural-language response
- Results are displayed and chat history is stored in Convex

---

## Step 1 — Scope & Requirements

**Deliverable:** 1–2 page specification

Define in writing:
- **Target domain of the DSL** — What questions should be expressible?
- **Public API** — **Endpoint**, rate limits?, authentication, typical response sizes
- **Minimal chat features** — Login, chat history, single-model conversations
- **Success criteria** — Correctness, latency, security (prompt injection resistance)

---

## Step 2 — DSL v1 Design

**Deliverable:** DSL spec + 20 example pairs

**Decision:** Text grammar (CHQL) — defined via ANTLR4 in `docs/antlr4/`.

The DSL is CHQL (chy.stat Query Language), a text-based query language for filtering
measurement data. The grammar supports:
- K-key identifiers (K1001, K2001, K0001, etc.)
- Comparison operators: `=`, `<`, `<=`, `>`, `>=`, `LIKE`, `=~`
- Logical operators: `AND`, `OR`, `NOT`, parentheses
- Special criteria: `ALL`, `IS NULL`, `IN (...)`, `HAS ALARM`, `HAS NO ALARM`, `HAS MARK`
- Sub-query matching: `ANY VALUE MATCHES (...)`, `ALL VALUES MATCHES (...)`

The chy.stat API accepts CHQL text directly in the `query` field of the request body.

Tasks:
- Produce ~20 NL → CHQL examples with expected outputs
- Define an "allowed operations" allowlist (filters, sort, aggregation, limits)

> This deliverable is critical — it anchors both implementation and evaluation.

---

## Step 3 — System Architecture & Threat Model

**Deliverable:** Architecture diagram + threat table

### Architecture Diagram (Implemented)

```
┌─────────────┐     ┌──────────────────────────────┐     ┌────────────────────┐     ┌──────────────┐
│ Next.js App │ ──▶ │ Convex Backend                │     │ MCP Server         │     │ chy.stat     │
│ (Frontend)  │     │ (LLM + MCP Client)           │────▶│ (apps/mcp-server)  │────▶│ API v2       │
└─────────────┘     │                              │ HTTP│ Streamable HTTP    │POST │ /measurements│
                    │ - Anthropic Claude tool use  │     │ Express on :3001   │     │ /search      │
                    │ - MCP SDK client transport   │     └────────────────────┘     └──────────────┘
                    └──────────────┬───────────────┘
                                   │
                                   ▼
                           ┌──────────────┐
                           │   Convex DB  │
                           └──────────────┘
```

### Threat Model Table

| Attack Surface | Threats | Mitigations |
|----------------|---------|-------------|
| User prompt | Direct prompt injection | DSL validation, allowlists |
| API responses | Indirect prompt injection | Treat as data, not instructions |
| Tool output | Data exfiltration attempts | Output shaping |
| Chat history | Context poisoning | Context hygiene |

Reference: OWASP agent security guidance

---

## Step 4 — Vertical Slice Prototype

**Deliverable:** Working end-to-end demo

Goal: Complete "happy path" flow (implemented in `convex/ai.ts` + `apps/mcp-server/`):

1. User logs in (Convex Auth with GitHub OAuth) -- **done**
2. User sends message -- **done** (Next.js frontend + Convex mutation)
3. Convex action connects to MCP server via Streamable HTTP -- **done**
4. Convex fetches tool definitions from MCP server (`listTools`) -- **done**
5. Convex calls Anthropic Claude with tool definitions -- **done** (native tool use API)
6. Claude generates CHQL and requests `search_measurements` tool -- **done**
7. Convex calls MCP tool via `callTool` -- **done**
8. MCP server calls chy.stat API with CHQL query, returns results -- **done**
9. Claude receives tool result, generates user-facing response -- **done**
10. UI renders response + stores chat history in Convex -- **done**

### Key implementation details
- Multi-turn tool use loop (max 5 rounds) in `runLLMWithTools()`
- Graceful degradation: if MCP server is down, LLM responds without tools
- Metadata tracking: CHQL query and API response stored in message metadata
- Tool definitions fetched dynamically from MCP server (not hardcoded)

---

## Step 5 — Prompt-Injection Defenses v1

**Deliverable:** Defense checklist + test suite

### A. Hard Constraints (strongest)

- Strict DSL schema validation (reject unknown fields/ops)
- Allowlist which API endpoints/parameters can be called
- Output shaping: tool returns only what's needed

### B. Context Hygiene

- Clear delimiter boundaries between instructions and untrusted content
- Treat API responses as data, not instructions (summarize/transform before giving back to the model)

### C. Operational Controls

- Rate limiting / abuse controls on tool calls
- Logging/auditing of tool invocations (for evaluation)

### Test Suite

- **10–20 "attack prompts"** — Direct injection attempts
- **10 "indirect injection" samples** — Malicious strings embedded in API-returned fields

For the theory section, cite/compare against published secure design patterns work.
