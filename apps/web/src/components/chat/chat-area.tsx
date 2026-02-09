"use client";

import { useQuery } from "convex/react";
import { api } from "convex/_generated/api";
import { ChatMessages } from "@/components/chat/chat-messages";
import { ChatInput } from "@/components/chat/chat-input";
import { MessageSquare } from "lucide-react";
import type { Id, Doc } from "convex/_generated/dataModel";

interface ChatAreaProps {
  chatId: Id<"chats"> | null;
  onChatCreated: (chatId: Id<"chats">) => void;
  user: Doc<"users">;
}

export function ChatArea({ chatId, onChatCreated, user }: ChatAreaProps) {
  const messages = useQuery(
    api.messages.list,
    chatId ? { chatId } : "skip"
  );

  if (!chatId) {
    return (
      <div className="flex flex-1 flex-col">
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-muted">
            <MessageSquare className="size-7 text-muted-foreground" />
          </div>
          <div className="text-center">
            <h2 className="text-lg font-semibold">CHQL Chat</h2>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              Convert natural language into domain-specific queries. Start a
              conversation to begin.
            </p>
          </div>
        </div>
        <div className="border-t p-4">
          <ChatInput chatId={null} onChatCreated={onChatCreated} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <ChatMessages messages={messages ?? []} user={user} />
      <div className="border-t p-4">
        <ChatInput chatId={chatId} onChatCreated={onChatCreated} />
      </div>
    </div>
  );
}
