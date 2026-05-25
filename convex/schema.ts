import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

export default defineSchema({
  ...authTables,

  chats: defineTable({
    userId: v.id("users"),
    title: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
    activeToolCall: v.optional(v.string()),
    isProcessing: v.optional(v.boolean()),
  })
    .index("by_user", ["userId"])
    .index("by_user_updated", ["userId", "updatedAt"]),

  messages: defineTable({
    chatId: v.id("chats"),
    content: v.string(),
    role: v.union(v.literal("user"), v.literal("assistant")),
    createdAt: v.number(),
    interrupted: v.optional(v.boolean()),
    metadata: v.optional(
      v.object({
        dslQuery: v.optional(v.string()),
        apiResponse: v.optional(v.any()),
        error: v.optional(v.string()),
        toolCalls: v.optional(v.array(v.string())),
      })
    ),
  }).index("by_chat", ["chatId"]),

  // ─── Eval Tables ────────────────────────────────────────────────────────────

  evalRuns: defineTable({
    modelId: v.string(),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
    status: v.union(
      v.literal("running"),
      v.literal("completed"),
      v.literal("failed"),
    ),
    totalQueries: v.number(),
    methodologyVersion: v.optional(v.string()),
    aggregateMetrics: v.optional(
      v.object({
        successRate: v.number(),
        avgResponseTimeMs: v.number(),
        avgInputTokens: v.number(),
        avgOutputTokens: v.number(),
        avgTotalTokens: v.number(),
        totalCostUsd: v.number(),
        chqlParsesRate: v.number(),
        equivalenceRate: v.number(),
        toolUsageRate: v.number(),
      }),
    ),
  }).index("by_model", ["modelId"]),

  evalResults: defineTable({
    runId: v.id("evalRuns"),
    queryIndex: v.number(),
    userQuery: v.string(),
    questionId: v.optional(v.string()),
    category: v.optional(v.string()),
    expectedBehavior: v.optional(v.string()),
    expectedChql: v.optional(v.string()),
    expectedKkeys: v.optional(v.array(v.string())),
    actualChql: v.optional(v.string()),
    modelResponse: v.optional(v.string()),
    attempt: v.number(),
    success: v.boolean(),
    metrics: v.object({
      responseTimeMs: v.number(),
      inputTokens: v.number(),
      outputTokens: v.number(),
      totalTokens: v.number(),
      costUsd: v.optional(v.number()),
      usedTool: v.boolean(),
      kkeysCorrect: v.optional(v.boolean()),
      chqlParses: v.optional(v.boolean()),
      chqlEquivalent: v.optional(
        v.union(
          v.literal("equivalent"),
          v.literal("different"),
          v.literal("expected_empty"),
          v.literal("actual_error"),
        ),
      ),
      verdict: v.optional(v.string()),
      reason: v.optional(v.string()),
    }),
  }).index("by_run", ["runId"]),
});
