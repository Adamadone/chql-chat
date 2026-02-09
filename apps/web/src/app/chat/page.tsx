import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { ChatShell } from "@/components/chat/chat-shell";

export default async function ChatPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/auth/signin");
  }

  return <ChatShell />;
}
