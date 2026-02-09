"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "convex/_generated/api";
import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { MessageSquare, Plus, Trash2, LogOut } from "lucide-react";
import type { Id } from "convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { Session } from "next-auth";

interface ChatSidebarProps {
  userId: Id<"users">;
  activeChatId: Id<"chats"> | null;
  onSelectChat: (chatId: Id<"chats"> | null) => void;
  session: Session | null;
}

export function ChatSidebar({
  userId,
  activeChatId,
  onSelectChat,
  session,
}: ChatSidebarProps) {
  const chats = useQuery(api.chats.list, { userId });
  const emptyChat = useQuery(api.chats.findEmpty, { userId });
  const createChat = useMutation(api.chats.create);
  const removeChat = useMutation(api.chats.remove);

  const handleNewChat = async () => {
    if (emptyChat) {
      onSelectChat(emptyChat._id);
      return;
    }
    const chatId = await createChat({ userId });
    onSelectChat(chatId);
  };

  const handleDeleteChat = async (
    e: React.MouseEvent,
    chatId: Id<"chats">
  ) => {
    e.stopPropagation();
    await removeChat({ chatId });
    if (activeChatId === chatId) {
      onSelectChat(null);
    }
  };

  const initials = session?.user?.name
    ? session.user.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "?";

  return (
    <TooltipProvider delayDuration={0}>
      <div className="flex h-full w-64 flex-col border-r bg-muted/30">
        <div className="flex h-14 items-center justify-between border-b px-4">
          <div className="flex items-center gap-2 font-semibold text-sm">
            <MessageSquare className="size-4" />
            CHQL Chat
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="icon-xs" variant="ghost" onClick={handleNewChat}>
                <Plus className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">New chat</TooltipContent>
          </Tooltip>
        </div>

        <ScrollArea className="flex-1 px-2 py-2">
          {!chats ? (
            <div className="space-y-2 px-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="h-9 animate-pulse rounded-md bg-muted"
                />
              ))}
            </div>
          ) : chats.length === 0 ? (
            <p className="px-2 py-8 text-center text-xs text-muted-foreground">
              No conversations yet.
              <br />
              Start a new chat!
            </p>
          ) : (
            <div className="space-y-1">
              {chats.map((chat) => (
                <button
                  key={chat._id}
                  onClick={() => onSelectChat(chat._id)}
                  className={cn(
                    "group flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-accent",
                    activeChatId === chat._id && "bg-accent"
                  )}
                >
                  <span className="truncate">{chat.title}</span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => handleDeleteChat(e, chat._id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            handleDeleteChat(
                              e as unknown as React.MouseEvent,
                              chat._id
                            );
                          }
                        }}
                        className="shrink-0 rounded p-1 opacity-0 transition-opacity hover:bg-destructive/10 group-hover:opacity-100"
                      >
                        <Trash2 className="size-3 text-muted-foreground" />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="right">Delete</TooltipContent>
                  </Tooltip>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>

        <Separator />
        <div className="flex items-center gap-2 p-3">
          <Avatar size="sm">
            <AvatarImage src={session?.user?.image ?? undefined} />
            <AvatarFallback className="text-xs">{initials}</AvatarFallback>
          </Avatar>
          <span className="flex-1 truncate text-xs font-medium">
            {session?.user?.name ?? session?.user?.email ?? "User"}
          </span>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon-xs"
                variant="ghost"
                onClick={() => signOut({ callbackUrl: "/" })}
              >
                <LogOut className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Sign out</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </TooltipProvider>
  );
}
