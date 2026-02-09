"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "convex/_generated/api";
import { ChatMessages } from "@/components/chat/chat-messages";
import { ChatInput } from "@/components/chat/chat-input";
import { Skeleton } from "@/components/ui/skeleton";
import { MessageSquare } from "lucide-react";
import type { Id, Doc } from "convex/_generated/dataModel";

interface ChatAreaProps {
  chatId: Id<"chats"> | null;
  onChatCreated: (chatId: Id<"chats">) => void;
  user: Doc<"users">;
}

interface PendingMessage {
  content: string;
  key: string;
}

function MessagesSkeleton() {
  return (
    <div className="min-h-0 flex-1 px-4 py-6">
      <div className="mx-auto max-w-4xl">
        <div className="flex w-full max-w-md flex-col gap-2">
          <Skeleton className="h-20 w-4xl" />
        </div>
      </div>
    </div>
  );
}

export function ChatArea({ chatId, onChatCreated, user }: ChatAreaProps) {
  const messages = useQuery(
    api.messages.list,
    chatId ? { chatId } : "skip"
  );

  const [pendingMessage, setPendingMessage] = useState<PendingMessage | null>(null);
  const [typewriterId, setTypewriterId] = useState<string | null>(null);
  const [isWaitingForResponse, setIsWaitingForResponse] = useState(false);
  const initialLoadRef = useRef(true);
  const lastMessageCountRef = useRef(0);

  useEffect(() => {
    if (!messages) return;

    if (initialLoadRef.current) {
      initialLoadRef.current = false;
      lastMessageCountRef.current = messages.length;
      return;
    }

    if (messages.length > lastMessageCountRef.current) {
      const last = messages[messages.length - 1];
      lastMessageCountRef.current = messages.length;

      if (last.role === "user" && pendingMessage) {
        setPendingMessage(null);
      }

      if (last.role === "assistant") {
        setTypewriterId(last._id);
        setIsWaitingForResponse(false);
      }
    }
  }, [messages, pendingMessage]);

  useEffect(() => {
    initialLoadRef.current = true;
    lastMessageCountRef.current = 0;
    setPendingMessage(null);
    setTypewriterId(null);
    setIsWaitingForResponse(false);
  }, [chatId]);

  const handleOptimisticSend = useCallback((content: string) => {
    setPendingMessage({ content, key: `pending-${Date.now()}` });
    setIsWaitingForResponse(true);
  }, []);

  const handleTypewriterDone = useCallback(() => {
    setTypewriterId(null);
  }, []);

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
        <div className="px-4 pb-4">
          <ChatInput
            chatId={null}
            onChatCreated={onChatCreated}
            onOptimisticSend={handleOptimisticSend}
          />
        </div>
      </div>
    );
  }

  const isLoading = messages === undefined;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {isLoading ? (
        <MessagesSkeleton />
      ) : (
        <ChatMessages
          messages={messages}
          user={user}
          pendingMessage={pendingMessage}
          typewriterId={typewriterId}
          isWaitingForResponse={isWaitingForResponse}
          onTypewriterDone={handleTypewriterDone}
        />
      )}
      <div className="px-4 pb-4 pt-2">
        <ChatInput
          chatId={chatId}
          onChatCreated={onChatCreated}
          onOptimisticSend={handleOptimisticSend}
        />
      </div>
    </div>
  );
}
