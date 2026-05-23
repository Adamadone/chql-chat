/**
 * @module convex/ai — LLM + MCP Client Integration
 *
 * This is the core integration hub of the application. It acts as the **MCP client**
 * that bridges the Convex backend with both the LLM providers and the
 * external MCP server (which proxies the chy.stat API).
 *
 * ## Architecture
 *
 * ```
 *   Frontend (chat-input.tsx)
 *        │
 *        │  useAction(api.ai.processMessage)
 *        ▼
 *   ┌──────────────────────────────────────────────────┐
 *   │  This file (convex/ai.ts)                        │
 *   │                                                  │
 *   │  processMessage action                           │
 *   │    1. Save user message to DB                    │
 *   │    2. Connect to MCP server (Streamable HTTP)    │
 *   │    3. Fetch available tools via listTools()      │
 *   │    4. Run multi-turn LLM loop with tool use      │
 *   │    5. Save assistant response to DB              │
 *   └──────┬──────────────────────┬────────────────────┘
 *          │                      │
 *          ▼                      ▼
 *   ┌──────────────┐       ┌────────────────────┐
 *   │  LLM Provider│       │  MCP Server        │
 *   │  (Anthropic, │       │  (apps/mcp-server) │
 *   │   OpenAI,    │       │                    │
 *   │   local)     │──────▶│  search_           │──▶ chy.stat API
 *   │              │       │  measurements      │
 *   └──────────────┘       └────────────────────┘
 * ```
 *
 * ## Provider Abstraction
 *
 * This module uses the **Vercel AI SDK** (`ai` package) to abstract LLM providers.
 * The `getModel()` function returns the appropriate provider instance based on a
 * model ID string (e.g. `"claude-haiku-4-5"`, `"gpt-5.4"`, `"local/qwen3-4b"`).
 *
 * Supported providers:
 * - **Anthropic** — Claude models via `@ai-sdk/anthropic`
 * - **OpenAI** — GPT models via `@ai-sdk/openai`
 * - **Local** — Self-hosted models via OpenAI-compatible API (e.g. vLLM)
 *
 * ## Request Lifecycle (processMessage)
 *
 * 1. Authenticate the user and verify chat ownership
 * 2. Persist the user's message to the database
 * 3. Load full chat history for context
 * 4. Connect to the MCP server and discover available tools
 * 5. Build a system prompt (varies based on tool availability)
 * 6. Call `generateText()` with `maxSteps` for multi-turn tool use:
 *    a. Send chat history + tools to the LLM
 *    b. If the LLM requests a tool → execute it via MCP → feed result back
 *    c. Repeat up to {@link MAX_TOOL_ROUNDS} steps
 *    d. Once the LLM responds with text (no tool use) → return the response
 * 7. Check for user interruption
 * 8. Persist the assistant's response (with metadata: CHQL query, API response, tool calls)
 * 9. Clean up the MCP connection
 *
 * ## Graceful Degradation
 *
 * If the MCP server is unreachable or fails to list tools, the action proceeds
 * without tools. The system prompt changes to inform the LLM that the measurement
 * search tool is unavailable, and the LLM responds conversationally.
 *
 * ## Exported Actions
 *
 * - {@link processMessage} — Main entry point for the LLM + tool-use flow
 * - {@link generateTitle} — Auto-generates a short chat title from the first user message
 */

"use node";

import {v} from "convex/values";
import {action} from "./_generated/server";
import {api} from "./_generated/api";
import {getAuthUserId} from "@convex-dev/auth/server";
import {generateText, jsonSchema, stepCountIs, type ToolSet} from "ai";
import type {ModelMessage, SystemModelMessage} from "@ai-sdk/provider-utils";
import {anthropic} from "@ai-sdk/anthropic";
import {createOpenAI, openai} from "@ai-sdk/openai";
import {Client} from "@modelcontextprotocol/sdk/client/index.js";
import {StreamableHTTPClientTransport} from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {randomUUID} from "node:crypto";
import {
  ANTHROPIC_CACHE_CONTROL,
  buildSystemPrompt,
  parseSearchEnvelope,
  splitEnvelope,
  stripToolTags,
  type SearchEnvelope,
} from "@chql-chat/chql-core";
import {MAX_USER_MESSAGE_CHARS} from "./constants";

