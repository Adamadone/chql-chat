"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Bot, User, Loader2, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { MarkdownContent } from "@/components/chat/markdown-content";
import { Button } from "@/components/ui/button";
import type { Doc } from "convex/_generated/dataModel";

interface Message {
  _id: string;
  content: string;
  role: "user" | "assistant";
  createdAt: number;
  metadata?: {
    dslQuery?: string;
    apiResponse?: unknown;
    error?: string;
  };
}

interface PendingMessage {
  content: string;
  key: string;
}

interface ChatMessagesProps {
  messages: Message[];
  user: Doc<"users">;
  pendingMessage: PendingMessage | null;
  typewriterId: string | null;
  isWaitingForResponse: boolean;
  onTypewriterDone: () => void;
}

const BOTTOM_THRESHOLD = 40;

export function ChatMessages({
  messages,
  user,
  pendingMessage,
  typewriterId,
  isWaitingForResponse,
  onTypewriterDone,
}: ChatMessagesProps) {
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const isLatchedRef = useRef(true);
  const [showJumpButton, setShowJumpButton] = useState(false);

  const getViewport = useCallback(() => {
    return scrollAreaRef.current?.querySelector<HTMLDivElement>(
      "[data-radix-scroll-area-viewport]"
    );
  }, []);

  const scrollToBottom = useCallback(() => {
    const viewport = getViewport();
    if (viewport) {
      viewport.scrollTop = viewport.scrollHeight;
    }
  }, [getViewport]);

  const smoothScrollToBottom = useCallback(() => {
    const viewport = getViewport();
    if (!viewport) return;

    const start = viewport.scrollTop;
    const target = viewport.scrollHeight - viewport.clientHeight;
    const distance = target - start;
    if (distance <= 0) return;

    const duration = Math.min(400, Math.max(150, distance * 0.5));
    const startTime = performance.now();

    const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

    const step = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      viewport.scrollTop = start + distance * easeOutCubic(progress);
      if (progress < 1) {
        requestAnimationFrame(step);
      }
    };

    requestAnimationFrame(step);
  }, [getViewport]);

  const handleLatchedScroll = useCallback(() => {
    if (isLatchedRef.current) {
      scrollToBottom();
    }
  }, [scrollToBottom]);

  useEffect(() => {
    const viewport = getViewport();
    if (!viewport) return;

    const onScroll = () => {
      const distanceFromBottom =
        viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
      const latched = distanceFromBottom <= BOTTOM_THRESHOLD;
      isLatchedRef.current = latched;
      setShowJumpButton(!latched);
    };

    viewport.addEventListener("scroll", onScroll, { passive: true });
    return () => viewport.removeEventListener("scroll", onScroll);
  }, [getViewport]);

  useEffect(() => {
    if (isLatchedRef.current) {
      scrollToBottom();
    }
  }, [messages.length, pendingMessage?.key, scrollToBottom]);

  useEffect(() => {
    if (pendingMessage) {
      isLatchedRef.current = true;
      setShowJumpButton(false);
    }
  }, [pendingMessage]);

  const handleJumpToBottom = useCallback(() => {
    isLatchedRef.current = true;
    setShowJumpButton(false);
    smoothScrollToBottom();
  }, [smoothScrollToBottom]);

  const showThinking = isWaitingForResponse && !typewriterId;

  if (messages.length === 0 && !pendingMessage) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-muted-foreground">
          No messages yet. Send a message to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="relative min-h-0 flex-1">
      <ScrollArea className="h-full" ref={scrollAreaRef}>
        <div className="mx-auto max-w-4xl space-y-6 px-4 py-6">
          {messages.map((message) => {
            if (message.role === "assistant" && message._id === typewriterId) {
              return (
                <TypewriterBubble
                  key={message._id}
                  message={message}
                  onDone={onTypewriterDone}
                  onProgress={handleLatchedScroll}
                />
              );
            }
            return (
              <MessageBubble
                key={message._id}
                message={message}
                user={user}
              />
            );
          })}
          {pendingMessage && (
            <PendingUserBubble
              content={pendingMessage.content}
              key={pendingMessage.key}
              user={user}
            />
          )}
          {showThinking && <ThinkingIndicator key="thinking" />}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>
      {showJumpButton && (
        <Button
          variant="outline"
          size="icon"
          className="absolute bottom-3 left-1/2 z-10 size-8 -translate-x-1/2 rounded-full shadow-md"
          onClick={handleJumpToBottom}
        >
          <ArrowDown className="size-4" />
        </Button>
      )}
    </div>
  );
}

