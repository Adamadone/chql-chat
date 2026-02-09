"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useMutation, useAction, useQuery } from "convex/react";
import { api } from "convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Send, Loader2 } from "lucide-react";
import type { Id } from "convex/_generated/dataModel";

interface ChatInputProps {
  chatId: Id<"chats"> | null;
  onChatCreated: (chatId: Id<"chats">) => void;
}

export function ChatInput({ chatId, onChatCreated }: ChatInputProps) {
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const createChat = useMutation(api.chats.create);
  const emptyChat = useQuery(api.chats.findEmpty);
  const processMessage = useAction(api.ai.processMessage);
  const generateTitle = useAction(api.ai.generateTitle);

  const adjustHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 300)}px`;
  }, []);

  useEffect(() => {
    adjustHeight();
  }, [input, adjustHeight]);

  const handleSend = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || isSending) return;

    setIsSending(true);
    setInput("");

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

      const result = await processMessage({
        chatId: targetChatId,
        userMessage: trimmed,
      });

      if (!result.success) {
        console.error("AI processing failed:", result.error);
      }

      generateTitle({ chatId: targetChatId }).catch(console.error);
    } catch (error) {
      console.error("Failed to send message:", error);
    } finally {
      setIsSending(false);
      textareaRef.current?.focus();
    }
  }, [input, isSending, chatId, emptyChat, createChat, onChatCreated, processMessage, generateTitle]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="relative rounded-xl border bg-background shadow-sm focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message... (Enter to send, Shift+Enter for new line)"
          className="block w-full resize-none bg-transparent px-4 pt-3 pb-12 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
          rows={3}
          disabled={isSending}
        />
        <div className="absolute right-2 bottom-2">
          <Button
            size="icon-sm"
            onClick={handleSend}
            disabled={!input.trim() || isSending}
          >
            {isSending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