// ─── Constants ───────────────────────────────────────────────────────────────

/**
 * Maximum number of tool-use steps per message.
 *
 * Each "step" is one LLM response requesting a tool followed by the tool
 * result being fed back. This prevents infinite loops if the LLM keeps
 * requesting tools without producing a final text response.
 */
const MAX_TOOL_ROUNDS = 5;

/** Default model identifier used for both chat and title generation. */
const DEFAULT_MODEL = "claude-haiku-4-5";

/** Maximum tokens for chat responses. */
const CHAT_MAX_TOKENS = 4096;

/** Maximum tokens for title generation (kept small since titles are 3-6 words). */
const TITLE_MAX_TOKENS = 30;

/** Maximum character length for truncated chat titles. */
const TITLE_MAX_LENGTH = 40;

/** Maximum character length for LLM-generated titles before truncation. */
const LLM_TITLE_MAX_LENGTH = 60;

// ─── Provider Factory ───────────────────────────────────────────────────────

/**
 * Returns the appropriate AI SDK model instance for a given model ID.
 *
 * Supported prefixes:
 * - `claude-*` → Anthropic provider
 * - `gpt-*` → OpenAI provider
 * - `local/*` → OpenAI-compatible API (e.g. vLLM) at VLLM_BASE_URL
 *
 * @param modelId - Model identifier string
 * @returns An AI SDK model instance ready for `generateText()`
 */
export function getModel(modelId: string) {
  if (modelId.startsWith("claude-")) {
    return anthropic(modelId);
  }
  if (modelId.startsWith("gpt-") || modelId.startsWith("o")) {
    return openai(modelId);
  }
  if (modelId.startsWith("local/")) {
    const baseURL = process.env.VLLM_BASE_URL;
    if (!baseURL) throw new Error("VLLM_BASE_URL is not configured for local models");
    const localProvider = createOpenAI({
      baseURL,
      apiKey: "not-needed",
    });
    return localProvider(modelId.replace("local/", ""));
  }
  throw new Error(`Unknown model: ${modelId}`);
}

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * Metadata attached to assistant messages to provide observability into
 * the tool-use pipeline. Stored in the `messages.metadata` field.
 *
 * `apiResponse` carries the full {@link SearchEnvelope} (rows + aggregates +
 * page info) for the most recent `search_measurements` call on this turn.
 * The UI uses `apiResponse.rows` to render an inline virtualized table; the
 * LLM never sees `rows` (it gets only the digest via {@link splitEnvelope}).
 *
 * @see {@link processMessage} for where this is populated
 */
export interface ToolUseMetadata {
  /** The CHQL query string generated by Claude (if `search_measurements` was called). */
  dslQuery?: string;
  /** Full envelope (rows + aggregates + page) from the most recent tool call. */
  apiResponse?: SearchEnvelope;
  /** Error message if a tool call or the LLM pipeline failed. */
  error?: string;
  /** Ordered list of tool names invoked during this message (e.g. `["search_measurements"]`). */
  toolCalls?: string[];
}

/**
 * Per-call mapping from AI SDK `toolCallId` → parsed envelope for that call.
 *
 * The execute wrapper in {@link getMCPToolsAsAISDKTools} parses the envelope
 * and stashes it here, returning only the digest (no `rows`) to the LLM.
 * `onStepFinish` in {@link runLLMWithTools} drains this map to populate
 * `metadata.apiResponse` with the full envelope for UI rendering.
 *
 * Lives per `runLLMWithTools` invocation — created fresh each time.
 */
export type EnvelopeSideChannel = Map<string, SearchEnvelope>;

/** Return type for the {@link processMessage} action. */
interface ProcessMessageResult {
  success: boolean;
  response?: string;
  error?: string;
}

/** A simplified chat message used to build the conversation history for Claude. */
export interface ChatHistoryEntry {
  role: "user" | "assistant";
  content: string;
}

/** Token usage data aggregated across all steps. */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

/** Return type for the {@link runLLMWithTools} function. */
export interface LLMResult {
  response: string;
  metadata?: ToolUseMetadata;
  usage: TokenUsage;
}