interface MessageBubbleProps {
  message: Message;
  user: Doc<"users">;
}

function MessageBubble({ message, user }: MessageBubbleProps) {
  const isUser = message.role === "user";

  return (
    <div
      className={cn(
        "flex gap-3",
        isUser ? "justify-end" : "justify-start"
      )}
    >
      {!isUser && <BotAvatar />}
      <div
        className={cn(
          "max-w-[80%] rounded-xl px-4 py-2.5 text-sm leading-relaxed",
          isUser ? "bg-primary text-primary-foreground" : "bg-muted"
        )}
      >
        <DslBlock metadata={message.metadata} />
        {isUser ? (
          <div className="whitespace-pre-wrap">{message.content}</div>
        ) : (
          <MarkdownContent content={message.content} />
        )}
        <ErrorBlock metadata={message.metadata} />
      </div>
      {isUser && <UserAvatar user={user} />}
    </div>
  );
}

interface TypewriterBubbleProps {
  message: Message;
  onDone: () => void;
  onProgress: () => void;
}

const CHARS_PER_TICK = 3;
const TICK_MS = 14;

function TypewriterBubble({ message, onDone, onProgress }: TypewriterBubbleProps) {
  const [charIndex, setCharIndex] = useState(0);
  const text = message.content;
  const isDone = charIndex >= text.length;

  useEffect(() => {
    if (isDone) {
      onDone();
      return;
    }

    let raf: number;
    let last = 0;

    const step = (now: number) => {
      if (now - last >= TICK_MS) {
        last = now;
        setCharIndex((prev) => {
          const next = prev + CHARS_PER_TICK;
          return next >= text.length ? text.length : next;
        });
      }
      raf = requestAnimationFrame(step);
    };

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [isDone, text.length, onDone]);

  useEffect(() => {
    onProgress();
  }, [charIndex, onProgress]);

  const displayed = isDone ? text : text.slice(0, charIndex);

  return (
    <div className="animate-message-fade flex gap-3 justify-start">
      <BotAvatar />
      <div className="max-w-[80%] rounded-xl bg-muted px-4 py-2.5 text-sm leading-relaxed">
        <DslBlock metadata={message.metadata} />
        <div className="relative">
          <MarkdownContent content={displayed} />
          {!isDone && (
            <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-current align-middle" />
          )}
        </div>
        <ErrorBlock metadata={message.metadata} />
      </div>
    </div>
  );
}

interface PendingUserBubbleProps {
  content: string;
  user: Doc<"users">;
}

function PendingUserBubble({ content, user }: PendingUserBubbleProps) {
  return (
    <div className="animate-message-in flex gap-3 justify-end">
      <div className="max-w-[80%] rounded-xl bg-primary px-4 py-2.5 text-sm leading-relaxed text-primary-foreground">
        <div className="whitespace-pre-wrap">{content}</div>
      </div>
      <UserAvatar user={user} />
    </div>
  );
}

function ThinkingIndicator() {
  return (
    <div className="animate-message-fade flex gap-3 justify-start">
      <BotAvatar />
      <div className="flex items-center gap-2 rounded-xl bg-muted px-4 py-2.5 text-sm text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" />
        <span>Thinking...</span>
      </div>
    </div>
  );
}

function BotAvatar() {
  return (
    <Avatar size="sm" className="mt-0.5 shrink-0">
      <AvatarFallback className="bg-primary text-primary-foreground">
        <Bot className="size-3.5" />
      </AvatarFallback>
    </Avatar>
  );
}

function UserAvatar({ user }: { user: Doc<"users"> }) {
  return (
    <Avatar size="sm" className="mt-0.5 shrink-0">
      <AvatarImage src={user.image ?? undefined} />
      <AvatarFallback>
        <User className="size-3.5" />
      </AvatarFallback>
    </Avatar>
  );
}

function DslBlock({ metadata }: { metadata?: Message["metadata"] }) {
  if (!metadata?.dslQuery) return null;
  return (
    <div className="mb-2 rounded-md bg-background/50 p-2 font-mono text-xs">
      <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        DSL Query
      </div>
      <pre className="whitespace-pre-wrap">{metadata.dslQuery}</pre>
    </div>
  );
}

function ErrorBlock({ metadata }: { metadata?: Message["metadata"] }) {
  if (!metadata?.error) return null;
  return (
    <div className="mt-2 text-xs text-destructive">{metadata.error}</div>
  );
}
