"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { MessageSquare, Shield, Zap, ArrowRight } from "lucide-react";

export function HeroSection() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Header */}
      <header className="border-b border-border/60 bg-card/80 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
          <div className="flex items-center gap-2.5 font-semibold text-sm">
            <div className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <MessageSquare className="size-3.5" />
            </div>
            <span>CHQL Chat</span>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button size="sm" asChild>
              <Link href="/auth/signin">Sign in</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <main className="flex flex-1 flex-col items-center justify-center px-6">
        <div className="hero-fade-in mx-auto max-w-2xl text-center">
          <div className="mb-6 inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-medium text-primary">
            <span className="size-1.5 rounded-full bg-primary animate-pulse" />
            Bachelor&apos;s Thesis Project
          </div>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Natural Language to{" "}
            <span className="hero-gradient-text">DSL queries</span>
          </h1>
          <p className="mx-auto mt-5 max-w-lg text-base leading-relaxed text-muted-foreground sm:text-lg">
            Convert plain language into structured domain-specific queries using
            AI. Built with prompt injection resistance and MCP architecture.
          </p>
          <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Button size="lg" className="shadow-sm" asChild>
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

        {/* Feature cards */}
        <div className="hero-fade-in-delayed mx-auto mt-24 grid max-w-3xl gap-6 sm:grid-cols-3">
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

      {/* Footer */}
      <footer className="border-t border-border/60 py-6 text-center text-xs text-muted-foreground">
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
    <div className="group relative rounded-xl border border-border/40 bg-card p-6 text-center transition-all duration-300 hover:border-primary/30 hover:shadow-md">
      {/* Accent border top */}
      <div className="absolute inset-x-0 top-0 h-0.5 rounded-t-xl bg-gradient-to-r from-transparent via-primary/40 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
      <div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary transition-all duration-300 group-hover:bg-primary/15 group-hover:shadow-sm">
        {icon}
      </div>
      <h3 className="font-semibold text-sm">{title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
        {description}
      </p>
    </div>
  );
}
