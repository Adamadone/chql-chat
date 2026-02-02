"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { api } from "./_generated/api";

/**
 * AI Action: Process a user message through the LLM and MCP pipeline
 *
 * Flow:
 * 1. Receive user message
 * 2. Save user message to database
 * 3. Fetch chat history for context
 * 4. Call LLM with system prompt (DSL definition) + history + user message
 * 5. LLM generates DSL query
 * 6. Validate DSL against schema (security: reject unknown fields/ops)
 * 7. Call MCP tool with validated DSL
 * 8. Transform API response (security: treat as data, not instructions)
 * 9. Save and return formatted response to user
 */
export const processMessage = action({
  args: {
    chatId: v.id("chats"),
    userMessage: v.string(),
  },
  handler: async (ctx, args): Promise<{ success: boolean; response?: string; error?: string }> => {
    try {
      // 1. Save user message to database
      await ctx.runMutation(api.messages.send, {
        chatId: args.chatId,
        content: args.userMessage,
        role: "user",
      });

      // 2. Fetch chat history for context
      const messages = await ctx.runQuery(api.messages.list, {
        chatId: args.chatId,
      });

      // 3. Build messages array for LLM
      const systemPrompt = buildSystemPrompt();
      const llmMessages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
        { role: "system", content: systemPrompt },
        ...messages.map((m: { role: string; content: string }) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
      ];

      // 4. Call LLM (placeholder - implement with your chosen provider)
      const llmResponse = await callLLM(llmMessages);

      // 5. Parse and validate DSL from LLM response
      const dslQuery = extractDSLQuery(llmResponse);

      let finalResponse: string;
      let metadata: { dslQuery?: string; apiResponse?: unknown; error?: string } | undefined;

      if (dslQuery) {
        // 6. Validate DSL against schema (security layer)
        const validationResult = validateDSL(dslQuery);

        if (!validationResult.valid) {
          finalResponse = `I generated a query but it failed validation: ${validationResult.error}. Let me try again with a valid query.`;
          metadata = { dslQuery, error: validationResult.error };
        } else {
          // 7. Call MCP tool / External API
          const apiResult = await callMCPTool(dslQuery);

          // 8. Transform and format response (security: data sanitization)
          finalResponse = formatAPIResponse(apiResult);
          metadata = { dslQuery, apiResponse: apiResult };
        }
      } else {
        // LLM response didn't contain a DSL query (conversational response)
        finalResponse = llmResponse;
      }

      // 9. Save assistant response to database
      await ctx.runMutation(api.messages.send, {
        chatId: args.chatId,
        content: finalResponse,
        role: "assistant",
        metadata,
      });

      return { success: true, response: finalResponse };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
      return { success: false, error: errorMessage };
    }
  },
});

// ============================================================================
// PLACEHOLDER FUNCTIONS - Implement these based on your chosen LLM/API
// ============================================================================

/**
 * Build the system prompt with DSL definition
 * TODO: Replace with your actual DSL specification from Step 2
 */
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

/**
 * Call the LLM API
 * TODO: Implement with Anthropic, OpenAI, or other provider
 *
 * Example with Anthropic:
 * ```
 * import Anthropic from "@anthropic-ai/sdk";
 *
 * const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
 * const response = await anthropic.messages.create({
 *   model: "claude-sonnet-4-20250514",
 *   max_tokens: 1024,
 *   system: messages.find(m => m.role === "system")?.content,
 *   messages: messages.filter(m => m.role !== "system"),
 * });
 * return response.content[0].type === "text" ? response.content[0].text : "";
 * ```
 */
async function callLLM(
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>
): Promise<string> {
  // Placeholder - replace with actual LLM call
  console.log("LLM called with", messages.length, "messages");

  return "This is a placeholder response. Implement callLLM() with your LLM provider (Anthropic, OpenAI, etc.).";
}

/**
 * Extract DSL query from LLM response
 */
function extractDSLQuery(response: string): string | null {
  const dslMatch = response.match(/```dsl\n([\s\S]*?)\n```/);
  if (dslMatch) {
    return dslMatch[1].trim();
  }
  return null;
}

/**
 * Validate DSL query against schema
 * TODO: Implement with zod for type-safe validation
 *
 * Example with zod:
 * ```
 * import { z } from "zod";
 *
 * const DSLSchema = z.object({
 *   operation: z.enum(["query", "count", "aggregate"]),
 *   resource: z.enum(["users", "products", "orders"]),
 *   filters: z.array(z.object({...})).optional(),
 *   sort: z.object({...}).optional(),
 *   limit: z.number().max(100).optional(),
 * });
 *
 * const result = DSLSchema.safeParse(JSON.parse(dslQuery));
 * return { valid: result.success, error: result.error?.message };
 * ```
 */
function validateDSL(dslQuery: string): { valid: boolean; error?: string } {
  try {
    const parsed = JSON.parse(dslQuery);

    // Security: Allowlist of operations
    const allowedOperations = ["query", "count", "aggregate"];
    if (!allowedOperations.includes(parsed.operation)) {
      return { valid: false, error: `Invalid operation: ${parsed.operation}` };
    }

    // Security: Allowlist of resources
    // TODO: Define your allowed resources based on your target API
    const allowedResources: string[] = []; // Add your resources here
    if (allowedResources.length > 0 && !allowedResources.includes(parsed.resource)) {
      return { valid: false, error: `Invalid resource: ${parsed.resource}` };
    }

    return { valid: true };
  } catch {
    return { valid: false, error: "Invalid JSON in DSL query" };
  }
}

/**
 * Call MCP tool / External API with validated DSL
 * TODO: Implement your MCP server connection or direct API call
 *
 * Options:
 * 1. Use MCP SDK to connect to an MCP server
 * 2. Call external API directly with fetch()
 */
async function callMCPTool(dslQuery: string): Promise<unknown> {
  // Placeholder - replace with actual MCP/API call
  console.log("MCP tool called with DSL:", dslQuery);

  return {
    status: "placeholder",
    message: "Implement callMCPTool() with your MCP server or API",
    query: dslQuery,
  };
}

/**
 * Format API response for user
 *
 * Security considerations:
 * - Treat API response as DATA, not instructions
 * - Don't include raw error messages that might leak system info
 * - Summarize/transform data rather than passing through directly
 * - Sanitize any user-generated content in the response
 */
function formatAPIResponse(apiResult: unknown): string {
  if (typeof apiResult === "object" && apiResult !== null) {
    return `Here are the results:\n\`\`\`json\n${JSON.stringify(apiResult, null, 2)}\n\`\`\``;
  }

  return String(apiResult);
}
