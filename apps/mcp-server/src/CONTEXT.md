# mcp-server context

## Purpose

Standalone Model Context Protocol (MCP) server that exposes a single tool, `search_measurements`, for querying chy.stat measurement data via CHQL. Sits between the Convex backend (MCP client) and the chy.stat REST API. Also supports stdio transport for local testing / Claude Desktop.

## Key concepts

- **`search_measurements` tool** — accepts `{ query, pageSize?, pageNumber? }`, forwards to the chy.stat `/api/v2/measurements/search` endpoint, wraps the `aqdef-json` response in a `SearchEnvelope`, and returns the envelope as MCP `TextContent`.
- **SearchEnvelope** — wire shape defined in `@chql-chat/chql-core/envelope`; this server is the producer. `envelope.ts` flattens the hierarchical aqdef-json into one row per leaf value (parent K-keys merged in) and computes deterministic aggregates + pivot summary over the whole page so the LLM can answer analytical questions without seeing every row.
- **Session lifecycle** — `POST /mcp` without `mcp-session-id` creates a new session and a new `McpServer` instance; subsequent calls reuse the transport via the session header; `DELETE /mcp` tears it down.

## Architecture

```
Convex action ──Streamable HTTP, Bearer auth──▶ this server ──POST + Bearer──▶ chy.stat /api/v2/measurements/search
```

- `POST /mcp` — session creation + message routing
- `GET /mcp` — SSE for server→client notifications
- `DELETE /mcp` — explicit teardown
- `GET /health` — unauthenticated health check
- `--stdio` flag switches to `StdioServerTransport` for local Claude Desktop usage.

## Environment variables

| Variable            | Required | Default | Description                        |
|---------------------|----------|---------|------------------------------------|
| `MCP_PORT`          | No       | `3001`  | HTTP listen port                   |
| `MCP_AUTH_TOKEN`    | Prod     | —       | Shared secret with the Convex client. Absent in dev = auth disabled (warned); absent in prod = fatal. |
| `CHYSTAT_API_TOKEN` | Yes      | —       | Bearer token for the chy.stat API. |

## Gotchas

- **Stale-session reaper.** Streamable HTTP has no heartbeat, so a client that dies mid-request leaves its session in `transports` forever and `MAX_SESSIONS` (100) eventually fills up with corpses → 503. A `setInterval` sweeps sessions idle longer than `SESSION_IDLE_TIMEOUT_MS` (10 min).
- **Timing-safe token comparison.** `timingSafeEqual` returns false for mismatched lengths (length leak, but Bearer-token format is already public).
- **Per-IP sliding-window rate limit** of 60 req/min, 1 MB body limit, `X-Content-Type-Options` / `X-Frame-Options` headers on every response.
- **Pivot summary re-derives part/characteristic identity from K-keys** present on each flat row — no parent pointer is carried across the flatten step. Identity falls back: K1000 → K1001 → `_unknown` for parts, K2000 → K2001 → `_unknown` for characteristics.
- **`sampleLast` is empty when `sampleFirst` already covers the page** to avoid duplicating rows in the LLM digest.
- **Field-collision rule in `flattenAqdef`**: child fields win over parent fields. In practice K0xxx / K1xxx / K2xxx don't collide.
- The `MeasurementsSearchRequest`/`Result` types are local to this server; the envelope wire types come from chql-core.
