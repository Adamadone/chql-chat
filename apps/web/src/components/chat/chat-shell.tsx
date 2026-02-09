"use client";

import { useState } from "react";
import { useUserSync } from "@/hooks/use-user-sync";
import { ChatSidebar } from "@/components/chat/chat-sidebar";
import { ChatArea } from "@/components/chat/chat-area";
import { Skeleton } from "@/components/ui/skeleton";
import type { Id } from "convex/_generated/dataModel";
import { useSession } from "next-auth/react";

export function ChatShell() {
  const { userId, isLoading } = useUserSync();
  const [activeChatId, setActiveChatId] = useState<Id<"chats"> | null>(null);
  const { data: session } = useSession();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
      </div>
    );
  }

  if (!userId) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-muted-foreground">
          Unable to load user. Please try signing in again.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <ChatSidebar
        userId={userId}
        activeChatId={activeChatId}
        onSelectChat={setActiveChatId}
        session={session}
      />
      <ChatArea
        userId={userId}
        chatId={activeChatId}
        onChatCreated={setActiveChatId}
        session={session}
      />
    </div>
  );
}
