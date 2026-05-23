#!/usr/bin/env tsx
/**
 * Local eval runner for self-hosted models (e.g. Qwen 3 4B via vLLM).
 *
 * This script replicates the exact same eval pipeline as the Convex-based
 * evaluation but runs entirely on localhost — connecting directly to vLLM
 * and the MCP server.
 *
 * Usage:
 *   npx tsx run-local.ts                                          # defaults
 *   npx tsx run-local.ts --model qwen3-4b                         # custom model name
 *   npx tsx run-local.ts --vllm-url http://localhost:8000/v1      # custom vLLM URL
 *   npx tsx run-local.ts --mcp-url http://localhost:3001/mcp      # custom MCP URL
 */

import { generateText, jsonSchema, stepCountIs, type ToolSet } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import {
  buildSystemPrompt,
  extractKkeys,
  hashMCPResponseText,
  kkeysMatch,
  parseChql,
  stripToolTags,
} from "@chql-chat/chql-core";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ─── CLI Args ───────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const parsed: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    const raw = args[i];
    if (!raw?.startsWith("--")) continue;
    const stripped = raw.slice(2);
    const eqIdx = stripped.indexOf("=");
    if (eqIdx >= 0) {
      parsed[stripped.slice(0, eqIdx)] = stripped.slice(eqIdx + 1);
    } else {
      const val = args[i + 1];
      if (val && !val.startsWith("--")) {
        parsed[stripped] = val;
        i++;
      }
    }
  }
  return {
    model: parsed["model"] ?? "qwen3-4b-qwen3.6-plus-reasoning-distilled",
    vllmUrl: parsed["vllm-url"] ?? "http://localhost:1234/v1",
    mcpUrl: parsed["mcp-url"] ?? process.env.MCP_SERVER_URL ?? "http://localhost:3001/mcp",
    mcpAuthToken: parsed["mcp-auth-token"] ?? process.env.MCP_AUTH_TOKEN,
  };
}

// ─── Types ──────────────────────────────────────────────────────────────────

interface GoldenQuery {
  query: string;
  expectedChql: string;
  expectedKkeys: string[];
}

type ChqlEquivalent =
  | "equivalent"
  | "different"
  | "expected_empty"
  | "actual_error";

interface EvalResult {
  queryIndex: number;
  userQuery: string;
  expectedChql: string;
  expectedKkeys: string[];
  actualChql?: string;
  modelResponse?: string;
  attempt: number;
  success: boolean;
  metrics: {
    responseTimeMs: number;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    usedTool: boolean;
    kkeysCorrect?: boolean;
    chqlParses?: boolean;
    chqlEquivalent?: ChqlEquivalent;
  };
}

interface EvalReport {
  modelId: string;
  vllmUrl: string;
  startedAt: string;
  completedAt: string;
  totalQueries: number;
  aggregateMetrics: {
    successRate: number;
    avgResponseTimeMs: number;
    avgInputTokens: number;
    avgOutputTokens: number;
    avgTotalTokens: number;
    chqlParsesRate: number;
    equivalenceRate: number;
    toolUsageRate: number;
  };
  results: EvalResult[];
}

const EVAL_PAGE_SIZE = 1000;
const SEARCH_TOOL_NAME = "search_measurements";

// ─── MCP Client ─────────────────────────────────────────────────────────────

async function createMCPClient(mcpUrl: string, authToken?: string): Promise<Client> {
  const url = new URL(mcpUrl);
  const transport = new StreamableHTTPClientTransport(url, {
    requestInit: authToken
      ? { headers: { Authorization: `Bearer ${authToken}` } }
      : undefined,
  });
  const client = new Client({ name: "chql-eval-local", version: "0.1.0" });
  await client.connect(transport);
  return client;
}

async function closeMCPClient(client: Client): Promise<void> {
  try {
    await client.close();
  } catch {
    // Best-effort cleanup
  }
}

async function callMCPTool(
  mcpClient: Client,
  toolName: string,
  args: Record<string, unknown>,
): Promise<{ text: string; isError: boolean }> {
  const result = await mcpClient.callTool({ name: toolName, arguments: args });
  if (!("content" in result) || !Array.isArray(result.content)) {
    return { text: JSON.stringify(result), isError: false };
  }
  const text = (result.content as Array<{ type: string; text?: string }>)
    .filter((c) => c.type === "text" && typeof c.text === "string")
    .map((c) => c.text as string)
    .join("\n");
  return { text, isError: Boolean(result.isError) };
}

async function getMCPToolsAsAISDKTools(mcpClient: Client): Promise<ToolSet> {
  const { tools: mcpTools } = await mcpClient.listTools();
  const toolSet: ToolSet = {};
  for (const mcpTool of mcpTools) {
    toolSet[mcpTool.name] = {
      description: mcpTool.description ?? "",
      inputSchema: jsonSchema(mcpTool.inputSchema as Parameters<typeof jsonSchema>[0]),
      execute: async (args: Record<string, unknown>) => {
        return await callMCPTool(mcpClient, mcpTool.name, args);
      },
    };
  }
  return toolSet;
}

