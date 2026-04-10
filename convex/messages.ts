import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

export const list = query({
  args: { chatId: v.id("chats") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const chat = await ctx.db.get(args.chatId);
    if (!chat || chat.userId !== userId) return [];

    return await ctx.db
      .query("messages")
      .withIndex("by_chat", (q) => q.eq("chatId", args.chatId))
      .order("asc")
      .collect();
  },
});

export const send = mutation({
  args: {
    chatId: v.id("chats"),
    content: v.string(),
    role: v.union(v.literal("user"), v.literal("assistant")),
    metadata: v.optional(
      v.object({
        dslQuery: v.optional(v.string()),
        apiResponse: v.optional(v.any()),
        error: v.optional(v.string()),
        toolCalls: v.optional(v.array(v.string())),
      })
    ),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const chat = await ctx.db.get(args.chatId);
    if (!chat || chat.userId !== userId) throw new Error("Not authorized");

    await ctx.db.patch(args.chatId, { updatedAt: Date.now() });

    return await ctx.db.insert("messages", {
      chatId: args.chatId,
      content: args.content,
      role: args.role,
      createdAt: Date.now(),
      metadata: args.metadata,
    });
  },
});

export const interrupt = mutation({
  args: { chatId: v.id("chats") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const chat = await ctx.db.get(args.chatId);
    if (!chat || chat.userId !== userId) throw new Error("Not authorized");

    await ctx.db.patch(args.chatId, { updatedAt: Date.now() });

    return await ctx.db.insert("messages", {
      chatId: args.chatId,
      content: "Message generation was interrupted.",
      role: "assistant",
      createdAt: Date.now(),
      interrupted: true,
    });
  },
});

export const clear = mutation({
  args: { chatId: v.id("chats") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const chat = await ctx.db.get(args.chatId);
    if (!chat || chat.userId !== userId) throw new Error("Not authorized");

    const messages = await ctx.db
      .query("messages")
      .withIndex("by_chat", (q) => q.eq("chatId", args.chatId))
      .collect();

    await Promise.all(messages.map((msg) => ctx.db.delete(msg._id)));
  },
});