/**
 * Callback invoked when a tool call starts or finishes.
 *
 * - Called with the tool name (e.g. `"search_measurements"`) when a call begins
 * - Called with `null` when the tool call completes or the LLM finishes
 *
 * Used by {@link processMessage} to update the chat's `activeToolCall` field
 * in real time, enabling the frontend to show a live progress indicator.
 */
type OnToolCallCallback = (toolName: string | null) => Promise<void>;

// ─── Text Utilities ──────────────────────────────────────────────────────────

/**
 * Truncates a string to a maximum length, appending "..." if truncated.
 *
 * Used as a fallback for chat title generation when the LLM is unavailable.
 *
 * @param text - The string to truncate
 * @param maxLen - Maximum allowed length (default: {@link TITLE_MAX_LENGTH})
 * @returns The original string or a truncated version with "..." suffix
 */
function truncateTitle(text: string, maxLen = TITLE_MAX_LENGTH): string {
  return text.length > maxLen ? text.slice(0, maxLen - 3) + "..." : text;
}

// ─── MCP Client Lifecycle ────────────────────────────────────────────────────

/**
 * Creates and connects an MCP client to the remote MCP server.
 *
 * Uses the Streamable HTTP transport (not stdio) to communicate with the
 * MCP server. If `MCP_AUTH_TOKEN` is set, it is sent as a Bearer token
 * in the `Authorization` header for authentication.
 *
 * @throws {Error} If `MCP_SERVER_URL` is not a valid URL
 * @throws {Error} If the connection to the MCP server fails
 * @returns A connected MCP {@link Client} ready for tool discovery and invocation
 *
 * @see {@link closeMCPClient} for cleanup
 */
async function createMCPClient(): Promise<Client> {
  const mcpUrl = process.env.MCP_SERVER_URL ?? "http://localhost:3001/mcp";
  const mcpAuthToken = process.env.MCP_AUTH_TOKEN;

  let url: URL;
  try {
    url = new URL(mcpUrl);
  } catch {
    throw new Error(
      `Invalid MCP_SERVER_URL: "${mcpUrl}". Must be a valid URL (e.g. http://localhost:3001/mcp)`,
    );
  }

  const transport = new StreamableHTTPClientTransport(url, {
    requestInit: mcpAuthToken
      ? { headers: { Authorization: `Bearer ${mcpAuthToken}` } }
      : undefined,
  });

  const client = new Client({
    name: "chql-convex-client",
    version: "0.1.0",
  });
  await client.connect(transport);
  return client;
}

/**
 * Gracefully closes an MCP client connection.
 *
 * Swallows errors to prevent cleanup failures from masking the original
 * error in a `finally` block.
 *
 * @param client - The MCP client to disconnect
 */
export async function closeMCPClient(client: Client): Promise<void> {
  try {
    await client.close();
  } catch (error) {
    console.warn("Failed to close MCP client cleanly:", error);
  }
}

/**
 * Attempts to connect to the MCP server and discover available tools.
 *
 * This encapsulates the two-step connection process (connect + listTools)
 * with graceful degradation:
 * - If connection fails → returns `{ client: null, tools: {}, envelopes }`
 * - If connection succeeds but tool listing fails → disconnects and returns `{ client: null, tools: {}, envelopes }`
 * - If both succeed → returns the connected client, AI SDK tools, and the envelope side-channel
 *
 * The `envelopes` map is populated as tools execute: each `search_measurements`
 * call parses its response envelope and stashes the full object (including
 * `rows`) keyed by the AI SDK's `toolCallId`. Pass this map to
 * {@link runLLMWithTools} so `onStepFinish` can drain it into `metadata.apiResponse`.
 *
 * @returns An object with the MCP client (or null), the discovered tools record, and a fresh envelope side-channel
 */
export async function connectAndDiscoverTools(): Promise<{
  client: Client | null;
  tools: ToolSet;
  envelopes: EnvelopeSideChannel;
}> {
  const envelopes: EnvelopeSideChannel = new Map();
  let client: Client | null = null;

  try {
    client = await createMCPClient();
  } catch (connectError) {
    console.error(
      "Failed to connect to MCP server, proceeding without tools:",
      connectError,
    );
    return { client: null, tools: {}, envelopes };
  }

  try {
    const tools = await getMCPToolsAsAISDKTools(client, envelopes);
    return { client, tools, envelopes };
  } catch (toolListError) {
    console.error(
      "Connected to MCP server but failed to list tools:",
      toolListError,
    );
    await closeMCPClient(client);
    return { client: null, tools: {}, envelopes };
  }
}

