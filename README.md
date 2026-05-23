# CHQL Chat

Natural language to DSL query converter with Convex backend and MCP architecture.

Bachelor's thesis project focusing on secure LLM integration and prompt injection resistance.

## Architecture

```
┌─────────────────┐
│   Next.js App   │  (Frontend + API Routes)
│   Port 3000     │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│         Convex Backend (Cloud)          │
│         — acts as the MCP client —      │
├─────────────────────────────────────────┤
│  Queries  │  Mutations  │    Actions    │
│  - chats  │  - chats    │ - ai.process  │
│  - msgs   │  - messages │   Message     │
│  - users  │  - users    │ - evaluation  │
├─────────────────────────────────────────┤
│           Database (Built-in)           │
└────────┬────────────────────────────────┘
         │
         ▼
┌──────────────────────────────┐     ┌─────────────────────────┐
│   LLM Provider               │────▶│   MCP Server            │
│   (Anthropic / OpenAI /      │     │   (Express + Streamable │
│    local vLLM via Vercel     │     │    HTTP)                │
│    AI SDK)                   │     │   ─▶ chy.stat API       │
└──────────────────────────────┘     └─────────────────────────┘
```

Convex actions in `convex/ai.ts` are the MCP client: they connect to the MCP
server over Streamable HTTP, discover the `search_measurements` tool, and run
a multi-turn tool-use loop with the configured LLM.

## Project Structure

```
chql-chat/
├── apps/
│   ├── web/                       # Next.js 16 + React 19 (App Router, Turbopack)
│   │   └── src/
│   │       ├── app/               # Pages, layouts, API routes, auth/chat routes
│   │       ├── components/        # auth/, chat/, ui/, hero-section.tsx
│   │       ├── hooks/, lib/, providers/, utils/
│   │       └── middleware.ts      # Next.js middleware
│   └── mcp-server/                # MCP server (Express + Streamable HTTP)
├── convex/                        # Convex backend (serverless + DB)
│   ├── schema.ts                  # chats, messages, evalRuns, evalResults, auth tables
│   ├── chats.ts / messages.ts / users.ts
│   ├── ai.ts                      # LLM + MCP client (multi-provider via Vercel AI SDK)
│   ├── evaluation.ts              # Model benchmarking actions
│   ├── evaluationHelpers.ts       # Eval mutations/queries (default runtime)
│   ├── migrations.ts              # @convex-dev/migrations runner
│   ├── constants.ts               # MAX_USER_MESSAGE_CHARS, etc.
│   ├── auth.ts / auth.config.ts / http.ts
│   ├── chql/                      # CHQL parser + response hashing
│   │   ├── parse.ts               # ANTLR4 wrapper (syntactic validation)
│   │   ├── hash.ts                # MCP response hashing
│   │   └── generated/             # antlr4ng-cli output
│   └── README.md
├── eval/                          # Local eval runner for self-hosted models
│   ├── run-local.ts               # Direct vLLM + MCP eval pipeline
│   ├── merge-results.ts
│   ├── aggregate-summary.ts
│   ├── golden-set.json
│   └── results/
├── packages/
│   └── shared/                    # Shared TypeScript interfaces
├── docker/
│   ├── Dockerfile.web             # Next.js production container
│   └── Dockerfile.mcp             # MCP server production container
├── docker-compose.yml             # web + mcp-server + caddy
├── Caddyfile                      # Reverse proxy + automatic HTTPS
├── docs/                          # Project documentation
├── .env.local                     # Encrypted environment variables (dotenvx)
└── package.json                   # Root workspace package.json
```

## Tech Stack

- **Frontend**: Next.js 16 + React 19.2 + Tailwind CSS 4 + ShadCN / Radix UI
- **Backend**: Convex (serverless functions + database)
- **Authentication**: Convex Auth (`@convex-dev/auth`) with GitHub OAuth
- **AI Integration**: Vercel AI SDK (`ai`) abstracting **Anthropic Claude**
  (default `claude-haiku-4-5`), **OpenAI**, and **local OpenAI-compatible
  servers** (e.g. vLLM, LM Studio). MCP integration via
  `@modelcontextprotocol/sdk`.
