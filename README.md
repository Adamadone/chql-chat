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
├─────────────────────────────────────────┤
│  Queries  │  Mutations  │    Actions    │
│  - chats  │  - chats    │ - ai.process  │
│  - msgs   │  - messages │   Message     │
│  - users  │  - users    │               │
├─────────────────────────────────────────┤
│           Database (Built-in)           │
└────────┬────────────────────────────────┘
         │
         ▼
┌─────────────────┐     ┌─────────────────┐
│  LLM Provider   │────▶│  MCP Server /   │
│  (Anthropic)    │     │  External API   │
└─────────────────┘     └─────────────────┘
```

## Project Structure

```
chql-chat/
├── apps/
│   ├── web/                    # Next.js 16 application
│   │   ├── src/
│   │   │   ├── app/            # Next.js App Router (pages + layouts)
│   │   │   ├── components/     # React components (chat/, auth/, ui/)
│   │   │   ├── hooks/          # Custom React hooks
│   │   │   ├── utils/          # Utility functions (easing, formatting)
│   │   │   ├── lib/            # shadcn/ui utilities (cn)
│   │   │   └── providers/      # Context providers (Convex, theme)
│   │   └── package.json
│   └── mcp-server/             # MCP Server (Streamable HTTP)
│       ├── src/index.ts        # Server + tool definitions
│       └── package.json
├── convex/                     # Convex backend (serverless functions + DB)
│   ├── schema.ts               # Database schema (chats, messages + auth tables)
│   ├── chats.ts                # Chat CRUD operations
│   ├── messages.ts             # Message operations
│   ├── users.ts                # User queries
│   ├── ai.ts                   # LLM + MCP client integration
│   ├── auth.ts                 # Convex Auth config (GitHub OAuth)
│   └── http.ts                 # HTTP routes (auth callbacks)
├── packages/
│   └── shared/                 # Shared TypeScript interfaces
├── docker/
│   ├── Dockerfile.web          # Next.js production container
│   └── Dockerfile.mcp          # MCP server production container
├── docs/                       # Project documentation
├── .env.local                  # Encrypted environment variables (dotenvx)
└── package.json                # Root workspace package.json
```

## Tech Stack

- **Frontend**: Next.js 16 + React 19 + Tailwind CSS + ShadCN UI
- **Backend**: Convex (serverless functions + database)
- **Authentication**: Convex Auth (`@convex-dev/auth`) with GitHub OAuth
- **AI Integration**: Anthropic Claude (tool use API) + MCP protocol
- **DSL**: CHQL (chy.stat Query Language) — text-based, defined by ANTLR4 grammar
- **Environment Security**: dotenvx (encrypted environment variables)
- **Containerization**: Docker

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

# Build
npm run build            # Build all workspaces

# Lint
npm run lint             # Lint all workspaces

# Docker
npm run docker:build     # Build Docker images
npm run docker:up        # Start containers
npm run docker:down      # Stop containers
npm run docker:logs      # View container logs

# Convex
npm run convex:deploy    # Deploy Convex to production
```

## Development Roadmap

The project follows a 5-step plan:

1. **Scope & Requirements** - 1-2 page spec defining DSL domain, target API, chat features
2. **DSL v1 Design** - DSL spec + 20 NL-to-DSL example pairs with allowlist
3. **System Architecture & Threat Model** - Architecture diagram + threat analysis
4. **Vertical Slice Prototype** - End-to-end happy path demo
5. **Prompt-Injection Defenses** - Defense checklist + test suite

Current status: **Step 5** (production deployed, refining prompt-injection defenses)

## Security Focus

This project emphasizes prompt injection resistance through:

- **Hard Constraints**: DSL schema validation, API allowlists, output shaping
- **Context Hygiene**: Clear delimiters, treating API responses as data
- **Operational Controls**: Rate limiting, logging, auditing

See `convex/ai.ts` for implementation details.

## Documentation

- `docs/SETUP.md` - Environment variables, authentication, secrets & Convex configuration
- `docs/DEPLOYMENT.md` - Production deployment guide (Hetzner + Docker + Caddy + CI/CD)
- `docs/CLAUDE.md` - Guidance for Claude Code AI assistant
- `docs/bachelors-specs.md` - Thesis implementation specifications
- `docs/bachelors-thesis-zadani.md` - Thesis assignment (Czech/English)
- `docs/Scenarios-prompt-examples.md` - NL-to-CHQL example scenarios
- `docs/antlr4/` - CHQL grammar definitions (lexer + parser)
