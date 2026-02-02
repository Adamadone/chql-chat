# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Bachelor's thesis project: A web application that converts natural-language inputs into a domain-specific query language (DSL) using AI models and MCP (Model Context Protocol) architecture. Key focus areas include prompt injection resistance and secure LLM integration.

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
         ▼ (from Actions)
┌─────────────────┐     ┌─────────────────┐
│   LLM Provider  │     │  MCP Server /   │
│ (Anthropic/     │────▶│  External API   │
│  OpenAI)        │     │                 │
└─────────────────┘     └─────────────────┘
```

## Tech Stack

- **Frontend**: Next.js 16 + React 19 + Tailwind CSS + ShadCN UI
- **Backend**: Convex (serverless functions + database)
- **Authentication**: Auth.js v5 (GitHub OAuth)
- **AI Integration**: LLM via Convex Actions + MCP protocol
- **DSL**: JSON validated with zod
- **Containerization**: Docker (for production deployment)

## Project Structure

```
chql-chat/
├── apps/
│   └── web/                    # Next.js application
│       ├── src/
│       │   ├── app/            # Next.js App Router
│       │   ├── components/     # React components
│       │   ├── lib/            # Utilities
│       │   ├── providers/      # Context providers
│       │   └── auth.ts         # Auth.js configuration
│       └── convex/             # Convex backend
│           ├── schema.ts       # Database schema
│           ├── chats.ts        # Chat CRUD operations
│           ├── messages.ts     # Message operations
│           ├── users.ts        # User operations
│           └── ai.ts           # LLM + MCP integration
├── packages/
│   └── shared/                 # Shared types/utilities
├── docker/
│   └── Dockerfile.web          # Production container
└── docs/                       # Project documentation
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

# Build for production
npm run build

# Docker commands
npm run docker:build
npm run docker:up
npm run docker:down
npm run docker:logs
```

## Development Roadmap

The project follows a 5-step plan where each step produces a concrete deliverable:

1. **Scope & Requirements** - 1-2 page spec defining DSL domain, target API, chat features
2. **DSL v1 Design** - DSL spec + 20 NL→DSL example pairs with allowlist of operations
3. **System Architecture & Threat Model** - Architecture diagram + threat table
4. **Vertical Slice Prototype** - End-to-end happy path demo
5. **Prompt-Injection Defenses v1** - Defense checklist + test suite

## Convex Backend Structure

### Schema (convex/schema.ts)
- `users` - User accounts synced from Auth.js
- `chats` - Chat conversations per user
- `messages` - Messages within chats (user/assistant roles)
- `sessions` - Auth.js sessions

### Key Files
- `convex/ai.ts` - Main LLM processing action with placeholder functions for:
  - `callLLM()` - Implement with Anthropic/OpenAI SDK
  - `validateDSL()` - Implement with zod schema
  - `callMCPTool()` - Implement MCP server connection

## Security Requirements

This project emphasizes prompt injection resistance with three defense layers:

**Hard Constraints:**
- Strict DSL schema validation (reject unknown fields/ops) - see `validateDSL()` in ai.ts
- Allowlist for API endpoints/parameters
- Output shaping (tool returns only necessary data)

**Context Hygiene:**
- Clear delimiter boundaries between instructions and untrusted content
- API responses treated as data, not instructions - see `formatAPIResponse()` in ai.ts

**Operational Controls:**
- Rate limiting on tool calls
- Logging/auditing of tool invocations

## Key References

- MCP Documentation: https://modelcontextprotocol.io/docs/getting-started/intro
- Convex Documentation: https://docs.convex.dev
- Auth.js Documentation: https://authjs.dev
- OWASP agent security guidance for threat modeling