// ─── MCP Tool Interaction ────────────────────────────────────────────────────

/**
 * Fetches the list of tools from the MCP server and converts them to
 * the Vercel AI SDK tool format.
 *
 * The MCP SDK returns tools with a `name`, `description`, and `inputSchema`
 * (JSON Schema). This function wraps each into an AI SDK `tool()` definition
 * using `jsonSchema()` to pass the JSON Schema directly (no Zod conversion needed).
 *
 * The execute wrapper around `search_measurements` parses the returned
 * envelope and routes:
 * - the **digest** (envelope minus `rows`) back to the LLM as the tool result
 * - the **full envelope** (including `rows`) into the `envelopes` side-channel
 *   keyed by `toolCallId`, where `runLLMWithTools.onStepFinish` reads it for
 *   `metadata.apiResponse`
 *
 * For non-envelope responses (errors, future tools), the raw text is passed
 * through unchanged.
 *
 * @param mcpClient - A connected MCP client
 * @param envelopes - Side-channel map populated as `search_measurements` executes
 * @returns A ToolSet record keyed by tool name
 */
async function getMCPToolsAsAISDKTools(
  mcpClient: Client,
  envelopes: EnvelopeSideChannel,
): Promise<ToolSet> {
  const { tools: mcpTools } = await mcpClient.listTools();
  const toolSet: ToolSet = {};

  for (let i = 0; i < mcpTools.length; i++) {
    const mcpTool = mcpTools[i];
    const isLast = i === mcpTools.length - 1;
    toolSet[mcpTool.name] = {
      description: mcpTool.description ?? "",
      inputSchema: jsonSchema(mcpTool.inputSchema as Parameters<typeof jsonSchema>[0]),
      execute: async (
        args: Record<string, unknown>,
        options: { toolCallId: string },
      ) => {
        const result = await callMCPTool(mcpClient, mcpTool.name, args);

        // Errors aren't envelopes — pass through unchanged so the LLM sees
        // the error text. (toolError responses from the MCP server are plain
        // strings, not JSON envelopes.)
        if (result.isError) {
          console.log(
            `[envelope] ${mcpTool.name} returned isError, passing through`,
          );
          return result;
        }

        const envelope = parseSearchEnvelope(result.text);
        if (!envelope) {
          console.warn(
            `[envelope] ${mcpTool.name} response did not parse as SearchEnvelope; passing through raw text. First 200 chars: ${result.text.slice(0, 200)}`,
          );
          return result;
        }

        const callId = options?.toolCallId;
        console.log(
          `[envelope] ${mcpTool.name} parsed envelope: rowCount=${envelope.rowCount}, toolCallId=${callId ?? "<missing>"}`,
        );

        if (callId) {
          envelopes.set(callId, envelope);
        } else {
          // Defensive: if for any reason the AI SDK doesn't pass toolCallId,
          // stash under a sentinel so onStepFinish can still recover the most
          // recent envelope (covers the single-tool-call-per-step case).
          envelopes.set("__last__", envelope);
        }
        const { digest } = splitEnvelope(envelope);
        return { text: JSON.stringify(digest), isError: false };
      },
      // Mark the last tool with cacheControl so the entire tools block is cached
      ...(isLast ? { providerOptions: ANTHROPIC_CACHE_CONTROL } : {}),
    };
  }

  return toolSet;
}

/**
 * Executes a single tool call via the MCP protocol.
 *
 * Sends the tool name and arguments to the MCP server, which forwards
 * the request to the appropriate backend (e.g. chy.stat API for
 * `search_measurements`). The server returns an array of content blocks;
 * this function extracts and joins all text blocks into a single string.
 *
 * @param mcpClient - A connected MCP client
 * @param toolName - Name of the tool to invoke (e.g. `"search_measurements"`)
 * @param args - Tool arguments (e.g. `{ query: "K1001 = '3'" }`)
 * @returns An object with the combined text response and an error flag
 */
