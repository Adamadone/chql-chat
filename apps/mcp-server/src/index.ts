#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import express, { type Request, type Response } from "express";
import { z } from "zod";
import { timingSafeEqual as cryptoTimingSafeEqual } from "node:crypto";

const CHYSTAT_API_BASE = "https://demo.chystat.com";
const MEASUREMENTS_SEARCH_ENDPOINT = `${CHYSTAT_API_BASE}/api/v2/measurements/search`;

const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_PAGE_NUMBER = 1;
const MIN_PAGE_SIZE = 1;
const MAX_PAGE_SIZE = 1000;
const MIN_PAGE_NUMBER = 1;
const DEFAULT_RESPONSE_FORMAT = "aqdef-json";

const MCP_PORT = parseInt(process.env.MCP_PORT ?? "3001", 10);

const MAX_SESSIONS = 100;
const REQUEST_BODY_LIMIT = "1mb";

// Rate limiting: sliding window per IP
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 60;
const rateLimitMap = new Map<string, { timestamps: number[] }>();

interface MeasurementsSearchRequest {
  query: string;
  responseOptions: {
    format: string;
  };
  pageSize: number;
  pageNumber: number;
}

interface MeasurementsSearchResult {
  data: unknown;
  status: number;
}

async function searchMeasurements(
  query: string,
  apiToken: string,
  pageSize: number = DEFAULT_PAGE_SIZE,
  pageNumber: number = DEFAULT_PAGE_NUMBER,
): Promise<MeasurementsSearchResult> {
  const body: MeasurementsSearchRequest = {
    query,
    responseOptions: {
      format: DEFAULT_RESPONSE_FORMAT,
    },
    pageSize,
    pageNumber,
  };

  const response = await fetch(MEASUREMENTS_SEARCH_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiToken}`,
    },
    body: JSON.stringify(body),
  });

  const data: unknown = await response.json().catch(() => response.text());

  return { data, status: response.status };
}

function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "chql-mcp-server",
    version: "0.1.0",
  });

  const TOOL_DESCRIPTION = `Search for measured values in the chy.stat database using a CHQL query.

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

  server.registerTool(
    "search_measurements",
    {
      description: TOOL_DESCRIPTION,
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
        return {
          content: [
            {
              type: "text" as const,
              text: "Error: CHYSTAT_API_TOKEN environment variable is not set. Please configure your chy.stat API token.",
            },
          ],
          isError: true,
        };
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
          return {
            content: [
              {
                type: "text" as const,
                text: `API request failed with status ${result.status}:\n${JSON.stringify(result.data, null, 2)}`,
              },
            ],
            isError: true,
          };
        }

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result.data, null, 2),
            },
          ],
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error occurred";
        console.error("chy.stat API call failed:", error);
        return {
          content: [
            {
              type: "text" as const,
              text: `Failed to call chy.stat API: ${message}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  return server;
}

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

async function startHttpTransport(): Promise<void> {
  const app = express();
  app.use(express.json({ limit: REQUEST_BODY_LIMIT }));

  app.disable("x-powered-by");

  app.use((_req: Request, res: Response, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    next();
  });

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

  app.use("/mcp", (req: Request, res: Response, next) => {
    if (!MCP_AUTH_TOKEN) return next();

    const authHeader = req.headers["authorization"];
    if (!authHeader || !timingSafeEqual(authHeader, `Bearer ${MCP_AUTH_TOKEN}`)) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    next();
  });

  app.use("/mcp", (req: Request, res: Response, next) => {
    const ip = req.ip ?? req.socket.remoteAddress ?? "unknown";
    if (!checkRateLimit(ip)) {
      res.status(429).json({ error: "Too many requests" });
      return;
    }
    next();
  });

  const transports = new Map<string, StreamableHTTPServerTransport>();

  app.post("/mcp", async (req: Request, res: Response) => {
    try {
      const sessionId = req.headers["mcp-session-id"] as string | undefined;
      let transport: StreamableHTTPServerTransport;

      if (sessionId && transports.has(sessionId)) {
        transport = transports.get(sessionId)!;
      } else if (!sessionId) {
        if (transports.size >= MAX_SESSIONS) {
          res
            .status(503)
            .json({ error: "Server at capacity, try again later" });
          return;
        }

        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => crypto.randomUUID(),
        });

        transport.onclose = () => {
          if (transport.sessionId) {
            transports.delete(transport.sessionId);
          }
        };

        const server = createMcpServer();
        await server.connect(transport);

        if (transport.sessionId) {
          transports.set(transport.sessionId, transport);
        }
      } else {
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
  });

  app.get("/mcp", async (req: Request, res: Response) => {
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
  });

  app.delete("/mcp", async (req: Request, res: Response) => {
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
  });

  app.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok" });
  });

  app.listen(MCP_PORT, () => {
    console.error(`CHQL MCP Server running on http://localhost:${MCP_PORT}/mcp`);
  });
}

/**
 * Constant-time string comparison to prevent timing attacks on auth tokens.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return cryptoTimingSafeEqual(bufA, bufB);
}

async function startStdioTransport(): Promise<void> {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("CHQL MCP Server running on stdio");
}

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
