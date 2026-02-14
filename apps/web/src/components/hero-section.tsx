"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { MessageSquare, Shield, Zap, ArrowRight } from "lucide-react";

export function HeroSection() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
          <div className="flex items-center gap-2 font-semibold">
            <MessageSquare className="size-5" />
            <span>CHQL Chat</span>
          </div>
          <Button size="sm" asChild>
            <Link href="/auth/signin">Sign in</Link>
          </Button>
        </div>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-6">
        <div className="hero-fade-in mx-auto max-w-2xl text-center">
          <div className="mb-6 inline-flex items-center rounded-full border px-3 py-1 text-xs text-muted-foreground">
            Bachelor&apos;s Thesis Project
          </div>
          <h1 className="text-3xl font-bold sm:text-4xl">
            Natural Language to <span className="hero-gradient-text">DSL Queries</span>
          </h1>
          <p className="mx-auto mt-5 max-w-lg text-lg leading-relaxed text-muted-foreground">
            Convert plain language into structured domain-specific queries using
            AI. Built with prompt injection resistance and MCP architecture.
          </p>
          <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Button size="lg" asChild>
              <Link href="/auth/signin">
                Get Started
                <ArrowRight className="ml-1 size-4" />
              </Link>
            </Button>
            <Button variant="outline" size="lg" asChild>
              <a
                href="https://github.com/Adamadone/chql-chat"
                target="_blank"
                rel="noopener noreferrer"
              >
                View Source
              </a>
            </Button>
          </div>
        </div>

        <div className="hero-fade-in-delayed mx-auto mt-24 grid max-w-3xl gap-8 sm:grid-cols-3">
          <FeatureCard
            icon={<MessageSquare className="size-5" />}
            title="Chat Interface"
            description="Conversational UI for natural language query generation"
          />
          <FeatureCard
            icon={<Shield className="size-5" />}
            title="Injection Resistant"
            description="Multi-layer defense against prompt injection attacks"
          />
          <FeatureCard
            icon={<Zap className="size-5" />}
            title="MCP Architecture"
            description="Model Context Protocol for structured tool interaction"
          />
        </div>
      </main>

      <footer className="border-t py-6 text-center text-xs text-muted-foreground">
        CHQL Chat &mdash; Bachelor&apos;s Thesis
      </footer>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="group rounded-xl border border-transparent p-6 text-center transition-all duration-300 hover:border-border hover:bg-muted/40 hover:shadow-sm">
      <div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors duration-300 group-hover:bg-primary/20">
        {icon}
      </div>
      <h3 className="font-medium">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
