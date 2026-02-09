import { isAuthenticatedNextjs } from "@convex-dev/auth/nextjs/server";
import { redirect } from "next/navigation";
import { ChatShell } from "@/components/chat/chat-shell";

export default async function ChatPage() {
  if (!(await isAuthenticatedNextjs())) {
    redirect("/auth/signin");
  }

  return <ChatShell />;
}
