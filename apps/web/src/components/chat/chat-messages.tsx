"use client";

import { useEffect, useRef } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Bot, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { Session } from "next-auth";

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

interface ChatMessagesProps {
  messages: Message[];
  session: Session | null;
}

export function ChatMessages({ messages, session }: ChatMessagesProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-muted-foreground">
          No messages yet. Send a message to get started.
        </p>
      </div>
    );
  }

  return (
    <ScrollArea className="flex-1">
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-6">
        {messages.map((message) => (
          <div
            key={message._id}
            className={cn(
              "flex gap-3",
              message.role === "user" ? "justify-end" : "justify-start"
            )}
          >
            {message.role === "assistant" && (
              <Avatar size="sm" className="mt-0.5 shrink-0">
                <AvatarFallback className="bg-primary text-primary-foreground">
                  <Bot className="size-3.5" />
                </AvatarFallback>
              </Avatar>
            )}
            <div
              className={cn(
                "max-w-[80%] rounded-xl px-4 py-2.5 text-sm leading-relaxed",
                message.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted"
              )}
            >
              {message.metadata?.dslQuery && (
                <div className="mb-2 rounded-md bg-background/50 p-2 font-mono text-xs">
                  <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    DSL Query
                  </div>
                  <pre className="whitespace-pre-wrap">
                    {message.metadata.dslQuery}
                  </pre>
                </div>
              )}
              <div className="whitespace-pre-wrap">{message.content}</div>
              {message.metadata?.error && (
                <div className="mt-2 text-xs text-destructive">
                  {message.metadata.error}
                </div>
              )}
            </div>
            {message.role === "user" && (
              <Avatar size="sm" className="mt-0.5 shrink-0">
                <AvatarImage src={session?.user?.image ?? undefined} />
                <AvatarFallback>
                  <User className="size-3.5" />
                </AvatarFallback>
              </Avatar>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  );
}
