#!/usr/bin/env tsx
/**
 * Local eval runner for self-hosted models (LM Studio, vLLM, etc.). See ./CONTEXT.md.
 *
 * Usage:
 *   npx tsx run-local.ts                                          # golden set, defaults
 *   npx tsx run-local.ts --set sample                             # 3-question smoke set
 *   npx tsx run-local.ts --model ministral-3-8b-instruct-2512     # custom model name
 *   npx tsx run-local.ts --vllm-url http://localhost:8000/v1      # custom OpenAI-compatible URL
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
  gradeResult,
  hashMCPResponseText,
  kkeysMatch,
  parseChql,
  stripToolTags,
  type ChqlEquivalent,
  type GoldenQuestion,
  type ModelOutput,
  type Verdict,
} from "@chql-chat/chql-core";
import { renderReport, type PerQuestionRow } from "./lib/render-report.js";

const METHODOLOGY_VERSION = "v2";

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
  const set = (parsed["set"] ?? process.env.EVAL_SET ?? "golden") as
    | "golden"
    | "sample";
  if (set !== "golden" && set !== "sample") {
    console.error(`Invalid --set value: ${set}. Expected "golden" or "sample".`);
    process.exit(1);
  }
  const model = parsed["model"] ?? process.env.MODEL;
  if (!model) {
    console.error(
      "Missing --model. Pass it as a flag (--model <id>) or via the MODEL env var.\n" +
        "Tip: `curl http://localhost:1234/v1/models` to see what LM Studio is serving.",
    );
    process.exit(1);
  }
  return {
    model,
    vllmUrl: parsed["vllm-url"] ?? "http://localhost:1234/v1",
    mcpUrl: parsed["mcp-url"] ?? process.env.MCP_SERVER_URL ?? "http://localhost:3001/mcp",
    mcpAuthToken: parsed["mcp-auth-token"] ?? process.env.MCP_AUTH_TOKEN,
    set,
  };
}

// ─── Types ──────────────────────────────────────────────────────────────────

interface EvalResult {
  question: GoldenQuestion;
  actualChql: string | null;
  modelResponse: string;
  usedTool: boolean;
  success: boolean;
  verdict: Verdict;
  reason: string;
  metrics: {
    responseTimeMs: number;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    chqlParses?: boolean;
    kkeysCorrect?: boolean;
    chqlEquivalent?: ChqlEquivalent;
  };
}

interface EvalReport {
  modelId: string;
  set: "golden" | "sample";
  methodologyVersion: string;
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
    // best-effort
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
  expectedChql: string | null,
): Promise<ChqlEquivalent | undefined> {
  if (!actualChql) return undefined;
  if (expectedChql === null) {
    // No reference to compare against (refusal/clarification question). Equivalence is undefined.
    return undefined;
  }

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
  question: GoldenQuestion,
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
  chqlEquivalent?: ChqlEquivalent;
}> {
  const systemPrompt = buildSystemPrompt(Object.keys(tools).length > 0);

  let dslQuery: string | undefined;
  const toolCalls: string[] = [];

  const startTime = Date.now();
  const result = await generateText({
    model,
    system: systemPrompt,
    messages: [{ role: "user", content: question.query }],
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
    question.expectedChql,
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
  console.log(`   Set:      ${config.set}`);
  console.log(`   vLLM URL: ${config.vllmUrl}`);
  console.log(`   MCP URL:  ${config.mcpUrl}\n`);

  const setFile = config.set === "sample" ? "sample-set.json" : "golden-set.json";
  const setPath = join(__dirname, setFile);
  const questions: GoldenQuestion[] = JSON.parse(readFileSync(setPath, "utf-8"));
  console.log(`📋 Loaded ${questions.length} questions from ${setFile}\n`);

  const localProvider = createOpenAI({
    baseURL: config.vllmUrl,
    apiKey: "not-needed",
  });
  const model = localProvider.chat(config.model);

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

  const results: EvalResult[] = [];
  const startedAt = new Date().toISOString();

  for (let i = 0; i < questions.length; i++) {
    const question = questions[i];

    try {
      console.log(`[${i + 1}/${questions.length}] "${question.query}"`);

      const result = await runSingleQuery(question, model, mcpClient, tools);

      const actualChql = result.dslQuery ?? null;
      const chqlParses = actualChql ? parseChql(actualChql).ok : undefined;

      let kkeysCorrect: boolean | undefined;
      if (
        actualChql &&
        question.expectedKkeys &&
        question.expectedKkeys.length > 0
      ) {
        const actualKkeys = extractKkeys(actualChql);
        kkeysCorrect = kkeysMatch(actualKkeys, question.expectedKkeys);
      }

      const modelOutput: ModelOutput = {
        actualChql,
        usedTool: result.usedTool,
        chqlEquivalent: result.chqlEquivalent,
      };
      const graded = gradeResult(question, modelOutput);

      results.push({
        question,
        actualChql,
        modelResponse: result.response.slice(0, 4000),
        usedTool: result.usedTool,
        success: graded.success,
        verdict: graded.verdict,
        reason: graded.reason,
        metrics: {
          responseTimeMs: result.responseTimeMs,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          totalTokens: result.totalTokens,
          chqlParses,
          kkeysCorrect,
          chqlEquivalent: result.chqlEquivalent,
        },
      });

      const status = graded.success ? "✅" : "❌";
      console.log(
        `   ${status} ${graded.verdict} · CHQL: ${actualChql ?? "(none)"} | ${result.responseTimeMs}ms | ${result.totalTokens} tokens`,
      );
    } catch (error) {
      console.error(`   ❌ Error:`, error instanceof Error ? error.message : error);
      const modelOutput: ModelOutput = {
        actualChql: null,
        usedTool: false,
        chqlEquivalent: "actual_error",
      };
      const graded = gradeResult(question, modelOutput);
      results.push({
        question,
        actualChql: null,
        modelResponse: error instanceof Error ? error.message : String(error),
        usedTool: false,
        success: graded.success,
        verdict: "actual_error",
        reason: "runtime error during generation",
        metrics: {
          responseTimeMs: 0,
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          chqlEquivalent: "actual_error",
        },
      });
    }
  }

  await closeMCPClient(mcpClient);

  const completedAt = new Date().toISOString();
  const n = results.length || 1;

  const successCount = results.filter((r) => r.success).length;
  const toolUsageCount = results.filter((r) => r.usedTool).length;
  const chqlParsesCount = results.filter((r) => r.metrics.chqlParses === true)
    .length;
  const equivalenceCount = results.filter(
    (r) => r.metrics.chqlEquivalent === "equivalent",
  ).length;

  const report: EvalReport = {
    modelId,
    set: config.set,
    methodologyVersion: METHODOLOGY_VERSION,
    vllmUrl: config.vllmUrl,
    startedAt,
    completedAt,
    totalQueries: results.length,
    aggregateMetrics: {
      successRate: successCount / n,
      avgResponseTimeMs:
        results.reduce((s, r) => s + r.metrics.responseTimeMs, 0) / n,
      avgInputTokens:
        results.reduce((s, r) => s + r.metrics.inputTokens, 0) / n,
      avgOutputTokens:
        results.reduce((s, r) => s + r.metrics.outputTokens, 0) / n,
      avgTotalTokens:
        results.reduce((s, r) => s + r.metrics.totalTokens, 0) / n,
      chqlParsesRate: chqlParsesCount / n,
      equivalenceRate: equivalenceCount / n,
      toolUsageRate: toolUsageCount / n,
    },
    results,
  };

  mkdirSync(join(__dirname, "results"), { recursive: true });

  const safeModelId = modelId.replace(/[\/\\:*?"<>|]/g, "_");
  const jsonPath = join(__dirname, "results", `${safeModelId}.json`);
  writeFileSync(jsonPath, JSON.stringify(report, null, 2));

  const mdPath = join(__dirname, "results", `${safeModelId}.md`);
  const perQuestion: PerQuestionRow[] = results.map((r) => ({
    question: r.question,
    actualChql: r.actualChql,
    modelResponse: r.modelResponse,
    usedTool: r.usedTool,
    verdict: r.verdict,
    success: r.success,
    reason: r.reason,
    chqlParses: r.metrics.chqlParses,
    chqlEquivalent: r.metrics.chqlEquivalent,
    kkeysCorrect: r.metrics.kkeysCorrect,
    metrics: {
      responseTimeMs: r.metrics.responseTimeMs,
      inputTokens: r.metrics.inputTokens,
      outputTokens: r.metrics.outputTokens,
      totalTokens: r.metrics.totalTokens,
    },
  }));

  const md = renderReport({
    modelId,
    set: config.set,
    methodologyVersion: METHODOLOGY_VERSION,
    runConfig: {
      "vLLM URL": config.vllmUrl,
      "MCP URL": config.mcpUrl,
    },
    startedAt,
    completedAt,
    results: perQuestion,
  });
  writeFileSync(mdPath, md);

  console.log(`\n${"═".repeat(60)}`);
  console.log(`📊 Eval Results: ${config.model} (${config.set})`);
  console.log(`${"═".repeat(60)}`);
  console.log(`   Success rate:      ${(report.aggregateMetrics.successRate * 100).toFixed(1)}%`);
  console.log(`   CHQL parses:       ${(report.aggregateMetrics.chqlParsesRate * 100).toFixed(1)}%`);
  console.log(`   Equivalence:       ${(report.aggregateMetrics.equivalenceRate * 100).toFixed(1)}%`);
  console.log(`   Tool usage:        ${(report.aggregateMetrics.toolUsageRate * 100).toFixed(1)}%`);
  console.log(`   Avg response time: ${report.aggregateMetrics.avgResponseTimeMs.toFixed(0)}ms`);
  console.log(`   Avg total tokens:  ${report.aggregateMetrics.avgTotalTokens.toFixed(0)}`);
  console.log(`${"═".repeat(60)}`);
  console.log(`\n💾 JSON: ${jsonPath}`);
  console.log(`💾 MD:   ${mdPath}\n`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
