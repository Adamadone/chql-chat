"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "convex/_generated/api";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { MessageSquare, Plus, Trash2, LogOut } from "lucide-react";
import type { Id, Doc } from "convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { useAnimatedTitle } from "@/hooks/use-animated-title";
import { getInitials } from "@/utils/format";

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

  const [deleteTarget, setDeleteTarget] = useState<{
    id: Id<"chats">;
    title: string;
  } | null>(null);
  const [displayedDeleteTitle, setDisplayedDeleteTitle] = useState("");

  const handleNewChat = async () => {
    if (emptyChat) {
      onSelectChat(emptyChat._id);
      return;
    }
    try {
      const chatId = await createChat({});
      onSelectChat(chatId);
    } catch (error) {
      console.error("Failed to create chat:", error);
    }
  };

  const handleRequestDelete = (
    e: React.MouseEvent,
    chatId: Id<"chats">,
    title: string
  ) => {
    e.stopPropagation();
    setDeleteTarget({ id: chatId, title });
    setDisplayedDeleteTitle(title);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await removeChat({ chatId: deleteTarget.id });
      if (activeChatId === deleteTarget.id) {
        onSelectChat(null);
      }
    } catch (error) {
      console.error("Failed to delete chat:", error);
    } finally {
      setDeleteTarget(null);
    }
  };

  const initials = getInitials(user.name);

  return (
    <TooltipProvider delayDuration={0}>
      <div className="flex h-full w-72 flex-col border-r border-border/60 bg-card/50 dark:bg-card/30">
        {/* Header */}
        <div className="flex h-14 items-center justify-between border-b border-border/60 px-4">
          <div className="flex items-center gap-2.5 font-semibold text-sm">
            <div className="flex size-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <MessageSquare className="size-3" />
            </div>
            <span>CHQL Chat</span>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon-xs"
                variant="ghost"
                className="transition-transform duration-150 active:scale-90"
                onClick={handleNewChat}
              >
                <Plus className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">New chat</TooltipContent>
          </Tooltip>
        </div>

        {/* Chat list */}
        <ScrollArea className="flex-1 px-2 py-2">
          {!chats ? (
            <div className="space-y-1.5 px-1">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="h-9 animate-pulse rounded-lg bg-muted/50"
                  style={{ animationDelay: `${i * 100}ms` }}
                />
              ))}
            </div>
          ) : chats.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-2 py-10">
              <div className="flex size-10 items-center justify-center rounded-xl bg-muted">
                <MessageSquare className="size-5 text-muted-foreground" />
              </div>
              <p className="text-center text-xs text-muted-foreground">
                No conversations yet.
                <br />
                Start a new chat!
              </p>
            </div>
          ) : (
            <div className="space-y-0.5">
              {chats.map((chat) => (
                <ChatListItem
                  key={chat._id}
                  chat={chat}
                  isActive={activeChatId === chat._id}
                  onSelect={() => onSelectChat(chat._id)}
                  onRequestDelete={(e) =>
                    handleRequestDelete(e, chat._id, chat.title)
                  }
                />
              ))}
            </div>
          )}
        </ScrollArea>

        {/* Footer — user info + controls */}
        <div className="border-t border-border/60 p-3">
          <div className="flex items-center gap-2">
            <Avatar size="sm">
              <AvatarImage src={user.image ?? undefined} />
              <AvatarFallback className="text-xs bg-primary/10 text-primary">
                {initials}
              </AvatarFallback>
            </Avatar>
            <span className="flex-1 truncate text-xs font-medium">
              {user.name ?? user.email ?? "User"}
            </span>
            <ThemeToggle className="size-7 [&_svg]:size-3.5" />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon-xs"
                  variant="ghost"
                  className="transition-transform duration-150 active:scale-90"
                  onClick={() => void signOut()}
                >
                  <LogOut className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">Sign out</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete chat?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete{" "}
              <span className="font-medium text-foreground">
                {displayedDeleteTitle || "this chat"}
              </span>{" "}
              and all its messages. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleConfirmDelete}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TooltipProvider>
  );
}

interface ChatListItemProps {
  chat: Doc<"chats">;
  isActive: boolean;
  onSelect: () => void;
  onRequestDelete: (e: React.MouseEvent) => void;
}

function ChatListItem({
  chat,
  isActive,
  onSelect,
  onRequestDelete,
}: ChatListItemProps) {
  const displayedTitle = useAnimatedTitle(chat.title);

  return (
    <button
      onClick={onSelect}
      className={cn(
        "group flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition-all duration-150",
        isActive
          ? "bg-primary/10 text-primary font-medium"
          : "text-foreground/80 hover:bg-accent hover:text-foreground"
      )}
    >
      {/* Active indicator */}
      <div
        className={cn(
          "h-5 w-0.5 shrink-0 rounded-full transition-all duration-200",
          isActive ? "bg-primary" : "bg-transparent"
        )}
      />
      <span className="flex-1 truncate">{displayedTitle}</span>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            role="button"
            tabIndex={0}
            onClick={onRequestDelete}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                onRequestDelete(e as unknown as React.MouseEvent);
              }
            }}
            className={cn(
              "flex size-6 shrink-0 items-center justify-center rounded-md transition-all duration-150",
              "opacity-0 group-hover:opacity-70 hover:!opacity-100",
              "hover:bg-destructive/10 hover:text-destructive"
            )}
          >
            <Trash2 className="size-3.5" />
          </span>
        </TooltipTrigger>
        <TooltipContent side="right">Delete</TooltipContent>
      </Tooltip>
    </button>
  );
}
