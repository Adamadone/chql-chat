"use client";

import { useState, useRef, useCallback } from "react";
import { useMutation, useAction, useQuery } from "convex/react";
import { api } from "convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Send, Square } from "lucide-react";
import { useMessageHistory } from "@/hooks/use-message-history";
import { useTextareaAutoResize } from "@/hooks/use-textarea-auto-resize";
import type { Id } from "convex/_generated/dataModel";

interface ChatInputProps {
  chatId: Id<"chats"> | null;
  onChatCreated: (chatId: Id<"chats">) => void;
  onOptimisticSend: (content: string) => void;
  isSending: boolean;
  onSendingChange: (sending: boolean) => void;
  userMessageHistory: string[];
}

export function ChatInput({
  chatId,
  onChatCreated,
  onOptimisticSend,
  isSending,
  onSendingChange,
  userMessageHistory,
}: ChatInputProps) {
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const activeChatRef = useRef<Id<"chats"> | null>(null);
  const abortedRef = useRef(false);

  const createChat = useMutation(api.chats.create);
  const emptyChat = useQuery(api.chats.findEmpty);
  const processMessage = useAction(api.ai.processMessage);
  const generateTitle = useAction(api.ai.generateTitle);
  const interruptMessage = useMutation(api.messages.interrupt);

  useTextareaAutoResize(textareaRef, input);
  const { handleHistoryKeyDown, resetHistory } = useMessageHistory(
    userMessageHistory,
    input,
    setInput,
    isSending,
    textareaRef,
  );

  const handleSend = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || isSending) return;

    onSendingChange(true);
    abortedRef.current = false;
    resetHistory();
    setInput("");
    onOptimisticSend(trimmed);

    try {
      let targetChatId = chatId;

      if (!targetChatId) {
        if (emptyChat) {
          targetChatId = emptyChat._id;
        } else {
          targetChatId = await createChat({});
        }
        onChatCreated(targetChatId);
      }

      activeChatRef.current = targetChatId;

      const result = await processMessage({
        chatId: targetChatId,
        userMessage: trimmed,
      });

      if (abortedRef.current) return;

      if (!result.success) {
        console.error("AI processing failed:", result.error);
      }

      generateTitle({ chatId: targetChatId }).catch(console.error);
    } catch (error) {
      if (abortedRef.current) return;
      console.error("Failed to send message:", error);
    } finally {
      if (!abortedRef.current) {
        onSendingChange(false);
      }
      textareaRef.current?.focus();
    }
  }, [input, isSending, chatId, emptyChat, createChat, onChatCreated, onOptimisticSend, onSendingChange, processMessage, generateTitle]);

  const handleInterrupt = useCallback(async () => {
    abortedRef.current = true;
    const targetChatId = activeChatRef.current ?? chatId;
    if (targetChatId) {
      try {
        await interruptMessage({ chatId: targetChatId });
      } catch (error) {
        console.error("Failed to interrupt:", error);
      }
    }
    onSendingChange(false);
    textareaRef.current?.focus();
  }, [chatId, interruptMessage, onSendingChange]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
      return;
    }

    handleHistoryKeyDown(e);
  };

  return (
    <div className="mx-auto w-full max-w-4xl">
      <div className="relative rounded-2xl border border-border/50 bg-card shadow-md transition-all duration-200 focus-within:shadow-lg focus-within:border-primary/30 focus-within:ring-1 focus-within:ring-primary/20">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            resetHistory();
          }}
          onKeyDown={handleKeyDown}
          placeholder="Type a message... (Enter to send, Shift+Enter for new line)"
          className="block w-full resize-none bg-transparent px-4 pt-3 pb-12 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
          rows={3}
          disabled={isSending}
        />
        <div className="absolute right-2.5 bottom-2.5">
          {isSending ? (
            <Button
              size="icon-sm"
              variant="destructive"
              className="rounded-xl transition-transform duration-150 active:scale-95"
              onClick={handleInterrupt}
            >
              <Square className="size-3.5" />
            </Button>
          ) : (
            <Button
              size="icon-sm"
              className="rounded-xl transition-transform duration-150 active:scale-95"
              onClick={handleSend}
              disabled={!input.trim()}
            >
              <Send className="size-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
