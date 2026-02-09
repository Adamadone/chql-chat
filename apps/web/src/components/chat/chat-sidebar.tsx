"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "convex/_generated/api";
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
import type { Id, Doc } from "convex/_generated/dataModel";
import { cn } from "@/lib/utils";

const TITLE_CHARS_PER_FRAME = 2;
const TITLE_FRAME_INTERVAL = 18;

function useAnimatedTitle(title: string) {
  const prevRef = useRef(title);
  const [displayed, setDisplayed] = useState(title);

  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = title;

    if (prev === "New Chat" && title !== "New Chat") {
      setDisplayed("");
      let index = 0;
      let raf: number;
      let last = 0;

      const step = (time: number) => {
        if (time - last >= TITLE_FRAME_INTERVAL) {
          last = time;
          index += TITLE_CHARS_PER_FRAME;
          if (index >= title.length) {
            setDisplayed(title);
            return;
          }
          setDisplayed(title.slice(0, index));
        }
        raf = requestAnimationFrame(step);
      };

      raf = requestAnimationFrame(step);
      return () => cancelAnimationFrame(raf);
    }

    setDisplayed(title);
  }, [title]);

  return displayed;
}

interface ChatSidebarProps {
  activeChatId: Id<"chats"> | null;
  onSelectChat: (chatId: Id<"chats"> | null) => void;
  user: Doc<"users">;
}

export function ChatSidebar({
  activeChatId,
  onSelectChat,
  user,
}: ChatSidebarProps) {
  const { signOut } = useAuthActions();
  const chats = useQuery(api.chats.list);
  const emptyChat = useQuery(api.chats.findEmpty);
  const createChat = useMutation(api.chats.create);
  const removeChat = useMutation(api.chats.remove);

  const handleNewChat = async () => {
    if (emptyChat) {
      onSelectChat(emptyChat._id);
      return;
    }
    const chatId = await createChat({});
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

  const initials = user.name
    ? user.name
        .split(" ")
        .map((n: string) => n[0])
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
                <ChatListItem
                  key={chat._id}
                  chat={chat}
                  isActive={activeChatId === chat._id}
                  onSelect={() => onSelectChat(chat._id)}
                  onDelete={(e) => handleDeleteChat(e, chat._id)}
                />
              ))}
            </div>
          )}
        </ScrollArea>

        <Separator />
        <div className="flex items-center gap-2 p-3">
          <Avatar size="sm">
            <AvatarImage src={user.image ?? undefined} />
            <AvatarFallback className="text-xs">{initials}</AvatarFallback>
          </Avatar>
          <span className="flex-1 truncate text-xs font-medium">
            {user.name ?? user.email ?? "User"}
          </span>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon-xs"
                variant="ghost"
                onClick={() => void signOut()}
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

interface ChatListItemProps {
  chat: Doc<"chats">;
  isActive: boolean;
  onSelect: () => void;
  onDelete: (e: React.MouseEvent) => void;
}

function ChatListItem({ chat, isActive, onSelect, onDelete }: ChatListItemProps) {
  const displayedTitle = useAnimatedTitle(chat.title);

  return (
    <button
      onClick={onSelect}
      className={cn(
        "group flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-accent",
        isActive && "bg-accent"
      )}
    >
      <span className="truncate">{displayedTitle}</span>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            role="button"
            tabIndex={0}
            onClick={onDelete}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                onDelete(e as unknown as React.MouseEvent);
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
  );
}
