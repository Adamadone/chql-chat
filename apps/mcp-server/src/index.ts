#!/usr/bin/env node

// See ./CONTEXT.md for module overview.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import express, { type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { timingSafeEqual as cryptoTimingSafeEqual } from "node:crypto";
import { buildEnvelope } from "./envelope.js";

// ─── chy.stat API ───────────────────────────────────────────────────────────

const CHYSTAT_API_BASE = "https://demo.chystat.com";
const MEASUREMENTS_SEARCH_ENDPOINT = `${CHYSTAT_API_BASE}/api/v2/measurements/search`;
const DEFAULT_RESPONSE_FORMAT = "aqdef-json";

// ─── Pagination ─────────────────────────────────────────────────────────────

const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_PAGE_NUMBER = 1;
const MIN_PAGE_SIZE = 1;
const MAX_PAGE_SIZE = 1000;
const MIN_PAGE_NUMBER = 1;

// ─── Server config ──────────────────────────────────────────────────────────

const MCP_PORT = parseInt(process.env.MCP_PORT ?? "3001", 10);
const MAX_SESSIONS = 100;
// Streamable HTTP has no heartbeat; without a reaper, dead clients fill MAX_SESSIONS forever.
const SESSION_IDLE_TIMEOUT_MS = 10 * 60_000;
const SESSION_SWEEP_INTERVAL_MS = 60_000;
const REQUEST_BODY_LIMIT = "1mb";

// ─── Rate limiting ──────────────────────────────────────────────────────────

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 60;
const rateLimitMap = new Map<string, { timestamps: number[] }>();

// ─── Types ──────────────────────────────────────────────────────────────────

interface MeasurementsSearchRequest {
  query: string;
  responseOptions: { format: string };
  pageSize: number;
  pageNumber: number;
}

interface MeasurementsSearchResult {
  data: unknown;
  status: number;
}

// ─── chy.stat API client ────────────────────────────────────────────────────

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

// ─── MCP tool response helpers ──────────────────────────────────────────────

function toolSuccess(text: string) {
  return {
    content: [{ type: "text" as const, text }],
  };
}

function toolError(text: string) {
  return {
    content: [{ type: "text" as const, text }],
    isError: true,
  };
}

// ─── MCP server & tool registration ─────────────────────────────────────────

// Sent to the LLM as the tool description during `listTools()`.
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

/** New `McpServer` per session, exposing the `search_measurements` tool. */
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

        // Wrap in SearchEnvelope so Convex can strip `rows` before sending to the LLM.
        const envelope = buildEnvelope(
          result.data,
          resolvedPageNumber,
          resolvedPageSize,
        );

        return toolSuccess(JSON.stringify(envelope));
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

// ─── Rate limiting ──────────────────────────────────────────────────────────

/** Sliding-window: returns false if the IP has hit `RATE_LIMIT_MAX_REQUESTS` in `RATE_LIMIT_WINDOW_MS`. */
function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  let entry = rateLimitMap.get(ip);

  if (!entry) {
    entry = { timestamps: [] };
    rateLimitMap.set(ip, entry);
  }

  entry.timestamps = entry.timestamps.filter(
    (t) => now - t < RATE_LIMIT_WINDOW_MS,
  );

  if (entry.timestamps.length >= RATE_LIMIT_MAX_REQUESTS) {
    return false;
  }

  entry.timestamps.push(now);
  return true;
}

// ─── Security utilities ─────────────────────────────────────────────────────

// Length mismatch leaks length, but Bearer-token format is already public.
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return cryptoTimingSafeEqual(bufA, bufB);
}

// ─── Express middleware ─────────────────────────────────────────────────────

function securityHeadersMiddleware(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  next();
}

/** Bearer-token auth for `/mcp`. No-op if `authToken` is undefined (dev mode). */
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

function rateLimitMiddleware(req: Request, res: Response, next: NextFunction): void {
  const ip = req.ip ?? req.socket.remoteAddress ?? "unknown";
  if (!checkRateLimit(ip)) {
    res.status(429).json({ error: "Too many requests" });
    return;
  }
  next();
}

