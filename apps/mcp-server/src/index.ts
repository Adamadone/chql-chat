#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import express, { type Request, type Response } from "express";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CHYSTAT_API_BASE = "https://demo.chystat.com";
const MEASUREMENTS_SEARCH_ENDPOINT = `${CHYSTAT_API_BASE}/api/v2/measurements/search`;

const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_PAGE_NUMBER = 1;
const DEFAULT_RESPONSE_FORMAT = "aqdef-json";

const MCP_PORT = parseInt(process.env.MCP_PORT ?? "3001", 10);

// ---------------------------------------------------------------------------
// chy.stat API helpers
// ---------------------------------------------------------------------------

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

/**
 * Call the chy.stat measurements search endpoint.
 *
 * The `query` field accepts a CHQL text string directly (e.g.
 * `K1001 = 'shaft' AND K2001 = 'diameter'`).
 */
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

  const data: unknown = await response.json().catch((jsonError: unknown) => {
    console.error("Response is not valid JSON, falling back to text:", jsonError);
    return response.text();
  });

  return { data, status: response.status };
}

// ---------------------------------------------------------------------------
// MCP Server & Tool Registration
// ---------------------------------------------------------------------------

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

      const resolvedPageSize = pageSize ?? DEFAULT_PAGE_SIZE;
      const resolvedPageNumber = pageNumber ?? DEFAULT_PAGE_NUMBER;

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

// ---------------------------------------------------------------------------
// Transport: Streamable HTTP (default)
// ---------------------------------------------------------------------------

async function startHttpTransport(): Promise<void> {
  const app = express();
  app.use(express.json());

  // ---------------------------------------------------------------------------
  // Auth middleware — protects /mcp endpoints with a shared Bearer token.
  // If MCP_AUTH_TOKEN is not set, auth is disabled (local development).
  // ---------------------------------------------------------------------------
  const MCP_AUTH_TOKEN = process.env.MCP_AUTH_TOKEN;

  app.use("/mcp", (req: Request, res: Response, next) => {
    if (!MCP_AUTH_TOKEN) return next(); // No token configured → skip auth (dev mode)

    const authHeader = req.headers["authorization"];
    if (authHeader !== `Bearer ${MCP_AUTH_TOKEN}`) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    next();
  });

  // Map of session ID → transport for stateful connections
  const transports = new Map<string, StreamableHTTPServerTransport>();

  // Handle MCP protocol requests (POST)
  app.post("/mcp", async (req: Request, res: Response) => {
    try {
      const sessionId = req.headers["mcp-session-id"] as string | undefined;
      let transport: StreamableHTTPServerTransport;

      if (sessionId && transports.has(sessionId)) {
        // Reuse existing transport for the session
        transport = transports.get(sessionId)!;
      } else if (!sessionId) {
        // New session — create a fresh transport + server
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
        // Invalid session ID
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

  // Handle SSE streams (GET) for server-initiated messages
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

  // Handle session termination (DELETE)
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

  // Health check
  app.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok", sessions: transports.size });
  });

  app.listen(MCP_PORT, () => {
    console.error(`CHQL MCP Server running on http://localhost:${MCP_PORT}/mcp`);
  });
}

// ---------------------------------------------------------------------------
// Transport: stdio (for Claude Desktop / direct testing)
// ---------------------------------------------------------------------------

async function startStdioTransport(): Promise<void> {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("CHQL MCP Server running on stdio");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

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
