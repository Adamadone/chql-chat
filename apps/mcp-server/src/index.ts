#!/usr/bin/env node

/**
 * @module CHQL MCP Server
 *
 * A Model Context Protocol (MCP) server that exposes a `search_measurements` tool
 * for querying industrial measurement data from the chy.stat API using CHQL
 * (chy.stat Query Language).
 *
 * ## Architecture
 *
 * The server sits between the Convex backend (MCP client) and the chy.stat REST API:
 *
 * ```
 *   Convex Action (MCP Client)
 *        │
 *        ▼  Streamable HTTP + Bearer auth
 *   ┌──────────────────────┐
 *   │   This MCP Server    │
 *   │   POST /mcp          │ ← session management, auth, rate limiting
 *   │   GET  /mcp          │ ← SSE for server-to-client notifications
 *   │   DELETE /mcp        │ ← session teardown
 *   │   GET /health        │ ← health check (unauthenticated)
 *   └──────────┬───────────┘
 *              │
 *              ▼  POST + Bearer auth
 *   ┌──────────────────────┐
 *   │   chy.stat API       │
 *   │   /api/v2/measure-   │
 *   │   ments/search       │
 *   └──────────────────────┘
 * ```
 *
 * ## Request Lifecycle (tool call)
 *
 * 1. Convex connects via `POST /mcp` (no session header) → server creates a new session
 * 2. Convex calls `listTools()` → server returns the `search_measurements` tool definition
 * 3. Convex calls `callTool("search_measurements", { query, ... })` via `POST /mcp`
 * 4. Server forwards the CHQL query to the chy.stat API
 * 5. chy.stat response is returned as an MCP `TextContent` tool result
 * 6. Convex disconnects via `DELETE /mcp` → server tears down the session
 *
 * ## Security
 *
 * - Bearer token auth on all `/mcp` routes (required in production)
 * - Timing-safe token comparison to prevent timing attacks
 * - Per-IP sliding-window rate limiting (60 req/min)
 * - Concurrent session cap (100)
 * - Request body size limit (1 MB)
 * - Security headers (`X-Content-Type-Options`, `X-Frame-Options`)
 *
 * ## Environment Variables
 *
 * | Variable           | Required | Default | Description                        |
 * |--------------------|----------|---------|------------------------------------|
 * | `MCP_PORT`         | No       | `3001`  | HTTP listen port                   |
 * | `MCP_AUTH_TOKEN`   | Prod     | —       | Shared secret with Convex client   |
 * | `CHYSTAT_API_TOKEN`| Yes      | —       | Bearer token for the chy.stat API  |
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import express, { type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { timingSafeEqual as cryptoTimingSafeEqual } from "node:crypto";

// ─── chy.stat API Configuration ──────────────────────────────────────────────

/** Base URL for the chy.stat staging instance. */
const CHYSTAT_API_BASE = "https://demo.chystat.com:8443";

/** Full endpoint for the measurements search API. */
const MEASUREMENTS_SEARCH_ENDPOINT = `${CHYSTAT_API_BASE}/api/v2/measurements/search`;

/** Response format requested from the chy.stat API. */
const DEFAULT_RESPONSE_FORMAT = "aqdef-json";

// ─── Pagination Defaults & Bounds ────────────────────────────────────────────

const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_PAGE_NUMBER = 1;
const MIN_PAGE_SIZE = 1;
const MAX_PAGE_SIZE = 1000;
const MIN_PAGE_NUMBER = 1;

// ─── Server Configuration ────────────────────────────────────────────────────

/** HTTP port the Express server listens on. */
const MCP_PORT = parseInt(process.env.MCP_PORT ?? "3001", 10);

/** Maximum number of concurrent MCP sessions allowed. */
const MAX_SESSIONS = 100;

/** Maximum request body size accepted by Express. */
const REQUEST_BODY_LIMIT = "1mb";

// ─── Rate Limiting Configuration ─────────────────────────────────────────────

/** Sliding window duration in milliseconds (1 minute). */
const RATE_LIMIT_WINDOW_MS = 60_000;

/** Maximum requests allowed per IP within the sliding window. */
const RATE_LIMIT_MAX_REQUESTS = 60;

