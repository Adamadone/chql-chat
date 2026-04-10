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
    aggregateMetrics: v.optional(
      v.object({
        successRate: v.number(),
        avgResponseTimeMs: v.number(),
        avgInputTokens: v.number(),
        avgOutputTokens: v.number(),
        avgTotalTokens: v.number(),
        totalCostUsd: v.number(),
        chqlValidityRate: v.number(),
        toolUsageRate: v.number(),
        goldenSetAccuracy: v.number(),
      }),
    ),
  }).index("by_model", ["modelId"]),

  evalResults: defineTable({
    runId: v.id("evalRuns"),
    queryIndex: v.number(),
    userQuery: v.string(),
    category: v.string(),
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
      chqlValid: v.optional(v.boolean()),
      usedTool: v.boolean(),
      kkeysCorrect: v.optional(v.boolean()),
    }),
  }).index("by_run", ["runId"]),
});