// ─── MCP route handlers ─────────────────────────────────────────────────────

// POST /mcp: no session header → create new session (subject to MAX_SESSIONS); else route to existing transport.
function createPostHandler(
  transports: Map<string, StreamableHTTPServerTransport>,
  lastActivity: Map<string, number>,
) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const sessionId = req.headers["mcp-session-id"] as string | undefined;
      let transport: StreamableHTTPServerTransport;
      let activeSessionId: string;

      if (sessionId && transports.has(sessionId)) {
        transport = transports.get(sessionId)!;
        activeSessionId = sessionId;
      } else if (!sessionId) {
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
          lastActivity.delete(newSessionId);
        };

        const server = createMcpServer();
        await server.connect(transport);
        activeSessionId = newSessionId;
      } else {
        // Session ID provided but expired/invalid.
        res.status(404).json({ error: "Session not found" });
        return;
      }

      lastActivity.set(activeSessionId, Date.now());
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error("Error handling POST /mcp:", error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Internal server error" });
      }
    }
  };
}

// GET /mcp: SSE stream of server→client notifications for an existing session.
function createGetHandler(
  transports: Map<string, StreamableHTTPServerTransport>,
  lastActivity: Map<string, number>,
) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const sessionId = req.headers["mcp-session-id"] as string | undefined;

      if (!sessionId || !transports.has(sessionId)) {
        res.status(404).json({ error: "Session not found" });
        return;
      }

      const transport = transports.get(sessionId)!;
      lastActivity.set(sessionId, Date.now());
      await transport.handleRequest(req, res);
    } catch (error) {
      console.error("Error handling GET /mcp:", error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Internal server error" });
      }
    }
  };
}

// DELETE /mcp: explicit session teardown.
function createDeleteHandler(
  transports: Map<string, StreamableHTTPServerTransport>,
  lastActivity: Map<string, number>,
) {
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
      lastActivity.delete(sessionId);
      res.status(200).json({ message: "Session closed" });
    } catch (error) {
      console.error("Error handling DELETE /mcp:", error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Internal server error" });
      }
    }
  };
}

// ─── Transport bootstrapping ────────────────────────────────────────────────

async function startHttpTransport(): Promise<void> {
  const app = express();
  app.use(express.json({ limit: REQUEST_BODY_LIMIT }));
  app.disable("x-powered-by");
  app.use(securityHeadersMiddleware);

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

  app.use("/mcp", createAuthMiddleware(MCP_AUTH_TOKEN));
  app.use("/mcp", rateLimitMiddleware);

  const transports = new Map<string, StreamableHTTPServerTransport>();
  const lastActivity = new Map<string, number>();

  app.post("/mcp", createPostHandler(transports, lastActivity));
  app.get("/mcp", createGetHandler(transports, lastActivity));
  app.delete("/mcp", createDeleteHandler(transports, lastActivity));

  // Stale-session reaper: transport.close() fires the onclose handler that prunes both maps.
  setInterval(() => {
    const now = Date.now();
    for (const [sessionId, transport] of transports) {
      const last = lastActivity.get(sessionId) ?? 0;
      if (now - last > SESSION_IDLE_TIMEOUT_MS) {
        console.error(
          `[reaper] closing idle session ${sessionId} (idle ${now - last}ms)`,
        );
        transport.close().catch((err) => {
          console.error(`[reaper] failed to close ${sessionId}:`, err);
          transports.delete(sessionId);
          lastActivity.delete(sessionId);
        });
      }
    }
  }, SESSION_SWEEP_INTERVAL_MS).unref();

  // Unauthenticated health check.
  app.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok" });
  });

  app.listen(MCP_PORT, () => {
    console.error(`CHQL MCP Server running on http://localhost:${MCP_PORT}/mcp`);
  });
}

/** stdio transport for local Claude Desktop usage; activate with `--stdio`. */
async function startStdioTransport(): Promise<void> {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("CHQL MCP Server running on stdio");
}

// ─── Entry point ────────────────────────────────────────────────────────────

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
