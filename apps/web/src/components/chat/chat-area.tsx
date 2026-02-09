"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
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
    <div className="mx-auto flex max-w-3xl flex-1 flex-col gap-6 px-4 py-6">
      <div className="flex gap-3">
        <Skeleton className="size-8 shrink-0 rounded-full" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-4 w-72" />
        </div>
      </div>
      <div className="flex justify-end gap-3">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="size-8 shrink-0 rounded-full" />
      </div>
      <div className="flex gap-3">
        <Skeleton className="size-8 shrink-0 rounded-full" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-64" />
          <Skeleton className="h-4 w-56" />
          <Skeleton className="h-4 w-36" />
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

  const markLoaded = useMutation(api.messages.markLoaded);

  const [pendingMessage, setPendingMessage] = useState<PendingMessage | null>(null);
  const [typewriterId, setTypewriterId] = useState<string | null>(null);
  const [isWaitingForResponse, setIsWaitingForResponse] = useState(false);
  const knownIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!messages) return;

    for (const msg of messages) {
      if (!knownIdsRef.current.has(msg._id)) {
        knownIdsRef.current.add(msg._id);

        if (msg.role === "user" && pendingMessage) {
          setPendingMessage(null);
        }

        if (msg.role === "assistant" && !msg.loaded) {
          setTypewriterId(msg._id);
          setIsWaitingForResponse(false);
        }
      }
    }
  }, [messages, pendingMessage]);

  useEffect(() => {
    knownIdsRef.current.clear();
    setPendingMessage(null);
    setTypewriterId(null);
    setIsWaitingForResponse(false);
  }, [chatId]);

  const handleOptimisticSend = useCallback((content: string) => {
    setPendingMessage({ content, key: `pending-${Date.now()}` });
    setIsWaitingForResponse(true);
  }, []);

  const handleTypewriterDone = useCallback((messageId: string) => {
    setTypewriterId(null);
    markLoaded({ messageId: messageId as Id<"messages"> });
  }, [markLoaded]);

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
      <div className="border-t p-4">
        <ChatInput
          chatId={chatId}
          onChatCreated={onChatCreated}
          onOptimisticSend={handleOptimisticSend}
        />
      </div>
    </div>
  );
}
