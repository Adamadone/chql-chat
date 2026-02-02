import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // User accounts (synced from Auth.js)
  users: defineTable({
    email: v.string(),
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_email", ["email"]),

  // Chat conversations
  chats: defineTable({
    userId: v.id("users"),
    title: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_updated", ["userId", "updatedAt"]),

  // Messages within chats
  messages: defineTable({
    chatId: v.id("chats"),
    content: v.string(),
    role: v.union(v.literal("user"), v.literal("assistant")),
    createdAt: v.number(),
    // For storing DSL queries and API responses
    metadata: v.optional(
      v.object({
        dslQuery: v.optional(v.string()),
        apiResponse: v.optional(v.any()),
        error: v.optional(v.string()),
      })
    ),
  }).index("by_chat", ["chatId"]),

  // Auth.js sessions (if needed)
  sessions: defineTable({
    userId: v.id("users"),
    sessionToken: v.string(),
    expires: v.number(),
  }).index("by_session_token", ["sessionToken"]),
});