async function computeEquivalence(
  mcpClient: Client,
  actualChql: string | undefined,
  expectedChql: string,
): Promise<ChqlEquivalent> {
  if (!actualChql) return "actual_error";

  let actualText: { text: string; isError: boolean };
  try {
    actualText = await callMCPTool(mcpClient, SEARCH_TOOL_NAME, {
      query: actualChql,
      pageSize: EVAL_PAGE_SIZE,
    });
  } catch {
    return "actual_error";
  }
  if (actualText.isError) return "actual_error";
  const actualHash = hashMCPResponseText(actualText.text);
  if (!actualHash) return "actual_error";

  let expectedText: { text: string; isError: boolean };
  try {
    expectedText = await callMCPTool(mcpClient, SEARCH_TOOL_NAME, {
      query: expectedChql,
      pageSize: EVAL_PAGE_SIZE,
    });
  } catch {
    return "expected_empty";
  }
  if (expectedText.isError) return "expected_empty";
  const expectedHash = hashMCPResponseText(expectedText.text);
  if (!expectedHash || expectedHash.isEmpty) return "expected_empty";

  return actualHash.hash === expectedHash.hash ? "equivalent" : "different";
}

// ─── Core Eval ──────────────────────────────────────────────────────────────

const MAX_TOOL_ROUNDS = 5;
const MAX_OUTPUT_TOKENS = 16384;

