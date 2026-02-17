# CLAUDE.md

Guidance for Claude Code when working with this repository.

## Project Overview

Bachelor's thesis: Web app converting natural language to CHQL (chy.stat Query Language) using AI models and MCP (Model Context Protocol). Key focus: prompt injection resistance and secure LLM integration.

## Architecture

```
Next.js App (Frontend)
        │
        ▼
Convex Backend (Queries/Mutations/Actions + DB)
        │
        ▼ (from Actions — MCP Client)
LLM (Claude) ──▶ MCP Server (Streamable HTTP) ──▶ chy.stat API
```

### Data Flow
1. User sends message via Next.js frontend
2. Convex action `ai.processMessage` receives message
3. Convex connects to MCP server, fetches available tools
4. Calls Claude with tool definitions + system prompt
5. Claude generates CHQL query, requests `search_measurements` tool
6. Convex (MCP client) calls MCP server via Streamable HTTP
7. MCP server sends CHQL to chy.stat API, returns results
8. Results sent back to Claude as `tool_result`
9. Claude generates user-facing response
10. Response stored in Convex DB and displayed to user

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16, React 19, Tailwind CSS, ShadCN UI |
| Backend | Convex (serverless functions + database) |
| Auth | Convex Auth (`@convex-dev/auth`), GitHub OAuth |
| AI | Anthropic Claude (tool use API) + MCP protocol |
| DSL | CHQL — text-based, ANTLR4 grammar in `docs/antlr4/` |
| MCP Server | TypeScript, Express, MCP SDK (Streamable HTTP) |
| Deployment | Docker (production containers) |

## Project Structure

```
chql-chat/
├── apps/
│   ├── web/                        # Next.js 16 app
│   │   └── src/
│   │       ├── app/                # App Router (pages + layouts)
│   │       ├── components/
│   │       │   ├── chat/           # Chat UI (area, input, messages, sidebar, shell, markdown)
│   │       │   ├── auth/           # Auth UI (sign-in card)
│   │       │   └── ui/            # shadcn/ui primitives (13 components)
│   │       ├── hooks/              # use-auto-scroll, use-typewriter, use-animated-title,
│   │       │                       # use-message-history, use-textarea-auto-resize
│   │       ├── utils/              # easing.ts, format.ts
│   │       ├── lib/                # shadcn/ui utilities (cn)
│   │       └── providers/          # Convex + theme providers
│   └── mcp-server/                 # MCP Server (Streamable HTTP)
│       └── src/index.ts            # Server entry + tool definitions
├── convex/                         # Convex backend (MCP Client)
│   ├── schema.ts                   # DB schema
│   ├── chats.ts / messages.ts / users.ts  # CRUD operations
│   ├── ai.ts                       # LLM + MCP client integration
│   ├── auth.ts / auth.config.ts    # Auth config (GitHub OAuth)
│   ├── http.ts                     # HTTP routes (auth callbacks)
│   └── migrations.ts / convex.config.ts
├── packages/shared/                # Shared TypeScript interfaces
├── docker/                         # Dockerfile.web, Dockerfile.mcp
└── docs/                           # CLAUDE.md, SETUP.md, DEPLOYMENT.md, specs, ANTLR4 grammar
```

## Development Commands

```bash
npm install                  # Install dependencies
npm run dev                  # Start Next.js + Convex
npm run dev:web              # Next.js only
npm run convex:dev           # Convex only
npm run mcp:build            # Compile MCP server
npm run mcp:dev              # MCP server watch mode
npm run mcp:start            # Run MCP server (dotenvx for env vars)
npm run build                # Production build
npm run docker:build / docker:up / docker:down / docker:logs
```

**Full stack locally:** `npm run mcp:start` (port 3001) + `npm run dev` + open http://localhost:3000

## Environment Variables

See [SETUP.md](./SETUP.md#environment-variables) for the full table, secrets inventory, dotenvx encryption guide, and Convex env var config.

## Convex Backend

### Schema (`convex/schema.ts`)
- `users` — accounts synced from Convex Auth
- `chats` — per-user conversations (`activeToolCall` for real-time tool-use UI feedback)
- `messages` — chat messages (user/assistant roles, optional metadata: `dslQuery`, `apiResponse`, `error`, `toolCalls`, `interrupted` flag)
- Auth tables (`authAccounts`, `authSessions`, `authRefreshTokens`) — managed by Convex Auth

### Key File: `convex/ai.ts` (MCP Client)
- `processMessage` — main LLM + tool use entry point
- `createMCPClient()` — connects to MCP server via Streamable HTTP
- `getMCPToolsAsAnthropicTools()` — fetches and converts tools to Anthropic format
- `callMCPTool()` — executes tool calls via MCP
- `runLLMWithTools()` — multi-turn loop handling Claude tool_use (max 5 rounds)
- `generateTitle` — auto-generates chat titles
- Graceful degradation if MCP server is unavailable

## MCP Server (`apps/mcp-server/`)

**Transport:** Streamable HTTP on port 3001 (`/mcp`), or stdio (`--stdio` flag). Health check: `GET /health`.

**Security:** Bearer token auth (`MCP_AUTH_TOKEN`, required in prod), timing-safe comparison, per-IP rate limiting (60 req/min), session cap (100), body limit (1 MB), security headers, non-root Docker user.

**Tool `search_measurements`:** Input: `query` (CHQL), optional `pageSize` (1-1000), `pageNumber` (1-based). Calls `POST https://demo.chystat.com/api/v2/measurements/search` with bearer token from `CHYSTAT_API_TOKEN`. Response format: `aqdef-json`.

## CHQL (chy.stat Query Language)

Text-based DSL defined by ANTLR4 grammar in `docs/antlr4/`:
- **K-key identifiers:** `K` + digits (e.g. `K1001`, `K2001`)
- **Comparison:** `=`, `<`, `<=`, `>`, `>=`, `LIKE`, `=~`
- **Logical:** `AND`, `OR`, `NOT`, parentheses
- **Special:** `ALL`, `IS NULL`, `IN (...)`, `HAS ALARM`, `HAS NO ALARM`, `HAS MARK`, `ANY VALUE MATCHES`, `ALL VALUES MATCHES`

## Security (Prompt Injection Defense)

Three defense layers:

**Hard Constraints:** CHQL query validation on MCP server, allowlisted API endpoint (measurements/search only), output shaping (tool returns only measurement data).

**Context Hygiene:** System prompt marks API responses as data, clear delimiters between instructions and untrusted content.

**Operational Controls:** Max 5 tool call rounds/message, per-IP rate limiting (60 req/min), session cap (100), body limit (1 MB), timing-safe token comparison, security headers (`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`).

## UI Design Guidelines

**Extracted to [`docs/UI_GUIDELINES.md`](./UI_GUIDELINES.md).** Read that file when modifying or creating UI components.

## Key References

- [MCP Documentation](https://modelcontextprotocol.io/docs/getting-started/intro)
- [chy.stat API Docs](https://apidocs.chystat.com/v2/current)
- [Convex Documentation](https://docs.convex.dev)
- [Convex Auth Documentation](https://labs.convex.dev/auth)
- OWASP agent security guidance for threat modeling
- Refactoring UI (design principles): `docs/RefactoringUI.md`
