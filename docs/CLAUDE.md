# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Bachelor's thesis project: A web application that converts natural-language inputs into a domain-specific query language (CHQL) using AI models and MCP (Model Context Protocol) architecture. Key focus areas include prompt injection resistance and secure LLM integration.

## Architecture

```
┌─────────────────┐
│   Next.js App   │
│   (Frontend)    │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────────────────┐
│                 Convex Backend                   │
├─────────────────────────────────────────────────┤
│  Queries     │  Mutations   │     Actions       │
│  - chats     │  - chats     │  - ai.process     │
│  - messages  │  - messages  │    Message        │
│  - users     │  - users     │                   │
├─────────────────────────────────────────────────┤
│              Database (Built-in)                 │
│  Tables: users, chats, messages, sessions       │
└────────┬────────────────────────────────────────┘
         │
         ▼ (from Actions — MCP Client)
┌─────────────────┐     ┌──────────────────────┐     ┌──────────────┐
│   LLM Provider  │     │  MCP Server          │     │  chy.stat    │
│   (Anthropic    │────▶│  (apps/mcp-server)   │────▶│  API         │
│    Claude)      │     │  Streamable HTTP     │     │  POST /api/  │
└─────────────────┘     └──────────────────────┘     │  v2/search   │
                                                     └──────────────┘
```

### Data Flow
1. User sends natural language message via Next.js frontend
2. Convex action (`ai.processMessage`) receives the message
3. Convex connects to MCP server, fetches available tools
4. Convex calls Anthropic Claude with tool definitions + system prompt
5. Claude generates a CHQL query and requests `search_measurements` tool
6. Convex (MCP client) calls the MCP server's tool via Streamable HTTP
7. MCP server sends CHQL query to chy.stat API, returns results
8. Results sent back to Claude as tool_result
9. Claude generates user-facing response
10. Response stored in Convex DB and displayed to user

## Tech Stack

- **Frontend**: Next.js 16 + React 19 + Tailwind CSS + ShadCN UI
- **Backend**: Convex (serverless functions + database)
- **Authentication**: Convex Auth (`@convex-dev/auth`) with GitHub OAuth
- **AI Integration**: Anthropic Claude (tool use API) + MCP protocol
- **DSL**: CHQL (chy.stat Query Language) — text-based, defined by ANTLR4 grammar in `docs/antlr4/`
- **MCP Server**: TypeScript + Express + MCP SDK (Streamable HTTP transport)
- **Containerization**: Docker (for production deployment)

## Project Structure

```
chql-chat/
├── apps/
│   ├── web/                       # Next.js application
│   │   ├── src/
│   │   │   ├── app/               # Next.js App Router
│   │   │   ├── components/        # React components
│   │   │   ├── lib/               # Utilities
│   │   │   ├── providers/         # Context providers
│   │   │   └── auth.ts            # Auth configuration
│   │   └── ...
│   └── mcp-server/                # MCP Server (Streamable HTTP)
│       ├── src/
│       │   └── index.ts           # Server entry point + tool definitions
│       ├── build/                  # Compiled output (gitignored)
│       ├── package.json
│       └── tsconfig.json
├── convex/                        # Convex backend (MCP Client)
│   ├── schema.ts                  # Database schema
│   ├── chats.ts                   # Chat CRUD operations
│   ├── messages.ts                # Message operations
│   ├── users.ts                   # User operations
│   ├── ai.ts                      # LLM + MCP client integration
│   ├── auth.ts                    # Convex Auth config
│   └── http.ts                    # HTTP routes
├── packages/
│   └── shared/                    # Shared types/utilities
├── docker/
│   ├── Dockerfile.web             # Next.js production container
│   └── Dockerfile.mcp             # MCP server production container
└── docs/
    ├── antlr4/                    # CHQL grammar (lexer + parser)
    ├── CLAUDE.md                  # This file
    ├── DEPLOYMENT.md              # Production deployment guide
    ├── bachelors-specs.md         # Implementation plan
    └── initial-plan.md            # Thesis overview
```

## Development Commands

