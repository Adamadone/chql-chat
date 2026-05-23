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
  stripToolTags,
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
 * @see {@link processMessage} for where this is populated
 */
export interface ToolUseMetadata {
  /** The CHQL query string generated by Claude (if `search_measurements` was called). */
  dslQuery?: string;
  /** Raw JSON response from the chy.stat API (if the tool call succeeded). */
  apiResponse?: string;
  /** Error message if a tool call or the LLM pipeline failed. */
  error?: string;
  /** Ordered list of tool names invoked during this message (e.g. `["search_measurements"]`). */
  toolCalls?: string[];
}

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
 * - If connection fails → returns `{ client: null, tools: {} }`
 * - If connection succeeds but tool listing fails → disconnects and returns `{ client: null, tools: {} }`
 * - If both succeed → returns the connected client and AI SDK tools
 *
 * @returns An object with the MCP client (or null) and the discovered tools record
 */
export async function connectAndDiscoverTools(): Promise<{
  client: Client | null;
  tools: ToolSet;
}> {
  let client: Client | null = null;

  try {
    client = await createMCPClient();
  } catch (connectError) {
    console.error(
      "Failed to connect to MCP server, proceeding without tools:",
      connectError,
    );
    return { client: null, tools: {} };
  }

  try {
    const tools = await getMCPToolsAsAISDKTools(client);
    return { client, tools };
  } catch (toolListError) {
    console.error(
      "Connected to MCP server but failed to list tools:",
      toolListError,
    );
    await closeMCPClient(client);
    return { client: null, tools: {} };
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
 * Each tool's `execute` function delegates to {@link callMCPTool}.
 *
 * @param mcpClient - A connected MCP client
 * @returns A ToolSet record keyed by tool name
 */
async function getMCPToolsAsAISDKTools(
  mcpClient: Client,
): Promise<ToolSet> {
  const { tools: mcpTools } = await mcpClient.listTools();
  const toolSet: ToolSet = {};

  for (let i = 0; i < mcpTools.length; i++) {
    const mcpTool = mcpTools[i];
    const isLast = i === mcpTools.length - 1;
    toolSet[mcpTool.name] = {
      description: mcpTool.description ?? "",
      inputSchema: jsonSchema(mcpTool.inputSchema as Parameters<typeof jsonSchema>[0]),
      execute: async (args: Record<string, unknown>) => {
        return await callMCPTool(mcpClient, mcpTool.name, args);
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

      // Capture API response from tool results
      if (step.toolResults && step.toolResults.length > 0) {
        for (const toolResult of step.toolResults) {
          if (
            toolResult.toolName === "search_measurements" &&
            toolResult.output
          ) {
            const resultObj = toolResult.output as { text: string; isError: boolean };
            metadata = { ...metadata, apiResponse: resultObj.text };
            if (resultObj.isError) {
              metadata = { ...metadata, error: resultObj.text };
            }
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
      const { client: mcpClient, tools } = await connectAndDiscoverTools();

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
  },
  handler: async (ctx, args): Promise<string> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return "New Chat";

    const messages = await ctx.runQuery(api.messages.list, {
      chatId: args.chatId,
    });

    const chat = await ctx.runQuery(api.chats.get, { chatId: args.chatId });
    if (!chat || chat.title !== "New Chat" || messages.length === 0) {
      return chat?.title ?? "New Chat";
    }

    const firstUserMessage = messages.find((m) => m.role === "user");
    if (!firstUserMessage) return "New Chat";

    try {
      const model = getModel(DEFAULT_MODEL);
      const result = await generateText({
        model,
        maxOutputTokens: TITLE_MAX_TOKENS,
        system:
          "Generate a very short title (3-6 words, no quotes, no punctuation at end) summarizing the user's message. Reply with ONLY the title, nothing else.",
        messages: [{ role: "user", content: firstUserMessage.content }],
      });

      const title = result.text
        ? result.text
            .trim()
            .replace(/['"]+/g, "")
            .slice(0, LLM_TITLE_MAX_LENGTH)
        : truncateTitle(firstUserMessage.content);

      await ctx.runMutation(api.chats.updateTitle, {
        chatId: args.chatId,
        title,
      });
      return title;
    } catch (error) {
      console.error("Failed to generate title via LLM:", error);

      // Fallback: truncate the first message as the title
      const title = truncateTitle(firstUserMessage.content);
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