export async function callMCPTool(
  mcpClient: Client,
  toolName: string,
  args: Record<string, unknown>,
): Promise<{ text: string; isError: boolean }> {
  const result = await mcpClient.callTool({
    name: toolName,
    arguments: args,
  });

  // Handle unexpected response shapes (e.g. no content array)
  if (!("content" in result) || !Array.isArray(result.content)) {
    return { text: JSON.stringify(result), isError: false };
  }

  // Extract and join all text content blocks
  const text = (result.content as Array<{ type: string; text?: string }>)
    .filter((c) => c.type === "text" && typeof c.text === "string")
    .map((c) => c.text as string)
    .join("\n");

  return { text, isError: Boolean(result.isError) };
}

// ─── LLM Tool-Use Loop ──────────────────────────────────────────────────────

/**
 * Runs a multi-turn conversation with the LLM that supports tool use.
 *
 * Uses the Vercel AI SDK's `generateText()` with `maxSteps` to handle the
 * iterative tool-use loop automatically. The AI SDK calls tools, feeds results
 * back, and continues until the LLM produces a final text response or the
 * step limit is reached.
 *
 * **Metadata capture**: During tool execution, the function captures
 * observability metadata (CHQL query, API response, tool names) via the
 * `onStepFinish` callback.
 *
 * @param systemPrompt - System prompt as an array of SystemModelMessage blocks
 * @param chatHistory - Array of prior user/assistant messages
 * @param tools - AI SDK ToolSet from MCP discovery
 * @param modelId - Model identifier for the provider factory
 * @param onToolCall - Optional callback for tool call status updates
 * @returns The final text response and optional metadata
 */
export async function runLLMWithTools(
  systemPrompt: SystemModelMessage[],
  chatHistory: ChatHistoryEntry[],
  tools: ToolSet,
  modelId: string,
  onToolCall?: OnToolCallCallback,
  envelopes?: EnvelopeSideChannel,
): Promise<LLMResult> {
  const model = getModel(modelId);

  // Build messages with cacheControl on the last message for Anthropic prompt
  // caching. Non-Anthropic providers ignore providerOptions.
  const messages: ModelMessage[] = chatHistory.map((m, i) => {
    const isLast = i === chatHistory.length - 1;
    return {
      role: m.role,
      content: m.content,
      ...(isLast ? { providerOptions: ANTHROPIC_CACHE_CONTROL } : {}),
    };
  });

  let metadata: ToolUseMetadata | undefined;

  const result = await generateText({
    model,
    system: systemPrompt,
    messages,
    tools: Object.keys(tools).length > 0 ? tools : undefined,
    stopWhen: stepCountIs(MAX_TOOL_ROUNDS),
    maxOutputTokens: CHAT_MAX_TOKENS,
    onStepFinish: async (step) => {
      // Log token usage for observability
      console.log(
        `[LLM step] Token usage:`,
        JSON.stringify({
          input_tokens: step.usage.inputTokens,
          output_tokens: step.usage.outputTokens,
          total_tokens: step.usage.totalTokens,
        }),
      );

      // Capture metadata from tool calls
      if (step.toolCalls && step.toolCalls.length > 0) {
        for (const toolCall of step.toolCalls) {
          // Track tool names
          const existingCalls = metadata?.toolCalls ?? [];
          metadata = {
            ...metadata,
            toolCalls: [...existingCalls, toolCall.toolName],
          };

          // Notify UI about active tool call
          await onToolCall?.(toolCall.toolName);

          // Capture CHQL query for observability
          if (
            toolCall.toolName === "search_measurements" &&
            toolCall.input &&
            typeof toolCall.input === "object" &&
            "query" in toolCall.input
          ) {
            metadata = {
              ...metadata,
              dslQuery: String((toolCall.input as Record<string, unknown>).query),
            };
          }
        }
      }

      // Capture API response from tool results.
      //
      // For successful search_measurements calls we read the full envelope
      // out of the side-channel (the execute wrapper stripped `rows` from
      // what the LLM sees, but stored the complete envelope keyed by
      // toolCallId for us). The UI consumes `metadata.apiResponse.rows` to
      // render the inline table.
      //
      // For errors, the side-channel is empty (execute returns early on
      // isError); fall back to capturing the error text into metadata.error.
      if (step.toolResults && step.toolResults.length > 0) {
        for (const toolResult of step.toolResults) {
          if (toolResult.toolName !== "search_measurements") continue;

          // Prefer keyed lookup; fall back to the sentinel set by the execute
          // wrapper when toolCallId wasn't available at execute time.
          const envelope =
            envelopes?.get(toolResult.toolCallId) ??
            envelopes?.get("__last__");
          console.log(
            `[envelope] onStepFinish lookup: toolCallId=${toolResult.toolCallId}, found=${envelope ? `rowCount=${envelope.rowCount}` : "no"}`,
          );
          if (envelope) {
            metadata = { ...metadata, apiResponse: envelope };
            continue;
          }

          // No envelope means either an error or a non-envelope response.
          const resultObj = toolResult.output as
            | { text: string; isError: boolean }
            | undefined;
          if (resultObj?.isError) {
            metadata = { ...metadata, error: resultObj.text };
          }
        }
      }
    },
  });

  await onToolCall?.(null);

  const text = stripToolTags(result.text);

  // Aggregate token usage across all steps
  const usage: TokenUsage = {
    inputTokens: result.usage.inputTokens ?? 0,
    outputTokens: result.usage.outputTokens ?? 0,
    totalTokens: result.usage.totalTokens ?? 0,
  };

  if (!text) {
    return {
      response:
        "I attempted to retrieve data but exceeded the maximum number of tool call attempts. Please try rephrasing your query.",
      metadata,
      usage,
    };
  }

  return { response: text, metadata, usage };
}