/** Per-IP request timestamp log for the sliding-window rate limiter. */
const rateLimitMap = new Map<string, { timestamps: number[] }>();

// ─── Types ───────────────────────────────────────────────────────────────────

/** Request body sent to the chy.stat measurements search endpoint. */
interface MeasurementsSearchRequest {
  query: string;
  responseOptions: { format: string };
  pageSize: number;
  pageNumber: number;
}

/** Parsed response from the chy.stat measurements search endpoint. */
interface MeasurementsSearchResult {
  /** The JSON (or text fallback) body returned by the API. */
  data: unknown;
  /** HTTP status code from the API response. */
  status: number;
}

// ─── chy.stat API Client ─────────────────────────────────────────────────────

/**
 * Sends a CHQL query to the chy.stat measurements search API.
 *
 * This is the only external HTTP call the server makes. The response format
 * is always `aqdef-json` (a structured JSON representation of AQDEF data).
 *
 * @param query - The CHQL query string (e.g. `"K1001 = 'shaft'"`)
 * @param apiToken - Bearer token for chy.stat API authentication
 * @param pageSize - Number of results per page (clamped to 1-1000)
 * @param pageNumber - 1-based page index
 * @returns The raw API response data and HTTP status code
 *
 * @example
 * ```ts
 * const result = await searchMeasurements("K1001 = 'shaft'", "my-token");
 * if (result.status === 200) {
 *   console.log(result.data);
 * }
 * ```
 */
async function searchMeasurements(
  query: string,
  apiToken: string,
  pageSize: number = DEFAULT_PAGE_SIZE,
  pageNumber: number = DEFAULT_PAGE_NUMBER,
): Promise<MeasurementsSearchResult> {
  const body: MeasurementsSearchRequest = {
    query,
    responseOptions: { format: DEFAULT_RESPONSE_FORMAT },
    pageSize,
    pageNumber,
  };

  console.log("[DEBUG] chy.stat API request:", {
    url: MEASUREMENTS_SEARCH_ENDPOINT,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiToken.slice(0, 6)}...${apiToken.slice(-4)}`,
    },
    body,
  });

  const response = await fetch(MEASUREMENTS_SEARCH_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiToken}`,
    },
    body: JSON.stringify(body),
  });

  const data: unknown = await response.json().catch(() => response.text());

  console.log("[DEBUG] chy.stat API response:", {
    status: response.status,
    statusText: response.statusText,
    data: typeof data === "string" ? data.slice(0, 500) : JSON.stringify(data).slice(0, 500),
  });

  return { data, status: response.status };
}

// ─── MCP Tool Response Helpers ───────────────────────────────────────────────

/**
 * Creates a successful MCP tool result containing text content.
 *
 * @param text - The text payload to return to the MCP client
 */
function toolSuccess(text: string) {
  return {
    content: [{ type: "text" as const, text }],
  };
}

/**
 * Creates an error MCP tool result containing an error message.
 *
 * @param text - The error message to return to the MCP client
 */
function toolError(text: string) {
  return {
    content: [{ type: "text" as const, text }],
    isError: true,
  };
}

// ─── MCP Server & Tool Registration ─────────────────────────────────────────

/**
 * CHQL grammar description provided to the LLM as the tool's description.
 *
 * This text is sent during `listTools()` and is used by Claude to understand
 * how to construct valid CHQL queries. It covers all supported operators,
 * K-key identifiers, and special criteria.
 */
const SEARCH_MEASUREMENTS_DESCRIPTION = `Search for measured values in the chy.stat database using a CHQL query.

CHQL (chy.stat Query Language) is a text-based query language for filtering
measurement data. The query is passed directly to the chy.stat API.

Grammar overview (case-insensitive):
  - K-key identifiers: K followed by digits (e.g. K1001, K2001, K0001)
  - Comparison operators: =, <, <=, >, >=, LIKE, =~
  - Logical operators: AND, OR, NOT
  - Grouping: parentheses ( )
  - Special criteria:
      ALL                              - match everything
      K<id> IS NULL                    - K-key has no value
      K<id> IN ('val1', 'val2', ...)   - K-key matches any listed value
      HAS ALARM '<name>'               - has a specific alarm
      HAS NO ALARM                     - has no alarm
      HAS MARK <number>                - has a specific mark
      ANY VALUE MATCHES (criteria)     - any value matches sub-criteria
      ALL VALUES MATCHES (criteria)    - all values match sub-criteria

Example queries:
  K1001 = 'shaft'
  K1001 = 'shaft' AND K2001 = 'diameter'
  K1001 = 'shaft' AND (K2001 = 'length' OR K2001 = 'diameter')
  K0004 >= '2024-01-01T00:00:00+01:00' AND K0004 < '2024-02-01T00:00:00+01:00'
  K2001 IN ('length', 'diameter', 'weight')
  K1001 = 'shaft' AND NOT K2001 = 'weight'`;