async function runSingleQuery(
  queryEntry: GoldenQuery,
  model: ReturnType<ReturnType<typeof createOpenAI>>,
  mcpClient: Client,
  tools: ToolSet,
): Promise<{
  response: string;
  dslQuery?: string;
  usedTool: boolean;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  responseTimeMs: number;
  chqlEquivalent: ChqlEquivalent;
}> {
  const systemPrompt = buildSystemPrompt(Object.keys(tools).length > 0);

  let dslQuery: string | undefined;
  let toolCalls: string[] = [];

  const startTime = Date.now();
  const result = await generateText({
    model,
    system: systemPrompt,
    messages: [{ role: "user", content: queryEntry.query }],
    tools: Object.keys(tools).length > 0 ? tools : undefined,
    stopWhen: stepCountIs(MAX_TOOL_ROUNDS),
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    onStepFinish: async (step) => {
      if (step.toolCalls && step.toolCalls.length > 0) {
        for (const tc of step.toolCalls) {
          toolCalls.push(tc.toolName);
          if (
            tc.toolName === "search_measurements" &&
            tc.input &&
            typeof tc.input === "object" &&
            "query" in tc.input
          ) {
            dslQuery = String((tc.input as Record<string, unknown>).query);
          }
        }
      }
    },
  });
  const responseTimeMs = Date.now() - startTime;

  const chqlEquivalent = await computeEquivalence(
    mcpClient,
    dslQuery,
    queryEntry.expectedChql,
  );

  return {
    response: stripToolTags(result.text),
    dslQuery,
    usedTool: toolCalls.length > 0,
    inputTokens: result.usage.inputTokens ?? 0,
    outputTokens: result.usage.outputTokens ?? 0,
    totalTokens: result.usage.totalTokens ?? 0,
    responseTimeMs,
    chqlEquivalent,
  };
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const config = parseArgs();
  const modelId = `local/${config.model}`;

  console.log(`\n🔧 Local Eval Runner`);
  console.log(`   Model:    ${config.model}`);
  console.log(`   vLLM URL: ${config.vllmUrl}`);
  console.log(`   MCP URL:  ${config.mcpUrl}\n`);

  // Load golden set
  const goldenSetPath = join(__dirname, "golden-set.json");
  const queries: GoldenQuery[] = JSON.parse(readFileSync(goldenSetPath, "utf-8"));
  console.log(`📋 Loaded ${queries.length} test queries from golden-set.json\n`);

  // Create vLLM provider
  const localProvider = createOpenAI({
    baseURL: config.vllmUrl,
    apiKey: "not-needed",
  });
  const model = localProvider.chat(config.model);

  // Connect to MCP server
  console.log(`🔌 Connecting to MCP server at ${config.mcpUrl}...`);
  let mcpClient: Client;
  try {
    mcpClient = await createMCPClient(config.mcpUrl, config.mcpAuthToken);
  } catch (err) {
    console.error(`❌ Failed to connect to MCP server:`, err);
    process.exit(1);
  }

  let tools: ToolSet;
  try {
    tools = await getMCPToolsAsAISDKTools(mcpClient);
    console.log(`✅ Connected. Discovered ${Object.keys(tools).length} tools.\n`);
  } catch (err) {
    console.error(`❌ Failed to discover tools:`, err);
    await closeMCPClient(mcpClient);
    process.exit(1);
  }

  // Run eval
  const results: EvalResult[] = [];
  let successCount = 0;
  let toolUsageCount = 0;
  let chqlParsesCount = 0;
  let equivalenceCount = 0;
  let kkeysCorrectCount = 0;
  let totalResponseTime = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalTokensAll = 0;
  let validResultCount = 0;

  const startedAt = new Date().toISOString();

  for (let i = 0; i < queries.length; i++) {
    const queryEntry = queries[i];

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        console.log(
          `[${i + 1}/${queries.length}] (attempt ${attempt}) "${queryEntry.query}"`,
        );

        const result = await runSingleQuery(queryEntry, model, mcpClient, tools);

        const usedTool = result.usedTool;
        const actualChql = result.dslQuery;
        const chqlParses = actualChql ? parseChql(actualChql).ok : undefined;

        let kkeysCorrect: boolean | undefined;
        if (actualChql && queryEntry.expectedKkeys.length > 0) {
          const actualKkeys = extractKkeys(actualChql);
          kkeysCorrect = kkeysMatch(actualKkeys, queryEntry.expectedKkeys);
        }

        const success = result.chqlEquivalent === "equivalent";

        const evalResult: EvalResult = {
          queryIndex: i,
          userQuery: queryEntry.query,
          expectedChql: queryEntry.expectedChql,
          expectedKkeys: queryEntry.expectedKkeys,
          actualChql,
          modelResponse: result.response.slice(0, 2000),
          attempt,
          success,
          metrics: {
            responseTimeMs: result.responseTimeMs,
            inputTokens: result.inputTokens,
            outputTokens: result.outputTokens,
            totalTokens: result.totalTokens,
            usedTool,
            kkeysCorrect,
            chqlParses,
            chqlEquivalent: result.chqlEquivalent,
          },
        };
        results.push(evalResult);

        if (attempt === 1 || !success) {
          validResultCount++;
          if (success) successCount++;
          if (usedTool) toolUsageCount++;
          if (chqlParses) chqlParsesCount++;
          if (result.chqlEquivalent === "equivalent") equivalenceCount++;
          if (kkeysCorrect) kkeysCorrectCount++;
          totalResponseTime += result.responseTimeMs;
          totalInputTokens += result.inputTokens;
          totalOutputTokens += result.outputTokens;
          totalTokensAll += result.totalTokens;
        }

        const status = success ? "✅" : "❌";
        console.log(
          `   ${status} CHQL: ${actualChql ?? "(none)"} | ${result.responseTimeMs}ms | ${result.totalTokens} tokens`,
        );

        if (success) break;
        if (attempt < 2) console.log(`   ↻ Retrying...`);
      } catch (error) {
        console.error(`   ❌ Error:`, error instanceof Error ? error.message : error);

        results.push({
          queryIndex: i,
          userQuery: queryEntry.query,
          expectedChql: queryEntry.expectedChql,
          expectedKkeys: queryEntry.expectedKkeys,
          attempt,
          success: false,
          metrics: {
            responseTimeMs: 0,
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
            usedTool: false,
            chqlEquivalent: "actual_error",
          },
        });

        if (attempt === 1) validResultCount++;
      }
    }
  }

  // Close MCP
  await closeMCPClient(mcpClient);

  // Compute aggregates
  const n = validResultCount || 1;
  const completedAt = new Date().toISOString();

  const report: EvalReport = {
    modelId,
    vllmUrl: config.vllmUrl,
    startedAt,
    completedAt,
    totalQueries: queries.length,
    aggregateMetrics: {
      successRate: successCount / n,
      avgResponseTimeMs: totalResponseTime / n,
      avgInputTokens: totalInputTokens / n,
      avgOutputTokens: totalOutputTokens / n,
      avgTotalTokens: totalTokensAll / n,
      chqlParsesRate: chqlParsesCount / n,
      equivalenceRate: equivalenceCount / n,
      toolUsageRate: toolUsageCount / n,
    },
    results,
  };

  // Write results
  mkdirSync(join(__dirname, "results"), { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outputPath = join(__dirname, "results", `${config.model}-${timestamp}.json`);
  writeFileSync(outputPath, JSON.stringify(report, null, 2));

  // Print summary
  console.log(`\n${"═".repeat(60)}`);
  console.log(`📊 Eval Results: ${config.model}`);
  console.log(`${"═".repeat(60)}`);
  console.log(`   Success rate:      ${(report.aggregateMetrics.successRate * 100).toFixed(1)}%`);
  console.log(`   CHQL parses:       ${(report.aggregateMetrics.chqlParsesRate * 100).toFixed(1)}%`);
  console.log(`   Equivalence:       ${(report.aggregateMetrics.equivalenceRate * 100).toFixed(1)}%`);
  console.log(`   Tool usage:        ${(report.aggregateMetrics.toolUsageRate * 100).toFixed(1)}%`);
  console.log(`   Avg response time: ${report.aggregateMetrics.avgResponseTimeMs.toFixed(0)}ms`);
  console.log(`   Avg total tokens:  ${report.aggregateMetrics.avgTotalTokens.toFixed(0)}`);
  console.log(`${"═".repeat(60)}`);
  console.log(`\n💾 Results saved to: ${outputPath}\n`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
