"use client";

import { useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Bot, User, Loader2, ArrowDown, ChevronRight, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import { MarkdownContent } from "@/components/chat/markdown-content";
import { Button } from "@/components/ui/button";
import { useAutoScroll } from "@/hooks/use-auto-scroll";
import { useTypewriter } from "@/hooks/use-typewriter";
import type { Doc } from "convex/_generated/dataModel";

interface Message {
  _id: string;
  content: string;
  role: "user" | "assistant";
  createdAt: number;
  interrupted?: boolean;
  metadata?: {
    dslQuery?: string;
    apiResponse?: unknown;
    error?: string;
    toolCalls?: string[];
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
  activeToolCall: string | null;
}

export function ChatMessages({
  messages,
  user,
  pendingMessage,
  typewriterId,
  isWaitingForResponse,
  onTypewriterDone,
  activeToolCall,
}: ChatMessagesProps) {
  const { scrollAreaRef, showJumpButton, handleJumpToBottom, handleLatchedScroll } =
    useAutoScroll({
      deps: [messages.length, pendingMessage?.key],
      pendingMessage,
    });

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
        <div className="mx-auto max-w-4xl space-y-5 px-4 py-6">
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
          {showThinking && <ThinkingIndicator activeToolCall={activeToolCall} />}
          <div />
        </div>
      </ScrollArea>

      {/* Jump to bottom — animated in/out */}
      <div
        className={cn(
          "absolute bottom-3 left-1/2 z-10 -translate-x-1/2 transition-all duration-200",
          showJumpButton
            ? "translate-y-0 opacity-100"
            : "translate-y-2 opacity-0 pointer-events-none"
        )}
      >
        <Button
          variant="outline"
          size="icon"
          className="size-8 rounded-full shadow-md bg-card"
          onClick={handleJumpToBottom}
        >
          <ArrowDown className="size-4" />
        </Button>
      </div>
    </div>
  );
}

interface MessageBubbleProps {
  message: Message;
  user: Doc<"users">;
}

function MessageBubble({ message, user }: MessageBubbleProps) {
  const isUser = message.role === "user";

  if (message.interrupted) {
    return (
      <div className="flex gap-3 justify-start animate-message-fade">
        <BotAvatar />
        <div className="max-w-[80%] rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-2.5 text-sm leading-relaxed text-destructive dark:bg-destructive/10">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex gap-3 animate-message-fade",
        isUser ? "justify-end" : "justify-start"
      )}
    >
      {!isUser && <BotAvatar />}
      <div
        className={cn(
          "max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
          isUser
            ? "bg-primary text-primary-foreground shadow-sm"
            : "bg-muted/70 dark:bg-muted/50"
        )}
      >
        <ToolCallBlock metadata={message.metadata} />
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

function TypewriterBubble({ message, onDone, onProgress }: TypewriterBubbleProps) {
  const { displayed, isDone } = useTypewriter(message.content, onDone, onProgress);

  return (
    <div className="animate-message-fade flex gap-3 justify-start">
      <BotAvatar />
      <div className="max-w-[80%] rounded-2xl bg-muted/70 dark:bg-muted/50 px-4 py-2.5 text-sm leading-relaxed">
        <ToolCallBlock metadata={message.metadata} />
        <div className="relative">
          <MarkdownContent content={displayed} />
          {!isDone && (
            <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-primary align-middle rounded-full" />
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
      <div className="max-w-[80%] rounded-2xl bg-primary px-4 py-2.5 text-sm leading-relaxed text-primary-foreground shadow-sm">
        <div className="whitespace-pre-wrap">{content}</div>
      </div>
      <UserAvatar user={user} />
    </div>
  );
}

function ThinkingIndicator({ activeToolCall }: { activeToolCall: string | null }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="animate-message-fade flex gap-3 justify-start">
      <BotAvatar />
      <div className="rounded-2xl bg-muted/70 dark:bg-muted/50 px-4 py-2.5 text-sm text-muted-foreground">
        {!activeToolCall ? (
          <div className="flex items-center gap-2">
            <div className="flex gap-1">
              <span className="size-1.5 rounded-full bg-primary/60 animate-bounce [animation-delay:0ms]" />
              <span className="size-1.5 rounded-full bg-primary/60 animate-bounce [animation-delay:150ms]" />
              <span className="size-1.5 rounded-full bg-primary/60 animate-bounce [animation-delay:300ms]" />
            </div>
            <span>Thinking...</span>
          </div>
        ) : (
          <div>
            <button
              type="button"
              onClick={() => setExpanded((prev) => !prev)}
              className="flex items-center gap-2 transition-colors hover:text-foreground"
            >
              <Loader2 className="size-3.5 animate-spin text-primary" />
              <span>Calling 1 tool</span>
              <ChevronRight
                className={cn(
                  "size-3 transition-transform duration-200",
                  expanded && "rotate-90"
                )}
              />
            </button>
            <div
              className={cn(
                "grid transition-all duration-300 ease-out",
                expanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
              )}
            >
              <div className="overflow-hidden">
                <code className="mt-1.5 inline-block rounded-md bg-background/60 px-2 py-1 text-[11px] font-mono text-foreground">
                  {activeToolCall}
                </code>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function BotAvatar() {
  return (
    <Avatar size="sm" className="mt-0.5 shrink-0">
      <AvatarFallback className="bg-primary/10 text-primary">
        <Bot className="size-3.5" />
      </AvatarFallback>
    </Avatar>
  );
}

function UserAvatar({ user }: { user: Doc<"users"> }) {
  return (
    <Avatar size="sm" className="mt-0.5 shrink-0">
      <AvatarImage src={user.image ?? undefined} />
      <AvatarFallback className="bg-primary text-primary-foreground">
        <User className="size-3.5" />
      </AvatarFallback>
    </Avatar>
  );
}

function ToolCallBlock({ metadata }: { metadata?: Message["metadata"] }) {
  const [expanded, setExpanded] = useState(false);
  const toolCalls = metadata?.toolCalls;

  if (!toolCalls || toolCalls.length === 0) return null;

  const count = toolCalls.length;
  const label = `Called ${count} tool${count > 1 ? "s" : ""}`;

  return (
    <div className="mb-2">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="group flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <Wrench className="size-3" />
        <span>{label}</span>
        <ChevronRight
          className={cn(
            "size-3 transition-transform duration-200",
            expanded && "rotate-90"
          )}
        />
      </button>
      <div
        className={cn(
          "grid transition-all duration-300 ease-out",
          expanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        )}
      >
        <div className="overflow-hidden">
          <div className="flex flex-wrap gap-1.5 pt-1.5">
            {toolCalls.map((name, i) => (
              <code
                key={i}
                className="rounded-md bg-background/60 px-2 py-0.5 text-[11px] font-mono"
              >
                {name}
              </code>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ErrorBlock({ metadata }: { metadata?: Message["metadata"] }) {
  if (!metadata?.error) return null;
  return (
    <div className="mt-2 text-xs text-destructive">{metadata.error}</div>
  );
}