/**
 * Creates and configures a new MCP server instance with the `search_measurements` tool.
 *
 * Each MCP session gets its own server instance (created when a new session
 * is established via `POST /mcp` without a session header).
 *
 * The server exposes a single tool:
 *
 * ### `search_measurements`
 * - **Input**: `query` (CHQL string), optional `pageSize` (1-1000), optional `pageNumber` (1-based)
 * - **Behavior**: Forwards the query to the chy.stat API and returns the response
 * - **Error handling**: Returns `isError: true` for missing tokens, non-2xx responses, or network failures
 *
 * @returns A configured {@link McpServer} instance ready to be connected to a transport
 */
function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "chql-mcp-server",
    version: "0.1.0",
  });

  server.registerTool(
    "search_measurements",
    {
      description: SEARCH_MEASUREMENTS_DESCRIPTION,
      inputSchema: {
        query: z
          .string()
          .describe(
            "CHQL query string to filter measurements (e.g. \"K1001 = 'shaft' AND K2001 = 'diameter'\")",
          ),
        pageSize: z
          .number()
          .optional()
          .describe("Number of results per page (1-1000, default 100)"),
        pageNumber: z
          .number()
          .optional()
          .describe("Page number to retrieve (1-based, default 1)"),
      },
    },
    async ({ query, pageSize, pageNumber }) => {
      const apiToken = process.env.CHYSTAT_API_TOKEN;

      if (!apiToken) {
        return toolError(
          "Error: CHYSTAT_API_TOKEN environment variable is not set. Please configure your chy.stat API token.",
        );
      }

      // Clamp pagination values to valid bounds
      const resolvedPageSize = Math.max(
        MIN_PAGE_SIZE,
        Math.min(MAX_PAGE_SIZE, Math.floor(pageSize ?? DEFAULT_PAGE_SIZE)),
      );
      const resolvedPageNumber = Math.max(
        MIN_PAGE_NUMBER,
        Math.floor(pageNumber ?? DEFAULT_PAGE_NUMBER),
      );

      try {
        const result = await searchMeasurements(
          query,
          apiToken,
          resolvedPageSize,
          resolvedPageNumber,
        );

        if (result.status < 200 || result.status >= 300) {
          return toolError(
            `API request failed with status ${result.status}:\n${JSON.stringify(result.data, null, 2)}`,
          );
        }

        return toolSuccess(JSON.stringify(result.data, null, 2));
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error occurred";
        console.error("chy.stat API call failed:", error);
        return toolError(`Failed to call chy.stat API: ${message}`);
      }
    },
  );

  return server;
}

// ─── Rate Limiting ───────────────────────────────────────────────────────────

/**
 * Checks whether a request from the given IP is within the rate limit.
 *
 * Uses a sliding-window algorithm: timestamps older than {@link RATE_LIMIT_WINDOW_MS}
 * are pruned, and the request is allowed if fewer than {@link RATE_LIMIT_MAX_REQUESTS}
 * remain in the window.
 *
 * @param ip - The client's IP address (used as the rate limit key)
 * @returns `true` if the request is allowed, `false` if rate-limited
 */
function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  let entry = rateLimitMap.get(ip);

  if (!entry) {
    entry = { timestamps: [] };
    rateLimitMap.set(ip, entry);
  }

  // Prune timestamps outside the current window
  entry.timestamps = entry.timestamps.filter(
    (t) => now - t < RATE_LIMIT_WINDOW_MS,
  );

  if (entry.timestamps.length >= RATE_LIMIT_MAX_REQUESTS) {
    return false;
  }

  entry.timestamps.push(now);
  return true;
}

