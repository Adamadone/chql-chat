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
  routeSections,
  stripToolTags,
  type ChqlEquivalent,
  type GoldenQuestion,
  type ModelOutput,
  type SectionId,
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
  // Prompt composer: `full` ships the entire CHQL_REFERENCE (current
  // behaviour, default); `composed` invokes routeSections per question.
  // The flag is the experimental knob for the small-local-model A/B.
  const promptMode = (parsed["prompt-mode"] ?? "full") as "full" | "composed";
  if (promptMode !== "full" && promptMode !== "composed") {
    console.error(
      `Invalid --prompt-mode value: ${promptMode}. Expected "full" or "composed".`,
    );
    process.exit(1);
  }
  return {
    model,
    vllmUrl: parsed["vllm-url"] ?? "http://localhost:1234/v1",
    mcpUrl: parsed["mcp-url"] ?? process.env.MCP_SERVER_URL ?? "http://localhost:3001/mcp",
    mcpAuthToken: parsed["mcp-auth-token"] ?? process.env.MCP_AUTH_TOKEN,
    set,
    promptMode,
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
  /** `'all'` for full-prompt runs, otherwise the routed conditional sections. */
  sections: SectionId[] | "all";
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
  /** `'full'` ships the entire CHQL_REFERENCE; `'composed'` routes per question. */
  promptMode: "full" | "composed";
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
  equivalenceCount: number;
  equivalenceQuestionCount: number;
  results: EvalResult[];
}

const EVAL_PAGE_SIZE = 1000;
const SEARCH_TOOL_NAME = "search_measurements";
// SDK default is 60s; chy.stat can exceed that on broad pageSize=1000 calls.
const MCP_CALL_TIMEOUT_MS = 180_000;

interface CachedHash {
  hash: string;
  isEmpty: boolean;
}

// Whitespace-only normalize: `K0014 = '9891978'` == `K0014='9891978'`.
function normalizeChql(s: string): string {
  return s.trim().replace(/\s+/g, " ");
}

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
  const result = await mcpClient.callTool(
    { name: toolName, arguments: args },
    undefined,
    { timeout: MCP_CALL_TIMEOUT_MS },
  );
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

async function fetchHash(
  mcpClient: Client,
  chql: string,
): Promise<CachedHash | "error"> {
  let text: { text: string; isError: boolean };
  try {
    text = await callMCPTool(mcpClient, SEARCH_TOOL_NAME, {
      query: chql,
      pageSize: EVAL_PAGE_SIZE,
    });
  } catch {
    return "error";
  }
  if (text.isError) return "error";
  const h = hashMCPResponseText(text.text);
  if (!h) return "error";
  return { hash: h.hash, isEmpty: h.isEmpty };
}

async function computeEquivalence(
  mcpClient: Client,
  actualChql: string | undefined,
  expectedChql: string | null,
  expectedHashCache: Map<string, CachedHash>,
): Promise<ChqlEquivalent | undefined> {
  if (!actualChql || expectedChql === null) return undefined;

  // Identical CHQL ⇒ identical row sets; same fast-path rejudgeRun uses on historical rows.
  if (normalizeChql(actualChql) === normalizeChql(expectedChql)) {
    return "equivalent";
  }

  const actualHash = await fetchHash(mcpClient, actualChql);
  if (actualHash === "error") return "actual_error";

  let expectedHash = expectedHashCache.get(expectedChql);
  if (!expectedHash) {
    const fetched = await fetchHash(mcpClient, expectedChql);
    if (fetched === "error") return "expected_empty";
    expectedHash = fetched;
    expectedHashCache.set(expectedChql, expectedHash);
  }

  if (expectedHash.isEmpty) return "expected_empty";
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
  promptMode: "full" | "composed",
  expectedHashCache: Map<string, CachedHash>,
): Promise<{
  response: string;
  dslQuery?: string;
  usedTool: boolean;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  responseTimeMs: number;
  chqlEquivalent?: ChqlEquivalent;
  sections: SectionId[] | "all";
}> {
  // Route on the question text alone — `run-local.ts` is single-turn (no chat
  // history), matching the eval methodology v2 invariant.
  const sections: SectionId[] | "all" =
    promptMode === "composed" ? routeSections([question.query]) : "all";
  const systemPrompt = buildSystemPrompt({
    hasTools: Object.keys(tools).length > 0,
    sections,
    timeZone: "Europe/Prague",
  });

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
    expectedHashCache,
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
    sections,
  };
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const config = parseArgs();
  const modelId = `local/${config.model}`;

  console.log(`\n🔧 Local Eval Runner`);
  console.log(`   Model:       ${config.model}`);
  console.log(`   Set:         ${config.set}`);
  console.log(`   Prompt mode: ${config.promptMode}`);
  console.log(`   vLLM URL:    ${config.vllmUrl}`);
  console.log(`   MCP URL:     ${config.mcpUrl}\n`);

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
  const expectedHashCache = new Map<string, CachedHash>();

  for (let i = 0; i < questions.length; i++) {
    const question = questions[i];

    try {
      console.log(`[${i + 1}/${questions.length}] "${question.query}"`);

      const result = await runSingleQuery(
        question,
        model,
        mcpClient,
        tools,
        config.promptMode,
        expectedHashCache,
      );

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
        sections: result.sections,
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
      const sectionsLabel =
        result.sections === "all" ? "all" : `[${result.sections.join(",")}]`;
      console.log(
        `   ${status} ${graded.verdict} · CHQL: ${actualChql ?? "(none)"} | ${result.responseTimeMs}ms | ${result.totalTokens} tokens | sections: ${sectionsLabel}`,
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
        sections: "all",
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
  // equivalence rate is defined only over questions whose expectedBehavior is
  // "equivalence"; refusal/clarification questions correctly produce no CHQL and
  // would otherwise depress the denominator. See convex/evaluationHelpers.ts.
  const equivalenceQuestions = results.filter(
    (r) => r.question.expectedBehavior === "equivalence",
  );
  const equivalenceCount = equivalenceQuestions.filter(
    (r) => r.metrics.chqlEquivalent === "equivalent",
  ).length;
  const equivalenceQuestionCount = equivalenceQuestions.length;

  const report: EvalReport = {
    modelId,
    set: config.set,
    methodologyVersion: METHODOLOGY_VERSION,
    promptMode: config.promptMode,
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
      equivalenceRate:
        equivalenceQuestionCount === 0
          ? 0
          : equivalenceCount / equivalenceQuestionCount,
      toolUsageRate: toolUsageCount / n,
    },
    equivalenceCount,
    equivalenceQuestionCount,
    results,
  };

  mkdirSync(join(__dirname, "results"), { recursive: true });

  const safeModelId = modelId.replace(/[\/\\:*?"<>|]/g, "_");
  // Suffix the report filename only for the new `composed` mode so existing
  // full-prompt artefacts (referenced from the thesis) keep their canonical
  // names and `merge-results.ts` / `aggregate-summary.ts` find them.
  const modeSuffix = config.promptMode === "composed" ? "_composed" : "";
  const jsonPath = join(__dirname, "results", `${safeModelId}${modeSuffix}.json`);
  writeFileSync(jsonPath, JSON.stringify(report, null, 2));

  const mdPath = join(__dirname, "results", `${safeModelId}${modeSuffix}.md`);
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
