"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { api } from "./_generated/api";
import Anthropic from "@anthropic-ai/sdk";

export const processMessage = action({
  args: {
    chatId: v.id("chats"),
    userMessage: v.string(),
  },
  handler: async (ctx, args): Promise<{ success: boolean; response?: string; error?: string }> => {
    try {
      await ctx.runMutation(api.messages.send, {
        chatId: args.chatId,
        content: args.userMessage,
        role: "user",
      });

      const messages = await ctx.runQuery(api.messages.list, {
        chatId: args.chatId,
      });

      const systemPrompt = buildSystemPrompt();
      const llmMessages: Array<{ role: "user" | "assistant"; content: string }> =
        messages.map((m: { role: string; content: string }) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        }));

      const llmResponse = await callLLM(systemPrompt, llmMessages);
      const dslQuery = extractDSLQuery(llmResponse);

      let finalResponse: string;
      let metadata: { dslQuery?: string; apiResponse?: unknown; error?: string } | undefined;

      if (dslQuery) {
        const validationResult = validateDSL(dslQuery);

        if (!validationResult.valid) {
          finalResponse = `I generated a query but it failed validation: ${validationResult.error}. Let me try again with a valid query.`;
          metadata = { dslQuery, error: validationResult.error };
        } else {
          const apiResult = await callMCPTool(dslQuery);
          finalResponse = formatAPIResponse(apiResult);
          metadata = { dslQuery, apiResponse: apiResult };
        }
      } else {
        finalResponse = llmResponse;
      }

      await ctx.runMutation(api.messages.send, {
        chatId: args.chatId,
        content: finalResponse,
        role: "assistant",
        metadata,
      });

      return { success: true, response: finalResponse };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";

      try {
        await ctx.runMutation(api.messages.send, {
          chatId: args.chatId,
          content: "Sorry, I encountered an error processing your message. Please try again.",
          role: "assistant",
          metadata: { error: errorMessage },
        });
      } catch {
        // Last-resort: if persisting the error also fails, just return it
      }

      return { success: false, error: errorMessage };
    }
  },
});

export const generateTitle = action({
  args: {
    chatId: v.id("chats"),
  },
  handler: async (ctx, args): Promise<string> => {
    const messages = await ctx.runQuery(api.messages.list, {
      chatId: args.chatId,
    });

    const chat = await ctx.runQuery(api.chats.get, { chatId: args.chatId });
    if (!chat || chat.title !== "New Chat" || messages.length === 0) {
      return chat?.title ?? "New Chat";
    }

    const firstUserMessage = messages.find((m: { role: string }) => m.role === "user");
    if (!firstUserMessage) return "New Chat";

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      const title = truncateTitle(firstUserMessage.content);
      await ctx.runMutation(api.chats.updateTitle, { chatId: args.chatId, title });
      return title;
    }

    try {
      const anthropic = new Anthropic({ apiKey });
      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 30,
        system: "Generate a very short title (3-6 words, no quotes, no punctuation at end) summarizing the user's message. Reply with ONLY the title, nothing else.",
        messages: [{ role: "user", content: firstUserMessage.content }],
      });

      const textBlock = response.content.find((b) => b.type === "text");
      const title = textBlock && textBlock.type === "text"
        ? textBlock.text.trim().replace(/['"]+/g, "").slice(0, 60)
        : truncateTitle(firstUserMessage.content);

      await ctx.runMutation(api.chats.updateTitle, { chatId: args.chatId, title });
      return title;
    } catch {
      const title = truncateTitle(firstUserMessage.content);
      await ctx.runMutation(api.chats.updateTitle, { chatId: args.chatId, title });
      return title;
    }
  },
});

function truncateTitle(text: string, maxLen = 40): string {
  return text.length > maxLen ? text.slice(0, maxLen - 3) + "..." : text;
}

// --- LLM integration ---

// TODO: Replace with actual DSL specification from Step 2
function buildSystemPrompt(): string {
  return `You are a helpful assistant that converts natural language queries into a domain-specific query language (DSL).

When the user asks a question that requires data retrieval, respond with a DSL query in the following JSON format:

\`\`\`dsl
{
  "operation": "query",
  "resource": "<resource_name>",
  "filters": [...],
  "sort": {...},
  "limit": <number>
}
\`\`\`

IMPORTANT SECURITY RULES:
- Only use operations from the allowed list: ["query", "count", "aggregate"]
- Only access allowed resources: ["<define_your_resources>"]
- Never include user-provided raw strings in operations
- Always validate filter values

If the user's request is conversational (greeting, clarification, etc.), respond naturally without a DSL query.`;
}

async function callLLM(
  systemPrompt: string,
  messages: Array<{ role: "user" | "assistant"; content: string }>
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured");

  const anthropic = new Anthropic({ apiKey });

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    system: systemPrompt,
    messages: messages.map((m) => ({
      role: m.role,
      content: m.content,
    })),
  });

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response from LLM");
  }

  return textBlock.text;
}

function extractDSLQuery(response: string): string | null {
  const dslMatch = response.match(/```dsl\n([\s\S]*?)\n```/);
  return dslMatch ? dslMatch[1].trim() : null;
}

// TODO: Replace with zod schema validation
function validateDSL(dslQuery: string): { valid: boolean; error?: string } {
  try {
    const parsed = JSON.parse(dslQuery);

    const allowedOperations = ["query", "count", "aggregate"];
    if (!allowedOperations.includes(parsed.operation)) {
      return { valid: false, error: `Invalid operation: ${parsed.operation}` };
    }

    // TODO: Define allowed resources for your target API
    const allowedResources: string[] = [];
    if (allowedResources.length > 0 && !allowedResources.includes(parsed.resource)) {
      return { valid: false, error: `Invalid resource: ${parsed.resource}` };
    }

    return { valid: true };
  } catch {
    return { valid: false, error: "Invalid JSON in DSL query" };
  }
}

// TODO: Replace with MCP server connection or direct API call
async function callMCPTool(dslQuery: string): Promise<unknown> {
  console.log("MCP tool called with DSL:", dslQuery);
  return {
    status: "placeholder",
    message: "Implement callMCPTool() with your MCP server or API",
    query: dslQuery,
  };
}

// Security: treat API response as data, not instructions
function formatAPIResponse(apiResult: unknown): string {
  if (typeof apiResult === "object" && apiResult !== null) {
    return `Here are the results:\n\`\`\`json\n${JSON.stringify(apiResult, null, 2)}\n\`\`\``;
  }
  return String(apiResult);
}