- **MCP Server**: Express + Streamable HTTP transport, per-IP rate limiting, healthcheck endpoint
- **DSL**: CHQL (chy.stat Query Language) — text-based, defined by ANTLR4 grammar; parser generated with `antlr4ng`
- **Evaluation**: Convex actions + local `tsx` runner against a golden set with CHQL-equivalence scoring
- **Reverse Proxy**: Caddy (automatic HTTPS via Let's Encrypt)
- **Environment Security**: dotenvx (encrypted environment variables)
- **Containerization**: Docker (web + MCP server + Caddy via `docker-compose`)

## Quick Start

### Prerequisites

- Node.js >= 18.0.0
- npm
- Convex account (free at https://convex.dev)

### Installation

1. Clone the repository:
   ```bash
   git clone <your-repo-url>
   cd chql-chat
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   - **If first time:** You need the `.env.keys` file with decryption key (see `docs/SETUP.md`)
   - **If team member:** Ask for the `DOTENV_PRIVATE_KEY_LOCAL` value and create `.env.keys`
   - The `.env.local` file is encrypted and included in the repo

4. Start development servers:
   ```bash
   npm run dev
   ```
   This starts both Next.js (port 3000) and Convex in watch mode.

5. Visit http://localhost:3000

## Available Commands

```bash
# Development
npm run dev              # Start Next.js + Convex
npm run dev:web          # Start only Next.js
npm run convex:dev       # Start only Convex

# Build & Lint
npm run build            # Build all workspaces
npm run lint             # Lint all workspaces

# MCP server
npm run mcp:build        # tsc compile
npm run mcp:dev          # tsc --watch
npm run mcp:dev:run      # Build + run locally
npm run mcp:start        # Run with dotenvx

# Docker
npm run docker:build     # Build Docker images
npm run docker:up        # Start containers (web + mcp-server + caddy)
npm run docker:down      # Stop containers
npm run docker:logs      # View container logs

# Convex
npm run convex:deploy    # Deploy Convex to production

# Evaluation (run from eval/)
cd eval
npm run eval             # Local eval runner against vLLM / local model
npm run merge            # Merge per-model JSON results
npm run aggregate        # CSV summary across runs
```

## Development Roadmap

The project follows a 5-step plan:

1. **Scope & Requirements** — 1-2 page spec defining DSL domain, target API, chat features
2. **DSL v1 Design** — DSL spec + 20 NL-to-DSL example pairs with allowlist
3. **System Architecture & Threat Model** — Architecture diagram + threat analysis
4. **Vertical Slice Prototype** — End-to-end happy path demo
5. **Prompt-Injection Defenses** — Defense checklist + test suite

Current status: **Step 5** — production deployed; refining prompt-injection
defenses and benchmarking models against the CHQL golden set.

## Security Focus

Three intentional defense layers (see `docs/CLAUDE.md` and `convex/ai.ts`):

1. **Hard constraints** — ANTLR-based CHQL syntactic validation
   (`packages/chql-core/src/parse.ts`), allowlisted endpoint (measurements/search only),
   output shaping in the MCP server.
2. **Context hygiene** — system prompt marks API responses as untrusted data,
   XML delimiters between instructions and tool output, message length cap
   (`MAX_USER_MESSAGE_CHARS = 8000`).
3. **Operational controls** — `MAX_TOOL_ROUNDS = 5` per message, per-IP and
   session-level rate limiting on the MCP server, body-size limits,
   timing-safe auth-token comparison, security headers.

## Documentation

- `docs/SETUP.md` — Environment variables, authentication, secrets & Convex configuration
- `docs/DEPLOYMENT.md` — Production deployment guide (Hetzner + Docker + Caddy + CI/CD)
- `docs/CLAUDE.md` — Guidance for Claude Code AI assistant
- `docs/bachelors-specs.md` — Thesis implementation specifications
- `docs/prompt-examples.md` — NL-to-CHQL example scenarios
- `docs/UI_GUIDELINES.md`, `docs/RefactoringUI.md` — UI design references
- `docs/kkey-dictionary.csv` — K-key reference data
- `docs/antlr4/` — CHQL grammar definitions (lexer + parser)
- `convex/README.md` — Backend module map
