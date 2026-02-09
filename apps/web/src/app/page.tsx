import { isAuthenticatedNextjs } from "@convex-dev/auth/nextjs/server";
import { redirect } from "next/navigation";
import { HeroSection } from "@/components/hero-section";

export default async function Home() {
  if (await isAuthenticatedNextjs()) {
    redirect("/chat");
  }

  return <HeroSection />;
}
