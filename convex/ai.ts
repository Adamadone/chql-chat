// See ./CONTEXT.md for module overview.

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
  routeSections,
  splitEnvelope,
  stripToolTags,
  type SearchEnvelope,
  type SectionId,
} from "@chql-chat/chql-core";
import {MAX_USER_MESSAGE_CHARS} from "./constants";

// ─── Constants ───────────────────────────────────────────────────────────────

/** Bound on tool-use steps per message (prevents infinite tool loops). */
const MAX_TOOL_ROUNDS = 5;
const DEFAULT_MODEL = "claude-haiku-4-5";
const CHAT_MAX_TOKENS = 4096;
const TITLE_MAX_TOKENS = 30;
const TITLE_MAX_LENGTH = 40;
const LLM_TITLE_MAX_LENGTH = 60;
// SDK default is 60s; chy.stat can exceed that on broad pageSize=1000 calls.
const MCP_CALL_TIMEOUT_MS = 180_000;

// ─── Provider factory ───────────────────────────────────────────────────────

// Prefixes: `claude-*` / `gpt-*` / `o*` / `local/*` (last uses VLLM_BASE_URL).
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

// ─── Types ──────────────────────────────────────────────────────────────────

/** Stored on assistant messages. `apiResponse` carries the full envelope; LLM only sees the digest. */
export interface ToolUseMetadata {
  dslQuery?: string;
  apiResponse?: SearchEnvelope;
  error?: string;
  toolCalls?: string[];
}

/** `toolCallId` → full envelope. Filled by the execute wrapper; drained by `onStepFinish`. */
export type EnvelopeSideChannel = Map<string, SearchEnvelope>;

interface ProcessMessageResult {
  success: boolean;
  response?: string;
  error?: string;
}

export interface ChatHistoryEntry {
  role: "user" | "assistant";
  content: string;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface LLMResult {
  response: string;
  metadata?: ToolUseMetadata;
  usage: TokenUsage;
}

/** Called with the tool name on start, `null` on finish — drives the UI's live tool indicator. */
type OnToolCallCallback = (toolName: string | null) => Promise<void>;

// ─── Text utilities ─────────────────────────────────────────────────────────

function truncateTitle(text: string, maxLen = TITLE_MAX_LENGTH): string {
  return text.length > maxLen ? text.slice(0, maxLen - 3) + "..." : text;
}

// ─── MCP client lifecycle ───────────────────────────────────────────────────

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

/** Swallows errors so cleanup failures don't mask the original error in a `finally`. */
export async function closeMCPClient(client: Client): Promise<void> {
  try {
    await client.close();
  } catch (error) {
    console.warn("Failed to close MCP client cleanly:", error);
  }
}

// Connect + listTools with graceful degradation. On either step's failure, returns null client + empty tools.
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

// ─── MCP tool interaction ───────────────────────────────────────────────────

// Wraps each MCP tool as an AI SDK `tool()`. The execute wrapper for search_measurements
// strips `rows` from the LLM-visible result and stashes the full envelope in `envelopes`.
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

        // Errors aren't envelopes — pass through so the LLM sees the error text.
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
          // Defensive: `__last__` sentinel covers the single-tool-call-per-step case.
          envelopes.set("__last__", envelope);
        }
        const { digest } = splitEnvelope(envelope);
        return { text: JSON.stringify(digest), isError: false };
      },
      // cacheControl on the last tool caches the entire tools block (Anthropic).
      ...(isLast ? { providerOptions: ANTHROPIC_CACHE_CONTROL } : {}),
    };
  }

  return toolSet;
}

