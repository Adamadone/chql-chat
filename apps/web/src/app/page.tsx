import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { HeroSection } from "@/components/hero-section";

export default async function Home() {
  const session = await auth();

  if (session?.user) {
    redirect("/chat");
  }

  return <HeroSection />;
}