```bash
# Install dependencies
npm install

# Start development (Next.js + Convex)
npm run dev

# Start only Next.js
npm run dev:web

# Start only Convex
npm run convex:dev

# MCP Server commands
npm run mcp:build              # Compile TypeScript
npm run mcp:dev                # Watch mode
npm run mcp:start              # Run server (with dotenvx for env vars)

# Build for production
npm run build

# Docker commands
npm run docker:build
npm run docker:up
npm run docker:down
npm run docker:logs
```

### Running the full stack locally
1. Start the MCP server: `npm run mcp:start` (listens on port 3001)
2. Start Convex + Next.js: `npm run dev`
3. Open http://localhost:3000

## Environment Variables

| Variable | Used By | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | Convex actions | Anthropic Claude API key |
| `CHYSTAT_API_TOKEN` | MCP server | chy.stat API Bearer token |
| `MCP_SERVER_URL` | Convex actions | MCP server URL (default: `http://localhost:3001/mcp`) |
| `MCP_AUTH_TOKEN` | Convex actions + MCP server | Shared secret for MCP server auth (optional in dev) |
| `MCP_PORT` | MCP server | HTTP port (default: `3001`) |
| `CONVEX_DEPLOYMENT` | Convex | Convex deployment identifier |
| `AUTH_SECRET` | Convex Auth | Session encryption secret |
| `GITHUB_ID` / `GITHUB_SECRET` | Convex Auth | GitHub OAuth credentials |

## Convex Backend Structure

### Schema (convex/schema.ts)
- `users` - User accounts synced from Convex Auth
- `chats` - Chat conversations per user
- `messages` - Messages within chats (user/assistant roles, optional metadata with dslQuery/apiResponse/error)
- `sessions` - Convex Auth sessions

### Key File: convex/ai.ts (MCP Client)
- `processMessage` action — main entry point for the LLM + tool use flow
- `createMCPClient()` — connects to the MCP server via Streamable HTTP transport
- `getMCPToolsAsAnthropicTools()` — fetches tools from MCP server, converts to Anthropic format
- `callMCPTool()` — executes a tool call via MCP protocol
- `runLLMWithTools()` — multi-turn loop handling Claude's tool_use requests (max 5 rounds)
- `generateTitle` action — auto-generates chat titles
- Graceful degradation: if MCP server is unavailable, LLM responds without tools

## MCP Server (apps/mcp-server/)

### Transport
- **Default**: Streamable HTTP on port 3001 (`/mcp` endpoint)
- **Alternative**: stdio transport (`--stdio` flag, for Claude Desktop or direct testing)
- Health check: `GET /health`

### Tool: search_measurements
- **Input**: `query` (CHQL string), `pageSize` (optional), `pageNumber` (optional)
- **Calls**: `POST https://demo.chystat.com/api/v2/measurements/search`
- **Auth**: Bearer token from `CHYSTAT_API_TOKEN` env var
- **Response format**: `aqdef-json` (static)

## CHQL (chy.stat Query Language)

Text-based DSL defined by ANTLR4 grammar in `docs/antlr4/`. Grammar overview:
- K-key identifiers: `K` followed by digits (e.g. `K1001`, `K2001`, `K0001`)
- Comparison: `=`, `<`, `<=`, `>`, `>=`, `LIKE`, `=~`
- Logical: `AND`, `OR`, `NOT`, parentheses
- Special: `ALL`, `IS NULL`, `IN (...)`, `HAS ALARM`, `HAS NO ALARM`, `HAS MARK`, `ANY VALUE MATCHES`, `ALL VALUES MATCHES`

## Security Requirements

This project emphasizes prompt injection resistance with three defense layers:

**Hard Constraints:**
- CHQL query validation (MCP server validates before API call)
- Allowlisted API endpoint (only measurements/search)
- Output shaping (tool returns only measurement data)

**Context Hygiene:**
- System prompt explicitly marks API responses as data
- Clear delimiter boundaries between instructions and untrusted content

**Operational Controls:**
- Max 5 tool call rounds per message (prevents infinite loops)
- Rate limiting on tool calls (TODO)
- Logging/auditing of tool invocations (TODO)

## Key References

- MCP Documentation: https://modelcontextprotocol.io/docs/getting-started/intro
- chy.stat API Docs: https://apidocs.chystat.com/v2/current
- Convex Documentation: https://docs.convex.dev
- Convex Auth Documentation: https://labs.convex.dev/auth
- OWASP agent security guidance for threat modeling
