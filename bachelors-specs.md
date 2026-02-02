# Bachelor's Thesis - Implementation Plan
## Tech Stack

- **Language:** TypeScript (backend & frontend)
- **Database:** Convex
- **Authentication:** Auth.js
- **Containerization:** Docker (backend & frontend)
- **UI:** ShadCN

## System Concept

A ChatGPT-style web application where:
- User logs in and sees chat history
- User writes messages in natural language
- Backend (MCP client) includes a system prompt with DSL definition
- LLM converts natural language to domain-specific query language
- MCP server exposes a single tool that calls an external API using the DSL query
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

Keep DSL small and machine-validated. Choose either:
- **JSON DSL** — Easy validation with JSON Schema / zod
- **Text grammar** — Validate with a parser

Tasks:
- Produce ~20 NL → DSL examples with expected outputs
- Define an "allowed operations" allowlist (filters, sort, aggregation, limits)

> This deliverable is critical — it anchors both implementation and evaluation.

---

## Step 3 — System Architecture & Threat Model

**Deliverable:** Architecture diagram + threat table

### Architecture Diagram

Should explicitly show:
```
┌─────────────┐     ┌─────────────────────────┐     ┌─────────────┐     ┌──────────────┐
│ Frontend UI │ ──▶ │ Backend (LLM + MCP Client)│ ──▶ │ MCP Server  │ ──▶ │ External API │
└─────────────┘     └─────────────────────────┘     └─────────────┘     └──────────────┘
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

Goal: Complete "happy path" flow:

1. User logs in (Auth.js)
2. User sends message
3. Backend calls LLM
4. LLM returns DSL
5. Backend validates DSL
6. Backend calls MCP tool
7. Tool calls public API and returns structured data
8. UI renders response + stores chat history in Convex

### Resources
- Auth.js and Convex both have explicit TS best practices and integration guidance
- MCP has official SDKs (including TS) and a "build a server" walkthrough

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
