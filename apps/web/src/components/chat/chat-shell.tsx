"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { Authenticated, AuthLoading } from "convex/react";
import { api } from "convex/_generated/api";
import { ChatSidebar } from "@/components/chat/chat-sidebar";
import { ChatArea } from "@/components/chat/chat-area";
import { Skeleton } from "@/components/ui/skeleton";
import type { Id } from "convex/_generated/dataModel";

function ChatLayout() {
  const [activeChatId, setActiveChatId] = useState<Id<"chats"> | null>(null);
  const user = useQuery(api.users.currentUser);

  if (user === undefined) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
      </div>
    );
  }

  if (!user) {
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
        activeChatId={activeChatId}
        onSelectChat={setActiveChatId}
        user={user}
      />
      <ChatArea
        chatId={activeChatId}
        onChatCreated={setActiveChatId}
        user={user}
      />
    </div>
  );
}

export function ChatShell() {
  return (
    <>
      <AuthLoading>
        <div className="flex h-screen items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-64" />
          </div>
        </div>
      </AuthLoading>
      <Authenticated>
        <ChatLayout />
      </Authenticated>
    </>
  );
}
