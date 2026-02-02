import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

/**
 * List all chats for a user, ordered by most recently updated
 */
export const list = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("chats")
      .withIndex("by_user_updated", (q) => q.eq("userId", args.userId))
      .order("desc")
      .collect();
  },
});

/**
 * Get a single chat by ID
 */
export const get = query({
  args: { chatId: v.id("chats") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.chatId);
  },
});

/**
 * Create a new chat conversation
 */
export const create = mutation({
  args: {
    userId: v.id("users"),
    title: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("chats", {
      userId: args.userId,
      title: args.title ?? "New Chat",
      createdAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Update chat title
 */
export const updateTitle = mutation({
  args: {
    chatId: v.id("chats"),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.chatId, {
      title: args.title,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Delete a chat and all its messages
 */
export const remove = mutation({
  args: { chatId: v.id("chats") },
  handler: async (ctx, args) => {
    // Delete all messages in the chat
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_chat", (q) => q.eq("chatId", args.chatId))
      .collect();

    await Promise.all(messages.map((msg) => ctx.db.delete(msg._id)));

    // Delete the chat itself
    await ctx.db.delete(args.chatId);
  },
});