// ─── Exported Actions ────────────────────────────────────────────────────────

/**
 * Main entry point for processing a user message through the LLM + MCP pipeline.
 *
 * Called by the frontend via `useAction(api.ai.processMessage)`. This action
 * orchestrates the entire flow:
 *
 * 1. **Auth & validation** — Verify the user is authenticated and owns the chat
 * 2. **Persist user message** — Save to the `messages` table for real-time display
 * 3. **Load chat history** — Fetch all messages for conversation context
 * 4. **MCP connection** — Connect to the MCP server and discover tools
 *    (gracefully degrades if the server is unreachable)
 * 5. **LLM loop** — Run the multi-turn tool-use loop with the selected model
 * 6. **Interruption check** — Abort if the user interrupted while we were processing
 * 7. **Persist response** — Save the assistant's response with metadata
 * 8. **Cleanup** — Close the MCP connection and clear the active tool call indicator
 *
 * If any step fails, an error message is persisted as an assistant message
 * so the user sees feedback rather than a silent failure.
 *
 * @param args.chatId - The ID of the chat to send the message in
 * @param args.userMessage - The user's natural language message
 * @param args.modelId - Optional model ID (defaults to DEFAULT_MODEL)
 * @returns A result object with `success`, optional `response`, and optional `error`
 */