// ─── Security Utilities ──────────────────────────────────────────────────────

/**
 * Constant-time string comparison to prevent timing attacks on auth tokens.
 *
 * Falls back to returning `false` for mismatched lengths (which leaks length
 * information, but the token format is already known — `"Bearer <token>"`).
 *
 * @param a - First string (typically the request's `Authorization` header)
 * @param b - Second string (typically the expected `"Bearer <token>"` value)
 * @returns `true` if the strings are identical
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return cryptoTimingSafeEqual(bufA, bufB);
}

// ─── Express Middleware ──────────────────────────────────────────────────────

/**
 * Adds security headers to every response.
 *
 * - `X-Content-Type-Options: nosniff` — prevents MIME-type sniffing
 * - `X-Frame-Options: DENY` — prevents clickjacking via iframes
 */
function securityHeadersMiddleware(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  next();
}

/**
 * Creates a Bearer token authentication middleware for the `/mcp` routes.
 *
 * If no `MCP_AUTH_TOKEN` is configured (dev mode), the middleware is a no-op.
 * In production, requests without a valid `Authorization: Bearer <token>` header
 * receive a `401 Unauthorized` response.
 *
 * @param authToken - The expected Bearer token, or `undefined` to skip auth
 * @returns Express middleware function
 */
function createAuthMiddleware(authToken: string | undefined) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!authToken) return next();

    const authHeader = req.headers["authorization"];
    if (!authHeader || !timingSafeEqual(authHeader, `Bearer ${authToken}`)) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    next();
  };
}

/**
 * Per-IP rate limiting middleware.
 *
 * Returns `429 Too Many Requests` if the client has exceeded
 * {@link RATE_LIMIT_MAX_REQUESTS} requests within the last
 * {@link RATE_LIMIT_WINDOW_MS} milliseconds.
 */
function rateLimitMiddleware(req: Request, res: Response, next: NextFunction): void {
  const ip = req.ip ?? req.socket.remoteAddress ?? "unknown";
  if (!checkRateLimit(ip)) {
    res.status(429).json({ error: "Too many requests" });
    return;
  }
  next();
}

// ─── MCP Route Handlers ─────────────────────────────────────────────────────

/**
 * Handles `POST /mcp` — the main MCP protocol endpoint.
 *
 * This endpoint serves two purposes:
 * 1. **Session creation**: If no `mcp-session-id` header is present, a new session
 *    is created (up to {@link MAX_SESSIONS}), a new {@link McpServer} is instantiated,
 *    and the transport is connected.
 * 2. **Message routing**: If a valid session ID is present, the request is forwarded
 *    to the existing session's transport for processing (tool calls, etc.).
 *
 * @param transports - Map of active session ID → transport pairs
 */
function createPostHandler(transports: Map<string, StreamableHTTPServerTransport>) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const sessionId = req.headers["mcp-session-id"] as string | undefined;
      let transport: StreamableHTTPServerTransport;

      if (sessionId && transports.has(sessionId)) {
        // Existing session — route to its transport
        transport = transports.get(sessionId)!;
      } else if (!sessionId) {
        // New session — check capacity, then create
        if (transports.size >= MAX_SESSIONS) {
          res.status(503).json({ error: "Server at capacity, try again later" });
          return;
        }

        const newSessionId = crypto.randomUUID();
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => newSessionId,
        });

        transports.set(newSessionId, transport);
        transport.onclose = () => {
          transports.delete(newSessionId);
        };

        const server = createMcpServer();
        await server.connect(transport);
      } else {
        // Session ID provided but not found (expired or invalid)
        res.status(404).json({ error: "Session not found" });
        return;
      }

      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error("Error handling POST /mcp:", error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Internal server error" });
      }
    }
  };
}

/**
 * Handles `GET /mcp` — SSE endpoint for server-to-client notifications.
 *
 * Requires a valid `mcp-session-id` header pointing to an existing session.
 * The transport keeps the connection open and streams events as they occur.
 *
 * @param transports - Map of active session ID → transport pairs
 */
function createGetHandler(transports: Map<string, StreamableHTTPServerTransport>) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const sessionId = req.headers["mcp-session-id"] as string | undefined;

      if (!sessionId || !transports.has(sessionId)) {
        res.status(404).json({ error: "Session not found" });
        return;
      }

      const transport = transports.get(sessionId)!;
      await transport.handleRequest(req, res);
    } catch (error) {
      console.error("Error handling GET /mcp:", error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Internal server error" });
      }
    }
  };
}

