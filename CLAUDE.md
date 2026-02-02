# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Bachelor's thesis project: A web application that converts natural-language inputs into a domain-specific query language (DSL) using AI models and MCP (Model Context Protocol) client/server architecture. Key focus areas include prompt injection resistance and secure LLM integration.

## Architecture

```
User → Frontend UI → Backend (LLM + MCP Client) → MCP Server (Tool) → External API
                                    ↓
                              Database (Convex)
```

**Planned Stack:**
- Frontend/Backend: TypeScript (Node.js)
- Authentication: Auth.js
- Database: Convex
- AI Integration: LLM with MCP protocol
- DSL: JSON (validated with JSON Schema / zod) or text grammar with parser

## Development Roadmap

The project follows a 5-step plan where each step produces a concrete deliverable:

1. **Scope & Requirements** - 1-2 page spec defining DSL domain, target API, chat features
2. **DSL v1 Design** - DSL spec + 20 NL→DSL example pairs with allowlist of operations
3. **System Architecture & Threat Model** - Architecture diagram + threat table
4. **Vertical Slice Prototype** - End-to-end happy path demo
5. **Prompt-Injection Defenses v1** - Defense checklist + test suite (10-20 direct injection prompts, 10 indirect injection samples)

## Security Requirements

This project emphasizes prompt injection resistance with three defense layers:

**Hard Constraints:**
- Strict DSL schema validation (reject unknown fields/ops)
- Allowlist for API endpoints/parameters
- Output shaping (tool returns only necessary data)

**Context Hygiene:**
- Clear delimiter boundaries between instructions and untrusted content
- API responses treated as data, not instructions (summarize/transform before returning to model)

**Operational Controls:**
- Rate limiting on tool calls
- Logging/auditing of tool invocations

## Key References

- MCP Documentation: https://modelcontextprotocol.io/docs/getting-started/intro
- OWASP agent security guidance for threat modeling
- Convex TypeScript best practices for database integration