export const processMessage = action({
  args: {
    chatId: v.id("chats"),
    userMessage: v.string(),
    modelId: v.optional(v.string()),
    timeZone: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<ProcessMessageResult> => {
    // ── Step 1: Authenticate and verify chat ownership ─────────────
    const userId = await getAuthUserId(ctx);
    if (!userId) return { success: false, error: "Not authenticated" };

    const chat = await ctx.runQuery(api.chats.get, { chatId: args.chatId });
    if (!chat)
      return { success: false, error: "Chat not found or not authorized" };

    if (args.userMessage.length > MAX_USER_MESSAGE_CHARS) {
      return {
        success: false,
        error: `Message too long (max ${MAX_USER_MESSAGE_CHARS} characters).`,
      };
    }

    try {
      // ── Step 2: Persist the user's message and mark chat as processing ─
      await ctx.runMutation(api.messages.send, {
        chatId: args.chatId,
        content: args.userMessage,
        role: "user",
      });
      await ctx.runMutation(api.chats.setProcessing, {
        chatId: args.chatId,
        isProcessing: true,
      });

      // ── Step 3: Load full chat history for context ─────────────────
      const messages = await ctx.runQuery(api.messages.list, {
        chatId: args.chatId,
      });

      const userNonce = randomUUID();
      const openTag = `<user_message_${userNonce}>`;
      const closeTag = `</user_message_${userNonce}>`;
      const chatHistory: ChatHistoryEntry[] = messages.map((m) => ({
        role: m.role as "user" | "assistant",
        content:
          m.role === "user"
            ? `${openTag}${m.content}${closeTag}`
            : m.content,
      }));

      // ── Step 4: Connect to MCP server and discover tools ───────────
      const { client: mcpClient, tools, envelopes } =
        await connectAndDiscoverTools();

      // ── Step 5: Run the LLM tool-use loop ──────────────────────────
      let finalResponse: string;
      let metadata: ToolUseMetadata | undefined;
      const modelId = args.modelId ?? DEFAULT_MODEL;

      try {
        const systemPrompt = buildSystemPrompt(Object.keys(tools).length > 0, args.timeZone);
        const result = await runLLMWithTools(
          systemPrompt,
          chatHistory,
          tools,
          modelId,
          async (toolName) => {
            await ctx.runMutation(api.chats.setActiveToolCall, {
              chatId: args.chatId,
              toolName,
            });
          },
          envelopes,
        );
        finalResponse = result.response;
        metadata = result.metadata;
      } finally {
        // Always clean up: close MCP connection and clear tool call indicator
        if (mcpClient) {
          await closeMCPClient(mcpClient);
        }
        await ctx.runMutation(api.chats.setActiveToolCall, {
          chatId: args.chatId,
          toolName: null,
        });
      }

      // ── Step 6: Check for user interruption ────────────────────────
      const latestMessages = await ctx.runQuery(api.messages.list, {
        chatId: args.chatId,
      });
      const lastMessage = latestMessages[latestMessages.length - 1];
      if (lastMessage?.interrupted) {
        await ctx.runMutation(api.chats.setProcessing, {
          chatId: args.chatId,
          isProcessing: false,
        });
        return { success: false, error: "Interrupted by user" };
      }

      // ── Step 7: Persist the assistant's response ────────────────────
      await ctx.runMutation(api.messages.send, {
        chatId: args.chatId,
        content: finalResponse,
        role: "assistant",
        metadata,
      });

      await ctx.runMutation(api.chats.setProcessing, {
        chatId: args.chatId,
        isProcessing: false,
      });

      return { success: true, response: finalResponse };
    } catch (error) {
      // ── Error recovery: persist error as an assistant message ─────
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error occurred";
      console.error("processMessage failed:", error);

      try {
        await ctx.runMutation(api.messages.send, {
          chatId: args.chatId,
          content:
            "Sorry, I encountered an error processing your message. Please try again.",
          role: "assistant",
          metadata: { error: errorMessage },
        });
      } catch (persistError) {
        console.error(
          "Failed to persist error message to database:",
          persistError,
        );
      }

      // Always clear processing flag, even on error
      try {
        await ctx.runMutation(api.chats.setProcessing, {
          chatId: args.chatId,
          isProcessing: false,
        });
      } catch {
        // Best-effort cleanup
      }

      return { success: false, error: errorMessage };
    }
  },
});

/**
 * Re-runs the CHQL query stored in an assistant message's metadata at a
 * different page number, then patches `metadata.apiResponse` with the new
 * page's envelope. The LLM is NOT involved — this is a direct MCP call
 * driven by the UI's table pagination controls.
 *
 * Lets the user browse beyond the LLM's working page without spawning a
 * new turn or burning context. Both `dslQuery` and the prior page size are
 * read from the existing metadata (the page size defaults to {@link DEFAULT_FETCH_PAGE_SIZE}
 * if the original metadata didn't capture it).
 *
 * @param args.chatId - The chat that owns the message
 * @param args.messageId - The assistant message whose apiResponse to refresh
 * @param args.pageNumber - 1-based page to fetch
 */
export const fetchPage = action({
  args: {
    chatId: v.id("chats"),
    messageId: v.id("messages"),
    pageNumber: v.number(),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ success: boolean; error?: string }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { success: false, error: "Not authenticated" };

    const chat = await ctx.runQuery(api.chats.get, { chatId: args.chatId });
    if (!chat) return { success: false, error: "Chat not found or not authorized" };

    const messages = await ctx.runQuery(api.messages.list, {
      chatId: args.chatId,
    });
    const message = messages.find((m) => m._id === args.messageId);
    if (!message) return { success: false, error: "Message not found" };

    const dslQuery = message.metadata?.dslQuery;
    if (!dslQuery) {
      return { success: false, error: "Message has no stored CHQL query to re-run" };
    }

    // Preserve the original page size so pagination stays stable; fall back
    // to the same default the MCP server uses.
    const prior = message.metadata?.apiResponse as
      | { page?: { pageSize?: number } }
      | undefined;
    const pageSize = prior?.page?.pageSize ?? DEFAULT_FETCH_PAGE_SIZE;

    const { client: mcpClient } = await connectAndDiscoverTools();
    if (!mcpClient) {
      return { success: false, error: "MCP server is unavailable" };
    }

    try {
      const result = await callMCPTool(mcpClient, "search_measurements", {
        query: dslQuery,
        pageNumber: args.pageNumber,
        pageSize,
      });

      if (result.isError) {
        return { success: false, error: result.text };
      }

      const envelope = parseSearchEnvelope(result.text);
      if (!envelope) {
        return { success: false, error: "Unexpected response shape from MCP" };
      }

      await ctx.runMutation(api.messages.patchApiResponse, {
        messageId: args.messageId,
        apiResponse: envelope,
      });

      return { success: true };
    } finally {
      await closeMCPClient(mcpClient);
    }
  },
});