/** Single MCP tool call; joins all text content blocks into a single string. */
export async function callMCPTool(
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

// ─── LLM tool-use loop ──────────────────────────────────────────────────────

/** AI SDK `generateText` with `stopWhen: stepCountIs(MAX_TOOL_ROUNDS)`; captures CHQL/envelope/tool-name metadata via `onStepFinish`. */
export async function runLLMWithTools(
  systemPrompt: SystemModelMessage[],
  chatHistory: ChatHistoryEntry[],
  tools: ToolSet,
  modelId: string,
  onToolCall?: OnToolCallCallback,
  envelopes?: EnvelopeSideChannel,
): Promise<LLMResult> {
  const model = getModel(modelId);

  // cacheControl on the last message → Anthropic prompt caching; others ignore providerOptions.
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
      console.log(
        `[LLM step] Token usage:`,
        JSON.stringify({
          input_tokens: step.usage.inputTokens,
          output_tokens: step.usage.outputTokens,
          total_tokens: step.usage.totalTokens,
        }),
      );

      if (step.toolCalls && step.toolCalls.length > 0) {
        for (const toolCall of step.toolCalls) {
          const existingCalls = metadata?.toolCalls ?? [];
          metadata = {
            ...metadata,
            toolCalls: [...existingCalls, toolCall.toolName],
          };

          await onToolCall?.(toolCall.toolName);

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

      // Drain the envelope side-channel; on error rows the channel is empty, fall back to error text.
      if (step.toolResults && step.toolResults.length > 0) {
        for (const toolResult of step.toolResults) {
          if (toolResult.toolName !== "search_measurements") continue;

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

// ─── Exported actions ───────────────────────────────────────────────────────

export const processMessage = action({
  args: {
    chatId: v.id("chats"),
    userMessage: v.string(),
    modelId: v.optional(v.string()),
    timeZone: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<ProcessMessageResult> => {
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
      await ctx.runMutation(api.messages.send, {
        chatId: args.chatId,
        content: args.userMessage,
        role: "user",
      });
      await ctx.runMutation(api.chats.setProcessing, {
        chatId: args.chatId,
        isProcessing: true,
      });

      const messages = await ctx.runQuery(api.messages.list, {
        chatId: args.chatId,
      });

      // Wrap user messages in nonce-tagged sentinels — injection defense; the system prompt treats tag contents as data.
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

      const { client: mcpClient, tools, envelopes } =
        await connectAndDiscoverTools();

      let finalResponse: string;
      let metadata: ToolUseMetadata | undefined;
      const modelId = args.modelId ?? DEFAULT_MODEL;

      try {
        // Prompt composer (local-model only): route in only the conditional
        // CHQL_REFERENCE sections the user actually mentioned, cutting prefill
        // tokens on the slow local path. Cloud providers keep `sections: 'all'`
        // so their Anthropic prompt-cache prefix stays stable. Kill-switch:
        // `PROMPT_COMPOSE_LOCAL=off` reverts local sessions to the full prompt
        // without a redeploy.
        const composeLocal = process.env.PROMPT_COMPOSE_LOCAL !== "off";
        const isLocal = modelId.startsWith("local/");
        const sections: SectionId[] | "all" =
          isLocal && composeLocal
            ? routeSections(
                // Route on raw user text from the DB, not the tag-wrapped
                // chatHistory built above — the router should see what the
                // human typed, not the injection-defense wrappers.
                messages
                  .filter((m) => m.role === "user")
                  .map((m) => m.content),
              )
            : "all";
        if (isLocal) {
          console.log(
            `[compose] modelId=${modelId} composeLocal=${composeLocal} sections=${
              sections === "all" ? "all" : `[${sections.join(",")}]`
            }`,
          );
        }
        const systemPrompt = buildSystemPrompt({
          hasTools: Object.keys(tools).length > 0,
          timeZone: args.timeZone,
          sections,
        });
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
        if (mcpClient) {
          await closeMCPClient(mcpClient);
        }
        await ctx.runMutation(api.chats.setActiveToolCall, {
          chatId: args.chatId,
          toolName: null,
        });
      }

      // Bail out if the user interrupted while we were generating.
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
      // Persist a visible error message so failures aren't silent.
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

      try {
        await ctx.runMutation(api.chats.setProcessing, {
          chatId: args.chatId,
          isProcessing: false,
        });
      } catch {
        // best-effort
      }

      return { success: false, error: errorMessage };
    }
  },
});

/** LLM-free: re-runs the stored CHQL at a new page and patches `metadata.apiResponse`. */
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

    // Preserve original page size so pagination stays stable.
    const prior = message.metadata?.apiResponse as
      | { page?: { pageSize?: number } }
      | undefined;
    const pageSize = prior?.page?.pageSize ?? DEFAULT_FETCH_PAGE_SIZE;

    // Skip listTools — we know the tool name. Saves one MCP RT per pagination click.
    let mcpClient: Client;
    try {
      mcpClient = await createMCPClient();
    } catch (err) {
      console.error("fetchPage: failed to connect to MCP server:", err);
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

const DEFAULT_FETCH_PAGE_SIZE = 100;

export const generateTitle = action({
  args: {
    chatId: v.id("chats"),
    // Pass to let the caller fire generateTitle in parallel with processMessage
    // (skips the DB roundtrip for the first user message).
    userMessage: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<string> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return "New Chat";

    const chat = await ctx.runQuery(api.chats.get, { chatId: args.chatId });
    if (!chat) return "New Chat";
    if (chat.title !== "New Chat") return chat.title;

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
