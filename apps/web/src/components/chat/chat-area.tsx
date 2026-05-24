"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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

interface PendingMessage {
  content: string;
  key: string;
}

const NEW_CHAT_DRAFT_KEY = "__new__";

export function ChatArea({ chatId, onChatCreated, user }: ChatAreaProps) {
  const messages = useQuery(
    api.messages.list,
    chatId ? { chatId } : "skip"
  );
  const chat = useQuery(
    api.chats.get,
    chatId ? { chatId } : "skip"
  );

  const [pendingMessage, setPendingMessage] = useState<PendingMessage | null>(null);
  const [typewriterId, setTypewriterId] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  // Drafts in a ref (not state) so keystrokes don't re-render the expensive ChatMessages subtree.
  const draftsRef = useRef<Map<string, string>>(new Map());

  const getDraft = useCallback((key: Id<"chats"> | null) => {
    return draftsRef.current.get(key ?? NEW_CHAT_DRAFT_KEY) ?? "";
  }, []);
  const setDraft = useCallback((key: Id<"chats"> | null, value: string) => {
    const k = key ?? NEW_CHAT_DRAFT_KEY;
    if (value === "") draftsRef.current.delete(k);
    else draftsRef.current.set(k, value);
  }, []);

  const initialLoadRef = useRef(true);
  const lastMessageCountRef = useRef(0);

  // Server isProcessing survives chat switches; pendingMessage covers the gap before the server knows.
  const isWaitingForResponse =
    chat?.isProcessing === true || pendingMessage !== null;

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
        if (!last.interrupted) {
          setTypewriterId(last._id);
        }
      }
    }
  }, [messages, pendingMessage]);

  useEffect(() => {
    initialLoadRef.current = true;
    lastMessageCountRef.current = 0;
    setPendingMessage(null);
    setTypewriterId(null);
    setIsSending(false);
  }, [chatId]);

  const handleOptimisticSend = useCallback((content: string) => {
    setPendingMessage({ content, key: `pending-${Date.now()}` });
  }, []);

  const handleTypewriterDone = useCallback(() => {
    setTypewriterId(null);
  }, []);

  const handleSendingChange = useCallback((sending: boolean) => {
    setIsSending(sending);
  }, []);

  const userMessageHistory = (messages ?? [])
    .filter((m) => m.role === "user")
    .map((m) => m.content)
    .reverse();

  if (!chatId) {
    return (
      <div className="flex flex-1 flex-col">
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/10">
            <MessageSquare className="size-7 text-primary" />
          </div>
          <div className="text-center">
            <h2 className="text-lg font-semibold">CHQL Chat</h2>
            <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-muted-foreground">
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
            isSending={isSending}
            onSendingChange={handleSendingChange}
            userMessageHistory={userMessageHistory}
            getDraft={getDraft}
            setDraft={setDraft}
          />
        </div>
      </div>
    );
  }

  const isLoading = messages === undefined;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {isLoading ? (
        <div className="min-h-0 flex-1 px-4 py-6"/>
      ) : (
        <ChatMessages
          chatId={chatId}
          messages={messages}
          user={user}
          pendingMessage={pendingMessage}
          typewriterId={typewriterId}
          isWaitingForResponse={isWaitingForResponse}
          onTypewriterDone={handleTypewriterDone}
          activeToolCall={chat?.activeToolCall ?? null}
        />
      )}
      <div className="px-4 pb-4 pt-2">
        <ChatInput
          chatId={chatId}
          onChatCreated={onChatCreated}
          onOptimisticSend={handleOptimisticSend}
          isSending={isSending}
          onSendingChange={handleSendingChange}
          userMessageHistory={userMessageHistory}
          getDraft={getDraft}
          setDraft={setDraft}
        />
      </div>
    </div>
  );
}