/**
 * Handles `DELETE /mcp` — explicit session teardown.
 *
 * Closes the transport and removes the session from the active sessions map.
 * Returns `200` on success or `404` if the session doesn't exist.
 *
 * @param transports - Map of active session ID → transport pairs
 */
function createDeleteHandler(transports: Map<string, StreamableHTTPServerTransport>) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const sessionId = req.headers["mcp-session-id"] as string | undefined;

      if (!sessionId || !transports.has(sessionId)) {
        res.status(404).json({ error: "Session not found" });
        return;
      }

      const transport = transports.get(sessionId)!;
      await transport.close();
      transports.delete(sessionId);
      res.status(200).json({ message: "Session closed" });
    } catch (error) {
      console.error("Error handling DELETE /mcp:", error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Internal server error" });
      }
    }
  };
}

// ─── Transport Bootstrapping ─────────────────────────────────────────────────

/**
 * Starts the Express server with the Streamable HTTP transport.
 *
 * Sets up:
 * 1. Body parsing with size limit
 * 2. Security headers on all routes
 * 3. Bearer token auth on `/mcp` routes
 * 4. Per-IP rate limiting on `/mcp` routes
 * 5. MCP protocol handlers (`POST`, `GET`, `DELETE` on `/mcp`)
 * 6. Health check endpoint (`GET /health`)
 *
 * Each MCP session gets its own {@link McpServer} instance and
 * {@link StreamableHTTPServerTransport}, stored in an in-memory map.
 */
async function startHttpTransport(): Promise<void> {
  const app = express();
  app.use(express.json({ limit: REQUEST_BODY_LIMIT }));
  app.disable("x-powered-by");
  app.use(securityHeadersMiddleware);

  // ── Auth token validation ──────────────────────────────────────────────

  const MCP_AUTH_TOKEN = process.env.MCP_AUTH_TOKEN;

  if (!MCP_AUTH_TOKEN && process.env.NODE_ENV === "production") {
    console.error("FATAL: MCP_AUTH_TOKEN must be set in production.");
    process.exit(1);
  }

  if (!MCP_AUTH_TOKEN) {
    console.warn(
      "WARNING: MCP_AUTH_TOKEN is not set. Auth is disabled (dev mode only).",
    );
  }

  // ── Middleware stack for /mcp routes ────────────────────────────────────

  app.use("/mcp", createAuthMiddleware(MCP_AUTH_TOKEN));
  app.use("/mcp", rateLimitMiddleware);

  // ── Session store & route handlers ─────────────────────────────────────

  /** Active MCP sessions keyed by their UUID session ID. */
  const transports = new Map<string, StreamableHTTPServerTransport>();

  app.post("/mcp", createPostHandler(transports));
  app.get("/mcp", createGetHandler(transports));
  app.delete("/mcp", createDeleteHandler(transports));

  // ── Health check (unauthenticated) ─────────────────────────────────────

  app.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok" });
  });

  // ── Start listening ────────────────────────────────────────────────────

  app.listen(MCP_PORT, () => {
    console.error(`CHQL MCP Server running on http://localhost:${MCP_PORT}/mcp`);
  });
}

/**
 * Starts the MCP server using stdio transport (for local testing or Claude Desktop).
 *
 * In this mode the server communicates via stdin/stdout instead of HTTP.
 * Activate with the `--stdio` CLI flag: `node build/index.js --stdio`
 */
async function startStdioTransport(): Promise<void> {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("CHQL MCP Server running on stdio");
}

// ─── Entry Point ─────────────────────────────────────────────────────────────

/**
 * Main entry point. Selects the transport based on CLI flags:
 * - `--stdio` → stdio transport (for Claude Desktop / direct testing)
 * - (default) → Streamable HTTP transport on port {@link MCP_PORT}
 */
async function main(): Promise<void> {
  const transport = process.argv.includes("--stdio") ? "stdio" : "http";

  if (transport === "stdio") {
    await startStdioTransport();
  } else {
    await startHttpTransport();
  }
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