/** Fallback page size when the original metadata didn't capture one. */
const DEFAULT_FETCH_PAGE_SIZE = 100;

/**
 * Auto-generates a short title for a chat based on the first user message.
 *
 * Called by the frontend via `useAction(api.ai.generateTitle)` after the
 * first message is sent. The title is used in the sidebar chat list.
 *
 * **Title generation strategy (in priority order):**
 * 1. If the chat already has a non-default title → return it unchanged
 * 2. If there are no messages or no user messages → return "New Chat"
 * 3. Ask the LLM for a 3-6 word summary
 * 4. Fallback → truncate the first user message to {@link TITLE_MAX_LENGTH} chars
 *
 * @param args.chatId - The ID of the chat to generate a title for
 * @returns The generated (or existing) title string
 */
export const generateTitle = action({
  args: {
    chatId: v.id("chats"),
    /**
     * The user's message text. When passed, the action skips the DB
     * roundtrip for the first message — the caller can fire generateTitle
     * **in parallel with** processMessage instead of waiting for it to
     * persist the message. This lets the title appear within ~1s of the
     * user pressing send, regardless of how long the assistant's reply takes.
     *
     * Omit to fall back to the legacy behaviour of reading the first user
     * message from the DB.
     */
    userMessage: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<string> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return "New Chat";

    const chat = await ctx.runQuery(api.chats.get, { chatId: args.chatId });
    if (!chat) return "New Chat";
    if (chat.title !== "New Chat") return chat.title;

    // Prefer the explicit userMessage arg; only hit the DB if we have to.
    let seedMessage: string | undefined = args.userMessage;
    if (!seedMessage) {
      const messages = await ctx.runQuery(api.messages.list, {
        chatId: args.chatId,
      });
      seedMessage = messages.find((m) => m.role === "user")?.content;
    }
    if (!seedMessage) return "New Chat";

    try {
      const model = getModel(DEFAULT_MODEL);
      const result = await generateText({
        model,
        maxOutputTokens: TITLE_MAX_TOKENS,
        system:
          "Generate a very short title (3-6 words, no quotes, no punctuation at end) summarizing the user's message. Reply in the same language the user wrote in. Reply with ONLY the title, nothing else.",
        messages: [{ role: "user", content: seedMessage }],
      });

      const title = result.text
        ? result.text
            .trim()
            .replace(/['"]+/g, "")
            .slice(0, LLM_TITLE_MAX_LENGTH)
        : truncateTitle(seedMessage);

      await ctx.runMutation(api.chats.updateTitle, {
        chatId: args.chatId,
        title,
      });
      return title;
    } catch (error) {
      console.error("Failed to generate title via LLM:", error);

      // Fallback: truncate the first message as the title
      const title = truncateTitle(seedMessage);
      try {
        await ctx.runMutation(api.chats.updateTitle, {
          chatId: args.chatId,
          title,
        });
      } catch (updateError) {
        console.error("Failed to update chat title in database:", updateError);
      }
      return title;
    }
  },
});
