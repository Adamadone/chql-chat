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
        verificationScore: v.optional(v.number()),
        verificationDetails: v.optional(
          v.object({
            totalValues: v.number(),
            matchedValues: v.number(),
          })
        ),
      })
    ),
  }).index("by_chat", ["chatId"]),
});
